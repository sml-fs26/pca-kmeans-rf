// VIZ: showdown — owns scene 8 (reseeds).
//
// Pedagogical beat: across 50 different random seeds, a deep single tree's
// test error scatters from ~7% to ~14% — wildly seed-dependent. A 200-tree
// RF lands in a tight band ~7-10%. Same data, same model class, same labels.
// The forest is just more reliable.
//
// Top half:  side-by-side decision-boundary panels for one representative seed.
//   - left:  single deep tree (RF.renderGridCells over sampleSingleBoundary)
//   - right: 200-tree forest  (RF.renderProbCells over sampleRFProb)
//   - moons scatter overlaid on both panels.
//
// Bottom half: strip plot of test errors for all 50 reseeds.
//   - left column = single tree (50 dots, fill=var(--muted), jittered)
//   - right column = RF (50 dots, fill=var(--ink), jittered)
//   - mean ticks on each column; dashed connector shows the gap.
//
// Color discipline: --muted vs --ink is the contrast. cluster-1/cluster-2
// remain class-identity colors and are only used for the moons overlay.

window.SCENES.showdown = (function () {

  // Deterministic [-1, 1] jitter derived from an integer index. No Math.random.
  function jitter(i) {
    // Knuth-style multiplicative hash, then map to [-1, 1].
    const h = ((i * 2654435761) >>> 0) / 4294967296; // [0, 1)
    return h * 2 - 1;
  }

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

    // --- 3. SVG sizing (read bounding rect; do NOT hardcode) -------------
    const stage = svg.parentElement; // .viz-stage
    const rect = stage.getBoundingClientRect();
    const W = Math.max(360, Math.floor(rect.width || 720));
    const H = Math.max(420, Math.floor(rect.height || 600));

    const sel = d3.select(svg)
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    // Split the SVG vertically — top region for boundaries, bottom for strip.
    const TOP_FRAC = 0.46;
    const topH = Math.floor(H * TOP_FRAC);
    const botH = H - topH;

    // ---------------------------------------------------------------------
    // 4. TOP HALF — two boundary panels side by side.
    // ---------------------------------------------------------------------
    const topGap = 16;
    const topPadX = 16;
    const topLabelH = 22;     // space for label above each panel
    const panelW = (W - topPadX * 2 - topGap) / 2;
    const panelH = topH - topLabelH - 12; // a bit of bottom padding

    const topG = sel.append('g').attr('class', 'sd-top');

    // Flatten the precomputed nested arrays for the RF renderers.
    const singleArr = RF.flatten2D(S.sampleSingleBoundary);
    const rfProbArr = RF.flatten2D(S.sampleRFProb);

    function buildPanel(xOffset, label, drawCells, isProb) {
      const px = topPadX + xOffset;
      const py = topLabelH;

      const panelG = topG.append('g')
        .attr('transform', `translate(${px},${py})`);

      // Frame.
      panelG.append('rect')
        .attr('class', 'mini-frame')
        .attr('x', 0).attr('y', 0)
        .attr('width', panelW).attr('height', panelH);

      // Label above the frame.
      topG.append('text')
        .attr('class', 'mini-label')
        .attr('x', px + 4)
        .attr('y', py - 8)
        .text(label);

      // Local scales for this panel.
      const scales = RF.makeScales(grid, panelW, panelH, 4, 4);

      // Clip cells & points to the panel's interior.
      const clipId = `sd-clip-${Math.round(px)}-${Math.round(py)}`;
      panelG.append('defs').append('clipPath')
        .attr('id', clipId)
        .append('rect')
        .attr('x', 0).attr('y', 0)
        .attr('width', panelW).attr('height', panelH);

      const cellsG = panelG.append('g').attr('clip-path', `url(#${clipId})`);
      drawCells(cellsG, scales);

      // Moons scatter overlay.
      const ptsG = panelG.append('g').attr('clip-path', `url(#${clipId})`);
      ptsG.selectAll('circle.point')
        .data(moonsPts)
        .enter().append('circle')
        .attr('class', d => `point cluster-${d.label + 1}`)
        .attr('cx', d => scales.x(d.x))
        .attr('cy', d => scales.y(d.y))
        .attr('r', 2.4);

      return { panelG, scales };
    }

    buildPanel(0, 'single deep tree', (g, s) => {
      RF.renderGridCells(g, singleArr, grid, s.x, s.y);
    }, false);

    buildPanel(panelW + topGap, '200-tree forest', (g, s) => {
      RF.renderProbCells(g, rfProbArr, grid, s.x, s.y);
    }, true);

    // ---------------------------------------------------------------------
    // 5. BOTTOM HALF — strip plot.
    // ---------------------------------------------------------------------
    const botG = sel.append('g')
      .attr('transform', `translate(0,${topH})`);

    const margin = { top: 56, right: 28, bottom: 48, left: 64 };
    const innerW = Math.max(160, W - margin.left - margin.right);
    const innerH = Math.max(120, botH - margin.top - margin.bottom);

    const root = botG.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Title above the strip plot. Anchor middle so it sits center-stage and
    // doesn't run into the column headers, which sit above each column.
    botG.append('text')
      .attr('class', 'sd-title')
      .attr('x', W / 2)
      .attr('y', 18)
      .attr('text-anchor', 'middle')
      .text('50 reseeds — error per seed');

    // Y scale: error rate, 0 to 0.18 (a hair above worst single-tree).
    const yMax = 0.18;
    const y = d3.scaleLinear().domain([0, yMax]).range([innerH, 0]);

    // Two columns. Centers at 1/3 and 2/3 of innerW.
    const colSingleX = innerW * 0.32;
    const colRfX     = innerW * 0.68;
    const halfColW   = Math.min(80, innerW * 0.15);

    // Background grid.
    const gGrid = root.append('g').attr('class', 'sd-grid');
    gGrid.selectAll('line.h')
      .data(y.ticks(6))
      .enter().append('line')
      .attr('x1', 0).attr('x2', innerW)
      .attr('y1', d => y(d)).attr('y2', d => y(d));

    // Y axis.
    const yAxis = d3.axisLeft(y)
      .ticks(6)
      .tickFormat(d => `${(d * 100).toFixed(0)}%`);
    root.append('g').attr('class', 'sd-axis').call(yAxis);

    // Axis label.
    root.append('text')
      .attr('class', 'sd-axis-label')
      .attr('transform', `translate(-46,${innerH / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .text('test error');

    // Column headers (sit just above the plot area).
    root.append('text')
      .attr('class', 'col-header')
      .attr('x', colSingleX).attr('y', -22)
      .attr('text-anchor', 'middle')
      .text('single tree');
    root.append('text')
      .attr('class', 'col-subtitle')
      .attr('x', colSingleX).attr('y', -8)
      .attr('text-anchor', 'middle')
      .text(`μ = ${(S.singleTreeMean * 100).toFixed(1)}%   σ = ${(S.singleTreeStd * 100).toFixed(1)}%`);

    root.append('text')
      .attr('class', 'col-header')
      .attr('x', colRfX).attr('y', -22)
      .attr('text-anchor', 'middle')
      .text('200-tree forest');
    root.append('text')
      .attr('class', 'col-subtitle')
      .attr('x', colRfX).attr('y', -8)
      .attr('text-anchor', 'middle')
      .text(`μ = ${(S.rfMean * 100).toFixed(1)}%   σ = ${(S.rfStd * 100).toFixed(1)}%`);

    // X-axis (just the two column anchors).
    const xLabelG = root.append('g')
      .attr('class', 'sd-axis')
      .attr('transform', `translate(0,${innerH})`);
    xLabelG.append('line')
      .attr('x1', 0).attr('x2', innerW)
      .attr('y1', 0).attr('y2', 0);
    xLabelG.append('text')
      .attr('class', 'sd-axis-label')
      .attr('x', colSingleX).attr('y', 28)
      .attr('text-anchor', 'middle')
      .text('single tree');
    xLabelG.append('text')
      .attr('class', 'sd-axis-label')
      .attr('x', colRfX).attr('y', 28)
      .attr('text-anchor', 'middle')
      .text('forest');

    // ---- σ-bands behind each column (faint shaded rectangles) ----------
    function drawSigmaBand(cx, mean, std, klass) {
      const top = y(mean + std);
      const bot = y(mean - std);
      root.append('rect')
        .attr('class', `sigma-band ${klass}`)
        .attr('x', cx - halfColW).attr('y', top)
        .attr('width', halfColW * 2).attr('height', Math.max(1, bot - top));
    }
    drawSigmaBand(colSingleX, S.singleTreeMean, S.singleTreeStd, 'single');
    drawSigmaBand(colRfX,     S.rfMean,         S.rfStd,         'rf');

    // ---- Dots ----------------------------------------------------------
    const JITTER_PX = Math.min(22, halfColW * 0.55);
    const single = S.singleTreeErr || [];
    const rf     = S.rfErr || [];

    root.append('g').selectAll('circle.dot-single')
      .data(single)
      .enter().append('circle')
      .attr('class', 'dot-single')
      .attr('cx', (_, i) => colSingleX + jitter(i + 1) * JITTER_PX)
      .attr('cy', d => y(d))
      .attr('r', 3);

    root.append('g').selectAll('circle.dot-rf')
      .data(rf)
      .enter().append('circle')
      .attr('class', 'dot-rf')
      .attr('cx', (_, i) => colRfX + jitter(i + 1001) * JITTER_PX)
      .attr('cy', d => y(d))
      .attr('r', 3);

    // ---- Mean tick marks -----------------------------------------------
    const tickHalf = halfColW * 0.7;
    root.append('line')
      .attr('class', 'mean-line single')
      .attr('x1', colSingleX - tickHalf).attr('x2', colSingleX + tickHalf)
      .attr('y1', y(S.singleTreeMean)).attr('y2', y(S.singleTreeMean));
    root.append('line')
      .attr('class', 'mean-line')
      .attr('x1', colRfX - tickHalf).attr('x2', colRfX + tickHalf)
      .attr('y1', y(S.rfMean)).attr('y2', y(S.rfMean));

    // ---- Dashed connector between the two means -------------------------
    root.append('line')
      .attr('class', 'mean-connector')
      .attr('x1', colSingleX + tickHalf).attr('x2', colRfX - tickHalf)
      .attr('y1', y(S.singleTreeMean)).attr('y2', y(S.rfMean));

    // Mean-gap label, placed midway between the two means.
    const gapMidX = (colSingleX + colRfX) / 2;
    const gapMidY = (y(S.singleTreeMean) + y(S.rfMean)) / 2;
    const gapPct = (S.singleTreeMean - S.rfMean) * 100;
    root.append('text')
      .attr('class', 'mean-gap-label')
      .attr('x', gapMidX)
      .attr('y', gapMidY - 6)
      .attr('text-anchor', 'middle')
      .text(`Δμ = ${gapPct.toFixed(1)}pp`);

    // --- 6. Readout ------------------------------------------------------
    readout.innerHTML = `
      <div class="readout-cell">
        <span class="readout-label">single tree μ</span>
        <span class="readout-value">${(S.singleTreeMean * 100).toFixed(1)}%</span>
      </div>
      <div class="readout-cell">
        <span class="readout-label">single tree σ</span>
        <span class="readout-value">${(S.singleTreeStd * 100).toFixed(1)}%</span>
      </div>
      <div class="readout-cell">
        <span class="readout-label">RF μ</span>
        <span class="readout-value">${(S.rfMean * 100).toFixed(1)}%</span>
      </div>
      <div class="readout-cell">
        <span class="readout-label">RF σ</span>
        <span class="readout-value">${(S.rfStd * 100).toFixed(1)}%</span>
      </div>
    `;

    // --- 7. Theme reactivity --------------------------------------------
    function onThemeChange() { /* CSS variables handle re-coloring */ }
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
