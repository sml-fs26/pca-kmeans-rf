/* k-means math utilities. Pure functions, no DOM. */

window.KMEANS = (function () {

  function dist2(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  function dist(a, b) { return Math.sqrt(dist2(a, b)); }

  /* For each point, return the index of its nearest centroid. */
  function assignToNearest(points, centroids) {
    const out = new Array(points.length);
    for (let i = 0; i < points.length; i++) {
      let best = 0, bestD = Infinity;
      for (let k = 0; k < centroids.length; k++) {
        const d = dist2(points[i], centroids[k]);
        if (d < bestD) { bestD = d; best = k; }
      }
      out[i] = best;
    }
    return out;
  }

  /* Returns new centroids (mean of assigned points). Empty clusters yield null. */
  function updateCentroids(points, assignments, k) {
    const sums = Array.from({ length: k }, () => ({ x: 0, y: 0, n: 0 }));
    for (let i = 0; i < points.length; i++) {
      const a = assignments[i];
      sums[a].x += points[i].x;
      sums[a].y += points[i].y;
      sums[a].n++;
    }
    return sums.map(s => s.n > 0 ? { x: s.x / s.n, y: s.y / s.n } : null);
  }

  /* J = Σ_k Σ_{x∈C_k} ||x − μ_k||². */
  function computeJ(points, assignments, centroids) {
    let total = 0;
    for (let i = 0; i < points.length; i++) {
      total += dist2(points[i], centroids[assignments[i]]);
    }
    return total;
  }

  function pointJContribution(point, centroid) { return dist2(point, centroid); }

  /* Largest centroid movement between two iterations. */
  function maxCentroidShift(oldC, newC) {
    let max = 0;
    for (let k = 0; k < oldC.length; k++) {
      if (newC[k] === null || oldC[k] === null) continue;
      max = Math.max(max, dist(oldC[k], newC[k]));
    }
    return max;
  }

  /* Voronoi cell SVG paths via D3. bounds is [x0, y0, x1, y1]. */
  function voronoiCells(centroids, bounds) {
    if (typeof d3 === 'undefined' || !d3.Delaunay) return [];
    const valid = centroids.map((c, i) => ({ c, i })).filter(o => o.c !== null);
    if (valid.length < 1) return [];
    const pts = valid.map(o => [o.c.x, o.c.y]);
    const delaunay = d3.Delaunay.from(pts);
    const voronoi = delaunay.voronoi(bounds);
    const cells = new Array(centroids.length).fill(null);
    valid.forEach((o, j) => { cells[o.i] = voronoi.renderCell(j); });
    return cells;
  }

  /* Run Lloyd's algorithm to convergence. Returns full trajectory.
   * trajectory[t] = { centroids, assignments, J } where t=0 is the starting state. */
  function runLloyd(points, initialCentroids, opts) {
    opts = opts || {};
    const maxIter = opts.maxIter || 50;
    const eps = opts.eps != null ? opts.eps : 1e-6;
    const k = initialCentroids.length;

    const trajectory = [];
    let centroids = initialCentroids.map(c => ({ x: c.x, y: c.y }));
    let assignments = assignToNearest(points, centroids);
    trajectory.push({
      centroids: centroids.map(c => ({ ...c })),
      assignments: assignments.slice(),
      J: computeJ(points, assignments, centroids),
      step: 'init'
    });

    for (let t = 0; t < maxIter; t++) {
      const newCentroids = updateCentroids(points, assignments, k).map((c, i) =>
        c === null ? centroids[i] : c
      );
      const shift = maxCentroidShift(centroids, newCentroids);
      const newAssignments = assignToNearest(points, newCentroids);

      centroids = newCentroids;
      assignments = newAssignments;

      trajectory.push({
        centroids: centroids.map(c => ({ ...c })),
        assignments: assignments.slice(),
        J: computeJ(points, assignments, centroids),
        shift,
        step: 'iter'
      });

      if (shift < eps) break;
    }
    return trajectory;
  }

  /* k-means++ initialization. */
  function kmeansPlusPlus(points, k, rng) {
    const n = points.length;
    const r = rng || Math.random;
    const centroids = [];
    centroids.push({ ...points[Math.floor(r() * n)] });
    while (centroids.length < k) {
      const d2s = points.map(p => {
        let m = Infinity;
        for (const c of centroids) m = Math.min(m, dist2(p, c));
        return m;
      });
      const sum = d2s.reduce((a, b) => a + b, 0);
      let pick = r() * sum;
      let idx = 0;
      for (let i = 0; i < n; i++) {
        pick -= d2s[i];
        if (pick <= 0) { idx = i; break; }
      }
      centroids.push({ ...points[idx] });
    }
    return centroids;
  }

  /* Seedable RNG (mulberry32) for deterministic runs. */
  function seedRandom(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* Random k centroids drawn uniformly from data points. */
  function randomInit(points, k, rng) {
    const r = rng || Math.random;
    const idxs = new Set();
    while (idxs.size < k) idxs.add(Math.floor(r() * points.length));
    return Array.from(idxs).map(i => ({ ...points[i] }));
  }

  return {
    dist, dist2,
    assignToNearest, updateCentroids, computeJ, pointJContribution,
    maxCentroidShift, voronoiCells,
    runLloyd, kmeansPlusPlus, randomInit, seedRandom
  };
})();
