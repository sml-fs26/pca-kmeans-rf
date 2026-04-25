/* PCA helpers and data loader.
 *
 * Faces.load() fetches the binary blobs produced by precompute/build-data.py
 * and exposes them as Float32Array / Uint8Array typed arrays:
 *
 *   FACES.meta      = { N, K, W, H }      // 400, 50, 64, 64 for Olivetti
 *   FACES.mean      = Float32Array[H*W]   // mean face μ
 *   FACES.eigen     = Float32Array[K * H*W]  // top-K eigenfaces, row-major
 *   FACES.eigenval  = Float32Array[K]     // λ_j (variance per component)
 *   FACES.varRatio  = Float32Array[K]     // explained variance ratio
 *   FACES.faces     = Uint8Array[N * H*W] // raw faces (0..255)
 *   FACES.proj      = Float32Array[N * K] // each face's coordinates in PC space
 *   FACES.labels    = { subjects: Uint8Array[N], names?: string[] }
 *
 * Pure-math helpers are deliberately small — at K=50 and D=4096 the matrix-vector
 * products are well under 1ms, so we can recompute reconstructions on every
 * slider tick without thinking about performance.
 */

window.Faces = (function () {
  let LOADED = null;
  let LOAD_PROMISE = null;

  async function fetchFloat32(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Failed to fetch ${url}: ${r.status}`);
    return new Float32Array(await r.arrayBuffer());
  }
  async function fetchUint8(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Failed to fetch ${url}: ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  }
  async function fetchJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Failed to fetch ${url}: ${r.status}`);
    return r.json();
  }

  function load() {
    if (LOAD_PROMISE) return LOAD_PROMISE;
    LOAD_PROMISE = (async () => {
      const labels = await fetchJSON('data/labels.json');
      const meta = labels.meta;  // { N, K, W, H }
      const [mean, eigen, eigenval, varRatio, faces, proj] = await Promise.all([
        fetchFloat32('data/mean.bin'),
        fetchFloat32('data/eigenfaces.bin'),
        fetchFloat32('data/eigenvalues.bin'),
        fetchFloat32('data/variance-ratio.bin'),
        fetchUint8('data/faces.bin'),
        fetchFloat32('data/projections.bin'),
      ]);
      LOADED = {
        meta, mean, eigen, eigenval, varRatio, faces, proj,
        labels: { subjects: new Uint8Array(labels.subjects), names: labels.names || null },
      };
      window.FACES = LOADED;
      window.dispatchEvent(new CustomEvent('faces-loaded', { detail: LOADED }));
      return LOADED;
    })();
    return LOAD_PROMISE;
  }

  function ready() { return LOAD_PROMISE || load(); }
  function get() { return LOADED; }

  /* ---- pure math, no I/O ---- */

  // Get the i-th raw face as a Float32Array of length D (rescaled to [0,1] from uint8).
  function rawFace(i) {
    const F = LOADED;
    const D = F.meta.W * F.meta.H;
    const out = new Float32Array(D);
    const off = i * D;
    for (let k = 0; k < D; k++) out[k] = F.faces[off + k] / 255;
    return out;
  }

  // Get the j-th eigenface as a Float32Array view (no copy).
  function eigenface(j) {
    const F = LOADED;
    const D = F.meta.W * F.meta.H;
    return F.eigen.subarray(j * D, (j + 1) * D);
  }

  // Project a centered face vector onto the first k principal components.
  // x must already be (face - mean). Returns a length-k Float32Array of coefficients.
  function project(xCentered, k) {
    const F = LOADED;
    const D = F.meta.W * F.meta.H;
    const K = Math.min(k, F.meta.K);
    const coeffs = new Float32Array(K);
    for (let j = 0; j < K; j++) {
      const off = j * D;
      let s = 0;
      for (let d = 0; d < D; d++) s += F.eigen[off + d] * xCentered[d];
      coeffs[j] = s;
    }
    return coeffs;
  }

  // Reconstruct a face from coefficients: μ + Σ c_j · e_j.
  // out is optional (Float32Array of length D) — caller can reuse a buffer.
  function reconstruct(coeffs, out) {
    const F = LOADED;
    const D = F.meta.W * F.meta.H;
    const K = coeffs.length;
    const result = out || new Float32Array(D);
    result.set(F.mean);
    for (let j = 0; j < K; j++) {
      const c = coeffs[j];
      if (c === 0) continue;
      const off = j * D;
      for (let d = 0; d < D; d++) result[d] += c * F.eigen[off + d];
    }
    return result;
  }

  // Truncated reconstruction of face i using top-k components, computed from
  // the precomputed projections (faster than re-projecting). Pass out to reuse.
  function reconstructFace(i, k, out) {
    const F = LOADED;
    const D = F.meta.W * F.meta.H;
    const K = Math.min(k, F.meta.K);
    const result = out || new Float32Array(D);
    result.set(F.mean);
    const baseProj = i * F.meta.K;
    for (let j = 0; j < K; j++) {
      const c = F.proj[baseProj + j];
      if (c === 0) continue;
      const off = j * D;
      for (let d = 0; d < D; d++) result[d] += c * F.eigen[off + d];
    }
    return result;
  }

  // Mean squared error between two equal-length vectors.
  function mse(a, b) {
    const n = a.length;
    let s = 0;
    for (let i = 0; i < n; i++) {
      const d = a[i] - b[i];
      s += d * d;
    }
    return s / n;
  }

  return {
    load, ready, get,
    rawFace, eigenface, project, reconstruct, reconstructFace, mse,
  };
})();
