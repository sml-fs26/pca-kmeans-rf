/* Scene 5 — Five shapes, five eigen-images.
 *
 * Scales the lesson up to k=5 disjoint shapes. Three click-steps:
 *   1) A 12-image sample grid from independent5.
 *   2) The five eigen-images appear (each one a single shape).
 *   3) Eigenvalue bar chart + the variance/support formula.
 *
 * Eigenvecs in this variant are non-negative (each equals the +normMask of one
 * shape), so we render them with the auto-grayscale path — no diverging palette.
 * Order in eigenvecs is by support descending: circle, square, star, triangle, diamond.
 */

window.scenes.scene5 = function (root) {
  root.innerHTML = '';
  root.classList.add('scene-s5');

  const variant = PCA.variant('independent5');
  // The shape names in the order they appear in eigenvecs (by support, descending):
  const EV_LABELS = [
    { sym: 'v_1', name: 'circle' },
    { sym: 'v_2', name: 'square' },
    { sym: 'v_3', name: 'star' },
    { sym: 'v_4', name: 'triangle' },
    { sym: 'v_5', name: 'diamond' },
  ];

  // ---- Layout ---------------------------------------------------------------
  const layout = document.createElement('div');
  layout.className = 'scene-layout center s5-layout';
  root.appendChild(layout);

  const stepPill = document.createElement('div');
  stepPill.className = 'step-pill s5-step-pill';
  layout.appendChild(stepPill);

  const heading = document.createElement('h2');
  heading.className = 's5-heading';
  heading.textContent = 'Five shapes, five eigen-images.';
  layout.appendChild(heading);

  const subhead = document.createElement('p');
  subhead.className = 's5-subhead muted';
  layout.appendChild(subhead);

  // The body region holds (in order) the sample grid, the eigen-image row, and
  // the chart panel; sections are added/removed per step.
  const body = document.createElement('div');
  body.className = 's5-body';
  layout.appendChild(body);

  // ---- KaTeX helper ---------------------------------------------------------
  function renderKatex(host, src, displayMode) {
    if (!host) return;
    host.textContent = '';
    if (window.katex) {
      try {
        window.katex.render(src, host, { displayMode: !!displayMode, throwOnError: false });
      } catch (e) {
        host.textContent = src;
      }
    } else {
      host.textContent = src;
    }
  }

  // ---- Builders -------------------------------------------------------------
  function buildSampleGrid() {
    const wrap = document.createElement('div');
    wrap.className = 's5-sample-grid';
    const N = 12;
    for (let i = 0; i < N; i++) {
      const cell = document.createElement('div');
      cell.className = 's5-sample-cell';
      const c = ImageCanvas.create(cell, { w: 32, h: 32, scale: 3 });
      const img = PCA.buildImage(variant, i);
      ImageCanvas.render(c, img, { min: 0, max: 1 });
      wrap.appendChild(cell);
    }
    return wrap;
  }

  function buildEigenRow() {
    const row = document.createElement('div');
    row.className = 's5-eigen-row';
    for (let j = 0; j < 5; j++) {
      const cell = document.createElement('div');
      cell.className = 's5-eigen-cell';

      const c = ImageCanvas.create(cell, { w: 32, h: 32, scale: 6 });
      // Auto-grayscale: eigenvecs are non-negative for independent5 (each is a
      // single shape's +normMask). Don't pass {signed: true}.
      ImageCanvas.render(c, variant.eigenvecs[j]);

      const cap = document.createElement('div');
      cap.className = 'image-caption s5-eigen-caption';
      const tex = document.createElement('span');
      const lab = EV_LABELS[j];
      renderKatex(tex, lab.sym, false);
      cap.appendChild(tex);
      cap.appendChild(document.createTextNode(`  (${lab.name})`));
      cell.appendChild(cap);

      row.appendChild(cell);
    }
    return row;
  }

  function buildChart() {
    const wrap = document.createElement('div');
    wrap.className = 's5-chart-wrap';

    const formula = document.createElement('div');
    formula.className = 'formula-block s5-formula';
    renderKatex(formula, '\\lambda_i = \\sigma^2 \\cdot |\\text{support}_i|', true);
    wrap.appendChild(formula);

    // Bar chart, 100x60 viewBox, sized via CSS.
    const VBW = 100, VBH = 60;
    const M = { top: 6, right: 6, bottom: 14, left: 12 };
    const innerW = VBW - M.left - M.right;
    const innerH = VBH - M.top - M.bottom;

    const svg = d3.select(wrap).append('svg')
      .attr('class', 's5-bar-svg')
      .attr('viewBox', `0 0 ${VBW} ${VBH}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    const evals = variant.eigenvals;
    const labels = EV_LABELS.map(l => l.name);
    const maxEval = Math.max.apply(null, evals);

    const xScale = d3.scaleBand()
      .domain(labels.map((_, i) => i))
      .range([M.left, M.left + innerW])
      .padding(0.25);
    const yScale = d3.scaleLinear()
      .domain([0, maxEval * 1.05])
      .range([M.top + innerH, M.top]);

    // Light gridlines for the y-axis.
    const yTicks = yScale.ticks(4);
    const gGrid = svg.append('g').attr('class', 'grid');
    yTicks.forEach(t => {
      gGrid.append('line')
        .attr('x1', M.left).attr('x2', M.left + innerW)
        .attr('y1', yScale(t)).attr('y2', yScale(t));
    });

    // Bars.
    const gBars = svg.append('g').attr('class', 's5-bars');
    evals.forEach((lam, i) => {
      const bx = xScale(i);
      const bw = xScale.bandwidth();
      const by = yScale(lam);
      const bh = yScale(0) - yScale(lam);
      gBars.append('rect')
        .attr('class', 'cluster-1 s5-bar')
        .attr('x', bx)
        .attr('y', by)
        .attr('width', bw)
        .attr('height', bh);
      gBars.append('text')
        .attr('class', 's5-bar-value')
        .attr('x', bx + bw / 2)
        .attr('y', by - 1.2)
        .attr('text-anchor', 'middle')
        .text(lam.toFixed(2));
    });

    // X-axis labels and baseline.
    const gAx = svg.append('g').attr('class', 'axis s5-axis');
    labels.forEach((name, i) => {
      const cx = xScale(i) + xScale.bandwidth() / 2;
      gAx.append('text')
        .attr('class', 's5-x-label')
        .attr('x', cx)
        .attr('y', yScale(0) + 4.2)
        .attr('text-anchor', 'middle')
        .text(name);
    });
    gAx.append('line')
      .attr('class', 's5-baseline')
      .attr('x1', M.left).attr('x2', M.left + innerW)
      .attr('y1', yScale(0)).attr('y2', yScale(0));

    const sidebar = document.createElement('div');
    sidebar.className = 'sidebar-note s5-sidebar';
    sidebar.innerHTML =
      '<span class="sidebar-title">Why bigger shapes win.</span>' +
      'The eigenvalue is the variance of the latent factor times the size of the shape’s pixel support. ' +
      'Bigger shape → bigger eigenvalue, even though the variance per coefficient is the same ' +
      '<span class="mono">Var(U[0,1]) = 1/12</span>.';
    wrap.appendChild(sidebar);

    return wrap;
  }

  // ---- Step engine ----------------------------------------------------------
  const STEPS = 3;
  let cursor = 0;

  function setStep(c) {
    if (c < 1 || c > STEPS) return false;
    cursor = c;
    body.innerHTML = '';
    stepPill.textContent = `Step ${cursor} of ${STEPS}`;

    if (cursor === 1) {
      subhead.innerHTML = '<em>The dataset now has five disjoint shapes. Each image is a different mix.</em>';
      body.appendChild(buildSampleGrid());
    } else if (cursor === 2) {
      subhead.innerHTML = '<em>PCA, again, returns the shapes — sorted by how much variance each contributes.</em>';
      body.appendChild(buildEigenRow());
    } else if (cursor === 3) {
      subhead.innerHTML = '<em>The eigenvalue ranks each direction by total variance contributed.</em>';
      body.appendChild(buildChart());
    }
    return true;
  }

  function onThemeChange() {
    // Re-render images that read CSS-variable palettes.
    setStep(cursor);
  }
  window.addEventListener('theme-change', onThemeChange);

  setStep(1);

  return {
    onEnter() {
      setStep(1);
    },
    onLeave() {},
    onNextKey() {
      if (cursor < STEPS) {
        setStep(cursor + 1);
        return true;
      }
      return false;
    },
    onPrevKey() {
      if (cursor > 1) {
        setStep(cursor - 1);
        return true;
      }
      return false;
    },
  };
};
