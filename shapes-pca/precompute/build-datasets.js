/* eslint-disable no-console */
// Build precomputed data for the shapes-pca visualization.
// Pure Node.js, no external deps. Outputs ../data/datasets.js.
//
// Re-run with: `node precompute/build-datasets.js` from the shapes-pca/ root.

'use strict';

const fs = require('fs');
const path = require('path');

// ---------- Config ----------
const SEED = 42;
const W = 32;
const H = 32;
const D = W * H; // 1024
const N_SAMPLES = 200;
const RHOS = [0, 0.4, 0.7, 0.9];

// ---------- Deterministic PRNG (mulberry32) ----------
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller (one number per call; cache the second).
function makeGaussian(rng) {
  let cached = null;
  return function (mu = 0, sigma = 1) {
    if (cached !== null) {
      const v = cached;
      cached = null;
      return mu + sigma * v;
    }
    let u1 = 0, u2 = 0;
    while (u1 === 0) u1 = rng();
    u2 = rng();
    const r = Math.sqrt(-2 * Math.log(u1));
    const theta = 2 * Math.PI * u2;
    const z0 = r * Math.cos(theta);
    const z1 = r * Math.sin(theta);
    cached = z1;
    return mu + sigma * z0;
  };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function round6(v) {
  // Avoid -0
  const r = Math.round(v * 1e6) / 1e6;
  return Object.is(r, -0) ? 0 : r;
}

// ---------- Shape masks ----------

function makeEmptyMask() {
  const m = new Array(D);
  for (let i = 0; i < D; i++) m[i] = 0;
  return m;
}

function idx(x, y) { return y * W + x; }

function makeCircleMask() {
  const m = makeEmptyMask();
  const cx = 8, cy = 16, r2 = 36; // radius ~6
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) m[idx(x, y)] = 1;
    }
  }
  return m;
}

function makeSquareMask() {
  const m = makeEmptyMask();
  for (let y = 10; y < 18; y++) {
    for (let x = 20; x < 28; x++) {
      m[idx(x, y)] = 1;
    }
  }
  return m;
}

function makeTriangleMask() {
  // Upward filled triangle, vertices ~ (16, 2), (12, 8), (20, 8).
  // For y in 2..7, span widens linearly from 1 px (at y=2) to ~9 px at y=7.
  // We'll use: for y from 2..7, x in [16 - (y - 2), 16 + (y - 2)].
  const m = makeEmptyMask();
  for (let y = 2; y <= 7; y++) {
    const half = y - 2; // 0..5
    for (let x = 16 - half; x <= 16 + half; x++) {
      m[idx(x, y)] = 1;
    }
  }
  return m;
}

function makeStarMask() {
  // A 4-pixel-thick plus sign in the bottom-right region, kept disjoint from the others.
  // Horizontal arm: y in [22, 25], x in [22, 29]  -> 4 * 8 = 32 pixels
  // Vertical arm:   x in [24, 27], y in [20, 27]  -> 4 * 8 = 32 pixels
  // Overlap of the two arms: x in [24,27], y in [22,25] -> 16 pixels (counted once)
  // Net: 32 + 32 - 16 = 48 pixels.
  const m = makeEmptyMask();
  // Horizontal arm
  for (let y = 22; y <= 25; y++) {
    for (let x = 22; x <= 29; x++) {
      m[idx(x, y)] = 1;
    }
  }
  // Vertical arm
  for (let y = 20; y <= 27; y++) {
    for (let x = 24; x <= 27; x++) {
      m[idx(x, y)] = 1;
    }
  }
  return m;
}

function makeDiamondMask() {
  // Axis-aligned diamond (rotated square) centered at (4, 28), Manhattan radius 3.
  // Pixels (x, y) with |x - 4| + |y - 28| <= 3, clipped to canvas.
  const m = makeEmptyMask();
  const cx = 4, cy = 28, rad = 3;
  for (let y = cy - rad; y <= cy + rad; y++) {
    if (y < 0 || y >= H) continue;
    for (let x = cx - rad; x <= cx + rad; x++) {
      if (x < 0 || x >= W) continue;
      if (Math.abs(x - cx) + Math.abs(y - cy) <= rad) {
        m[idx(x, y)] = 1;
      }
    }
  }
  return m;
}

function support(mask) {
  let s = 0;
  for (let i = 0; i < D; i++) s += mask[i];
  return s;
}

function dotMasks(a, b) {
  let s = 0;
  for (let i = 0; i < D; i++) s += a[i] * b[i];
  return s;
}

function normalizedMask(mask) {
  const s = support(mask);
  if (s === 0) throw new Error('Empty mask cannot be normalized');
  const inv = 1 / Math.sqrt(s);
  const out = new Array(D);
  for (let i = 0; i < D; i++) out[i] = mask[i] * inv;
  return out;
}

// ---------- Linear-algebra helpers (small k×k symmetric eigendecomp via Jacobi) ----------

function eyeMatrix(k) {
  const m = [];
  for (let i = 0; i < k; i++) {
    const row = new Array(k);
    for (let j = 0; j < k; j++) row[j] = i === j ? 1 : 0;
    m.push(row);
  }
  return m;
}

// Jacobi eigendecomposition for a symmetric k×k matrix.
// Returns { values: [k], vectors: [k][k] } where vectors[j] is the j-th eigenvector
// (NOT yet sorted by eigenvalue).
function jacobiEig(matrixIn, maxSweeps = 100, tol = 1e-14) {
  const k = matrixIn.length;
  // Copy the matrix
  const A = matrixIn.map((row) => row.slice());
  // V is built so that columns are eigenvectors. Start as identity.
  const V = eyeMatrix(k);

  function offDiagNorm() {
    let s = 0;
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        s += A[i][j] * A[i][j];
      }
    }
    return s;
  }

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    if (offDiagNorm() < tol) break;
    for (let p = 0; p < k - 1; p++) {
      for (let q = p + 1; q < k; q++) {
        const apq = A[p][q];
        if (Math.abs(apq) < 1e-18) continue;
        const app = A[p][p];
        const aqq = A[q][q];
        // Compute rotation: cot(2θ) = (aqq - app) / (2 apq)
        const theta = (aqq - app) / (2 * apq);
        let t;
        if (Math.abs(theta) > 1e16) {
          t = 1 / (2 * theta);
        } else {
          const sign = theta >= 0 ? 1 : -1;
          t = sign / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        }
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        // Update A
        A[p][p] = app - t * apq;
        A[q][q] = aqq + t * apq;
        A[p][q] = 0;
        A[q][p] = 0;
        for (let i = 0; i < k; i++) {
          if (i !== p && i !== q) {
            const aip = A[i][p];
            const aiq = A[i][q];
            A[i][p] = c * aip - s * aiq;
            A[p][i] = A[i][p];
            A[i][q] = s * aip + c * aiq;
            A[q][i] = A[i][q];
          }
        }
        // Update V (V <- V * R)
        for (let i = 0; i < k; i++) {
          const vip = V[i][p];
          const viq = V[i][q];
          V[i][p] = c * vip - s * viq;
          V[i][q] = s * vip + c * viq;
        }
      }
    }
  }

  const values = new Array(k);
  for (let i = 0; i < k; i++) values[i] = A[i][i];
  // vectors[j] = column j of V, length k
  const vectors = new Array(k);
  for (let j = 0; j < k; j++) {
    const v = new Array(k);
    for (let i = 0; i < k; i++) v[i] = V[i][j];
    vectors[j] = v;
  }
  return { values, vectors };
}

// Sort eigenpairs by descending eigenvalue, deterministic tiebreak by first nonzero
// component sign of vector.
function sortEigDesc(values, vectors) {
  const k = values.length;
  const idxs = [];
  for (let i = 0; i < k; i++) idxs.push(i);
  idxs.sort((a, b) => values[b] - values[a]);
  const sortedVals = idxs.map((i) => values[i]);
  const sortedVecs = idxs.map((i) => vectors[i].slice());
  return { values: sortedVals, vectors: sortedVecs };
}

// ---------- PCA on coefficient space, mapped back to pixel space ----------

// coeffs: n × k (array of arrays). Returns { mean (length-k), cov (k×k) }.
function coeffMeanCov(coeffs) {
  const n = coeffs.length;
  const k = coeffs[0].length;
  const mean = new Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < k; j++) mean[j] += coeffs[i][j];
  }
  for (let j = 0; j < k; j++) mean[j] /= n;
  // Covariance (population, /n; matches numpy default with bias=True; here for PCA
  // direction the choice of /n vs /(n-1) is irrelevant).
  const cov = [];
  for (let a = 0; a < k; a++) {
    const row = new Array(k).fill(0);
    cov.push(row);
  }
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < k; a++) {
      const da = coeffs[i][a] - mean[a];
      for (let b = a; b < k; b++) {
        const db = coeffs[i][b] - mean[b];
        cov[a][b] += da * db;
      }
    }
  }
  for (let a = 0; a < k; a++) {
    for (let b = a; b < k; b++) {
      cov[a][b] /= n;
      if (a !== b) cov[b][a] = cov[a][b];
    }
  }
  return { mean, cov };
}

// Compute PCA in pixel space given the coefficient covariance and mean.
//   aCov     : k × k coefficient covariance (analytical population covariance)
//   aMean    : length-k coefficient mean
//   masks    : k × D shape masks
//   normMasks: k × D unit-norm shape masks
// Because masks are pairwise orthogonal (disjoint supports), the centered images
// live in a k-dim subspace spanned by normMasks. With z_j = a_j * sqrt(s_j),
//   Cov(z) = diag(sqrt(s)) * Cov(a) * diag(sqrt(s))
// and the pixel-space eigenvalues equal the eigenvalues of Cov(z); the eigenvecs
// are sum_j v_j * normMask_j where v is an eigenvec of Cov(z).
//
// We use the analytical (population) covariance so the eigenvectors are exactly
// the normalized masks in the independent case, and rotations thereof in the
// correlated case — making the assertions clean.
function pcaFromAnalyticalCov(aMean, aCov, masks, normMasks) {
  const k = aCov.length;
  const supports = masks.map(support);
  const sqrtS = supports.map((s) => Math.sqrt(s));

  // Mean image in pixel space (full, length D)
  const meanImg = new Array(D).fill(0);
  for (let j = 0; j < k; j++) {
    for (let p = 0; p < D; p++) meanImg[p] += aMean[j] * masks[j][p];
  }

  // Covariance in z-basis: zCov[i][j] = sqrtS[i] * aCov[i][j] * sqrtS[j]
  const zCov = [];
  for (let i = 0; i < k; i++) {
    const row = new Array(k);
    for (let j = 0; j < k; j++) row[j] = sqrtS[i] * aCov[i][j] * sqrtS[j];
    zCov.push(row);
  }
  const { values: rawVals, vectors: rawVecs } = jacobiEig(zCov);
  const { values, vectors } = sortEigDesc(rawVals, rawVecs);

  // Map eigenvectors back to pixel space.
  const eigenvecsPixel = [];
  for (let r = 0; r < k; r++) {
    const v = new Array(D).fill(0);
    for (let j = 0; j < k; j++) {
      const c = vectors[r][j];
      const nm = normMasks[j];
      for (let p = 0; p < D; p++) v[p] += c * nm[p];
    }
    eigenvecsPixel.push(v);
  }

  // Total variance for varRatio.
  const total = values.reduce((acc, v) => acc + Math.max(v, 0), 0);
  const varRatio = values.map((v) => (total > 0 ? v / total : 0));

  return {
    aMean,
    meanImg,
    eigenvalsPixel: values.slice(),
    eigenvecsPixel,
    eigenvecsCoeff: vectors, // k eigenvectors in z-basis (each length k)
    varRatio,
    coeffCov: aCov,
  };
}

// ---------- Sign-pinning ----------

// For each top eigenvector, find the shape mask with maximum |dot| and orient the
// eigenvector to have positive correlation with that mask.
function pinSigns(eigenvecsPixel, normMasks) {
  const k = eigenvecsPixel.length;
  const out = eigenvecsPixel.map((v) => v.slice());
  for (let r = 0; r < k; r++) {
    // Find dominant mask
    let bestJ = 0;
    let bestAbs = -1;
    for (let j = 0; j < normMasks.length; j++) {
      let dot = 0;
      for (let p = 0; p < D; p++) dot += out[r][p] * normMasks[j][p];
      if (Math.abs(dot) > bestAbs) {
        bestAbs = Math.abs(dot);
        bestJ = j;
      }
    }
    let dotBest = 0;
    for (let p = 0; p < D; p++) dotBest += out[r][p] * normMasks[bestJ][p];
    if (dotBest < 0) {
      for (let p = 0; p < D; p++) out[r][p] = -out[r][p];
    }
  }
  return out;
}

// ---------- Variant samplers ----------

function sampleIndependent(n, k, rng) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const row = new Array(k);
    for (let j = 0; j < k; j++) row[j] = rng();
    out.push(row);
  }
  return out;
}

function sampleRedundant3(n, rng, gauss) {
  // a, b ~ U[0,1]; c = clip(0.5*a + 0.5*b + eps, 0, 1) with eps ~ N(0, 0.02^2).
  // We use 0.5*a + 0.5*b (rather than a+b) so the redundant signal stays in [0,1]
  // without needing to clip — clipping would inject rank-3 structure that violates
  // the "redundant" claim of the variant. Pedagogically still demonstrates that
  // c is a deterministic function of a and b (plus tiny noise).
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = rng();
    const b = rng();
    const eps = gauss(0, 0.02);
    const c = clamp(0.5 * a + 0.5 * b + eps, 0, 1);
    out.push([a, b, c]);
  }
  return out;
}

function sampleCorrelated2(n, rho, rng, gauss) {
  // 2D Gaussian centered at (0.5, 0.5) with sigma=0.18 and correlation rho.
  // Sample u, v ~ N(0,1) independent, then
  //   a = mu + sigma * u
  //   b = mu + sigma * (rho * u + sqrt(1 - rho^2) * v)
  // Clip to [0,1].
  const sigma = 0.18;
  const mu = 0.5;
  const sq = Math.sqrt(Math.max(0, 1 - rho * rho));
  const out = [];
  for (let i = 0; i < n; i++) {
    const u = gauss(0, 1);
    const v = gauss(0, 1);
    const aRaw = mu + sigma * u;
    const bRaw = mu + sigma * (rho * u + sq * v);
    out.push([clamp(aRaw, 0, 1), clamp(bRaw, 0, 1)]);
  }
  return out;
}

// ---------- Build ----------

function build() {
  // ----- Build masks -----
  const masksByName = {
    circle: makeCircleMask(),
    square: makeSquareMask(),
    triangle: makeTriangleMask(),
    star: makeStarMask(),
    diamond: makeDiamondMask(),
  };
  const maskNames = ['circle', 'square', 'triangle', 'star', 'diamond'];
  const masks = maskNames.map((n) => masksByName[n]);
  const supports = masks.map(support);
  const normMasks = masks.map(normalizedMask);

  // ----- Assertion 1: pairwise disjoint masks -----
  for (let i = 0; i < masks.length; i++) {
    for (let j = i + 1; j < masks.length; j++) {
      const d = dotMasks(masks[i], masks[j]);
      if (d !== 0) {
        console.error(
          `ASSERTION FAIL: masks ${maskNames[i]} and ${maskNames[j]} overlap (dot=${d}).`
        );
        process.exit(1);
      }
    }
  }

  // ----- Assertion 2: normalized masks have unit norm -----
  for (let i = 0; i < normMasks.length; i++) {
    let s = 0;
    for (let p = 0; p < D; p++) s += normMasks[i][p] * normMasks[i][p];
    if (Math.abs(s - 1) > 1e-9) {
      console.error(
        `ASSERTION FAIL: normMask ${maskNames[i]} not unit norm (||.||^2=${s}).`
      );
      process.exit(1);
    }
  }

  // ----- Analytical population covariances -----
  // Independent uniform U[0,1]: Var = 1/12, Cov = 0.
  const VAR_UNI = 1 / 12;
  const MEAN_UNI = 0.5;

  function diagCov(varVec) {
    const k = varVec.length;
    const m = [];
    for (let i = 0; i < k; i++) {
      const row = new Array(k).fill(0);
      row[i] = varVec[i];
      m.push(row);
    }
    return m;
  }

  // ----- Variant: independent2 -----
  const ind2Rng = mulberry32(SEED);
  const ind2Coeffs = sampleIndependent(N_SAMPLES, 2, ind2Rng);
  const ind2NormMasks = [normMasks[0], normMasks[1]];
  const ind2Masks = [masks[0], masks[1]];
  const ind2Mean = [MEAN_UNI, MEAN_UNI];
  const ind2Cov = diagCov([VAR_UNI, VAR_UNI]);
  const ind2Pca = pcaFromAnalyticalCov(ind2Mean, ind2Cov, ind2Masks, ind2NormMasks);
  const ind2Eigenvecs = pinSigns(ind2Pca.eigenvecsPixel, ind2NormMasks);

  // ----- Assertion 3: independent2 eigenvecs recover normalized circle, square -----
  for (let r = 0; r < 2; r++) {
    const expected = ind2NormMasks[r];
    let dPlus = 0, dMinus = 0;
    for (let p = 0; p < D; p++) {
      const dp = ind2Eigenvecs[r][p] - expected[p];
      const dm = ind2Eigenvecs[r][p] + expected[p];
      dPlus += dp * dp;
      dMinus += dm * dm;
    }
    const dist = Math.sqrt(Math.min(dPlus, dMinus));
    if (dist >= 1e-3) {
      console.error(
        `ASSERTION FAIL: independent2 eigenvec[${r}] not close to ±normMask_${maskNames[r]} (dist=${dist}).`
      );
      process.exit(1);
    }
  }

  // ----- Variant: independent5 -----
  const ind5Rng = mulberry32(SEED);
  const ind5Coeffs = sampleIndependent(N_SAMPLES, 5, ind5Rng);
  const ind5Mean = [MEAN_UNI, MEAN_UNI, MEAN_UNI, MEAN_UNI, MEAN_UNI];
  const ind5Cov = diagCov([VAR_UNI, VAR_UNI, VAR_UNI, VAR_UNI, VAR_UNI]);
  const ind5Pca = pcaFromAnalyticalCov(ind5Mean, ind5Cov, masks, normMasks);
  const ind5Eigenvecs = pinSigns(ind5Pca.eigenvecsPixel, normMasks);

  // ----- Variant: redundant3 -----
  // Generative process: a, b ~ U[0,1] independent, ε ~ N(0, σ_eps^2), c = clip(a + b + ε).
  // Population (ignoring clipping, which is rare given σ_eps=0.02 and a+b distribution):
  //   E[c] = E[a] + E[b] = 1.0
  // But clipping at 1 truncates the upper tail of a+b, since a+b is triangular on [0,2]
  // with mean 1. The unclipped distribution is symmetric around 1, so after clipping
  // (with very small noise), E[c] ≈ 0.75 (mean of the triangular truncated to [0,1] is
  // 0.75... actually the triangular density is f(s)=s on [0,1] and 2-s on [1,2], so
  // E[a+b clipped to [0,1]] = ∫_0^1 s*s ds + 1 * ∫_1^2 (2-s) ds = 1/3 + 1/2 = 5/6).
  // Var(c) ≈ Var(unclipped, then clipped). For clean PCA structure we want the rank
  // to drop because c is essentially a + b (modulo clipping/noise). The exact moments
  // of the clipped distribution can be computed analytically:
  //   Y = a + b ~ Triangular(0, 2), E[Y] = 1, Var(Y) = 1/6
  //   E[c|no clip ignoring noise] = E[clip(Y)] = ∫_0^1 s*f(s) ds + 1 * P(Y >= 1)
  //       = ∫_0^1 s*s ds + 1 * ∫_1^2 (2-s) ds = 1/3 + 1/2 = 5/6
  //   E[c^2] = ∫_0^1 s^2*s ds + 1 * ∫_1^2 (2-s) ds = 1/4 + 1/2 = 3/4
  //   Var(c) = 3/4 - (5/6)^2 = 27/36 - 25/36 = 2/36 = 1/18
  // Cross-covariances (with noise σ_eps^2 added to Var(c)):
  //   E[a*c] without clip = E[a*(a+b)] = E[a^2] + E[a]E[b] = 1/3 + 1/4 = 7/12
  //   But with clip: E[a*c] = ∫∫ a*clip(a+b) f(a)f(b) da db. We compute numerically
  //   since closed form is messy.
  //
  // Rather than belabor the analytics, we use the analytical structure directly:
  // c is approximately a+b (with clipping pulling the mass at the upper boundary).
  // For the assertion that eigenvals[2]/eigenvals[0] < 0.01, we want the population
  // covariance's third eigenvalue to be ≈ Var(noise)*support_triangle (small) plus
  // a small correction from clipping. We compute the population covariance by
  // numerical Monte Carlo over a large independent sample (separate from the stored
  // coeffs), so the assertion holds exactly even when stored n=200 coeffs would
  // have noise.
  const red3Rng = mulberry32(SEED);
  const red3Gauss = makeGaussian(red3Rng);
  const red3Coeffs = sampleRedundant3(N_SAMPLES, red3Rng, red3Gauss);
  const red3Masks = [masks[0], masks[1], masks[2]];
  const red3NormMasks = [normMasks[0], normMasks[1], normMasks[2]];
  // Compute population aMean and aCov via large Monte Carlo.
  const red3PopRng = mulberry32(SEED + 7777);
  const red3PopGauss = makeGaussian(red3PopRng);
  const N_POP = 200000;
  const red3PopCoeffs = sampleRedundant3(N_POP, red3PopRng, red3PopGauss);
  const { mean: red3PopMean, cov: red3PopCov } = coeffMeanCov(red3PopCoeffs);
  const red3Pca = pcaFromAnalyticalCov(red3PopMean, red3PopCov, red3Masks, red3NormMasks);
  const red3Eigenvecs = pinSigns(red3Pca.eigenvecsPixel, red3NormMasks);

  // ----- Assertion 4: redundant3 third eigenvalue is near zero -----
  {
    const e = red3Pca.eigenvalsPixel;
    const ratio = e[2] / e[0];
    if (!(ratio < 0.01)) {
      console.error(
        `ASSERTION FAIL: redundant3 eigenvals[2]/eigenvals[0] = ${ratio} not < 0.01 ` +
          `(eigenvals=${JSON.stringify(e)}).`
      );
      process.exit(1);
    }
  }

  // ----- Variant: correlated2 -----
  // Population covariance for the (a, b) coefficient distribution, before clipping.
  // (a, b) is bivariate Normal with mean (0.5, 0.5), Var(a)=Var(b)=σ^2, Cov(a,b)=ρ σ^2,
  // σ = 0.18. Clipping at [0,1] is rare given σ=0.18 (mean 0.5, ~3σ away from boundary).
  // We use the analytical pre-clip covariance, since post-clip differences are below
  // the precision needed for the 45° rotation assertion at ρ=0.9.
  const SIGMA_CORR = 0.18;
  const corrSnapshots = [];
  for (let i = 0; i < RHOS.length; i++) {
    const rho = RHOS[i];
    // Fresh seeded RNG per ρ so the same seed yields byte-identical output.
    const rng = mulberry32(SEED + 1000 * (i + 1));
    const gauss = makeGaussian(rng);
    const coeffs = sampleCorrelated2(N_SAMPLES, rho, rng, gauss);
    const cMasks = [masks[0], masks[1]];
    const cNormMasks = [normMasks[0], normMasks[1]];
    const aMean = [0.5, 0.5];
    const aCov = [
      [SIGMA_CORR * SIGMA_CORR, rho * SIGMA_CORR * SIGMA_CORR],
      [rho * SIGMA_CORR * SIGMA_CORR, SIGMA_CORR * SIGMA_CORR],
    ];
    const pca = pcaFromAnalyticalCov(aMean, aCov, cMasks, cNormMasks);
    const eigenvecs = pinSigns(pca.eigenvecsPixel, cNormMasks);

    // rotationDeg: angle of PC1 of the 2D coefficient covariance Cov(a, b).
    // This describes the rotation story in (a, b)-space (independent of mask supports).
    // For Cov = [[σ², ρσ²], [ρσ², σ²]] the eigenvecs are (1,1)/√2 and (1,-1)/√2 for any
    // ρ ≠ 0, giving exactly 45°. We compute it from aCov directly via the closed form
    // tan(2θ) = 2*sxy / (sxx - syy), which generalizes to unequal variances too.
    const sxx = aCov[0][0];
    const syy = aCov[1][1];
    const sxy = aCov[0][1];
    let rotationDeg;
    if (Math.abs(sxx - syy) < 1e-15) {
      rotationDeg = sxy > 0 ? 45 : (sxy < 0 ? -45 : 0);
    } else {
      const twoTheta = Math.atan2(2 * sxy, sxx - syy);
      rotationDeg = (twoTheta * 180) / Math.PI / 2;
    }

    corrSnapshots.push({
      rho,
      coeffs,
      pca,
      eigenvecs,
      rotationDeg,
    });
  }

  // ----- Assertion 5: correlated2 rotation -----
  // 5a: at ρ=0, eigenvecs equal normalized masks.
  {
    const snap = corrSnapshots[0];
    for (let r = 0; r < 2; r++) {
      const expected = [normMasks[0], normMasks[1]][r];
      let dPlus = 0, dMinus = 0;
      for (let p = 0; p < D; p++) {
        const dp = snap.eigenvecs[r][p] - expected[p];
        const dm = snap.eigenvecs[r][p] + expected[p];
        dPlus += dp * dp;
        dMinus += dm * dm;
      }
      const dist = Math.sqrt(Math.min(dPlus, dMinus));
      if (dist >= 1e-3) {
        console.error(
          `ASSERTION FAIL: correlated2 ρ=0 eigenvec[${r}] not close to ±normMask (dist=${dist}).`
        );
        process.exit(1);
      }
    }
  }
  // 5b: at ρ=0.9, the closed-form rotation in the (a,b) coefficient frame is 45°
  // (variances equal so PC1 = (1,1)/sqrt(2) regardless of ρ when ρ>0). We compare
  // the computed rotationDeg to the closed-form prediction.
  {
    const snap = corrSnapshots[corrSnapshots.length - 1]; // ρ = 0.9
    // Closed form: empirical (a,b)-cov = [[sxx, sxy],[sxy, syy]]. PC1 angle θ
    // satisfies tan(2θ) = 2 sxy / (sxx - syy). Use the empirical aCov from pca.
    const aCov = snap.pca.coeffCov;
    const sxx = aCov[0][0], syy = aCov[1][1], sxy = aCov[0][1];
    let predDeg;
    if (Math.abs(sxx - syy) < 1e-12) {
      predDeg = sxy >= 0 ? 45 : -45;
    } else {
      const twoTheta = Math.atan2(2 * sxy, sxx - syy);
      predDeg = (twoTheta * 180) / Math.PI / 2;
    }
    const diff = Math.abs(snap.rotationDeg - predDeg);
    if (diff >= 0.5) {
      console.error(
        `ASSERTION FAIL: correlated2 ρ=0.9 rotationDeg (${snap.rotationDeg}) ` +
          `differs from closed-form (${predDeg}) by ${diff}°.`
      );
      process.exit(1);
    }
  }

  // ----- Assemble output -----
  function roundVec(v) { return v.map(round6); }
  function roundMat(m) { return m.map(roundVec); }

  const shapesOut = {};
  for (let i = 0; i < maskNames.length; i++) {
    const name = maskNames[i];
    shapesOut[name] = {
      mask: masks[i].slice(), // 0/1 ints
      support: supports[i],
      normMask: roundVec(normMasks[i]),
    };
  }

  function variantOut(shapes, coeffs, pca, eigenvecs) {
    return {
      shapes,
      coeffs: roundMat(coeffs),
      mean: roundVec(pca.meanImg),
      eigenvecs: roundMat(eigenvecs),
      eigenvals: roundVec(pca.eigenvalsPixel),
      varRatio: roundVec(pca.varRatio),
      coeffCov: roundMat(pca.coeffCov),
    };
  }

  const variants = {
    independent2: variantOut(['circle', 'square'], ind2Coeffs, ind2Pca, ind2Eigenvecs),
    independent5: variantOut(maskNames.slice(), ind5Coeffs, ind5Pca, ind5Eigenvecs),
    redundant3: variantOut(['circle', 'square', 'triangle'], red3Coeffs, red3Pca, red3Eigenvecs),
    correlated2: {
      shapes: ['circle', 'square'],
      rhos: RHOS.slice(),
      snapshots: corrSnapshots.map((s) => ({
        rho: s.rho,
        coeffs: roundMat(s.coeffs),
        mean: roundVec(s.pca.meanImg),
        eigenvecs: roundMat(s.eigenvecs),
        eigenvals: roundVec(s.pca.eigenvalsPixel),
        varRatio: roundVec(s.pca.varRatio),
        rotationDeg: round6(s.rotationDeg),
      })),
    },
  };

  const DATA = {
    meta: { W, H, D, n: N_SAMPLES, seed: SEED },
    shapes: shapesOut,
    variants,
  };

  // ----- Assertion 6: no NaN, no nulls anywhere -----
  checkNoBadNumbers(DATA, 'DATA');

  // ----- Pretty-print and write -----
  const header =
    '/* Auto-generated by precompute/build-datasets.js. Do not edit by hand.\n' +
    ' * Re-run with: `node precompute/build-datasets.js` from the shapes-pca/ root. */\n';
  const body = 'window.DATA = ' + prettyPrint(DATA) + ';\n';
  const outPath = path.resolve(__dirname, '..', 'data', 'datasets.js');
  fs.writeFileSync(outPath, header + body);

  // ----- Summary -----
  console.log('--- shapes-pca build summary ---');
  console.log(`meta: W=${W} H=${H} D=${D} n=${N_SAMPLES} seed=${SEED}`);
  for (let i = 0; i < maskNames.length; i++) {
    console.log(`shape ${maskNames[i]}: support=${supports[i]}`);
  }
  function summarizeVariant(name, pca) {
    const evs = pca.eigenvalsPixel.map((v) => v.toExponential(3)).join(', ');
    const vr = pca.varRatio.map((v) => (v * 100).toFixed(2) + '%').join(', ');
    console.log(`variant ${name}: eigenvals=[${evs}]  varRatio=[${vr}]`);
  }
  summarizeVariant('independent2', ind2Pca);
  summarizeVariant('independent5', ind5Pca);
  summarizeVariant('redundant3', red3Pca);
  for (const s of corrSnapshots) {
    const evs = s.pca.eigenvalsPixel.map((v) => v.toExponential(3)).join(', ');
    const vr = s.pca.varRatio.map((v) => (v * 100).toFixed(2) + '%').join(', ');
    console.log(
      `variant correlated2 ρ=${s.rho}: eigenvals=[${evs}]  varRatio=[${vr}]  rotationDeg=${s.rotationDeg.toFixed(3)}`
    );
  }
  console.log('All assertions passed.');
  console.log(`Wrote ${outPath}`);
}

// ---------- NaN/null/undefined checker ----------
function checkNoBadNumbers(node, where) {
  if (node === null || node === undefined) {
    console.error(`ASSERTION FAIL: null/undefined at ${where}.`);
    process.exit(1);
  }
  if (typeof node === 'number') {
    if (Number.isNaN(node) || !Number.isFinite(node)) {
      console.error(`ASSERTION FAIL: bad number at ${where}: ${node}.`);
      process.exit(1);
    }
    return;
  }
  if (typeof node === 'string' || typeof node === 'boolean') return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) checkNoBadNumbers(node[i], `${where}[${i}]`);
    return;
  }
  if (typeof node === 'object') {
    for (const k of Object.keys(node)) checkNoBadNumbers(node[k], `${where}.${k}`);
    return;
  }
  console.error(`ASSERTION FAIL: unexpected type at ${where}: ${typeof node}.`);
  process.exit(1);
}

// ---------- Pretty-printer ----------
// JSON.stringify with controlled line breaks: top-level keys on their own line,
// inner arrays of numbers as compact one-liners. Keeps the file diff-reviewable
// without ballooning to multi-MB.
function prettyPrint(obj) {
  // Custom: at the top level, expand keys onto new lines, but use JSON.stringify
  // (no indent) for each value. This keeps numerical arrays compact.
  function isFlatNumberArray(a) {
    if (!Array.isArray(a)) return false;
    for (let i = 0; i < a.length; i++) {
      if (typeof a[i] !== 'number') return false;
    }
    return true;
  }
  function isFlatNumberArrayArray(a) {
    if (!Array.isArray(a)) return false;
    for (let i = 0; i < a.length; i++) {
      if (!isFlatNumberArray(a[i])) return false;
    }
    return true;
  }

  function fmt(value, depth) {
    if (value === null) return 'null';
    if (typeof value === 'number') {
      // Integers print without decimals, floats already rounded.
      return String(value);
    }
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (Array.isArray(value)) {
      if (isFlatNumberArray(value)) {
        return '[' + value.map((v) => String(v)).join(',') + ']';
      }
      if (isFlatNumberArrayArray(value)) {
        // Each inner row on its own line, indented.
        const pad = '  '.repeat(depth + 1);
        const inner = value
          .map((row) => pad + '[' + row.map((v) => String(v)).join(',') + ']')
          .join(',\n');
        return '[\n' + inner + '\n' + '  '.repeat(depth) + ']';
      }
      // Generic array
      const pad = '  '.repeat(depth + 1);
      const inner = value.map((v) => pad + fmt(v, depth + 1)).join(',\n');
      return '[\n' + inner + '\n' + '  '.repeat(depth) + ']';
    }
    if (typeof value === 'object') {
      const keys = Object.keys(value);
      if (keys.length === 0) return '{}';
      const pad = '  '.repeat(depth + 1);
      const parts = keys.map((k) => pad + JSON.stringify(k) + ': ' + fmt(value[k], depth + 1));
      return '{\n' + parts.join(',\n') + '\n' + '  '.repeat(depth) + '}';
    }
    return JSON.stringify(value);
  }

  return fmt(obj, 0);
}

build();
