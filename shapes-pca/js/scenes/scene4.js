/* Scene 4 — Reconstruction is addition.
 *
 * Two columns:
 *   left:  μ + α₁·v₁ + α₂·v₂ = x̂  rendered as a horizontal canvas equation
 *   right: two sliders (α₁, α₂), the formula, a "Match sample 17" button
 *
 * Cold entry must work — the scene reconstructs from DATA alone.
 *
 * Default sliders: (2, -1) per the spec. Bounds: [-3, +3], step 0.05.
 */

window.scenes.scene4 = function (root) {
  const variant = PCA.variant('independent2');
  const v1 = variant.eigenvecs[0];
  const v2 = variant.eigenvecs[1];
  const mean = variant.mean;
  const D = window.DATA.meta.D;

  // ---- helper: KaTeX --------------------------------------------------------
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
  root.classList.add('scene-s4');

  const layout = document.createElement('div');
  layout.className = 'scene-layout split-eq s4-layout';
  root.appendChild(layout);

  // ---- Left column: equation strip + caption -------------------------------
  const left = document.createElement('div');
  left.className = 's4-left';
  layout.appendChild(left);

  const titleBlock = document.createElement('div');
  titleBlock.className = 's4-title-block';
  titleBlock.innerHTML = `
    <span class="step-pill">Reconstruction</span>
    <h2>Reconstruction is addition.</h2>
  `;
  left.appendChild(titleBlock);

  const eqStrip = document.createElement('div');
  eqStrip.className = 's4-eq-strip';
  left.appendChild(eqStrip);

  function makeCell(captionTex) {
    const cell = document.createElement('div');
    cell.className = 's4-eq-cell';
    const cHost = document.createElement('div');
    cHost.className = 's4-eq-canvas-host';
    cell.appendChild(cHost);
    const c = ImageCanvas.create(cHost, { scale: 5 });
    const cap = document.createElement('div');
    cap.className = 's4-eq-cap';
    renderKatex(cap, captionTex, false);
    cell.appendChild(cap);
    return { root: cell, canvas: c };
  }

  function makeOp(symbol) {
    const op = document.createElement('div');
    op.className = 's4-eq-op';
    op.textContent = symbol;
    return op;
  }

  const cellMean = makeCell('\\mu \\;\\text{(mean image)}');
  const cellA1   = makeCell('\\alpha_1\\, v_1');
  const cellA2   = makeCell('\\alpha_2\\, v_2');
  const cellRec  = makeCell('\\hat{x} \\;\\text{(reconstruction)}');

  eqStrip.appendChild(cellMean.root);
  eqStrip.appendChild(makeOp('+'));
  eqStrip.appendChild(cellA1.root);
  eqStrip.appendChild(makeOp('+'));
  eqStrip.appendChild(cellA2.root);
  eqStrip.appendChild(makeOp('='));
  eqStrip.appendChild(cellRec.root);

  // Mean canvas is static — render once.
  ImageCanvas.render(cellMean.canvas, mean);

  const stripCaption = document.createElement('p');
  stripCaption.className = 's4-strip-caption';
  stripCaption.innerHTML =
    '<em>Every image in the dataset is the mean image plus a multiple of the circle ' +
    'and a multiple of the square. Two numbers.</em>';
  left.appendChild(stripCaption);

  // Color legend — explains the diverging red/blue palette used in the αv panels.
  const legend = document.createElement('div');
  legend.className = 's4-legend';
  legend.innerHTML =
    '<span class="s4-legend-title">Reading the αv panels</span>' +
    '<div class="s4-legend-row">' +
      '<span class="s4-swatch s4-swatch-pos"></span>' +
      '<span class="s4-legend-text"><span class="mono">α &gt; 0</span> &middot; pixels glow <em>red</em> — that shape gets <em>added</em>.</span>' +
    '</div>' +
    '<div class="s4-legend-row">' +
      '<span class="s4-swatch s4-swatch-neg"></span>' +
      '<span class="s4-legend-text"><span class="mono">α &lt; 0</span> &middot; pixels glow <em>blue</em> — that shape gets <em>subtracted</em>.</span>' +
    '</div>' +
    '<div class="s4-legend-row">' +
      '<span class="s4-swatch s4-swatch-zero"></span>' +
      '<span class="s4-legend-text"><span class="mono">α = 0</span> &middot; nothing added. The reconstruction is exactly μ &mdash; gray, because μ is half-circle + half-square.</span>' +
    '</div>';
  left.appendChild(legend);

  // ---- Right column: sliders, formula, sample button -----------------------
  const right = document.createElement('div');
  right.className = 's4-right';
  layout.appendChild(right);

  const controls = document.createElement('div');
  controls.className = 's4-controls';
  right.appendChild(controls);

  // alpha1 slider
  const row1 = document.createElement('div');
  row1.className = 'slider-row s4-slider-row';
  row1.innerHTML = `
    <label class="s4-slider-label" for="s4-a1"><span class="s4-greek">α₁</span></label>
    <input id="s4-a1" type="range" min="-3" max="3" step="0.05" value="2">
    <span id="s4-a1-val" class="slider-val">+2.00</span>
  `;
  controls.appendChild(row1);

  // alpha2 slider
  const row2 = document.createElement('div');
  row2.className = 'slider-row s4-slider-row';
  row2.innerHTML = `
    <label class="s4-slider-label" for="s4-a2"><span class="s4-greek">α₂</span></label>
    <input id="s4-a2" type="range" min="-3" max="3" step="0.05" value="-1">
    <span id="s4-a2-val" class="slider-val">−1.00</span>
  `;
  controls.appendChild(row2);

  // formula block (the canonical reconstruction equation)
  const formula = document.createElement('div');
  formula.className = 'formula-block s4-formula';
  right.appendChild(formula);
  renderKatex(
    formula,
    '\\hat{x} \\;=\\; \\mu \\;+\\; \\alpha_1\\, v_1 \\;+\\; \\alpha_2\\, v_2',
    true
  );

  // "Match sample 17" button
  const btnRow = document.createElement('div');
  btnRow.className = 's4-btn-row';
  btnRow.innerHTML = `
    <button id="s4-match" class="btn small">Match sample 17</button>
    <span class="muted s4-btn-hint">snap (α₁, α₂) to a real sample's PC scores</span>
  `;
  right.appendChild(btnRow);

  // ---- State + render -------------------------------------------------------
  // Buffers reused across slider events to avoid GC pressure.
  const bufA1 = new Float32Array(D); // α₁·v₁
  const bufA2 = new Float32Array(D); // α₂·v₂
  const bufRc = new Float32Array(D); // reconstruction

  function fmt(v) {
    if (v >= 0) return '+' + v.toFixed(2);
    // Use a unicode minus for nicer rendering vs hyphen.
    return '−' + (-v).toFixed(2);
  }

  function readAlphas() {
    return [
      parseFloat(document.getElementById('s4-a1').value),
      parseFloat(document.getElementById('s4-a2').value),
    ];
  }

  function rerender() {
    const [a1, a2] = readAlphas();

    // α·v terms — these are signed (α may be negative). Use diverging ramp.
    // For consistent colour scale across the strip we render with a fixed
    // `max` set to the largest |α·v_i| we'd ever see — i.e. 3 * max(|v|) for
    // either eigenvector. For the independent2 variant max(|v_i|) is 0.144338
    // for the circle (1/sqrt(48) — wait, no: 1/sqrt(113) ≈ 0.0941), so the
    // global max is 3 * 0.125 (square) = 0.375. We just compute it on the fly
    // from the current α and the eigenvec max so the visualization uses its
    // dynamic range nicely.
    const v1max = absMax(v1), v2max = absMax(v2);
    const maxA1 = Math.abs(a1) * v1max;
    const maxA2 = Math.abs(a2) * v2max;
    const sharedMax = Math.max(maxA1, maxA2, 1e-9);

    // Compute α·v (signed image)
    for (let p = 0; p < D; p++) bufA1[p] = a1 * v1[p];
    for (let p = 0; p < D; p++) bufA2[p] = a2 * v2[p];

    ImageCanvas.render(cellA1.canvas, bufA1, { signed: true, max: sharedMax });
    ImageCanvas.render(cellA2.canvas, bufA2, { signed: true, max: sharedMax });

    // Reconstruction: μ + α₁·v₁ + α₂·v₂
    PCA.reconstruct([a1, a2], variant, { out: bufRc });
    // The reconstruction can have small negative pixel values when α is large
    // negative — that's outside the convex hull of the dataset. We clamp to
    // [0, max] so auto-grayscale renders it as a normal toy image. The
    // fixed [0, 1] range matches the dataset.
    ImageCanvas.render(cellRec.canvas, bufRc, { min: 0, max: 1 });

    // Numeric readouts (use unicode minus for negative)
    document.getElementById('s4-a1-val').textContent = fmt(a1);
    document.getElementById('s4-a2-val').textContent = fmt(a2);
  }

  function absMax(v) {
    let m = 0;
    for (let i = 0; i < v.length; i++) {
      const a = Math.abs(v[i]);
      if (a > m) m = a;
    }
    return m;
  }

  // ---- Wiring ---------------------------------------------------------------
  document.getElementById('s4-a1').addEventListener('input', rerender);
  document.getElementById('s4-a2').addEventListener('input', rerender);

  document.getElementById('s4-match').addEventListener('click', () => {
    const scores = PCA.allScores(variant)[17];
    const a1 = scores[0], a2 = scores[1];
    // Clamp to slider bounds for safety.
    const c1 = Math.max(-3, Math.min(3, a1));
    const c2 = Math.max(-3, Math.min(3, a2));
    document.getElementById('s4-a1').value = c1.toFixed(2);
    document.getElementById('s4-a2').value = c2.toFixed(2);
    rerender();
  });

  // ---- Theme reactivity (re-render bitmaps) --------------------------------
  function onThemeChange() { rerender(); ImageCanvas.render(cellMean.canvas, mean); }
  window.addEventListener('theme-change', onThemeChange);

  // Initial render
  rerender();

  return {
    onEnter() { rerender(); },
    onLeave() {},
  };
};
