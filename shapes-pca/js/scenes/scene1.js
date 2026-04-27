/* Scene 1 — Two numbers per image.
 *
 * Left: a live 32x32 image rendered from a*circle + b*square, with two sliders.
 * Right: an SVG scatter of the (a, b) coefficients of all 200 samples in the
 * independent2 variant; the current (a, b) is drawn as a larger ink dot.
 *
 * No internal step engine. Sliders mutate (a, b) and re-render the live image
 * and the highlighted dot. Next moves to scene 2.
 */

window.scenes.scene1 = function (root) {
  root.innerHTML = '';
  root.classList.add('scene-s1');

  // ---- DOM scaffolding ------------------------------------------------------
  const layout = document.createElement('div');
  layout.className = 'scene-layout';
  root.appendChild(layout);

  // Left column: image + sliders.
  const leftCol = document.createElement('div');
  leftCol.className = 's1-left';
  layout.appendChild(leftCol);

  const heading = document.createElement('h2');
  heading.textContent = 'Two numbers per image.';
  leftCol.appendChild(heading);

  const intro = document.createElement('p');
  intro.className = 'muted';
  intro.innerHTML = 'Move the sliders. Each image is <span class="mono">a · circle + b · square</span> — nothing else varies.';
  leftCol.appendChild(intro);

  const imageWrap = document.createElement('div');
  imageWrap.className = 's1-image-wrap';
  leftCol.appendChild(imageWrap);

  const liveCanvas = ImageCanvas.create(imageWrap, { w: 32, h: 32, scale: 8 });

  const formulaBlock = document.createElement('div');
  formulaBlock.className = 'formula-block s1-formula';
  leftCol.appendChild(formulaBlock);

  const sliders = document.createElement('div');
  sliders.className = 's1-sliders';
  leftCol.appendChild(sliders);

  function makeSlider(label, klass, initial) {
    const row = document.createElement('div');
    row.className = `s1-slider-row ${klass}`;

    const lab = document.createElement('label');
    lab.className = 's1-slider-label';
    lab.textContent = label;
    row.appendChild(lab);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '1';
    input.step = '0.01';
    input.value = String(initial);
    input.className = 's1-slider';
    row.appendChild(input);

    const out = document.createElement('span');
    out.className = 'mono s1-slider-value';
    out.textContent = Number(initial).toFixed(2);
    row.appendChild(out);

    sliders.appendChild(row);
    return { input, out };
  }

  const slA = makeSlider('a  (circle intensity)', 's1-row-a', 0.7);
  const slB = makeSlider('b  (square intensity)', 's1-row-b', 0.4);

  // Right column: scatter.
  const rightCol = document.createElement('div');
  rightCol.className = 's1-right';
  layout.appendChild(rightCol);

  const vizWrap = document.createElement('div');
  vizWrap.className = 'viz-wrap s1-viz-wrap';
  rightCol.appendChild(vizWrap);

  const scatterCaption = document.createElement('p');
  scatterCaption.className = 's1-caption';
  scatterCaption.innerHTML = '<em>200 samples drawn uniformly. Each dot is one of the images on the left.</em>';
  rightCol.appendChild(scatterCaption);

  // ---- KaTeX formula --------------------------------------------------------
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
  renderKatex(formulaBlock, 'x = a \\cdot \\mathbf{1}_C + b \\cdot \\mathbf{1}_S', true);

  // ---- Scatter SVG ----------------------------------------------------------
  // Margins inside a 100x100 viewBox.
  const VB = 100;
  const M = { top: 8, right: 10, bottom: 16, left: 16 };
  const innerW = VB - M.left - M.right;
  const innerH = VB - M.top - M.bottom;

  const svg = d3.select(vizWrap).append('svg')
    .attr('viewBox', `0 0 ${VB} ${VB}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  const xScale = d3.scaleLinear().domain([0, 1]).range([M.left, M.left + innerW]);
  const yScale = d3.scaleLinear().domain([0, 1]).range([M.top + innerH, M.top]);

  // Grid lines.
  const gGrid = svg.append('g').attr('class', 'grid s1-grid');
  for (let t = 0; t <= 1.0001; t += 0.25) {
    gGrid.append('line')
      .attr('x1', xScale(0)).attr('x2', xScale(1))
      .attr('y1', yScale(t)).attr('y2', yScale(t));
    gGrid.append('line')
      .attr('y1', yScale(0)).attr('y2', yScale(1))
      .attr('x1', xScale(t)).attr('x2', xScale(t));
  }

  // Axes (hairline only).
  const gAxis = svg.append('g').attr('class', 'axis s1-axis');
  gAxis.append('line')
    .attr('x1', xScale(0)).attr('x2', xScale(1))
    .attr('y1', yScale(0)).attr('y2', yScale(0));
  gAxis.append('line')
    .attr('x1', xScale(0)).attr('x2', xScale(0))
    .attr('y1', yScale(0)).attr('y2', yScale(1));

  // Axis ticks/labels.
  [0, 0.5, 1].forEach(t => {
    gAxis.append('text')
      .attr('x', xScale(t))
      .attr('y', yScale(0) + 4.2)
      .attr('text-anchor', 'middle')
      .attr('class', 's1-tick-label')
      .text(t.toFixed(1));
    gAxis.append('text')
      .attr('x', xScale(0) - 2)
      .attr('y', yScale(t) + 1.4)
      .attr('text-anchor', 'end')
      .attr('class', 's1-tick-label')
      .text(t.toFixed(1));
  });

  // Axis titles.
  svg.append('text')
    .attr('class', 's1-axis-title')
    .attr('x', M.left + innerW / 2)
    .attr('y', VB - 2.5)
    .attr('text-anchor', 'middle')
    .text('circle intensity   a');
  svg.append('text')
    .attr('class', 's1-axis-title')
    .attr('x', -M.top - innerH / 2)
    .attr('y', 5)
    .attr('text-anchor', 'middle')
    .attr('transform', 'rotate(-90)')
    .text('square intensity   b');

  // Sample dots.
  const variant = PCA.variant('independent2');
  const coeffs = variant.coeffs;

  const gDots = svg.append('g').attr('class', 's1-dots');
  gDots.selectAll('circle.s1-sample')
    .data(coeffs)
    .enter()
    .append('circle')
    .attr('class', 's1-sample')
    .attr('r', 0.9)
    .attr('cx', d => xScale(d[0]))
    .attr('cy', d => yScale(d[1]));

  // Current (a, b) marker.
  const gCurrent = svg.append('g').attr('class', 's1-current-g');
  const currentDot = gCurrent.append('circle')
    .attr('class', 's1-current')
    .attr('r', 1.9);

  // ---- State + render -------------------------------------------------------
  let a = 0.7, b = 0.4;
  const tmp = new Float32Array(window.DATA.meta.D);

  function renderImage() {
    PCA.buildImageFromCoeffs(['circle', 'square'], [a, b], { out: tmp });
    // Coeffs in [0,1] keep the image in [0, 2]. Pin display range to [0, 1] so
    // a single shape at full intensity always renders ink-black, and overlap
    // (a + b > 1) saturates rather than rescaling everything else.
    ImageCanvas.render(liveCanvas, tmp, { min: 0, max: 1 });
  }

  function renderCurrent() {
    currentDot
      .attr('cx', xScale(a))
      .attr('cy', yScale(b));
  }

  function renderAll() {
    renderImage();
    renderCurrent();
    slA.out.textContent = a.toFixed(2);
    slB.out.textContent = b.toFixed(2);
  }

  slA.input.addEventListener('input', () => {
    a = parseFloat(slA.input.value);
    renderAll();
  });
  slB.input.addEventListener('input', () => {
    b = parseFloat(slB.input.value);
    renderAll();
  });

  function onThemeChange() { renderImage(); }
  window.addEventListener('theme-change', onThemeChange);

  renderAll();

  return {
    onEnter() {
      // Reset to defaults so cold + warm entry are identical.
      a = 0.7; b = 0.4;
      slA.input.value = '0.7';
      slB.input.value = '0.4';
      renderAll();
    },
    onLeave() {},
  };
};
