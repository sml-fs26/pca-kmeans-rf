/* PCA helpers over the precomputed window.DATA payload.
 *
 * Layout (filled by precompute/build-datasets.js):
 *
 *   DATA.meta = { W, H, D, n, seed }
 *   DATA.shapes[name] = { mask: number[D], support: int, normMask: number[D] }
 *   DATA.variants.independent2 = {
 *     shapes: ['circle','square'],
 *     coeffs: number[n][k],
 *     mean: number[D],
 *     eigenvecs: number[k][D],
 *     eigenvals: number[k],
 *     varRatio: number[k],
 *     coeffCov: number[k][k],
 *   }
 *   DATA.variants.independent5 = {...}
 *   DATA.variants.redundant3 = {...}
 *   DATA.variants.correlated2 = { shapes, rhos, snapshots: [{rho, coeffs, mean, eigenvecs, eigenvals, varRatio, rotationDeg}, ...] }
 *
 * All array entries are plain JS numbers — typed-array conversion is on the
 * caller when they want one. */

window.PCA = (function () {

  // -------- vector utilities --------------------------------------------------

  function dot(a, b) {
    let s = 0;
    const n = a.length;
    for (let i = 0; i < n; i++) s += a[i] * b[i];
    return s;
  }

  function axpy(out, a, x, y) {
    // out = a*x + y. y may be the same as out.
    const n = out.length;
    for (let i = 0; i < n; i++) out[i] = a * x[i] + y[i];
    return out;
  }

  function copy(v) {
    const n = v.length;
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = v[i];
    return out;
  }

  function zeros(n) { return new Float32Array(n); }

  // -------- image construction from coefficients ------------------------------

  /** Build the i-th image of a variant by re-summing masks * coefficients.
   *  variant must include `shapes` (array of names) and `coeffs` (n × k).  */
  function buildImage(variant, sampleIdx, opts) {
    const D = window.DATA.meta.D;
    const out = (opts && opts.out) || new Float32Array(D);
    out.fill(0);
    const shapeNames = variant.shapes;
    const coeffs = variant.coeffs;
    const c = coeffs[sampleIdx];
    for (let s = 0; s < shapeNames.length; s++) {
      const mask = window.DATA.shapes[shapeNames[s]].mask;
      const a = c[s];
      if (a === 0) continue;
      for (let p = 0; p < D; p++) out[p] += a * mask[p];
    }
    return out;
  }

  /** Build an arbitrary image from coefficients (array of length k matched to
   *  variant.shapes). Useful for reconstruction sliders. */
  function buildImageFromCoeffs(shapeNames, coeffs, opts) {
    const D = window.DATA.meta.D;
    const out = (opts && opts.out) || new Float32Array(D);
    out.fill(0);
    for (let s = 0; s < shapeNames.length; s++) {
      const mask = window.DATA.shapes[shapeNames[s]].mask;
      const a = coeffs[s];
      if (a === 0) continue;
      for (let p = 0; p < D; p++) out[p] += a * mask[p];
    }
    return out;
  }

  // -------- PC-space operations -----------------------------------------------

  /** Project a length-D image onto the top-k eigenvectors of a variant.
   *  Caller passes the *centered* image (image - mean). Returns length-k array. */
  function project(centeredImage, variant, k) {
    const K = (k != null) ? Math.min(k, variant.eigenvecs.length) : variant.eigenvecs.length;
    const out = new Float32Array(K);
    for (let j = 0; j < K; j++) {
      let s = 0;
      const v = variant.eigenvecs[j];
      const D = v.length;
      for (let p = 0; p < D; p++) s += v[p] * centeredImage[p];
      out[j] = s;
    }
    return out;
  }

  /** Reconstruct image as mean + sum_j (scores[j] * eigenvec[j]).
   *  scores may be shorter than variant.eigenvecs (truncated reconstruction). */
  function reconstruct(scores, variant, opts) {
    const D = window.DATA.meta.D;
    const out = (opts && opts.out) || new Float32Array(D);
    const mean = variant.mean;
    for (let p = 0; p < D; p++) out[p] = mean[p];
    const K = scores.length;
    for (let j = 0; j < K; j++) {
      const s = scores[j];
      if (s === 0) continue;
      const v = variant.eigenvecs[j];
      for (let p = 0; p < D; p++) out[p] += s * v[p];
    }
    return out;
  }

  /** Compute the PC scores for every sample in a variant. Returns n × K Float32Array
   *  of arrays. Cached on the variant object after first call. */
  function allScores(variant) {
    if (variant._scoresCache) return variant._scoresCache;
    const n = variant.coeffs.length;
    const K = variant.eigenvecs.length;
    const D = window.DATA.meta.D;
    const out = new Array(n);
    const tmp = new Float32Array(D);
    for (let i = 0; i < n; i++) {
      buildImage(variant, i, { out: tmp });
      // center
      for (let p = 0; p < D; p++) tmp[p] -= variant.mean[p];
      out[i] = project(tmp, variant, K);
    }
    variant._scoresCache = out;
    return out;
  }

  // -------- linear algebra: 2×2 closed-form eigendecomposition ---------------

  /** Eigenvalues + eigenvectors of a real symmetric 2×2 matrix [[a,b],[b,d]].
   *  Returns { vals: [λ1, λ2] (descending), vecs: [[x1,y1],[x2,y2]] (columns) }. */
  function eig2x2(a, b, d) {
    const tr = a + d;
    const det = a * d - b * b;
    const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
    const l1 = tr / 2 + disc;
    const l2 = tr / 2 - disc;
    let v1, v2;
    if (Math.abs(b) > 1e-12) {
      v1 = [b, l1 - a];
      v2 = [b, l2 - a];
    } else {
      v1 = (a >= d) ? [1, 0] : [0, 1];
      v2 = (a >= d) ? [0, 1] : [1, 0];
    }
    const norm = ([x, y]) => {
      const n = Math.hypot(x, y) || 1;
      return [x / n, y / n];
    };
    return { vals: [l1, l2], vecs: [norm(v1), norm(v2)] };
  }

  // -------- variant accessor --------------------------------------------------

  function variant(name) {
    const v = window.DATA && window.DATA.variants && window.DATA.variants[name];
    if (!v) throw new Error(`PCA: variant "${name}" not found in DATA.variants`);
    return v;
  }

  function shape(name) {
    const s = window.DATA && window.DATA.shapes && window.DATA.shapes[name];
    if (!s) throw new Error(`PCA: shape "${name}" not found in DATA.shapes`);
    return s;
  }

  return {
    dot, axpy, copy, zeros,
    buildImage, buildImageFromCoeffs,
    project, reconstruct, allScores,
    eig2x2,
    variant, shape,
  };
})();
