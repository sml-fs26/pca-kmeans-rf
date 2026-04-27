// Scenes 1-2: hook (moons + ground-truth curve) and depth dial (single tree).
// Two sub-scenes share one viz kind because both render the same moons frame.

window.SCENES.moons = (function () {
  // Snapshot of metric depths actually present in DATA.singleTreeMetricsByDepth.
  const METRIC_DEPTHS = [1, 2, 3, 4, 5, 6, 8, 12, 20];

  function metricsForDepth(d) {
    // Round down to the nearest available depth in METRIC_DEPTHS so the readout
    // remains honest (precomputed metrics, not extracted-from-truncated-tree).
    let best = METRIC_DEPTHS[0];
    for (const m of METRIC_DEPTHS) if (m <= d) best = m;
    return DATA.singleTreeMetricsByDepth[String(best)];
  }

  function svgSize(svg) {
    const r = svg.getBoundingClientRect();
    return { w: Math.max(200, r.width), h: Math.max(200, r.height) };
  }

  function clearCtx(ctx) {
    d3.select(ctx.svg).selectAll('*').remove();
    ctx.overlay.innerHTML = '';
    ctx.controls.innerHTML = '';
    ctx.readout.innerHTML = '';
  }

  function readoutCells(ctx, cells) {
    ctx.readout.innerHTML = cells.map(c => `
      <div class="readout-cell">
        <div class="readout-label">${c.label}</div>
        <div class="readout-value" data-key="${c.key || ''}">${c.value}</div>
      </div>
    `).join('');
  }

  function setReadout(ctx, key, value) {
    const el = ctx.readout.querySelector(`[data-key="${key}"]`);
    if (el) el.textContent = value;
  }

  function fmtPct(x) { return (x * 100).toFixed(1) + '%'; }

  function renderScatter(svg, scaleX, scaleY, points, radius) {
    const g = svg.append('g').attr('class', 'points-layer');
    g.selectAll('circle.point')
      .data(points)
      .enter().append('circle')
      .attr('class', d => 'point cluster-' + (d.label === 0 ? 1 : 2))
      .attr('cx', d => scaleX(d.x))
      .attr('cy', d => scaleY(d.y))
      .attr('r', radius);
    return g;
  }

  function renderFrame(svg, w, h) {
    svg.append('rect')
      .attr('class', 'frame')
      .attr('x', 0).attr('y', 0).attr('width', w).attr('height', h)
      .attr('fill', 'none')
      .attr('stroke', 'var(--rule)')
      .attr('stroke-width', 1);
  }

  // ── Scene 1: hook ──
  function renderHook(ctx) {
    clearCtx(ctx);
    const svg = d3.select(ctx.svg);
    const { w, h } = svgSize(ctx.svg);
    svg.attr('viewBox', `0 0 ${w} ${h}`).attr('preserveAspectRatio', 'none');

    const { x: sx, y: sy } = RF.makeScales(DATA.grid, w, h, 24, 24);

    renderFrame(svg, w, h);
    renderScatter(svg, sx, sy, DATA.dataset.points, 4.5);

    // Draw each clean spiral arm as a faint dashed reference curve.
    const arms = DATA.groundTruthArms || [];
    const line = d3.line().x(d => sx(d.x)).y(d => sy(d.y)).curve(d3.curveCatmullRom.alpha(0.5));
    arms.forEach((arm, idx) => {
      const armPath = svg.append('path')
        .attr('class', 'gt-curve')
        .attr('fill', 'none')
        .attr('stroke-width', 1.4)
        .attr('opacity', 0.75)
        .attr('d', line(arm));
      const total = armPath.node().getTotalLength();
      armPath.attr('stroke-dasharray', `${total} ${total}`)
          .attr('stroke-dashoffset', total)
          .transition().delay(300 + idx * 200).duration(900)
          .attr('stroke-dashoffset', 0)
          .on('end', () => armPath.attr('stroke-dasharray', '5 4'));
    });

    const meta = DATA.dataset || {};
    readoutCells(ctx, [
      { label: 'points',   value: String(DATA.dataset.points.length) },
      { label: 'arms',     value: String(meta.nArms || 2) },
      { label: 'turns',    value: String(meta.nTurns || 2) },
      { label: 'noise',    value: (meta.noise ?? 0.18).toFixed(2) },
    ]);
  }

  // ── Scene 2: depth dial ──
  function renderDepth(ctx) {
    clearCtx(ctx);
    const svg = d3.select(ctx.svg);
    const { w, h } = svgSize(ctx.svg);
    svg.attr('viewBox', `0 0 ${w} ${h}`).attr('preserveAspectRatio', 'none');

    const { x: sx, y: sy } = RF.makeScales(DATA.grid, w, h, 24, 24);

    const regionG = svg.append('g').attr('class', 'regions-layer');
    const splitG  = svg.append('g').attr('class', 'splits-layer');
    renderFrame(svg, w, h);
    renderScatter(svg, sx, sy, DATA.dataset.points, 4);

    const bbox = { x0: DATA.grid.xMin, x1: DATA.grid.xMax, y0: DATA.grid.yMin, y1: DATA.grid.yMax };

    function paint(depth) {
      const flat = RF.computeTreeBoundary(DATA.singleTree, DATA.grid, depth);
      RF.renderGridCells(regionG, flat, DATA.grid, sx, sy);

      const splits = RF.extractSplits(DATA.singleTree, depth, bbox);
      const sel = splitG.selectAll('line.split-line').data(splits);
      sel.enter().append('line')
        .attr('class', 'split-line')
        .merge(sel)
        .attr('x1', d => sx(d.x0))
        .attr('x2', d => sx(d.x1))
        .attr('y1', d => sy(d.y0))
        .attr('y2', d => sy(d.y1))
        .attr('opacity', d => Math.max(0.25, 1 - d.depth * 0.08));
      sel.exit().remove();

      const stats = RF.treeStats(DATA.singleTree, depth);
      const m = metricsForDepth(depth);
      setReadout(ctx, 'depth', String(depth));
      setReadout(ctx, 'leaves', String(stats.leaves));
      setReadout(ctx, 'train',  fmtPct(m.trainAcc));
      setReadout(ctx, 'test',   fmtPct(m.testAcc));
    }

    ctx.controls.innerHTML = `
      <div class="controls-row">
        <label for="depth-slider">max_depth</label>
        <input id="depth-slider" type="range" min="1" max="20" step="1" value="4">
        <span class="value" id="depth-value">4</span>
      </div>
    `;
    const slider = ctx.controls.querySelector('#depth-slider');
    const sliderValue = ctx.controls.querySelector('#depth-value');

    readoutCells(ctx, [
      { label: 'depth',     value: '4', key: 'depth' },
      { label: 'leaves',    value: '–', key: 'leaves' },
      { label: 'train acc', value: '–', key: 'train' },
      { label: 'test acc',  value: '–', key: 'test' },
    ]);

    slider.addEventListener('input', () => {
      const d = +slider.value;
      sliderValue.textContent = String(d);
      paint(d);
    });

    paint(4);
  }

  function enter(ctx, { sub }) {
    if (sub === 'hook')  renderHook(ctx);
    else                 renderDepth(ctx);
  }

  function exit(ctx) {
    d3.select(ctx.svg).selectAll('*').interrupt();
  }

  return { enter, exit };
})();
