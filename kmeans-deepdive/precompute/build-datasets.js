/* eslint-disable no-console */
// Build precomputed data for the k-means deep-dive visualization.
// Pure Node.js, no external deps. Outputs ../data/datasets.js.

'use strict';

const fs = require('fs');
const path = require('path');

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

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function round3(v) { return Math.round(v * 1000) / 1000; }

function roundPoint(p) { return { x: round3(p.x), y: round3(p.y) }; }

// ---------- Dataset generators ----------

function genGaussianBlobs(seed) {
  const rng = mulberry32(seed);
  const gauss = makeGaussian(rng);
  const centers = [
    { x: 25, y: 30, std: 6.5 },
    { x: 70, y: 25, std: 7.0 },
    { x: 50, y: 75, std: 7.5 },
  ];
  const counts = [50, 50, 50]; // n=150
  const points = [];
  for (let c = 0; c < centers.length; c++) {
    const { x, y, std } = centers[c];
    for (let i = 0; i < counts[c]; i++) {
      const px = clamp(gauss(x, std), 0, 100);
      const py = clamp(gauss(y, std), 0, 100);
      points.push({ x: px, y: py });
    }
  }
  return points;
}

function genSmiley(seed) {
  const rng = mulberry32(seed);
  const gauss = makeGaussian(rng);
  const points = [];
  // Left eye
  for (let i = 0; i < 30; i++) {
    points.push({
      x: clamp(gauss(35, 2.5), 0, 100),
      y: clamp(gauss(65, 2.5), 0, 100),
    });
  }
  // Right eye
  for (let i = 0; i < 30; i++) {
    points.push({
      x: clamp(gauss(65, 2.5), 0, 100),
      y: clamp(gauss(65, 2.5), 0, 100),
    });
  }
  // Nose (small)
  for (let i = 0; i < 20; i++) {
    points.push({
      x: clamp(gauss(50, 2), 0, 100),
      y: clamp(gauss(45, 2.5), 0, 100),
    });
  }
  // Mouth: arc from (30,25) -> (50,18) -> (70,25). Parameterize by t in [0,1].
  // Use a parabola y = 25 - 7*(1 - (2t-1)^2) so apex at t=0.5 -> y=18.
  const arcN = 120; // total points across the smile
  for (let i = 0; i < arcN; i++) {
    const t = i / (arcN - 1);
    const xc = 30 + 40 * t;
    const yc = 25 - 7 * (1 - Math.pow(2 * t - 1, 2));
    points.push({
      x: clamp(gauss(xc, 1.0), 0, 100),
      y: clamp(gauss(yc, 1.0), 0, 100),
    });
  }
  return points; // 30+30+20+120 = 200
}

function genUniform(seed) {
  const rng = mulberry32(seed);
  const points = [];
  for (let i = 0; i < 120; i++) {
    points.push({
      x: 10 + 80 * rng(),
      y: 10 + 80 * rng(),
    });
  }
  return points;
}

function genTwoMoons(seed) {
  const rng = mulberry32(seed);
  const gauss = makeGaussian(rng);
  // sklearn-style: upper moon and lower moon, interleaving.
  // Native coords ~[-1,2] x [-0.5,1]. Map to [0,100]^2.
  const N = 75;
  const raw = [];
  for (let i = 0; i < N; i++) {
    const t = Math.PI * (i / (N - 1));
    raw.push({ x: Math.cos(t), y: Math.sin(t) }); // upper moon: x in [-1,1], y in [0,1]
  }
  for (let i = 0; i < N; i++) {
    const t = Math.PI * (i / (N - 1));
    raw.push({ x: 1 - Math.cos(t), y: 0.5 - Math.sin(t) }); // lower moon
  }
  // Map: x_native in [-1, 2] -> [10, 90]; y_native in [-0.5, 1] -> [20, 80] (flip y so upper moon visually up)
  const points = raw.map((p) => {
    const xMapped = 10 + 80 * ((p.x - -1) / 3);
    const yMapped = 20 + 60 * ((1 - p.y) / 1.5); // flip and scale
    const noise = 1.4;
    return {
      x: clamp(gauss(xMapped, noise), 0, 100),
      y: clamp(gauss(yMapped, noise), 0, 100),
    };
  });
  return points; // 150
}

// ---------- iterDemo (small, clean, K=3) ----------
function genIterDemo(seed = 11) {
  const rng = mulberry32(seed);
  const gauss = makeGaussian(rng);
  const centers = [
    { x: 25, y: 30 },
    { x: 70, y: 35 },
    { x: 50, y: 75 },
  ];
  const points = [];
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < 8; i++) {
      points.push({
        x: clamp(gauss(centers[c].x, 5), 0, 100),
        y: clamp(gauss(centers[c].y, 5), 0, 100),
      });
    }
  }
  // Suboptimal but reasonable initial centroids: all three start clustered near
  // the figure's centroid, so Lloyd's needs ~4 iterations to spread them out
  // to the three true blobs (long enough for students to see the dynamics).
  const initialCentroids = [
    { x: 40, y: 60 },
    { x: 60, y: 60 },
    { x: 50, y: 50 },
  ];
  return { points, initialCentroids };
}

// ---------- k-means / Lloyd ----------

function dist2(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function assignAll(points, centroids) {
  const a = new Array(points.length);
  for (let i = 0; i < points.length; i++) {
    let best = 0;
    let bestD = Infinity;
    for (let k = 0; k < centroids.length; k++) {
      const d = dist2(points[i], centroids[k]);
      if (d < bestD) { bestD = d; best = k; }
    }
    a[i] = best;
  }
  return a;
}

function computeJ(points, centroids, assignments) {
  let J = 0;
  for (let i = 0; i < points.length; i++) {
    J += dist2(points[i], centroids[assignments[i]]);
  }
  return J;
}

function updateCentroids(points, assignments, k, prev) {
  const sums = Array.from({ length: k }, () => ({ x: 0, y: 0, n: 0 }));
  for (let i = 0; i < points.length; i++) {
    const c = assignments[i];
    sums[c].x += points[i].x;
    sums[c].y += points[i].y;
    sums[c].n += 1;
  }
  const out = [];
  for (let k_ = 0; k_ < k; k_++) {
    if (sums[k_].n === 0) {
      // Empty cluster: keep previous centroid (rare in our seeds).
      out.push({ x: prev[k_].x, y: prev[k_].y });
    } else {
      out.push({ x: sums[k_].x / sums[k_].n, y: sums[k_].y / sums[k_].n });
    }
  }
  return out;
}

function maxShift(prev, next) {
  let m = 0;
  for (let i = 0; i < prev.length; i++) {
    const d = Math.sqrt(dist2(prev[i], next[i]));
    if (d > m) m = d;
  }
  return m;
}

function initRandom(points, k, rng) {
  // Sample k distinct points uniformly.
  const idx = new Set();
  while (idx.size < k) {
    idx.add(Math.floor(rng() * points.length));
  }
  return Array.from(idx).map((i) => ({ x: points[i].x, y: points[i].y }));
}

function initKMeansPP(points, k, rng) {
  const n = points.length;
  const chosen = [];
  // Pick first centroid uniformly at random
  const first = Math.floor(rng() * n);
  chosen.push({ x: points[first].x, y: points[first].y });
  // Pick remaining
  while (chosen.length < k) {
    // For each point, distance to nearest chosen centroid (squared)
    const d2 = new Array(n);
    let total = 0;
    for (let i = 0; i < n; i++) {
      let best = Infinity;
      for (let c = 0; c < chosen.length; c++) {
        const d = dist2(points[i], chosen[c]);
        if (d < best) best = d;
      }
      d2[i] = best;
      total += best;
    }
    // Sample proportional to d2
    let r = rng() * total;
    let pick = n - 1;
    for (let i = 0; i < n; i++) {
      r -= d2[i];
      if (r <= 0) { pick = i; break; }
    }
    chosen.push({ x: points[pick].x, y: points[pick].y });
  }
  return chosen;
}

function runLloyd(points, k, initCentroids, opts = {}) {
  const maxIter = opts.maxIter ?? 50;
  const tol = opts.tol ?? 1e-6;
  const trajectory = [];
  let centroids = initCentroids.map((c) => ({ x: c.x, y: c.y }));
  // Initial state: assign once, no shift.
  let assignments = assignAll(points, centroids);
  let J = computeJ(points, centroids, assignments);
  trajectory.push({
    centroids: centroids.map(roundPoint),
    assignments: assignments.slice(),
    J: round3(J),
    step: 'init',
  });
  for (let it = 0; it < maxIter; it++) {
    const newCentroids = updateCentroids(points, assignments, k, centroids);
    const shift = maxShift(centroids, newCentroids);
    const newAssignments = assignAll(points, newCentroids);
    const newJ = computeJ(points, newCentroids, newAssignments);
    centroids = newCentroids;
    assignments = newAssignments;
    J = newJ;
    trajectory.push({
      centroids: centroids.map(roundPoint),
      assignments: assignments.slice(),
      J: round3(J),
      step: 'iter',
      shift: round3(shift),
    });
    if (shift < tol) break;
  }
  return { trajectory, finalJ: J };
}

// ---------- Build all ----------

function build() {
  // Datasets
  const gaussianBlobs = genGaussianBlobs(1);
  const smiley = genSmiley(2);
  const uniform = genUniform(3);
  const twoMoons = genTwoMoons(4);

  const datasets = {
    gaussianBlobs: {
      points: gaussianBlobs.map(roundPoint),
      meta: {
        n: gaussianBlobs.length,
        kHint: 3,
        name: 'Gaussian blobs',
        description: 'Three well-separated isotropic Gaussian clusters; the textbook case where k-means works.',
      },
    },
    smiley: {
      points: smiley.map(roundPoint),
      meta: {
        n: smiley.length,
        kHint: 4,
        name: 'Smiley',
        description: 'Two eyes, a nose, and a curved mouth; the non-convex mouth challenges k-means.',
      },
    },
    uniform: {
      points: uniform.map(roundPoint),
      meta: {
        n: uniform.length,
        kHint: 3,
        name: 'Uniform',
        description: 'Points sampled uniformly in a square; k-means imposes structure even when none exists.',
      },
    },
    twoMoons: {
      points: twoMoons.map(roundPoint),
      meta: {
        n: twoMoons.length,
        kHint: 2,
        name: 'Two moons',
        description: 'Two interleaving crescents; k-means cannot recover non-convex clusters.',
      },
    },
  };

  // iterDemo
  const demo = genIterDemo(11);
  const iterDemo = {
    points: demo.points.map(roundPoint),
    initialCentroids: demo.initialCentroids.map(roundPoint),
    k: 3,
    datasetLabel: 'Three blobs (small)',
  };

  // ---------- Runs ----------
  const blobPoints = gaussianBlobs; // use full-precision points internally

  // canonical: k-means++ seed 42
  const canonRng = mulberry32(42);
  const canonInit = initKMeansPP(blobPoints, 3, canonRng);
  const canonical = runLloyd(blobPoints, 3, canonInit);

  // goodKMeansPP: same as canonical (intentionally duplicated)
  const goodRng = mulberry32(42);
  const goodInit = initKMeansPP(blobPoints, 3, goodRng);
  const good = runLloyd(blobPoints, 3, goodInit);

  // badRandom: search seeds for one that yields a visibly bad outcome.
  const goodFinalJ = good.finalJ;
  let chosenBadSeed = null;
  let badRun = null;
  const candidateSeeds = [];
  for (let s = 1; s <= 200; s++) candidateSeeds.push(s);
  for (const s of candidateSeeds) {
    const rng = mulberry32(s);
    const init = initRandom(blobPoints, 3, rng);
    const run = runLloyd(blobPoints, 3, init);
    if (run.finalJ > 1.10 * goodFinalJ) {
      // Also verify trajectory length sanity.
      if (run.trajectory.length >= 4 && run.trajectory.length <= 25) {
        chosenBadSeed = s;
        badRun = run;
        break;
      }
    }
  }
  if (badRun === null) {
    throw new Error('Could not find a random seed yielding a visibly bad outcome among seeds 1..200.');
  }

  const runs = {
    canonical: {
      datasetKey: 'gaussianBlobs',
      initStrategy: 'kmeans++',
      seed: 42,
      k: 3,
      trajectory: canonical.trajectory,
    },
    badRandom: {
      datasetKey: 'gaussianBlobs',
      initStrategy: 'random',
      seed: chosenBadSeed,
      k: 3,
      trajectory: badRun.trajectory,
    },
    goodKMeansPP: {
      datasetKey: 'gaussianBlobs',
      initStrategy: 'kmeans++',
      seed: 42,
      k: 3,
      trajectory: good.trajectory,
    },
  };

  const DATA = { datasets, iterDemo, runs };

  // ---------- Verification ----------
  verify(DATA, { goodFinalJ: good.finalJ, badFinalJ: badRun.finalJ });

  // ---------- Write file ----------
  const header =
    '/* AUTO-GENERATED by precompute/build-datasets.js. Do not edit by hand.\n' +
    ' * Coordinates in [0,100]x[0,100]. See precompute/build-datasets.js for generation logic.\n' +
    ' */\n';
  const body = 'window.DATA = ' + JSON.stringify(DATA) + ';\n';
  const outPath = path.resolve(__dirname, '..', 'data', 'datasets.js');
  fs.writeFileSync(outPath, header + body);

  // ---------- Report ----------
  console.log('--- Build summary ---');
  console.log(`gaussianBlobs: n=${datasets.gaussianBlobs.points.length}`);
  console.log(`smiley:        n=${datasets.smiley.points.length}`);
  console.log(`uniform:       n=${datasets.uniform.points.length}`);
  console.log(`twoMoons:      n=${datasets.twoMoons.points.length}`);
  console.log(`iterDemo:      n=${iterDemo.points.length}, k=${iterDemo.k}`);
  for (const [name, run] of Object.entries(runs)) {
    const t = run.trajectory;
    const initJ = t[0].J;
    const finalJ = t[t.length - 1].J;
    console.log(
      `run ${name}: iters=${t.length - 1} (entries=${t.length}), initJ=${initJ}, finalJ=${finalJ}, seed=${run.seed}, init=${run.initStrategy}`
    );
  }
  const gap = (badRun.finalJ - good.finalJ) / good.finalJ;
  console.log(`badRandom seed chosen: ${chosenBadSeed}`);
  console.log(`J gap (badRandom vs goodKMeansPP): ${(gap * 100).toFixed(2)}% (must be > 10%)`);
  console.log('All four verification checks passed.');
  console.log(`Wrote ${outPath}`);
}

function verify(DATA, ctx) {
  // 1. J monotonically non-increasing per run
  const eps = 1e-6;
  for (const [name, run] of Object.entries(DATA.runs)) {
    const t = run.trajectory;
    for (let i = 1; i < t.length; i++) {
      if (t[i].J > t[i - 1].J + eps) {
        throw new Error(`Monotonicity violated in run ${name} at step ${i}: ${t[i - 1].J} -> ${t[i].J}`);
      }
    }
  }
  // 2. badRandom > 1.10 * goodKMeansPP
  const bF = DATA.runs.badRandom.trajectory[DATA.runs.badRandom.trajectory.length - 1].J;
  const gF = DATA.runs.goodKMeansPP.trajectory[DATA.runs.goodKMeansPP.trajectory.length - 1].J;
  if (!(bF > 1.10 * gF)) {
    throw new Error(`badRandom finalJ (${bF}) is not > 1.10 * goodKMeansPP finalJ (${gF}).`);
  }
  // 3. trajectory length 4..25 inclusive
  for (const [name, run] of Object.entries(DATA.runs)) {
    const L = run.trajectory.length;
    if (L < 4 || L > 25) {
      throw new Error(`Trajectory length out of range for ${name}: ${L}`);
    }
  }
  // 4. No NaN / null in points or centroids
  function checkPt(p, where) {
    if (p == null || typeof p.x !== 'number' || typeof p.y !== 'number' || Number.isNaN(p.x) || Number.isNaN(p.y)) {
      throw new Error(`Bad point in ${where}: ${JSON.stringify(p)}`);
    }
  }
  for (const [key, ds] of Object.entries(DATA.datasets)) {
    ds.points.forEach((p, i) => checkPt(p, `datasets.${key}.points[${i}]`));
  }
  DATA.iterDemo.points.forEach((p, i) => checkPt(p, `iterDemo.points[${i}]`));
  DATA.iterDemo.initialCentroids.forEach((p, i) => checkPt(p, `iterDemo.initialCentroids[${i}]`));
  for (const [name, run] of Object.entries(DATA.runs)) {
    run.trajectory.forEach((s, ti) => {
      s.centroids.forEach((c, ci) => checkPt(c, `runs.${name}.trajectory[${ti}].centroids[${ci}]`));
      if (!Array.isArray(s.assignments)) {
        throw new Error(`Bad assignments in runs.${name}.trajectory[${ti}]`);
      }
      for (const a of s.assignments) {
        if (!Number.isInteger(a) || a < 0 || a >= run.k) {
          throw new Error(`Bad assignment value in runs.${name}.trajectory[${ti}]: ${a}`);
        }
      }
      if (typeof s.J !== 'number' || Number.isNaN(s.J)) {
        throw new Error(`Bad J in runs.${name}.trajectory[${ti}]`);
      }
    });
  }
}

build();
