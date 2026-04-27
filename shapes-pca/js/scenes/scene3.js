/* Scene 3 — PCA returns the shapes (the aha moment).
 *
 * Internal step engine, cursor 0..3:
 *   0: just the headline + the centering formula. Six tiny sample images on top.
 *   1: reveal eigenvector 1 (positive-only -> auto-grayscale glowing circle).
 *   2: reveal eigenvector 2 (the square). Both visible side-by-side from now on.
 *   3: bar chart of eigenvalues — 5 slots, only PC1/PC2 nonzero.
 *
 * For the independent2 variant the math is exact:
 *   eigenvecs[0] == normMask_circle, eigenvecs[1] == normMask_square,
 *   eigenvals[0] = 113/12 ≈ 9.42, eigenvals[1] = 64/12 ≈ 5.33.
 * Variance ratios sum to 1 exactly because the data lives on a 2-D affine
 * subspace of ℝ^1024 — there is nothing else to discover.
 */

window.scenes.scene3 = function (root) {
  const variant = PCA.variant('independent2');
  const STEPS = 3;       // 0..3
  let cursor = 0;

  // ---- helper: KaTeX render -------------------------------------------------
  function renderKatex(host, src, displayMode) {
    if (!host) return;
    host.textContent = '';
    if (window.katex) {
      try { katex.render(src, host, { displayMode: !!displayMode, throwOnError: false }); }
      catch (e) { host.textContent = src; }
    } else { host.textContent = src; }
  }

  // ---- DOM scaffolding ------------------------------------------------------
  root.innerHTML = '';
  root.classList.add('scene-s3');

  const layout = document.createElement('div');
  layout.className = 'scene-layout center s3-layout';
  root.appendChild(layout);

  // Header row
  const header = document.createElement('div');
  header.className = 's3-header';
  header.innerHTML = `
    <span class="step-pill" id="s3-pill">Step 0 of ${STEPS}</span>
    <h2>PCA returns the shapes.</h2>
    <p class="muted">We took 200 samples of <span class="mono">a · circle + b · square</span>
       and asked PCA for the directions of greatest variance.</p>
  `;
  layout.appendChild(header);

  // Sample-strip — 6 tiny images, always visible, anchors the dataset
  const stripWrap = document.createElement('div');
  stripWrap.className = 's3-strip-wrap';
  const stripLabel = document.createElement('div');
  stripLabel.className = 's3-strip-label muted';
  stripLabel.textContent = 'six samples from the dataset';
  stripWrap.appendChild(stripLabel);
  const strip = document.createElement('div');
  strip.className = 's3-strip';
  stripWrap.appendChild(strip);
  layout.appendChild(stripWrap);

  // Build the 6 sample canvases (deterministic indices for reproducibility)
  const SAMPLE_IDXS = [0, 17, 42, 87, 123, 188];
  SAMPLE_IDXS.forEach((idx) => {
    const cell = document.createElement('div');
    cell.className = 's3-strip-cell';
    const c = ImageCanvas.create(cell, { scale: 2 });
    const img = PCA.buildImage(variant, idx);
    ImageCanvas.render(c, img);
    strip.appendChild(cell);
  });

  // The formula block (covariance eigen-equation), shown from step 0
  const formulaWrap = document.createElement('div');
  formulaWrap.className = 'formula-block s3-formula';
  layout.appendChild(formulaWrap);
  renderKatex(formulaWrap, '\\mathrm{Cov}(X)\\, v \\;=\\; \\lambda \\, v', true);

  // Reveal row — holds the two eigen-image cards (step 1 & 2)
  const reveal = document.createElement('div');
  reveal.className = 's3-reveal';
  layout.appendChild(reveal);

  // PC1 card
  const card1 = makeEigenCard({
    pcLabel: 'v_1',
    captionPos: 'PC₁ is the circle. Literally.',
    eigenvec: variant.eigenvecs[0],
    lambda: variant.eigenvals[0],
    pct: variant.varRatio[0] * 100,
    cls: 's3-card s3-card-1',
  });
  reveal.appendChild(card1.root);

  // PC2 card
  const card2 = makeEigenCard({
    pcLabel: 'v_2',
    captionPos: 'PC₂ is the square. PCA recovered the basis we built in.',
    eigenvec: variant.eigenvecs[1],
    lambda: variant.eigenvals[1],
    pct: variant.varRatio[1] * 100,
    cls: 's3-card s3-card-2',
  });
  reveal.appendChild(card2.root);

  // Bar-chart row + sidebar note (step 3)
  const chartWrap = document.createElement('div');
  chartWrap.className = 's3-chart-wrap';
  layout.appendChild(chartWrap);

  const chartTitle = document.createElement('div');
  chartTitle.className = 's3-chart-title';
  chartTitle.textContent = 'Eigenvalues — variance along each principal direction';
  chartWrap.appendChild(chartTitle);

  const chartHost = document.createElement('div');
  chartHost.className = 's3-chart';
  chartWrap.appendChild(chartHost);

  const chartNote = document.createElement('div');
  chartNote.className = 'sidebar-note s3-note';
  chartNote.innerHTML =
    `<span class="sidebar-title">A flat 2-D world</span>` +
    `The other 1022 directions in pixel space have variance zero — there is nothing else to discover.`;
  chartWrap.appendChild(chartNote);

  drawBarChart(chartHost, variant.eigenvals);

  // ---- Eigen-image card factory --------------------------------------------
  function makeEigenCard({ pcLabel, captionPos, eigenvec, lambda, pct, cls }) {
    const wrap = document.createElement('div');
    wrap.className = cls;

    const label = document.createElement('div');
    label.className = 's3-card-label';
    renderKatex(label, pcLabel, false);
    wrap.appendChild(label);

    const canvasHost = document.createElement('div');
    canvasHost.className = 's3-card-canvas-host';
    wrap.appendChild(canvasHost);
    const c = ImageCanvas.create(canvasHost, { scale: 5 });
    // eigenvec for independent2 is positive-only (== normMask), so auto-grayscale
    // is exactly what we want — it'll look like a glowing shape.
    ImageCanvas.render(c, eigenvec);

    const readout = document.createElement('div');
    readout.className = 's3-card-readout mono';
    readout.innerHTML =
      `<span class="s3-readout-lambda">λ = ${lambda.toFixed(2)}</span>` +
      `<span class="s3-readout-pct muted">${pct.toFixed(1)}% of variance</span>`;
    wrap.appendChild(readout);

    const cap = document.createElement('div');
    cap.className = 'image-caption';
    cap.textContent = captionPos;
    wrap.appendChild(cap);

    return { root: wrap };
  }

  // ---- Bar chart (D3, 5 slots) ---------------------------------------------
  function drawBarChart(host, eigenvals) {
    const W = 460, H = 180;
    const margin = { top: 10, right: 16, bottom: 32, left: 44 };
    const innerW = W - margin.left - margin.right;
    const innerH = H - margin.top - margin.bottom;

    const slots = ['PC1', 'PC2', 'PC3', 'PC4', 'PC5'];
    const values = [
      eigenvals[0] || 0,
      eigenvals[1] || 0,
      eigenvals[2] || 0,
      eigenvals[3] || 0,
      eigenvals[4] || 0,
    ];

    const svg = d3.select(host).append('svg')
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .attr('class', 's3-svg');
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const maxVal = Math.max(...values, 1);
    const yMax = Math.ceil(maxVal); // 10 — clean tick value for 9.42

    const x = d3.scaleBand().domain(slots).range([0, innerW]).padding(0.32);
    const y = d3.scaleLinear().domain([0, yMax]).range([innerH, 0]);

    // Grid
    const grid = g.append('g').attr('class', 'grid');
    y.ticks(5).forEach(t => {
      grid.append('line')
        .attr('x1', 0).attr('x2', innerW)
        .attr('y1', y(t)).attr('y2', y(t));
    });

    // Bars (cluster-1 fill — categorical blue is fine here)
    g.append('g').attr('class', 's3-bars')
      .selectAll('rect')
      .data(values)
      .enter()
      .append('rect')
      .attr('class', 'cluster-1')
      .attr('x', (_, i) => x(slots[i]))
      .attr('y', d => y(d))
      .attr('width', x.bandwidth())
      .attr('height', d => Math.max(0, innerH - y(d)));

    // Bar value labels above each non-zero bar
    g.append('g').attr('class', 's3-bar-labels')
      .selectAll('text')
      .data(values)
      .enter()
      .append('text')
      .attr('x', (_, i) => x(slots[i]) + x.bandwidth() / 2)
      .attr('y', d => y(d) - 6)
      .attr('text-anchor', 'middle')
      .attr('class', 's3-bar-label')
      .text(d => d > 0.001 ? d.toFixed(2) : '0');

    // x-axis (just labels, no line)
    const ax = g.append('g').attr('class', 'axis s3-axis-x')
      .attr('transform', `translate(0, ${innerH})`);
    ax.append('line')
      .attr('x1', 0).attr('x2', innerW)
      .attr('y1', 0).attr('y2', 0);
    ax.selectAll('text.s3-x-tick')
      .data(slots)
      .enter()
      .append('text')
      .attr('class', 's3-x-tick')
      .attr('x', d => x(d) + x.bandwidth() / 2)
      .attr('y', 18)
      .attr('text-anchor', 'middle')
      .text(d => d);

    // y-axis (ticks + labels + label)
    const ay = g.append('g').attr('class', 'axis s3-axis-y');
    ay.append('line')
      .attr('x1', 0).attr('x2', 0)
      .attr('y1', 0).attr('y2', innerH);
    y.ticks(5).forEach(t => {
      ay.append('text')
        .attr('class', 's3-y-tick')
        .attr('x', -8)
        .attr('y', y(t))
        .attr('dy', '0.32em')
        .attr('text-anchor', 'end')
        .text(t);
    });
    svg.append('text')
      .attr('class', 's3-y-label')
      .attr('transform', `translate(12, ${margin.top + innerH / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .text('variance (λ)');
  }

  // ---- Step renderer --------------------------------------------------------
  function applyCursor() {
    document.getElementById('s3-pill').textContent = `Step ${cursor} of ${STEPS}`;
    card1.root.classList.toggle('is-visible', cursor >= 1);
    card2.root.classList.toggle('is-visible', cursor >= 2);
    chartWrap.classList.toggle('is-visible', cursor >= 3);
    // At step 3 we want the chart to fit on-screen, so collapse the sample
    // strip + formula block (they have already done their pedagogical work)
    // and keep only the eigen-images + bar chart on the page.
    layout.classList.toggle('is-step3', cursor >= 3);
  }

  // ---- Theme reactivity (re-render bitmaps via image-canvas) ----------------
  function onThemeChange() {
    // Re-render eigen-images and sample strip so they pick up new --image-bg / --ink.
    strip.querySelectorAll('canvas.shape-image').forEach((c, i) => {
      const img = PCA.buildImage(variant, SAMPLE_IDXS[i]);
      ImageCanvas.render(c, img);
    });
    const c1 = card1.root.querySelector('canvas.shape-image');
    if (c1) ImageCanvas.render(c1, variant.eigenvecs[0]);
    const c2 = card2.root.querySelector('canvas.shape-image');
    if (c2) ImageCanvas.render(c2, variant.eigenvecs[1]);
  }
  window.addEventListener('theme-change', onThemeChange);

  // Initial paint — honour optional ?s3step=N in the URL hash for direct linking
  // (helps screenshot pipelines and lecture-deeplinks land on a specific step).
  const m = (window.location.hash || '').match(/s3step=(\d+)/);
  if (m) {
    const k = Math.max(0, Math.min(STEPS, parseInt(m[1], 10)));
    cursor = k;
  }
  applyCursor();

  return {
    onEnter() {
      // Don't reset cursor — students can re-enter at the same step.
      applyCursor();
    },
    onLeave() {},
    onNextKey() {
      if (cursor < STEPS) { cursor++; applyCursor(); return true; }
      return false;
    },
    onPrevKey() {
      if (cursor > 0) { cursor--; applyCursor(); return true; }
      return false;
    },
  };
};
