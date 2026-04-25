/* Generates data/movies-data.js — the user × film rating matrix plus PCA.
 *
 * Run: node precompute/build-data.js  (writes to data/movies-data.js)
 *
 * Model:
 *   For each (user u, film f):
 *     r[u,f] = baseline + alpha * (a_u * a_f) + alpha * (b_u * b_f) + N(0, sigma)
 *   clamped to [1,5] and rounded to halves.
 *
 * a in {-1,+1} is the action(+1) ↔ romance(-1) axis.
 * b in {-1,+1} is the blockbuster(+1) ↔ indie(-1) axis.
 *
 * PCA:
 *   1. Center columns of the rating matrix.
 *   2. Power iteration with deflation gets the top 2 eigenvectors of (1/N) X^T X.
 *   3. Project each user row into the resulting 2D plane.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ----- Seeded RNG (Mulberry32) -----
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
function gauss(rng) {
  // Box-Muller; one sample per call (we drop the second).
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ----- Axis encoding -----
// category code: 'BA' blockbuster-action, 'IA' indie-action,
//                'BR' blockbuster-romance, 'IR' indie-romance
function axesFor(cat) {
  // a: +1 action, -1 romance ; b: +1 blockbuster, -1 indie
  switch (cat) {
    case 'BA': return { a: +1, b: +1 };
    case 'IA': return { a: +1, b: -1 };
    case 'BR': return { a: -1, b: +1 };
    case 'IR': return { a: -1, b: -1 };
  }
  throw new Error('unknown category: ' + cat);
}

// ----- Films (12) -----
const movies = [
  // Blockbuster action
  { id: 'avengers',   title: 'The Avengers',                    year: 2012, category: 'BA', tag: 'Superhero ensemble' },
  { id: 'topgun',     title: 'Top Gun: Maverick',               year: 2022, category: 'BA', tag: 'Fighter-jet spectacle' },
  { id: 'mifallout',  title: 'Mission: Impossible — Fallout',   year: 2018, category: 'BA', tag: 'Practical-stunt thriller' },
  // Indie action
  { id: 'drive',      title: 'Drive',                           year: 2011, category: 'IA', tag: 'Synth-noir getaway' },
  { id: 'sicario',    title: 'Sicario',                         year: 2015, category: 'IA', tag: 'Border-war procedural' },
  { id: 'johnwick',   title: 'John Wick',                       year: 2014, category: 'IA', tag: 'Cult action breakout' },
  // Blockbuster romance
  { id: 'titanic',    title: 'Titanic',                         year: 1997, category: 'BR', tag: 'Epic shipwreck love' },
  { id: 'notebook',   title: 'The Notebook',                    year: 2004, category: 'BR', tag: 'Letter-writing weepie' },
  { id: 'lalaland',   title: 'La La Land',                      year: 2016, category: 'BR', tag: 'Musical bittersweet' },
  // Indie romance
  { id: 'eternal',    title: 'Eternal Sunshine of the Spotless Mind', year: 2004, category: 'IR', tag: 'Memory-erasure heartbreak' },
  { id: 'lostintrans',title: 'Lost in Translation',             year: 2003, category: 'IR', tag: 'Tokyo-hotel quiet' },
  { id: 'cmbyn',      title: 'Call Me by Your Name',            year: 2017, category: 'IR', tag: 'Italian-summer ache' },
];

// Attach a, b
movies.forEach(m => Object.assign(m, axesFor(m.category)));

// ----- Users (16, 4 per category) -----
const users = [
  // Blockbuster action
  { id: 'u01', name: 'Marcus',  category: 'BA', blurb: 'Loves Marvel marathons; opening night, every time.' },
  { id: 'u02', name: 'Diego',   category: 'BA', blurb: 'Picks the loudest IMAX showing.' },
  { id: 'u03', name: 'Tyler',   category: 'BA', blurb: 'Owns three drone-shot Blu-rays.' },
  { id: 'u04', name: 'Brandon', category: 'BA', blurb: 'Re-watches Top Gun on long flights.' },
  // Indie action
  { id: 'u05', name: 'Mei',     category: 'IA', blurb: 'Letterboxd: 4.5 stars for anything Refn.' },
  { id: 'u06', name: 'Reza',    category: 'IA', blurb: 'Reads about cinematography between scenes.' },
  { id: 'u07', name: 'Ana',     category: 'IA', blurb: 'Will defend Sicario at any dinner table.' },
  { id: 'u08', name: 'Felix',   category: 'IA', blurb: 'Goes to the arthouse double bill.' },
  // Blockbuster romance
  { id: 'u09', name: 'Sophie',  category: 'BR', blurb: 'Cried at Titanic. Still cries.' },
  { id: 'u10', name: 'Olivia',  category: 'BR', blurb: 'Has the La La Land soundtrack memorized.' },
  { id: 'u11', name: 'Lily',    category: 'BR', blurb: 'Re-reads Nicholas Sparks every winter.' },
  { id: 'u12', name: 'Hannah',  category: 'BR', blurb: 'Sunday-night romcom ritual.' },
  // Indie romance
  { id: 'u13', name: 'Iris',    category: 'IR', blurb: 'Has opinions about Linklater\'s trilogy.' },
  { id: 'u14', name: 'Yuki',    category: 'IR', blurb: 'Lost in Translation poster on the wall.' },
  { id: 'u15', name: 'Naomi',   category: 'IR', blurb: 'Underlines Sufjan lyrics in notebooks.' },
  { id: 'u16', name: 'Theo',    category: 'IR', blurb: 'Goes to the indie cinema alone, and likes it.' },
];

users.forEach(u => Object.assign(u, axesFor(u.category)));

// ----- Build rating matrix -----
const SEED = 20260425;
const rng = mulberry32(SEED);
const ALPHA = 0.9;
const BASELINE = 3.0;
const SIGMA = 0.35;

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function roundHalf(x) { return Math.round(x * 2) / 2; }

const N = users.length;   // 16
const D = movies.length;  // 12

const matrix = []; // 16 × 12
for (let u = 0; u < N; u++) {
  const row = [];
  for (let f = 0; f < D; f++) {
    const r = BASELINE
      + ALPHA * (users[u].a * movies[f].a)
      + ALPHA * (users[u].b * movies[f].b)
      + SIGMA * gauss(rng);
    row.push(roundHalf(clamp(r, 1, 5)));
  }
  matrix.push(row);
}

// ----- Shuffled orders for the initial heatmap -----
function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const rowOrder = shuffle([...Array(N).keys()], rng);
const colOrder = shuffle([...Array(D).keys()], rng);

// Canonical sorted order — both rows and cols ordered BA, IA, BR, IR so the
// 4 matching categories sit on the main diagonal (bright blocks) and opposing
// categories sit on the anti-diagonal (dark blocks). Inside each macro-block
// the latent action/romance and blockbuster/indie attributes still show as
// finer sub-structure; the main 2D revelation is in scenes 6–8.
function sortedBy(items, order) {
  const out = [];
  order.forEach(c => {
    items.forEach((it, i) => { if (it.category === c) out.push(i); });
  });
  return out;
}
const catOrder = ['BA', 'IA', 'BR', 'IR'];
const sortedRowOrder = sortedBy(users,  catOrder);
const sortedColOrder = sortedBy(movies, catOrder);

// ----- PCA via power iteration on Σ = (1/N) X_c^T X_c -----
// Center columns.
const colMean = new Array(D).fill(0);
for (let u = 0; u < N; u++) for (let f = 0; f < D; f++) colMean[f] += matrix[u][f];
for (let f = 0; f < D; f++) colMean[f] /= N;

const Xc = matrix.map(row => row.map((v, f) => v - colMean[f])); // 16 × 12

// Σ = (1/N) X_c^T X_c   (D × D)
function buildCovariance(Xc) {
  const D = Xc[0].length, N = Xc.length;
  const S = Array.from({ length: D }, () => new Array(D).fill(0));
  for (let n = 0; n < N; n++) {
    const row = Xc[n];
    for (let i = 0; i < D; i++) {
      for (let j = i; j < D; j++) {
        S[i][j] += row[i] * row[j];
      }
    }
  }
  for (let i = 0; i < D; i++) {
    for (let j = i; j < D; j++) {
      S[i][j] /= N;
      if (i !== j) S[j][i] = S[i][j];
    }
  }
  return S;
}
const Sigma = buildCovariance(Xc);

function vecNorm(v) { let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * v[i]; return Math.sqrt(s); }
function normalize(v) { const n = vecNorm(v); return v.map(x => x / n); }
function matVec(S, v) {
  const out = new Array(v.length).fill(0);
  for (let i = 0; i < v.length; i++) {
    let s = 0;
    for (let j = 0; j < v.length; j++) s += S[i][j] * v[j];
    out[i] = s;
  }
  return out;
}
function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
function powerIteration(S, iters, seedRng) {
  const D = S.length;
  let v = new Array(D).fill(0).map(() => seedRng() - 0.5);
  v = normalize(v);
  for (let t = 0; t < iters; t++) {
    v = normalize(matVec(S, v));
  }
  const Sv = matVec(S, v);
  const lambda = dot(v, Sv);
  return { v, lambda };
}
function deflate(S, v, lambda) {
  const D = S.length;
  const out = Array.from({ length: D }, () => new Array(D).fill(0));
  for (let i = 0; i < D; i++) {
    for (let j = 0; j < D; j++) {
      out[i][j] = S[i][j] - lambda * v[i] * v[j];
    }
  }
  return out;
}

const piRng = mulberry32(SEED + 1);
const pc1 = powerIteration(Sigma, 400, piRng);
const Sigma2 = deflate(Sigma, pc1.v, pc1.lambda);
const pc2 = powerIteration(Sigma2, 400, piRng);
// Optional 3rd for scree comparison.
const Sigma3 = deflate(Sigma2, pc2.v, pc2.lambda);
const pc3 = powerIteration(Sigma3, 200, piRng);

// Total variance = trace(Σ).
let trace = 0;
for (let i = 0; i < D; i++) trace += Sigma[i][i];

// Sign convention: PC1 should make blockbuster-action users land on the positive
// quadrant of (PC1, PC2) for visual consistency. We compute sample projections
// and flip eigenvector signs if needed. (Eigenvectors are unique only up to sign.)
function project(Xc, V) {
  return Xc.map(row => V.map(v => dot(row, v)));
}
let projections = project(Xc, [pc1.v, pc2.v]);

// Find a representative BA user (category 'BA') and ensure its projection has
// positive PC1; also pick an IA user and ensure positive PC2 (action+indie).
const baIdx = users.findIndex(u => u.category === 'BA');
if (projections[baIdx][0] < 0) {
  pc1.v = pc1.v.map(x => -x);
  projections = project(Xc, [pc1.v, pc2.v]);
}
// Pick PC2 sign so indie-action users (a=+1, b=-1) have positive PC2 (i.e. PC2
// roughly aligns with "indie" direction). If the average IA PC2 is negative,
// flip pc2.
const iaProjAvg = users
  .map((u, i) => u.category === 'IA' ? projections[i][1] : null)
  .filter(x => x !== null)
  .reduce((s, x) => s + x, 0) / 4;
if (iaProjAvg < 0) {
  pc2.v = pc2.v.map(x => -x);
  projections = project(Xc, [pc1.v, pc2.v]);
}

// ----- Emit -----
const payload = {
  meta: {
    seed: SEED,
    nUsers: N,
    nMovies: D,
    alpha: ALPHA,
    baseline: BASELINE,
    sigma: SIGMA,
    builtAt: new Date().toISOString(),
  },
  axes: {
    a: { positive: 'action',      negative: 'romance' },
    b: { positive: 'blockbuster', negative: 'indie' },
  },
  categories: {
    BA: { label: 'Blockbuster Action',  short: 'BB·Act',  cluster: 1 },
    IA: { label: 'Indie Action',        short: 'In·Act',  cluster: 3 },
    BR: { label: 'Blockbuster Romance', short: 'BB·Rom',  cluster: 2 },
    IR: { label: 'Indie Romance',       short: 'In·Rom',  cluster: 4 },
  },
  movies,
  users,
  ratings: {
    matrix,         // 16 × 12, ratings in [1,5] half-step
    columnMean: colMean,
  },
  shuffle: {
    rowOrder,
    colOrder,
    sortedRowOrder,
    sortedColOrder,
  },
  pca: {
    eigenvalues: [pc1.lambda, pc2.lambda, pc3.lambda],
    totalVariance: trace,
    pc1: pc1.v,
    pc2: pc2.v,
    projections, // 16 × 2 in PCA coordinates
  },
};

const outPath = path.join(__dirname, '..', 'data', 'movies-data.js');
const js = '/* Generated by precompute/build-data.js — do not edit by hand. */\n' +
  'window.MOVIES_DATA = ' + JSON.stringify(payload, null, 2) + ';\n';
fs.writeFileSync(outPath, js);

// ----- Sanity report to stdout -----
console.log(`Wrote ${outPath}`);
console.log(`Eigenvalues (top 3): ${pc1.lambda.toFixed(3)}, ${pc2.lambda.toFixed(3)}, ${pc3.lambda.toFixed(3)}`);
console.log(`Trace(Σ) = ${trace.toFixed(3)}`);
console.log(`PC1 explains ${(100 * pc1.lambda / trace).toFixed(1)}%`);
console.log(`PC2 explains ${(100 * pc2.lambda / trace).toFixed(1)}%`);
console.log(`Top two combined: ${(100 * (pc1.lambda + pc2.lambda) / trace).toFixed(1)}%`);

// Sanity: per-category mean projection.
const catMeans = { BA: [0,0,0], IA: [0,0,0], BR: [0,0,0], IR: [0,0,0] };
users.forEach((u, i) => {
  catMeans[u.category][0] += projections[i][0];
  catMeans[u.category][1] += projections[i][1];
  catMeans[u.category][2] += 1;
});
console.log('Mean PC1, PC2 by category:');
Object.entries(catMeans).forEach(([c, [s1, s2, n]]) => {
  console.log(`  ${c}: PC1=${(s1/n).toFixed(2)}  PC2=${(s2/n).toFixed(2)}`);
});
