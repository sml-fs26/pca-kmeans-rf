// Shared random-forest math + traversal utilities. No DOM. No d3.
// Scenes lift this for any prediction or formula evaluation they need.

window.RF = (function () {

  // ---- Tree traversal ------------------------------------------------------

  // Walk a serialized sklearn tree (DATA.forest2D.trees[i]) for a feature vector.
  // `point` is an array of feature values, length = number of features the tree was trained on.
  // For 2D trees: point = [bill_length, flipper_length].
  function predictPath(tree, point) {
    const path = [];
    let nodeId = 0;
    while (true) {
      const node = tree.nodes[nodeId];
      path.push(nodeId);
      if (node.isLeaf) return path;
      nodeId = (point[node.feature] <= node.threshold) ? node.left : node.right;
    }
  }

  function predictLeaf(tree, point) {
    let nodeId = 0;
    while (true) {
      const node = tree.nodes[nodeId];
      if (node.isLeaf) return node;
      nodeId = (point[node.feature] <= node.threshold) ? node.left : node.right;
    }
  }

  function predictClass(tree, point) {
    return predictLeaf(tree, point).majorityClass;
  }

  function leafProbability(tree, point) {
    const leaf = predictLeaf(tree, point);
    const total = leaf.classDistribution.reduce((a, b) => a + b, 0);
    return leaf.classDistribution.map(c => c / total);
  }

  // ---- Forest aggregation --------------------------------------------------

  // Hard votes: returns { counts: [c0, c1, c2], winner: argmax }
  function forestVotes(trees, point, nClasses) {
    const counts = new Array(nClasses).fill(0);
    for (const tree of trees) {
      counts[predictClass(tree, point)]++;
    }
    let winner = 0;
    for (let i = 1; i < counts.length; i++) if (counts[i] > counts[winner]) winner = i;
    return { counts, winner };
  }

  // Soft probabilities (sklearn's `predict_proba` semantics): mean of per-tree leaf class probabilities.
  function forestProb(trees, point, nClasses) {
    const probs = new Array(nClasses).fill(0);
    for (const tree of trees) {
      const p = leafProbability(tree, point);
      for (let i = 0; i < nClasses; i++) probs[i] += p[i];
    }
    for (let i = 0; i < nClasses; i++) probs[i] /= trees.length;
    return probs;
  }

  // ---- Variance formula (scene 8) -----------------------------------------

  function varianceAtB(rho, sigma2, B) {
    return rho * sigma2 + (1 - rho) * sigma2 / B;
  }

  function varianceCurve(rho, sigma2, BMax) {
    const out = new Array(BMax);
    for (let B = 1; B <= BMax; B++) out[B - 1] = { B, v: varianceAtB(rho, sigma2, B) };
    return out;
  }

  // ---- Decision boundary grid helpers --------------------------------------

  // Map a flat int8 grid (length w*h) to {x, y, classIdx} cells in plot coords.
  // Useful for d3.contours or canvas raster drawing.
  function gridCellAt(arr, gridW, i, j) {
    return arr[j * gridW + i];
  }

  // Convert plot coords to grid index using DATA.scatter extents.
  function plotToGrid(x, y, scatter, gridW, gridH) {
    const i = Math.max(0, Math.min(gridW - 1, Math.floor((x - scatter.xMin) / (scatter.xMax - scatter.xMin) * gridW)));
    const j = Math.max(0, Math.min(gridH - 1, Math.floor((y - scatter.yMin) / (scatter.yMax - scatter.yMin) * gridH)));
    return { i, j };
  }

  // ---- Color helpers -------------------------------------------------------

  // Use these CSS classes — never inline hex — so dark mode swaps automatically.
  // 1-indexed to match the .cluster-N convention in style.css.
  function classToken(classIdx) { return `cluster-${classIdx + 1}`; }

  // Read the current resolved hex for a class, when an SVG element absolutely needs it
  // (e.g. for a canvas draw). The Theme module exposes readVar().
  function classColor(classIdx) {
    return Theme.readVar(`--c${classIdx + 1}`);
  }

  // ---- Lower-triangular access for the similarity matrix ------------------

  // distLowerTri stores entries (i, j) with i > j in row-major order:
  //   index(i, j) = i*(i-1)/2 + j   for i > j
  function similarityAt(distLowerTri, i, j) {
    if (i === j) return 0;
    if (i < j) [i, j] = [j, i];
    return distLowerTri[i * (i - 1) / 2 + j];
  }

  return {
    predictPath, predictLeaf, predictClass, leafProbability,
    forestVotes, forestProb,
    varianceAtB, varianceCurve,
    gridCellAt, plotToGrid,
    classToken, classColor,
    similarityAt,
  };
})();
