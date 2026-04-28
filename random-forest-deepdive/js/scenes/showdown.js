// VIZ: showdown — owns scene 8 (the diversity ladder).
//
// Three columns of test errors across 50 reseeds, each generated from a fresh
// 100-point spiral (smaller than the master 200-point set used for scenes 1–7
// — small N widens the gap between every rung):
//
//   single deep tree → standard RF → Extra-Trees
//
// Each rung adds one form of randomization on top of the previous:
//   - single tree:   no randomization. One bootstrap of the data; greedy splits.
//   - RF (mtry=1):   bootstrap rows + random feature subset per split.
//   - Extra-Trees:   bootstrap rows + random feature subset + RANDOM threshold.
//
// More randomization → less inter-tree correlation → lower variance floor for
// the bagged ensemble.
//
// Top half:  3 boundary panels for one representative seed.
//   - left:    single deep tree (hard boundary, jagged staircase)
//   - middle:  RF probability surface (smoother, but still rectangular)
//   - right:   Extra-Trees probability surface (smoothest, closest to a spiral)
//
// Bottom half: strip plot, three columns of 50 dots each.
//   - σ-band shaded behind each column
//   - mean tick + connector between adjacent means with Δμ labels

window.SCENES.showdown = (function () {

  // Deterministic [-1, 1] jitter from an integer index. No Math.random.
  function jitter(i) {
    const h = ((i * 2654435761) >>> 0) / 4294967296;
    return h * 2 - 1;
  }

  function fmtPct(x) { return (x * 100).toFixed(1) + '%'; }

  function enter(ctx, { sub, idx }) {
    const { svg, overlay, readout, controls } = ctx;

    // --- 1. Reset stage ---------------------------------------------------
    d3.select(svg).selectAll('*').remove();
    overlay.innerHTML = '';
    controls.innerHTML = '';
    readout.innerHTML = '';

    // --- 2. Pull data -----------------------------------------------------
    const D = window.DATA || {};
    const S = D.showdown;
    const grid = D.grid;
    const moonsPts = (D.dataset && D.dataset.points) || [];
    if (!S || !grid) {
      readout.innerHTML = '<div class="scene-stub">No showdown data.</div>';
      return;
    }

    // --- 3. SVG sizing ----------------------------------------------------
    const stage = svg.parentElement;
    const rect = stage.getBoundingClientRect();
    const W = Math.max(420, Math.floor(rect.width || 720));
    const H = Math.max(420, Math.floor(rect.height || 600));

    const sel = d3.select(svg)
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    const TOP_FRAC = 0.46;
    const topH = Math.floor(H * TOP_FRAC);
    const botH = H - topH;

    // ---------------------------------------------------------------------
    // 4. TOP HALF — three boundary panels.
    // ---------------------------------------------------------------------
    const topGap = 12;
    const topPadX = 14;
    const topLabelH = 22;
    const N_PANELS = 3;
    const panelW = (W - topPadX * 2 - topGap * (N_PANELS - 1)) / N_PANELS;
    const panelH = topH - topLabelH - 12;

    const topG = sel.append('g').attr('class', 'sd-top');

    const singleArr = RF.flatten2D(S.sampleSingleBoundary);
    const rfProbArr = RF.flatten2D(S.sampleRFProb);
    const etProbArr = S.sampleETProb ? RF.flatten2D(S.sampleETProb) : null;

    function buildPanel(panelIdx, label, drawCells) {
      const px = topPadX + panelIdx * (panelW + topGap);
      const py = topLabelH;

      const panelG = topG.append('g').attr('transform', `translate(${px},${py})`);

      panelG.append('rect')
        .attr('class', 'mini-frame')
        .attr('x', 0).attr('y', 0)
        .attr('width', panelW).attr('height', panelH);

      topG.append('text')
        .attr('class', 'mini-label')
        .attr('x', px + 4).attr('y', py - 8)
        .text(label);

      const scales = RF.makeScales(grid, panelW, panelH, 4, 4);

      const clipId = `sd-clip-${panelIdx}`;
      panelG.append('defs').append('clipPath')
        .attr('id', clipId)
        .append('rect')
        .attr('x', 0).attr('y', 0)
        .attr('width', panelW).attr('height', panelH);

      const cellsG = panelG.append('g').attr('clip-path', `url(#${clipId})`);
      drawCells(cellsG, scales);

      const ptsG = panelG.append('g').attr('clip-path', `url(#${clipId})`);
      ptsG.selectAll('circle.point')
        .data(moonsPts)
        .enter().append('circle')
        .attr('class', d => `point cluster-${d.label + 1}`)
        .attr('cx', d => scales.x(d.x))
        .attr('cy', d => scales.y(d.y))
        .attr('r', 1.6);
    }

    buildPanel(0, 'single deep tree', (g, s) => {
      RF.renderGridCells(g, singleArr, grid, s.x, s.y);
    });
    buildPanel(1, '200-tree forest', (g, s) => {
      RF.renderProbCells(g, rfProbArr, grid, s.x, s.y);
    });
    if (etProbArr) {
      buildPanel(2, 'extra-trees forest', (g, s) => {
        RF.renderProbCells(g, etProbArr, grid, s.x, s.y);
      });
    }

    // ---------------------------------------------------------------------
    // 5. BOTTOM HALF — strip plot, three columns.
    // ---------------------------------------------------------------------
    const botG = sel.append('g').attr('transform', `translate(0,${topH})`);

    const margin = { top: 56, right: 28, bottom: 48, left: 64 };
    const innerW = Math.max(160, W - margin.left - margin.right);
    const innerH = Math.max(120, botH - margin.top - margin.bottom);
    const root = botG.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    botG.append('text')
      .attr('class', 'sd-title')
      .attr('x', W / 2).attr('y', 18)
      .attr('text-anchor', 'middle')
      .text('50 reseeds — error per fit. The diversity ladder.');

    // Y scale based on actual ladder range (single tree mean is ~32%, so plot up to ~40%).
    const allErr = (S.singleTreeErr || [])
      .concat(S.rfErr || [])
      .concat(S.etErr || []);
    const yMax = Math.max(0.05, ...allErr) * 1.08;
    const y = d3.scaleLinear().domain([0, yMax]).range([innerH, 0]);

    // Three column centers, evenly spaced.
    const cols = [
      { idx: 0, x: innerW * 0.18, label: 'single tree',
        mean: S.singleTreeMean, std: S.singleTreeStd, errs: S.singleTreeErr || [],
        bandClass: 'sigma-band single', meanClass: 'mean-line single', dotClass: 'dot-single' },
      { idx: 1, x: innerW * 0.50, label: 'random forest',
        mean: S.rfMean, std: S.rfStd, errs: S.rfErr || [],
        bandClass: 'sigma-band rf', meanClass: 'mean-line', dotClass: 'dot-rf' },
      { idx: 2, x: innerW * 0.82, label: 'extra-trees',
        mean: S.etMean, std: S.etStd, errs: S.etErr || [],
        bandClass: 'sigma-band et', meanClass: 'mean-line et', dotClass: 'dot-et' },
    ];

    const halfColW = Math.min(56, innerW * 0.10);
    const tickHalf = halfColW * 0.85;
    const JITTER_PX = Math.min(18, halfColW * 0.45);

    // Background grid.
    const gGrid = root.append('g').attr('class', 'sd-grid');
    gGrid.selectAll('line.h')
      .data(y.ticks(6))
      .enter().append('line')
      .attr('x1', 0).attr('x2', innerW)
      .attr('y1', d => y(d)).attr('y2', d => y(d));

    // Y axis.
    const yAxis = d3.axisLeft(y).ticks(6).tickFormat(d => `${(d * 100).toFixed(0)}%`);
    root.append('g').attr('class', 'sd-axis').call(yAxis);
    root.append('text')
      .attr('class', 'sd-axis-label')
      .attr('transform', `translate(-46,${innerH / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .text('test error');

    // X-axis line.
    const xLabelG = root.append('g')
      .attr('class', 'sd-axis')
      .attr('transform', `translate(0,${innerH})`);
    xLabelG.append('line')
      .attr('x1', 0).attr('x2', innerW)
      .attr('y1', 0).attr('y2', 0);

    // Column headers + σ bands + dots + mean ticks.
    cols.forEach(c => {
      // Header.
      root.append('text')
        .attr('class', 'col-header')
        .attr('x', c.x).attr('y', -22)
        .attr('text-anchor', 'middle')
        .text(c.label);
      root.append('text')
        .attr('class', 'col-subtitle')
        .attr('x', c.x).attr('y', -8)
        .attr('text-anchor', 'middle')
        .text(`μ = ${fmtPct(c.mean)}   σ = ${fmtPct(c.std)}`);

      // X-axis tick label.
      xLabelG.append('text')
        .attr('class', 'sd-axis-label')
        .attr('x', c.x).attr('y', 28)
        .attr('text-anchor', 'middle')
        .text(c.label);

      // σ band.
      const top = y(c.mean + c.std);
      const bot = y(c.mean - c.std);
      root.append('rect')
        .attr('class', c.bandClass)
        .attr('x', c.x - halfColW).attr('y', top)
        .attr('width', halfColW * 2)
        .attr('height', Math.max(1, bot - top));

      // Dots.
      root.append('g').selectAll(`circle.${c.dotClass}`)
        .data(c.errs)
        .enter().append('circle')
        .attr('class', c.dotClass)
        .attr('cx', (_, i) => c.x + jitter(i + 1 + c.idx * 1009) * JITTER_PX)
        .attr('cy', d => y(d))
        .attr('r', 3);

      // Mean tick.
      root.append('line')
        .attr('class', c.meanClass)
        .attr('x1', c.x - tickHalf).attr('x2', c.x + tickHalf)
        .attr('y1', y(c.mean)).attr('y2', y(c.mean));
    });

    // Mean-to-mean connectors (single→RF, RF→ET).
    function connectMeans(a, b) {
      root.append('line')
        .attr('class', 'mean-connector')
        .attr('x1', a.x + tickHalf).attr('x2', b.x - tickHalf)
        .attr('y1', y(a.mean)).attr('y2', y(b.mean));
      const midX = (a.x + b.x) / 2;
      const midY = (y(a.mean) + y(b.mean)) / 2;
      const dpp = (a.mean - b.mean) * 100;
      root.append('text')
        .attr('class', 'mean-gap-label')
        .attr('x', midX)
        .attr('y', midY - 6)
        .attr('text-anchor', 'middle')
        .text(`Δμ = ${dpp.toFixed(1)}pp`);
    }
    connectMeans(cols[0], cols[1]);
    connectMeans(cols[1], cols[2]);

    // --- 6. Readout — six cells, one row each per metric -----------------
    readout.innerHTML = `
      <div class="readout-cell">
        <span class="readout-label">single μ</span>
        <span class="readout-value">${fmtPct(S.singleTreeMean)}</span>
      </div>
      <div class="readout-cell">
        <span class="readout-label">single σ</span>
        <span class="readout-value">${fmtPct(S.singleTreeStd)}</span>
      </div>
      <div class="readout-cell">
        <span class="readout-label">RF μ</span>
        <span class="readout-value">${fmtPct(S.rfMean)}</span>
      </div>
      <div class="readout-cell">
        <span class="readout-label">RF σ</span>
        <span class="readout-value">${fmtPct(S.rfStd)}</span>
      </div>
      <div class="readout-cell">
        <span class="readout-label">extra-trees μ</span>
        <span class="readout-value">${fmtPct(S.etMean)}</span>
      </div>
      <div class="readout-cell">
        <span class="readout-label">extra-trees σ</span>
        <span class="readout-value">${fmtPct(S.etStd)}</span>
      </div>
    `;

    // --- 7. Theme reactivity --------------------------------------------
    function onThemeChange() {}
    window.addEventListener('theme-change', onThemeChange);
    ctx.__showdownThemeListener = onThemeChange;
  }

  function exit(ctx) {
    if (ctx.__showdownThemeListener) {
      window.removeEventListener('theme-change', ctx.__showdownThemeListener);
      ctx.__showdownThemeListener = null;
    }
    d3.select(ctx.svg).selectAll('*').remove();
    ctx.overlay.innerHTML = '';
    ctx.controls.innerHTML = '';
    ctx.readout.innerHTML = '';
  }

  return { enter, exit };
})();
