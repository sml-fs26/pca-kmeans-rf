// Scene 3: variance / perturbation. Five fully-grown trees on five reseeds.
// The point is the disagreement: same dataset shape → wildly different boundaries.

window.SCENES.variance = (function () {

  const SEEDS = [42, 43, 44, 45, 46];

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
  function setReadout(ctx, k, v) {
    const el = ctx.readout.querySelector(`[data-key="${k}"]`);
    if (el) el.textContent = v;
  }
  function fmtPct(x) { return (x * 100).toFixed(1) + '%'; }

  let timer = null;

  function renderPerturb(ctx) {
    clearCtx(ctx);
    const svg = d3.select(ctx.svg);
    const { w, h } = svgSize(ctx.svg);
    svg.attr('viewBox', `0 0 ${w} ${h}`).attr('preserveAspectRatio', 'none');

    const { x: sx, y: sy } = RF.makeScales(DATA.grid, w, h, 24, 24);
    const bbox = { x0: DATA.grid.xMin, x1: DATA.grid.xMax, y0: DATA.grid.yMin, y1: DATA.grid.yMax };

    const regionG = svg.append('g').attr('class', 'regions-layer');
    const splitG  = svg.append('g').attr('class', 'splits-layer');
    svg.append('rect')
      .attr('x', 0).attr('y', 0).attr('width', w).attr('height', h)
      .attr('fill', 'none').attr('stroke', 'var(--rule)').attr('stroke-width', 1);
    const pointsG = svg.append('g').attr('class', 'points-layer');

    let cur = 0;

    function paint(idx) {
      const p = DATA.perturbations[idx];

      const flat = RF.flatten2D(p.boundary);
      RF.renderGridCells(regionG, flat, DATA.grid, sx, sy);

      const splits = RF.extractSplits(p.tree, Infinity, bbox);
      const lines = splitG.selectAll('line.split-line').data(splits);
      lines.enter().append('line')
        .attr('class', 'split-line')
        .merge(lines)
        .attr('x1', d => sx(d.x0))
        .attr('x2', d => sx(d.x1))
        .attr('y1', d => sy(d.y0))
        .attr('y2', d => sy(d.y1))
        .attr('opacity', d => Math.max(0.25, 1 - d.depth * 0.08));
      lines.exit().remove();

      const pts = pointsG.selectAll('circle.point').data(p.points, (_, i) => i);
      pts.exit().transition().duration(120).attr('opacity', 0).remove();
      const enter = pts.enter().append('circle')
        .attr('class', d => 'point cluster-' + (d.label === 0 ? 1 : 2))
        .attr('cx', d => sx(d.x))
        .attr('cy', d => sy(d.y))
        .attr('r', 4)
        .attr('opacity', 0);
      enter.merge(pts)
        .attr('class', d => 'point cluster-' + (d.label === 0 ? 1 : 2))
        .transition().duration(220)
        .attr('cx', d => sx(d.x))
        .attr('cy', d => sy(d.y))
        .attr('opacity', 1);

      const stats = RF.treeStats(p.tree, Infinity);
      setReadout(ctx, 'seed',   `${SEEDS[idx]}`);
      setReadout(ctx, 'leaves', String(stats.leaves));
      setReadout(ctx, 'train',  fmtPct(p.trainAcc));
      setReadout(ctx, 'test',   fmtPct(p.testAcc));

      ctx.overlay.querySelectorAll('.perturb-dot').forEach((el, i) => {
        el.classList.toggle('active', i === idx);
      });
    }

    ctx.overlay.innerHTML = `
      <div class="perturb-pager">
        ${SEEDS.map((_, i) => `<span class="perturb-dot" data-idx="${i}"></span>`).join('')}
      </div>
    `;

    ctx.controls.innerHTML = `
      <div class="controls-row">
        <button id="prev-seed">← prev</button>
        <button id="next-seed">next →</button>
        <button id="auto-cycle">auto</button>
        <span class="value" id="seed-readout">seed ${SEEDS[0]}</span>
      </div>
    `;

    readoutCells(ctx, [
      { label: 'seed',      value: '–', key: 'seed' },
      { label: 'leaves',    value: '–', key: 'leaves' },
      { label: 'train acc', value: '–', key: 'train' },
      { label: 'test acc',  value: '–', key: 'test' },
    ]);

    function go(i) {
      cur = ((i % SEEDS.length) + SEEDS.length) % SEEDS.length;
      ctx.controls.querySelector('#seed-readout').textContent = `seed ${SEEDS[cur]}`;
      paint(cur);
    }
    ctx.controls.querySelector('#prev-seed').addEventListener('click', () => go(cur - 1));
    ctx.controls.querySelector('#next-seed').addEventListener('click', () => go(cur + 1));
    ctx.controls.querySelector('#auto-cycle').addEventListener('click', () => {
      if (timer) { clearInterval(timer); timer = null; return; }
      timer = setInterval(() => go(cur + 1), 1100);
    });
    ctx.overlay.querySelectorAll('.perturb-dot').forEach(el => {
      el.addEventListener('click', () => go(+el.dataset.idx));
    });

    paint(0);
  }

  function enter(ctx) { renderPerturb(ctx); }
  function exit(ctx) {
    if (timer) { clearInterval(timer); timer = null; }
    d3.select(ctx.svg).selectAll('*').interrupt();
  }

  return { enter, exit };
})();
