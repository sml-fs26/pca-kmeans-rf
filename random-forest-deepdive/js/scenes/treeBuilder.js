// VIZ: treeBuilder — owns scenes 1 (singleOverfit) and 2 (fiveBootstraps).
//
// Scene 1 (sub: 'singleOverfit'): scatter the 233 training penguins, then grow
//   one tree's axis-aligned splits in BFS order before fading in the resulting
//   decision regions. Caption notes the (overfit) 100% training accuracy.
//
// Scene 2 (sub: 'fiveBootstraps'): same scatter, but 5 trees' decision regions
//   are stacked at low opacity. A small tray of tree chips lets the reader lift
//   any single tree to higher opacity by hovering.

(function () {
  // ---- Layout constants (in SVG-pixel space; sized to ctx.svg's bounding box) ----
  const M = { top: 14, right: 22, bottom: 36, left: 50 };
  const POINT_R = 3.4;
  const SPLIT_STAGGER_MS = 90;       // delay between BFS depth tiers when drawing splits
  const SPLIT_DRAW_MS = 220;         // dasharray reveal duration per split line
  const REGION_FADE_MS = 600;        // colored regions fade-in
  const SCENE2_CROSSFADE_MS = 600;   // additional 4 trees fade in over this

  // ---- Scene-local state we need to tear down on exit ------------------------
  let activeTimers = [];
  let currentSub = null;

  function clearTimers() {
    activeTimers.forEach(t => clearTimeout(t));
    activeTimers = [];
  }
  function later(fn, ms) {
    const id = setTimeout(fn, ms);
    activeTimers.push(id);
    return id;
  }

  // ---- Tree → list of leaf decision rectangles ------------------------------
  // Walks the tree depth-first. Each non-leaf splits its parent's bounding box
  // along feature 0 (x = bill_length) or feature 1 (y = flipper_length).
  // Returns:
  //   { leaves: [{xLo, xHi, yLo, yHi, classIdx, depth}],
  //     splits: [{depth, feature, threshold, xLo, xHi, yLo, yHi}] (one per non-leaf, in BFS order) }
  function describeTree(tree, scatter) {
    const root = { node: tree.nodes[0], xLo: scatter.xMin, xHi: scatter.xMax,
                   yLo: scatter.yMin, yHi: scatter.yMax, depth: 0 };
    const leaves = [];
    const splits = [];

    // BFS so split rendering order matches scene-1 narrative ("root first, then children").
    const queue = [root];
    while (queue.length) {
      const item = queue.shift();
      const n = item.node;
      if (n.isLeaf) {
        leaves.push({
          xLo: item.xLo, xHi: item.xHi, yLo: item.yLo, yHi: item.yHi,
          classIdx: n.majorityClass, depth: item.depth,
        });
        continue;
      }
      splits.push({
        depth: item.depth, feature: n.feature, threshold: n.threshold,
        xLo: item.xLo, xHi: item.xHi, yLo: item.yLo, yHi: item.yHi,
      });
      // feature 0 = x (bill_length), feature 1 = y (flipper_length).
      // sklearn convention: "left" branch is "<= threshold".
      if (n.feature === 0) {
        queue.push({ node: tree.nodes[n.left],
          xLo: item.xLo, xHi: n.threshold, yLo: item.yLo, yHi: item.yHi, depth: item.depth + 1 });
        queue.push({ node: tree.nodes[n.right],
          xLo: n.threshold, xHi: item.xHi, yLo: item.yLo, yHi: item.yHi, depth: item.depth + 1 });
      } else {
        queue.push({ node: tree.nodes[n.left],
          xLo: item.xLo, xHi: item.xHi, yLo: item.yLo, yHi: n.threshold, depth: item.depth + 1 });
        queue.push({ node: tree.nodes[n.right],
          xLo: item.xLo, xHi: item.xHi, yLo: n.threshold, yHi: item.yHi, depth: item.depth + 1 });
      }
    }
    return { leaves, splits };
  }

  // ---- Common scaffolding (axes, scatter) — used by both scenes -------------
  function buildScaffold(ctx) {
    const data = ctx.data;
    const rect = ctx.svg.getBoundingClientRect();
    const W = Math.max(320, rect.width);
    const H = Math.max(240, rect.height);

    const svg = d3.select(ctx.svg);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${W} ${H}`).attr('preserveAspectRatio', 'xMidYMid meet');

    const x = d3.scaleLinear()
      .domain([data.scatter.xMin, data.scatter.xMax])
      .range([M.left, W - M.right]);
    const y = d3.scaleLinear()
      .domain([data.scatter.yMin, data.scatter.yMax])
      .range([H - M.bottom, M.top]);

    // Layer order matters: regions (behind), splits, points (front), axes (front).
    const gRegionsBack = svg.append('g').attr('class', 'tb-regions-back');
    const gSplits = svg.append('g').attr('class', 'tb-splits');
    const gPoints = svg.append('g').attr('class', 'tb-points');
    const gAxes = svg.append('g').attr('class', 'tb-axes');

    // Axes
    const xAxis = d3.axisBottom(x).ticks(6).tickSizeOuter(0);
    const yAxis = d3.axisLeft(y).ticks(6).tickSizeOuter(0);
    gAxes.append('g')
      .attr('class', 'axis')
      .attr('transform', `translate(0, ${H - M.bottom})`)
      .call(xAxis);
    gAxes.append('g')
      .attr('class', 'axis')
      .attr('transform', `translate(${M.left}, 0)`)
      .call(yAxis);
    gAxes.append('text')
      .attr('class', 'tb-axis-label')
      .attr('x', (W + M.left - M.right) / 2)
      .attr('y', H - 6)
      .attr('text-anchor', 'middle')
      .text(data.scatter.xLabel);
    gAxes.append('text')
      .attr('class', 'tb-axis-label')
      .attr('transform', `translate(14, ${(H - M.bottom + M.top) / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .text(data.scatter.yLabel);

    // Training scatter (stable across scenes 1 and 2).
    const train = data.points.filter(p => p.split === 'train');
    gPoints.selectAll('circle.tb-point')
      .data(train, d => d.id)
      .enter()
      .append('circle')
      .attr('class', d => `tb-point cluster-${d.classIdx + 1}`)
      .attr('r', POINT_R)
      .attr('cx', d => x(d.x))
      .attr('cy', d => y(d.y));

    // Clear overlay/controls/readout up-front (scenes refill them).
    ctx.overlay.innerHTML = '';
    ctx.controls.innerHTML = '';
    ctx.readout.innerHTML = '';

    return { svg, x, y, W, H, gRegionsBack, gSplits, gPoints, gAxes, train };
  }

  // ---- Scene 1: single overfit tree ----------------------------------------
  function renderSingleOverfit(ctx) {
    const data = ctx.data;
    const tree = data.forest2D.trees[0];
    const scaff = buildScaffold(ctx);
    const { x, y, gRegionsBack, gSplits } = scaff;

    const { leaves, splits } = describeTree(tree, data.scatter);

    // Pre-paint leaf regions (transparent for now, fades in after splits drawn).
    gRegionsBack.selectAll('rect.tb-region')
      .data(leaves)
      .enter()
      .append('rect')
      .attr('class', d => `tb-region cluster-${d.classIdx + 1}`)
      .attr('x', d => x(d.xLo))
      .attr('y', d => y(d.yHi))    // y-axis flipped: yHi → smaller pixel
      .attr('width', d => Math.max(0, x(d.xHi) - x(d.xLo)))
      .attr('height', d => Math.max(0, y(d.yLo) - y(d.yHi)));

    // Group splits by depth so we can pace the BFS reveal in clean tiers.
    const byDepth = d3.group(splits, s => s.depth);
    const depths = Array.from(byDepth.keys()).sort((a, b) => a - b);

    // Draw splits with a stroke-dasharray growing animation.
    depths.forEach(d => {
      const lines = byDepth.get(d);
      const t0 = d * SPLIT_STAGGER_MS;
      later(() => {
        const sel = gSplits.selectAll(null)
          .data(lines)
          .enter()
          .append('line')
          .attr('class', 'tb-split');

        sel.each(function (s) {
          let x1, y1, x2, y2;
          if (s.feature === 0) {
            // Vertical cut at x = threshold, spanning parent's y-range.
            x1 = x2 = x(s.threshold);
            y1 = y(s.yLo);  // bottom (in plot coords)
            y2 = y(s.yHi);
          } else {
            // Horizontal cut at y = threshold, spanning parent's x-range.
            x1 = x(s.xLo);
            x2 = x(s.xHi);
            y1 = y2 = y(s.threshold);
          }
          const len = Math.hypot(x2 - x1, y2 - y1);
          d3.select(this)
            .attr('x1', x1).attr('y1', y1)
            .attr('x2', x2).attr('y2', y2)
            .attr('stroke-dasharray', `${len} ${len}`)
            .attr('stroke-dashoffset', len)
            .transition().duration(SPLIT_DRAW_MS).ease(d3.easeCubicOut)
            .attr('stroke-dashoffset', 0);
        });
      }, t0);
    });

    // After the deepest split has drawn, fade in colored regions and soften the splits.
    const totalSplitsTime = (depths.length ? depths[depths.length - 1] * SPLIT_STAGGER_MS : 0)
                            + SPLIT_DRAW_MS;
    later(() => {
      gRegionsBack.selectAll('rect.tb-region').classed('tb-region-on', true);
      gSplits.selectAll('line.tb-split').classed('tb-split-faded', true);
    }, totalSplitsTime + 120);

    // Compute training accuracy (using RF.predictLeaf; tree expects [bill_length, flipper_length]).
    let correct = 0;
    scaff.train.forEach(p => {
      const leaf = window.RF.predictLeaf(tree, [p.x, p.y]);
      if (leaf.majorityClass === p.classIdx) correct++;
    });
    const trainAcc = correct / scaff.train.length;

    // Readout caption (the headline line is shown immediately; the right-hand
    // accuracy reading appears once the boundary is fully drawn so it lands in sync).
    ctx.readout.innerHTML = `
      <div class="tb-readout-row">
        <span class="tb-caption">One tree, grown until every training point is on its own.</span>
      </div>
      <div class="readout-cell">
        <span class="readout-label">Training accuracy</span>
        <span class="readout-value" id="tb-train-acc">—</span>
      </div>
      <div class="readout-cell">
        <span class="readout-label">Tree depth</span>
        <span class="readout-value">${d3.max(tree.nodes, n => n.depth)}</span>
      </div>
      <div class="readout-cell">
        <span class="readout-label">Leaves</span>
        <span class="readout-value">${tree.nodes.filter(n => n.isLeaf).length}</span>
      </div>
    `;
    later(() => {
      const el = document.getElementById('tb-train-acc');
      if (el) el.textContent = `${(trainAcc * 100).toFixed(0)}%`;
    }, totalSplitsTime + 120);
  }

  // ---- Scene 2: five bootstrap trees ---------------------------------------
  function renderFiveBootstraps(ctx) {
    const data = ctx.data;
    const trees = data.forest2D.trees.slice(0, 5);
    const scaff = buildScaffold(ctx);
    const { x, y, gRegionsBack } = scaff;

    // One <g> per tree; each holds its leaf rectangles. Draw all in DOM, fade-in via CSS.
    const layerGs = trees.map((tree, ti) => {
      const { leaves } = describeTree(tree, data.scatter);
      const g = gRegionsBack.append('g')
        .attr('class', 'tb-region-layer-group')
        .attr('data-tree', ti);
      g.selectAll('rect.tb-region-layer')
        .data(leaves)
        .enter()
        .append('rect')
        .attr('class', d => `tb-region-layer cluster-${d.classIdx + 1}`)
        .attr('x', d => x(d.xLo))
        .attr('y', d => y(d.yHi))
        .attr('width', d => Math.max(0, x(d.xHi) - x(d.xLo)))
        .attr('height', d => Math.max(0, y(d.yLo) - y(d.yHi)));
      return g;
    });

    // Fade tree 0 first (it's what scene 1 ended on), then the other 4 together.
    later(() => layerGs[0].selectAll('rect').classed('tb-region-layer-on', true), 30);
    later(() => {
      for (let i = 1; i < 5; i++) {
        layerGs[i].selectAll('rect').classed('tb-region-layer-on', true);
      }
    }, 60 + SCENE2_CROSSFADE_MS / 4);

    // Tree-chip tray in the overlay. Hover lifts that tree, leaves the others dimmed.
    const tray = document.createElement('div');
    tray.className = 'tb-tree-tray';
    tray.innerHTML = '<span class="tb-tree-tray-label">Hover</span>';
    for (let i = 0; i < 5; i++) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'tb-tree-chip';
      chip.textContent = String(i + 1);
      chip.dataset.tree = String(i);
      chip.addEventListener('mouseenter', () => liftTree(i));
      chip.addEventListener('mouseleave', () => liftTree(null));
      chip.addEventListener('focus', () => liftTree(i));
      chip.addEventListener('blur', () => liftTree(null));
      tray.appendChild(chip);
    }
    ctx.overlay.appendChild(tray);

    function liftTree(idx) {
      // Hovered tree pops to higher opacity; the other four stay at the baseline 10%
      // so the eye can tell what changed without losing the consensus picture.
      layerGs.forEach((g, i) => {
        const sel = g.selectAll('rect');
        sel.classed('tb-region-layer-on', true);
        sel.classed('tb-region-layer-lift', idx !== null && i === idx);
      });
      tray.querySelectorAll('.tb-tree-chip').forEach((c, i) => {
        c.classList.toggle('tb-tree-chip-active', idx === i);
      });
    }

    // Per-tree training accuracy for the readout (expected ~100% — each is overfit).
    const accs = trees.map(t => {
      let c = 0;
      scaff.train.forEach(p => {
        if (window.RF.predictLeaf(t, [p.x, p.y]).majorityClass === p.classIdx) c++;
      });
      return c / scaff.train.length;
    });
    const meanAcc = d3.mean(accs);

    ctx.readout.innerHTML = `
      <div class="tb-readout-row">
        <span class="tb-caption">Five bootstrap resamples; five different overfit boundaries — same data, different cuts.</span>
      </div>
      <div class="readout-cell">
        <span class="readout-label">Trees shown</span>
        <span class="readout-value">5</span>
      </div>
      <div class="readout-cell">
        <span class="readout-label">Mean train acc.</span>
        <span class="readout-value">${(meanAcc * 100).toFixed(0)}%</span>
      </div>
      <div class="readout-cell">
        <span class="readout-label">Mean leaves</span>
        <span class="readout-value">${(d3.mean(trees, t => t.nodes.filter(n => n.isLeaf).length)).toFixed(0)}</span>
      </div>
    `;
  }

  // ---- Public dispatch ------------------------------------------------------
  window.SCENES.treeBuilder = {
    enter(ctx, { sub }) {
      clearTimers();
      currentSub = sub;
      // Wait for layout — on first dispatch the viz-stage may be mid-flow and
      // ctx.svg.getBoundingClientRect() returns stale dimensions otherwise.
      const run = () => {
        if (currentSub !== sub) return;  // user scrolled away before we drew
        if (sub === 'singleOverfit') {
          renderSingleOverfit(ctx);
        } else if (sub === 'fiveBootstraps') {
          renderFiveBootstraps(ctx);
        } else {
          buildScaffold(ctx);
        }
      };
      requestAnimationFrame(run);
    },
    exit(ctx) {
      clearTimers();
      currentSub = null;
      d3.select(ctx.svg).selectAll('*').interrupt();
      d3.select(ctx.svg).selectAll('*').remove();
      ctx.overlay.innerHTML = '';
      ctx.controls.innerHTML = '';
      ctx.readout.innerHTML = '';
    },
  };
})();
