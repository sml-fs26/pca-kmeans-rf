// VIZ: importance — owns scenes 10 (bars), 11 (waterfall) and 12 (heatmap).
//
// Scene 10 (sub: 'bars'): horizontal Gini-importance bar chart that rebuilds
//   from DATA.importance.giniByB[B-1] as B varies. Auto-animates 1 → 100 on
//   enter, then a slider lets the reader scrub. A small twin chart on the right
//   shows permutation importance for the final forest, for comparison.
//
// Scene 11 (sub: 'waterfall'): an explanation of one prediction. The query
//   point's four feature values up top; below, a horizontal waterfall for the
//   predicted class showing how the four feature contributions push the
//   probability from the prior to the forest's final P. Three buttons let the
//   reader switch which class is being decomposed.
//
// Scene 12 (sub: 'heatmap'): 4 features × 12 depths. Cell intensity = share of
//   times that feature is used at that depth across all 100 trees, normalised
//   per row. Hover reveals the exact value. Cream-to-ink (or cream-to-amber in
//   dark) sequential ramp; never reuses cluster colors.

(function () {

  // ---- Common scaffolding ---------------------------------------------------

  function clearAll(ctx) {
    d3.select(ctx.svg).interrupt();
    d3.select(ctx.svg).selectAll('*').interrupt();
    d3.select(ctx.svg).selectAll('*').remove();
    ctx.overlay.innerHTML = '';
    ctx.controls.innerHTML = '';
    ctx.readout.innerHTML = '';
  }

  let activeTimers = [];
  let activeIntervals = [];
  function clearTimers() {
    activeTimers.forEach(id => clearTimeout(id));
    activeTimers = [];
    activeIntervals.forEach(id => clearInterval(id));
    activeIntervals = [];
  }
  function later(fn, ms) {
    const id = setTimeout(fn, ms);
    activeTimers.push(id);
    return id;
  }

  function svgBox(ctx) {
    const rect = ctx.svg.getBoundingClientRect();
    const W = Math.max(360, rect.width);
    const H = Math.max(280, rect.height);
    d3.select(ctx.svg)
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');
    return { W, H };
  }

  // =========================================================================
  // SCENE 10 — Gini importance bars, with B-slider and permutation comparison
  // =========================================================================

  function renderBars(ctx) {
    clearAll(ctx);
    clearTimers();

    const data = ctx.data;
    const featureLabels = data.meta.featureLabels;
    const nFeatures = featureLabels.length;
    const giniByB = data.importance.giniByB;
    const BMax = giniByB.length;
    const permFinal = data.importance.permutationFinal;

    const { W, H } = svgBox(ctx);

    // Two side-by-side panels: Gini (wider, left) and Permutation (narrower, right).
    const M = { top: 36, right: 18, bottom: 28, left: 130 };
    const panelGap = 28;
    const splitFraction = 0.62;
    const totalInner = W - M.left - M.right;
    const giniW = Math.max(140, Math.floor(totalInner * splitFraction) - panelGap / 2);
    const permW = Math.max(80, totalInner - giniW - panelGap);
    const innerH = H - M.top - M.bottom;

    const svg = d3.select(ctx.svg);

    // ---- titles ---------------------------------------------------------
    svg.append('text')
      .attr('class', 'imp-panel-title')
      .attr('x', M.left)
      .attr('y', 18)
      .text('Gini importance');

    svg.append('text')
      .attr('class', 'imp-panel-subtitle')
      .attr('x', M.left)
      .attr('y', 32)
      .attr('id', 'imp-bars-subtitle')
      .text(`B = ${BMax} trees`);

    svg.append('text')
      .attr('class', 'imp-panel-title')
      .attr('x', M.left + giniW + panelGap)
      .attr('y', 18)
      .text('Permutation importance');

    svg.append('text')
      .attr('class', 'imp-panel-subtitle')
      .attr('x', M.left + giniW + panelGap)
      .attr('y', 32)
      .text('All 100 trees · final');

    // ---- bar group helpers ---------------------------------------------
    // Build a panel: rows = features in *current* descending order. We render
    // both panels with the SAME row order (Gini's order at the current B), so
    // the eye can compare directly.
    const giniGroup = svg.append('g')
      .attr('class', 'imp-bars-group')
      .attr('transform', `translate(${M.left}, ${M.top})`);

    const permGroup = svg.append('g')
      .attr('class', 'imp-bars-group')
      .attr('transform', `translate(${M.left + giniW + panelGap}, ${M.top})`);

    // Y-band: indexed 0..nFeatures-1, rebuilt every render with the current order
    function makeYBand(order) {
      return d3.scaleBand()
        .domain(d3.range(nFeatures))
        .range([0, innerH])
        .padding(0.28);
    }

    // X-scales: Gini uses fixed [0, 1] (since per-B vector sums to ~1). Perm
    // uses its own [0, max(perm)*1.15].
    const xGini = d3.scaleLinear().domain([0, 1]).range([0, giniW]);
    const permMax = d3.max(permFinal) || 0.001;
    const xPerm = d3.scaleLinear().domain([0, permMax * 1.15]).range([0, permW]);

    // Static perm-axis at the bottom of the perm panel
    const permAxis = d3.axisBottom(xPerm)
      .ticks(3)
      .tickFormat(d3.format('.0%'));
    svg.append('g')
      .attr('class', 'axis imp-axis')
      .attr('transform', `translate(${M.left + giniW + panelGap}, ${M.top + innerH + 4})`)
      .call(permAxis);

    const giniAxis = d3.axisBottom(xGini)
      .ticks(4)
      .tickFormat(d3.format('.0%'));
    svg.append('g')
      .attr('class', 'axis imp-axis')
      .attr('transform', `translate(${M.left}, ${M.top + innerH + 4})`)
      .call(giniAxis);

    // Pre-create row groups for each feature in each panel; we'll position
    // them on every redraw via their transform.
    const giniRowSel = giniGroup.selectAll('g.imp-row')
      .data(d3.range(nFeatures))
      .enter()
      .append('g')
      .attr('class', 'imp-row');
    giniRowSel.append('rect').attr('class', 'imp-bar-track');
    giniRowSel.append('rect').attr('class', 'imp-bar');
    giniRowSel.append('text').attr('class', 'imp-bar-label-left');
    giniRowSel.append('text').attr('class', 'imp-bar-value');

    const permRowSel = permGroup.selectAll('g.imp-row')
      .data(d3.range(nFeatures))
      .enter()
      .append('g')
      .attr('class', 'imp-row');
    permRowSel.append('rect').attr('class', 'imp-bar-track');
    permRowSel.append('rect').attr('class', 'imp-bar imp-bar-perm');
    permRowSel.append('text').attr('class', 'imp-bar-value');

    // ---- redraw ---------------------------------------------------------
    function redraw(B, animate) {
      const giniVec = giniByB[B - 1];

      // Sort features by current Gini importance, descending.
      const order = d3.range(nFeatures).sort((a, b) => giniVec[b] - giniVec[a]);
      // rank[featureIdx] = visual row 0..nFeatures-1
      const rank = new Array(nFeatures);
      order.forEach((featIdx, row) => { rank[featIdx] = row; });

      const yBand = makeYBand(order);
      const dominant = order[0];

      // Update subtitle
      d3.select('#imp-bars-subtitle').text(
        B === 1 ? 'B = 1 tree' : `B = ${B} trees`
      );

      const tDur = animate ? 220 : 0;

      giniRowSel.each(function (featIdx) {
        const g = d3.select(this);
        const v = giniVec[featIdx];
        const yPos = yBand(rank[featIdx]);
        const bw = yBand.bandwidth();

        g.transition().duration(tDur).attr('transform', `translate(0, ${yPos})`);

        g.select('rect.imp-bar-track')
          .attr('x', 0).attr('y', 0)
          .attr('width', giniW).attr('height', bw);

        g.select('rect.imp-bar')
          .classed('imp-bar-dominant', featIdx === dominant)
          .attr('x', 0).attr('y', 0)
          .attr('height', bw)
          .transition().duration(tDur)
          .attr('width', Math.max(0, xGini(v)));

        g.select('text.imp-bar-label-left')
          .attr('x', -10)
          .attr('y', bw / 2 + 4)
          .attr('text-anchor', 'end')
          .text(featureLabels[featIdx]);

        g.select('text.imp-bar-value')
          .attr('x', Math.max(xGini(v) + 6, 32))
          .attr('y', bw / 2 + 4)
          .text(`${(v * 100).toFixed(1)}%`)
          .transition().duration(tDur)
          .attr('x', Math.max(xGini(v) + 6, 32));
      });

      permRowSel.each(function (featIdx) {
        const g = d3.select(this);
        const v = permFinal[featIdx];
        const yPos = yBand(rank[featIdx]);
        const bw = yBand.bandwidth();

        g.transition().duration(tDur).attr('transform', `translate(0, ${yPos})`);

        g.select('rect.imp-bar-track')
          .attr('x', 0).attr('y', 0)
          .attr('width', permW).attr('height', bw);

        g.select('rect.imp-bar-perm')
          .attr('x', 0).attr('y', 0)
          .attr('height', bw)
          .transition().duration(tDur)
          .attr('width', Math.max(0, xPerm(v)));

        g.select('text.imp-bar-value')
          .attr('x', Math.max(xPerm(v) + 6, 24))
          .attr('y', bw / 2 + 4)
          .text(`${(v * 100).toFixed(1)}%`)
          .transition().duration(tDur)
          .attr('x', Math.max(xPerm(v) + 6, 24));
      });
    }

    // ---- controls -------------------------------------------------------
    const ctrl = document.createElement('div');
    ctrl.className = 'imp-control';
    ctrl.innerHTML = `
      <span class="imp-control-label">Trees in the forest</span>
      <input type="range" id="imp-B-slider" min="1" max="${BMax}" step="1" value="${BMax}">
      <span class="imp-control-value" id="imp-B-value">B = ${BMax}</span>
    `;
    ctx.controls.appendChild(ctrl);

    const slider = ctrl.querySelector('#imp-B-slider');
    const valueLabel = ctrl.querySelector('#imp-B-value');
    slider.addEventListener('input', () => {
      const B = +slider.value;
      valueLabel.textContent = `B = ${B}`;
      redraw(B, false);
    });

    // ---- readout caption ------------------------------------------------
    const finalDom = d3.range(nFeatures).sort(
      (a, b) => giniByB[BMax - 1][b] - giniByB[BMax - 1][a]
    )[0];
    ctx.readout.innerHTML = `
      <div class="imp-caption-row">
        <span class="imp-caption">
          Both methods agree: <strong>${featureLabels[finalDom]}</strong> matters most.
          The two scales differ &mdash; Gini sums to one across features; permutation does not.
        </span>
      </div>
      <div class="readout-cell">
        <span class="readout-label">Trees</span>
        <span class="readout-value">${BMax}</span>
      </div>
      <div class="readout-cell">
        <span class="readout-label">Features</span>
        <span class="readout-value">${nFeatures}</span>
      </div>
    `;

    // ---- auto-animate B from 1 → 100 over ~3s on enter ------------------
    redraw(1, false);
    slider.value = 1;
    valueLabel.textContent = 'B = 1';

    const animDur = 2800;
    const stepCount = 60;          // 60 frames feels smooth without thrashing
    const stepMs = animDur / stepCount;
    let frame = 0;
    const intervalId = setInterval(() => {
      frame += 1;
      const t = frame / stepCount;
      const B = Math.max(1, Math.min(BMax, Math.round(1 + (BMax - 1) * t)));
      slider.value = B;
      valueLabel.textContent = `B = ${B}`;
      redraw(B, true);
      if (frame >= stepCount) {
        clearInterval(intervalId);
      }
    }, stepMs);
    activeIntervals.push(intervalId);
  }

  // =========================================================================
  // SCENE 11 — Waterfall: per-feature contributions to one prediction
  // =========================================================================

  function renderWaterfall(ctx) {
    clearAll(ctx);
    clearTimers();

    const data = ctx.data;
    const wf = data.waterfall;
    const point = data.points[wf.pointIdx];
    const classNames = data.meta.classNames;
    const featureLabels = data.meta.featureLabels;
    const featureNames = data.meta.featureNames;

    let viewClass = wf.predictedClass;       // mutable: the class we're decomposing

    const { W, H } = svgBox(ctx);

    // Top strip: query-point feature values (rendered in overlay so they can
    // use HTML, which is friendlier than SVG text).
    const queryStrip = document.createElement('div');
    queryStrip.className = 'imp-wf-query';
    const fmts = [
      v => `${v.toFixed(1)} mm`,
      v => `${v.toFixed(1)} mm`,
      v => `${v.toFixed(0)} mm`,
      v => `${v.toFixed(0)} g`,
    ];
    queryStrip.innerHTML = `
      <div class="imp-wf-query-header">
        <div class="imp-wf-query-title">Query penguin</div>
        <div class="imp-wf-tray">
          <span class="imp-wf-tray-label">Decompose</span>
          ${classNames.map((cn, i) =>
            `<button type="button" class="imp-wf-chip" data-class="${i}">${cn}</button>`
          ).join('')}
        </div>
      </div>
      <div class="imp-wf-query-grid">
        ${featureLabels.map((lbl, i) => `
          <div class="imp-wf-query-cell">
            <span class="imp-wf-query-label">${lbl}</span>
            <span class="imp-wf-query-value">${fmts[i](point.features[i])}</span>
          </div>
        `).join('')}
      </div>
    `;
    ctx.overlay.appendChild(queryStrip);
    // The query strip is pointer-events: none for the card surface, but we
    // need the chip buttons to be clickable. Re-enable on the tray itself.
    const trayInQuery = queryStrip.querySelector('.imp-wf-tray');
    trayInQuery.style.pointerEvents = 'auto';

    // SVG layout for the waterfall itself.
    // We size the SVG region beneath the query strip (which is positioned over
    // the top of the stage). Reserve ~108px at top for the query strip.
    const QUERY_RESERVE = 112;
    const M = { top: QUERY_RESERVE + 24, right: 16, bottom: 50, left: 130 };
    const innerW = W - M.left - M.right;
    const innerH = H - M.top - M.bottom;

    // 6 columns: Prior, f1, f2, f3, f4, Final.
    const N_COLS = 2 + 4;
    const colBand = d3.scaleBand()
      .domain(d3.range(N_COLS))
      .range([0, innerW])
      .padding(0.28);

    // Y axis: probability 0..1. (We anchor 0 at the bottom.)
    const y = d3.scaleLinear().domain([0, 1]).range([innerH, 0]);

    const svg = d3.select(ctx.svg);
    const root = svg.append('g').attr('transform', `translate(${M.left}, ${M.top})`);

    // Title above the chart — names the class being decomposed.
    const titleText = svg.append('text')
      .attr('class', 'imp-panel-title')
      .attr('x', M.left)
      .attr('y', QUERY_RESERVE + 14);

    // Y axis (probability)
    const yAxis = d3.axisLeft(y).ticks(5).tickFormat(d3.format('.0%'));
    svg.append('g')
      .attr('class', 'axis imp-axis')
      .attr('transform', `translate(${M.left}, ${M.top})`)
      .call(yAxis);

    svg.append('text')
      .attr('class', 'imp-axis-label-rot')
      .attr('transform', `translate(${M.left - 96}, ${M.top + innerH / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .text(`P(class)`);

    // We pre-create six column groups; redraw populates them.
    const colGroups = root.selectAll('g.imp-wf-col')
      .data(d3.range(N_COLS))
      .enter()
      .append('g')
      .attr('class', 'imp-wf-col')
      .attr('transform', i => `translate(${colBand(i)}, 0)`);

    colGroups.append('rect').attr('class', 'imp-wf-rect');
    colGroups.append('text').attr('class', 'imp-wf-col-label');
    colGroups.append('text').attr('class', 'imp-wf-col-value');

    // A connecting "running total" tick between bars.
    const connectorsG = root.append('g').attr('class', 'imp-wf-connectors');

    // Toggle buttons (which class to decompose) live inside the query-strip
    // header so they don't overlap the rightmost waterfall columns.
    const tray = trayInQuery;
    tray.querySelectorAll('.imp-wf-chip').forEach(b => {
      b.addEventListener('click', () => {
        viewClass = +b.dataset.class;
        redraw(true);
      });
    });

    function redraw(animate) {
      const c = viewClass;
      const baseline = wf.baselineProb[c];
      const deltas = wf.contributions.map(ctr => ctr.delta[c]);
      const final = wf.finalProb[c];

      // Compute heights and y-anchors for each column.
      // Columns: 0 = baseline (full bar from 0 to baseline, "absolute")
      //           1..4 = contributions (delta bar between running totals)
      //           5 = final (full bar from 0 to final, "absolute")
      let running = baseline;
      const cols = [];
      cols.push({
        kind: 'absolute',
        label: 'Prior',
        value: baseline,
        y0: 0,
        y1: baseline,
        sign: 0,
        delta: 0,
      });
      for (let i = 0; i < deltas.length; i++) {
        const d = deltas[i];
        const before = running;
        const after = running + d;
        cols.push({
          kind: 'delta',
          label: featureLabels[i].replace(/\s*\([^)]+\)$/, ''),
          value: d,
          y0: Math.min(before, after),
          y1: Math.max(before, after),
          sign: d >= 0 ? +1 : -1,
          delta: d,
        });
        running = after;
      }
      cols.push({
        kind: 'absolute',
        label: 'Final',
        value: final,
        y0: 0,
        y1: final,
        sign: 0,
        delta: 0,
      });

      // Update title.
      const pctFinal = (final * 100).toFixed(1);
      const className = classNames[c];
      titleText.text(
        c === wf.predictedClass
          ? `The forest predicted ${className} with P = ${pctFinal}%`
          : `If we instead decompose ${className} (P = ${pctFinal}%)`
      );

      // Chip active state.
      tray.querySelectorAll('.imp-wf-chip').forEach(b => {
        b.classList.toggle('imp-wf-chip-active', +b.dataset.class === c);
      });

      const tDur = animate ? 360 : 0;

      colGroups.each(function (i) {
        const g = d3.select(this);
        const col = cols[i];
        const yTop = y(col.y1);
        const yBot = y(col.y0);
        const bw = colBand.bandwidth();

        const rect = g.select('rect.imp-wf-rect')
          .attr('x', 0)
          .attr('width', bw)
          .attr('class',
            'imp-wf-rect ' +
            (col.kind === 'absolute'
              ? `imp-wf-rect-abs cluster-${c + 1}`
              : (col.sign >= 0 ? `imp-wf-rect-pos cluster-${c + 1}` : 'imp-wf-rect-neg'))
          );
        rect.transition().duration(tDur)
          .attr('y', yTop)
          .attr('height', Math.max(1, yBot - yTop));

        g.select('text.imp-wf-col-label')
          .attr('x', bw / 2)
          .attr('y', innerH + 18)
          .attr('text-anchor', 'middle')
          .text(col.label);

        const valueLabel =
          col.kind === 'absolute'
            ? `${(col.value * 100).toFixed(1)}%`
            : (col.delta >= 0 ? `+${(col.delta * 100).toFixed(1)}%`
                              : `${(col.delta * 100).toFixed(1)}%`);

        g.select('text.imp-wf-col-value')
          .attr('x', bw / 2)
          .attr('text-anchor', 'middle')
          .text(valueLabel)
          .transition().duration(tDur)
          .attr('y', yTop - 6);
      });

      // Connectors between bars at running-total height.
      const segs = [];
      let r = baseline;
      for (let i = 0; i < deltas.length; i++) {
        const before = r;
        const after = r + deltas[i];
        // Right edge of column i (the column at index i, i.e. col i in cols array — same numbering).
        // The "before" segment runs from right of col i to left of col i+1 at y(before).
        const xRightOfCol = colBand(i) + colBand.bandwidth();
        const xLeftOfNext = colBand(i + 1);
        segs.push({ x1: xRightOfCol, x2: xLeftOfNext, y: y(before) });
        // Inside col i+1 we go from y(before) to y(after) — implied by the delta bar.
        r = after;
      }
      // Final connector: from right of col 4 (last delta) to left of col 5 (final), at y(running).
      const xRight = colBand(deltas.length) + colBand.bandwidth();
      const xLeft = colBand(deltas.length + 1);
      segs.push({ x1: xRight, x2: xLeft, y: y(r) });

      const linesSel = connectorsG.selectAll('line.imp-wf-connector').data(segs);
      linesSel.enter().append('line').attr('class', 'imp-wf-connector')
        .merge(linesSel)
        .transition().duration(tDur)
        .attr('x1', d => d.x1).attr('x2', d => d.x2)
        .attr('y1', d => d.y).attr('y2', d => d.y);
      linesSel.exit().remove();
    }

    // Find the biggest contributor (by absolute value) in the predicted class,
    // for the readout caption.
    const predClass = wf.predictedClass;
    const absDeltas = wf.contributions.map(c => Math.abs(c.delta[predClass]));
    let big = 0;
    for (let i = 1; i < absDeltas.length; i++) if (absDeltas[i] > absDeltas[big]) big = i;
    const bigName = featureLabels[featureNames.indexOf(wf.contributions[big].feature)];
    const bigDelta = wf.contributions[big].delta[predClass];
    const trueClassName = classNames[point.classIdx];

    ctx.readout.innerHTML = `
      <div class="imp-caption-row">
        <span class="imp-caption">
          The biggest contributor to the
          <strong>${classNames[predClass]}</strong> call was
          <strong>${bigName}</strong>
          (${bigDelta >= 0 ? '+' : ''}${(bigDelta * 100).toFixed(1)} pp).
          The penguin's true label is ${trueClassName}.
        </span>
      </div>
      <div class="readout-cell">
        <span class="readout-label">Predicted</span>
        <span class="readout-value">${classNames[predClass]}</span>
      </div>
      <div class="readout-cell">
        <span class="readout-label">P(predicted)</span>
        <span class="readout-value">${(wf.finalProb[predClass] * 100).toFixed(1)}%</span>
      </div>
      <div class="readout-cell">
        <span class="readout-label">True label</span>
        <span class="readout-value">${trueClassName}</span>
      </div>
    `;

    redraw(false);
    // Gentle entry animation: animate from baseline-only state to full waterfall.
    later(() => redraw(true), 50);
  }

  // =========================================================================
  // SCENE 12 — Feature × Depth heatmap
  // =========================================================================

  function renderHeatmap(ctx) {
    clearAll(ctx);
    clearTimers();

    const data = ctx.data;
    const featureLabels = data.meta.featureLabels;
    const fbd = data.featureByDepth;
    const counts = fbd.counts;
    const maxDepth = fbd.maxDepth;
    const nFeatures = featureLabels.length;
    const nDepths = maxDepth + 1;

    const { W, H } = svgBox(ctx);

    // Layout: leave room on left for feature labels, on bottom for depth axis
    // and a colour-scale legend.
    const M = { top: 30, right: 28, bottom: 86, left: 150 };
    const innerW = W - M.left - M.right;
    const innerH = H - M.top - M.bottom;

    const cellW = innerW / nDepths;
    const cellH = innerH / nFeatures;

    // Find the global max so the colour scale uses one consistent reference.
    let vMax = 0;
    for (const row of counts) for (const v of row) if (v > vMax) vMax = v;
    if (vMax <= 0) vMax = 1;

    // Build a sequential ramp from --bg to --highlight (purple). Purple is the
    // designated non-identity emphasis colour in this palette, so it doesn't
    // collide with any class.
    const bgHex = Theme.readVar('--bg') || '#f9f7f1';
    const accentHex = Theme.readVar('--highlight') || '#7a5c8c';
    const colorScale = d3.scaleSequential()
      .domain([0, vMax])
      .interpolator(d3.interpolateRgb(bgHex, accentHex));

    const svg = d3.select(ctx.svg);

    // Title
    svg.append('text')
      .attr('class', 'imp-panel-title')
      .attr('x', M.left)
      .attr('y', 18)
      .text('Feature usage by depth');

    const root = svg.append('g')
      .attr('transform', `translate(${M.left}, ${M.top})`);

    // ---- cells ---------------------------------------------------------
    const cellsData = [];
    for (let f = 0; f < nFeatures; f++) {
      for (let d = 0; d < nDepths; d++) {
        cellsData.push({ f, d, v: counts[f][d] });
      }
    }

    const cellsSel = root.selectAll('rect.imp-hm-cell')
      .data(cellsData)
      .enter()
      .append('rect')
      .attr('class', 'imp-hm-cell')
      .attr('x', d => d.d * cellW)
      .attr('y', d => d.f * cellH)
      .attr('width', cellW)
      .attr('height', cellH)
      .attr('fill', d => colorScale(d.v))
      .attr('stroke', bgHex)
      .attr('stroke-width', 1);

    // ---- text inside cells (only for the larger cells, omit zeros) ------
    root.selectAll('text.imp-hm-cell-text')
      .data(cellsData.filter(d => d.v >= 0.04))
      .enter()
      .append('text')
      .attr('class', d => 'imp-hm-cell-text' + (d.v >= 0.55 * vMax ? ' imp-hm-cell-text-light' : ''))
      .attr('x', d => d.d * cellW + cellW / 2)
      .attr('y', d => d.f * cellH + cellH / 2 + 3)
      .attr('text-anchor', 'middle')
      .text(d => `${(d.v * 100).toFixed(0)}`);

    // ---- row labels (features) -----------------------------------------
    root.selectAll('text.imp-hm-row-label')
      .data(featureLabels)
      .enter()
      .append('text')
      .attr('class', 'imp-hm-row-label')
      .attr('x', -10)
      .attr('y', (_d, i) => i * cellH + cellH / 2 + 4)
      .attr('text-anchor', 'end')
      .text(d => d);

    // ---- column labels (depths) ----------------------------------------
    root.selectAll('text.imp-hm-col-label')
      .data(d3.range(nDepths))
      .enter()
      .append('text')
      .attr('class', 'imp-hm-col-label')
      .attr('x', d => d * cellW + cellW / 2)
      .attr('y', innerH + 16)
      .attr('text-anchor', 'middle')
      .text(d => d);

    svg.append('text')
      .attr('class', 'imp-axis-label-flat')
      .attr('x', M.left + innerW / 2)
      .attr('y', M.top + innerH + 32)
      .attr('text-anchor', 'middle')
      .text('Depth in tree (0 = root)');

    // ---- legend (cream → purple) ---------------------------------------
    const legendW = Math.min(220, innerW * 0.4);
    const legendH = 8;
    const legendX = M.left + innerW - legendW;
    const legendY = M.top + innerH + 50;

    const defs = svg.append('defs');
    const grad = defs.append('linearGradient')
      .attr('id', 'imp-hm-gradient')
      .attr('x1', '0').attr('x2', '1')
      .attr('y1', '0').attr('y2', '0');
    const STOPS = 8;
    for (let i = 0; i <= STOPS; i++) {
      grad.append('stop')
        .attr('offset', `${(i / STOPS) * 100}%`)
        .attr('stop-color', colorScale((i / STOPS) * vMax));
    }
    svg.append('rect')
      .attr('class', 'imp-hm-legend')
      .attr('x', legendX).attr('y', legendY)
      .attr('width', legendW).attr('height', legendH)
      .attr('fill', 'url(#imp-hm-gradient)');

    svg.append('text')
      .attr('class', 'imp-hm-legend-label')
      .attr('x', legendX).attr('y', legendY - 4)
      .attr('text-anchor', 'start')
      .text('share of splits per row');

    svg.append('text')
      .attr('class', 'imp-hm-legend-tick')
      .attr('x', legendX).attr('y', legendY + legendH + 12)
      .attr('text-anchor', 'start')
      .text('0%');

    svg.append('text')
      .attr('class', 'imp-hm-legend-tick')
      .attr('x', legendX + legendW).attr('y', legendY + legendH + 12)
      .attr('text-anchor', 'end')
      .text(`${(vMax * 100).toFixed(0)}%`);

    // ---- hover tooltip --------------------------------------------------
    const tooltip = document.createElement('div');
    tooltip.className = 'imp-hm-tooltip';
    tooltip.style.opacity = '0';
    ctx.overlay.appendChild(tooltip);

    cellsSel
      .style('cursor', 'crosshair')
      .on('mouseenter', function (event, d) {
        d3.select(this).attr('stroke', Theme.readVar('--ink')).attr('stroke-width', 1.5);
        tooltip.innerHTML = `
          <div class="imp-hm-tt-feature">${featureLabels[d.f]}</div>
          <div class="imp-hm-tt-row"><span>Depth</span><span>${d.d}</span></div>
          <div class="imp-hm-tt-row"><span>Share at this depth</span><span>${(d.v * 100).toFixed(1)}%</span></div>
        `;
        tooltip.style.opacity = '1';
      })
      .on('mousemove', function (event) {
        const stageRect = ctx.overlay.getBoundingClientRect();
        const cx = event.clientX - stageRect.left;
        const cy = event.clientY - stageRect.top;
        const ttW = 200;
        const placeRight = cx + 16 + ttW < stageRect.width;
        tooltip.style.left = (placeRight ? cx + 16 : cx - ttW - 16) + 'px';
        tooltip.style.top = Math.max(10, cy - 30) + 'px';
      })
      .on('mouseleave', function () {
        d3.select(this).attr('stroke', bgHex).attr('stroke-width', 1);
        tooltip.style.opacity = '0';
      });

    // ---- caption: which feature owns the root? Which is rare? ----------
    // Most-used feature at depth 0 (root)
    let rootFeat = 0;
    for (let f = 1; f < nFeatures; f++) if (counts[f][0] > counts[rootFeat][0]) rootFeat = f;
    // Find the feature whose share is most concentrated *deep* (later depths).
    // Use mean depth weighted by row's distribution.
    const meanDepths = counts.map(row => {
      let num = 0, den = 0;
      for (let d = 0; d < row.length; d++) { num += d * row[d]; den += row[d]; }
      return den > 0 ? num / den : 0;
    });
    let deepFeat = 0;
    for (let f = 1; f < nFeatures; f++) if (meanDepths[f] > meanDepths[deepFeat]) deepFeat = f;

    ctx.readout.innerHTML = `
      <div class="imp-caption-row">
        <span class="imp-caption">
          <strong>${featureLabels[rootFeat]}</strong>
          shows up most often at the root.
          <strong>${featureLabels[deepFeat]}</strong>
          tends to appear later, after stronger features have already split the data.
        </span>
      </div>
      <div class="readout-cell">
        <span class="readout-label">Trees</span>
        <span class="readout-value">${data.meta.nTrees}</span>
      </div>
      <div class="readout-cell">
        <span class="readout-label">Max depth</span>
        <span class="readout-value">${maxDepth}</span>
      </div>
    `;

    // Re-render on theme change, since the colour ramp depends on CSS vars.
    function onThemeChange() {
      // Re-resolve the colour endpoints and re-tint the cells/legend in place.
      const bg2 = Theme.readVar('--bg') || '#f9f7f1';
      const ac2 = Theme.readVar('--highlight') || '#7a5c8c';
      const cs2 = d3.scaleSequential().domain([0, vMax])
        .interpolator(d3.interpolateRgb(bg2, ac2));
      cellsSel.attr('fill', d => cs2(d.v)).attr('stroke', bg2);
      grad.selectAll('stop').remove();
      for (let i = 0; i <= STOPS; i++) {
        grad.append('stop')
          .attr('offset', `${(i / STOPS) * 100}%`)
          .attr('stop-color', cs2((i / STOPS) * vMax));
      }
    }
    window.addEventListener('theme-change', onThemeChange);
    // Stash so exit() can detach it.
    ctx._impHeatmapThemeHandler = onThemeChange;
  }

  // =========================================================================
  // Public dispatch
  // =========================================================================

  window.SCENES.importance = {
    enter(ctx, { sub }) {
      // Detach any heatmap-only listener if we're entering a different sub.
      if (ctx._impHeatmapThemeHandler) {
        window.removeEventListener('theme-change', ctx._impHeatmapThemeHandler);
        ctx._impHeatmapThemeHandler = null;
      }
      if (sub === 'bars') {
        renderBars(ctx);
      } else if (sub === 'waterfall') {
        renderWaterfall(ctx);
      } else if (sub === 'heatmap') {
        renderHeatmap(ctx);
      } else {
        clearAll(ctx);
        ctx.overlay.innerHTML = `<div class="scene-stub">importance · ${sub}</div>`;
      }
    },
    exit(ctx) {
      clearTimers();
      if (ctx._impHeatmapThemeHandler) {
        window.removeEventListener('theme-change', ctx._impHeatmapThemeHandler);
        ctx._impHeatmapThemeHandler = null;
      }
      d3.select(ctx.svg).selectAll('*').interrupt();
      d3.select(ctx.svg).selectAll('*').remove();
      ctx.overlay.innerHTML = '';
      ctx.controls.innerHTML = '';
      ctx.readout.innerHTML = '';
    },
  };
})();
