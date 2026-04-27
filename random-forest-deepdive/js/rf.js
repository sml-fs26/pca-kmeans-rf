// Shared math/geometry utilities for the random-forest viz.
// Tree node format (from precompute):
//   leaf:     { leaf: true,  value: 0|1, prob1: number, samples: int, depth: int }
//   internal: { leaf: false, feature: 0|1, threshold: number, left: node, right: node, samples: int, depth: int }

window.RF = (function () {

  // Predict the class for a single point by walking the tree.
  // If maxDepth is finite, stop at that depth and return the majority class
  // implied by the node's prob1 (>0.5 → 1, else 0).
  function walkTree(tree, x, y, maxDepth) {
    let node = tree;
    let d = 0;
    while (!node.leaf && d < (maxDepth ?? Infinity)) {
      const v = node.feature === 0 ? x : y;
      node = v <= node.threshold ? node.left : node.right;
      d++;
    }
    return node.leaf ? node.value : (node.prob1 >= 0.5 ? 1 : 0);
  }

  // Soft probability — fraction of class-1 at the (possibly truncated) node.
  function walkTreeProb(tree, x, y, maxDepth) {
    let node = tree;
    let d = 0;
    while (!node.leaf && d < (maxDepth ?? Infinity)) {
      const v = node.feature === 0 ? x : y;
      node = v <= node.threshold ? node.left : node.right;
      d++;
    }
    return node.prob1;
  }

  // Predict over a 2D grid of points. Returns a flat Float32Array of size nx*ny
  // (row-major, y outer, x inner). Values are 0/1 (use computeTreeBoundary)
  // or floats in [0,1] (use computeTreeProb).
  function gridXY(grid) {
    const xs = new Float32Array(grid.nx);
    const ys = new Float32Array(grid.ny);
    for (let i = 0; i < grid.nx; i++) xs[i] = grid.xMin + i * (grid.xMax - grid.xMin) / (grid.nx - 1);
    for (let j = 0; j < grid.ny; j++) ys[j] = grid.yMin + j * (grid.yMax - grid.yMin) / (grid.ny - 1);
    return { xs, ys };
  }

  function computeTreeBoundary(tree, grid, maxDepth) {
    const { xs, ys } = gridXY(grid);
    const out = new Uint8Array(grid.nx * grid.ny);
    for (let j = 0; j < grid.ny; j++) {
      for (let i = 0; i < grid.nx; i++) {
        out[j * grid.nx + i] = walkTree(tree, xs[i], ys[j], maxDepth);
      }
    }
    return out;
  }

  function computeTreeProb(tree, grid, maxDepth) {
    const { xs, ys } = gridXY(grid);
    const out = new Float32Array(grid.nx * grid.ny);
    for (let j = 0; j < grid.ny; j++) {
      for (let i = 0; i < grid.nx; i++) {
        out[j * grid.nx + i] = walkTreeProb(tree, xs[i], ys[j], maxDepth);
      }
    }
    return out;
  }

  // Convert a nested 2D array (b[j][i] — j is y-index from yMin upward, i is x-index)
  // into the flat (j*nx+i) layout that renderGridCells / renderProbCells expect.
  function flatten2D(nested) {
    const ny = nested.length, nx = nested[0].length;
    const out = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) {
      const row = nested[j];
      for (let i = 0; i < nx; i++) out[j * nx + i] = row[i];
    }
    return out;
  }

  // Average a set of {0,1} prediction grids into a [0,1] probability grid.
  function averageGrids(grids) {
    if (!grids.length) return null;
    const n = grids[0].length;
    const out = new Float32Array(n);
    for (let g = 0; g < grids.length; g++) {
      const arr = grids[g];
      for (let i = 0; i < n; i++) out[i] += arr[i];
    }
    for (let i = 0; i < n; i++) out[i] /= grids.length;
    return out;
  }

  // Extract axis-aligned split lines from a tree truncated at maxDepth.
  // Each split is { feature: 0|1, threshold: number, x0, x1, y0, y1 }
  // where (x0,x1,y0,y1) is the bounding rectangle in feature space at the
  // moment of the split (so the split line is clipped to the parent region).
  function extractSplits(tree, maxDepth, bbox) {
    const out = [];
    const md = maxDepth ?? Infinity;
    function walk(node, x0, x1, y0, y1, depth) {
      if (node.leaf || depth >= md) return;
      const t = node.threshold;
      if (node.feature === 0) {
        out.push({ feature: 0, threshold: t, x0: t, x1: t, y0, y1, depth });
        walk(node.left,  x0, t,  y0, y1, depth + 1);
        walk(node.right, t,  x1, y0, y1, depth + 1);
      } else {
        out.push({ feature: 1, threshold: t, x0, x1, y0: t, y1: t, depth });
        walk(node.left,  x0, x1, y0, t,  depth + 1);
        walk(node.right, x0, x1, t,  y1, depth + 1);
      }
    }
    walk(tree, bbox.x0, bbox.x1, bbox.y0, bbox.y1, 0);
    return out;
  }

  // Count nodes / leaves in a tree truncated at maxDepth.
  function treeStats(tree, maxDepth) {
    const md = maxDepth ?? Infinity;
    let nodes = 0, leaves = 0, depthMax = 0;
    function walk(node, d) {
      nodes++;
      depthMax = Math.max(depthMax, d);
      if (node.leaf || d >= md) { leaves++; return; }
      walk(node.left, d + 1);
      walk(node.right, d + 1);
    }
    walk(tree, 0);
    return { nodes, leaves, depthMax };
  }

  // Render a Uint8Array prediction grid as <rect> cells, colored by class.
  // Caller owns the parent <g>; we manage children via D3 join.
  // pixelSize: width/height of each cell in screen pixels.
  function renderGridCells(parentG, gridArr, grid, scaleX, scaleY) {
    const cells = [];
    const px = (scaleX(grid.xMax) - scaleX(grid.xMin)) / (grid.nx - 1);
    const py = (scaleY(grid.yMin) - scaleY(grid.yMax)) / (grid.ny - 1);
    for (let j = 0; j < grid.ny; j++) {
      for (let i = 0; i < grid.nx; i++) {
        cells.push({ i, j, v: gridArr[j * grid.nx + i] });
      }
    }
    const { xs, ys } = gridXY(grid);
    const sel = parentG.selectAll('rect.region-cell').data(cells);
    sel.enter().append('rect')
      .attr('class', 'region-cell')
      .merge(sel)
      .attr('x', d => scaleX(xs[d.i]) - px / 2)
      .attr('y', d => scaleY(ys[d.j]) - py / 2)
      .attr('width', px + 0.5)
      .attr('height', py + 0.5)
      .attr('class', d => 'region-cell ' + (d.v >= 0.5 ? 'region-2' : 'region-1'));
    sel.exit().remove();
  }

  // Render a soft probability grid as <rect> cells with fill-opacity by distance from 0.5.
  // The fill class flips when prob crosses 0.5.
  function renderProbCells(parentG, probArr, grid, scaleX, scaleY) {
    const cells = [];
    const px = (scaleX(grid.xMax) - scaleX(grid.xMin)) / (grid.nx - 1);
    const py = (scaleY(grid.yMin) - scaleY(grid.yMax)) / (grid.ny - 1);
    for (let j = 0; j < grid.ny; j++) {
      for (let i = 0; i < grid.nx; i++) {
        cells.push({ i, j, p: probArr[j * grid.nx + i] });
      }
    }
    const { xs, ys } = gridXY(grid);
    const sel = parentG.selectAll('rect.prob-cell').data(cells);
    sel.enter().append('rect')
      .attr('class', 'prob-cell')
      .merge(sel)
      .attr('x', d => scaleX(xs[d.i]) - px / 2)
      .attr('y', d => scaleY(ys[d.j]) - py / 2)
      .attr('width', px + 0.5)
      .attr('height', py + 0.5)
      .attr('class', d => 'prob-cell ' + (d.p >= 0.5 ? 'region-2' : 'region-1'))
      .attr('fill-opacity', d => Math.abs(d.p - 0.5) * 0.5 + 0.05);
    sel.exit().remove();
  }

  // Standard linear scales for the moons coordinate frame, given a viewport rect.
  function makeScales(grid, width, height, padX, padY) {
    padX = padX ?? 16;
    padY = padY ?? 16;
    return {
      x: d3.scaleLinear().domain([grid.xMin, grid.xMax]).range([padX, width - padX]),
      y: d3.scaleLinear().domain([grid.yMin, grid.yMax]).range([height - padY, padY]),
    };
  }

  return {
    walkTree, walkTreeProb,
    computeTreeBoundary, computeTreeProb,
    averageGrids, flatten2D,
    extractSplits, treeStats,
    renderGridCells, renderProbCells,
    makeScales, gridXY,
  };
})();
