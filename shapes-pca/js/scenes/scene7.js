/* Scene 7 — When colors correlate, eigenvectors rotate.
 *
 * The climax of the viz. Pedagogical anchor:
 *   - At ρ=0, eigenvectors are the latent shapes (circle, square).
 *   - At ρ>0, eigenvectors *rotate*. v1 becomes a sum-image (both shapes bright);
 *     v2 becomes a contrast (one positive, one negative).
 *   - In the (a, b) coefficient frame this rotation is exactly 45° because
 *     Var(a) = Var(b). In 1024-D pixel space the rotation is anisotropic
 *     because the two masks have different supports.
 *
 * Interaction: a row of four buttons snapping among ρ ∈ {0, 0.4, 0.7, 0.9}.
 * No internal step engine — Next/Prev advances the scene, the buttons drive
 * the viz. Layout is two-column (viz | text+control). */

window.scenes.scene7 = function (root) {
  const variant = PCA.variant('correlated2');
  const RHOS = variant.rhos;          // [0, 0.4, 0.7, 0.9]
  const snapshots = variant.snapshots;
  const SIGMA = 0.18;                 // Std dev of the (a, b) Gaussian (per spec)
  const SIGMA2 = SIGMA * SIGMA;       // = 0.0324

  let rhoIdx = 0;                     // Default: ρ=0 on enter

  // ---- KaTeX helper ---------------------------------------------------------
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
  root.classList.add('scene-s7');

  const layout = document.createElement('div');
  layout.className = 'scene-layout s7-layout';
  root.appendChild(layout);

  // -- left column: visualization --
  const leftCol = document.createElement('div');
  leftCol.className = 's7-left';
  layout.appendChild(leftCol);

  // Scatter card
  const scatterCard = document.createElement('div');
  scatterCard.className = 's7-scatter-card';
  leftCol.appendChild(scatterCard);

  const scatterTitle = document.createElement('div');
  scatterTitle.className = 's7-card-title';
  scatterTitle.textContent = '200 samples in the (a, b) coefficient plane';
  scatterCard.appendChild(scatterTitle);

  const scatterHost = document.createElement('div');
  scatterHost.className = 's7-scatter-host';
  scatterCard.appendChild(scatterHost);

  // Eigen-image pair card
  const eigCard = document.createElement('div');
  eigCard.className = 's7-eig-card';
  leftCol.appendChild(eigCard);

  const eigTitle = document.createElement('div');
  eigTitle.className = 's7-card-title';
  eigTitle.textContent = 'Principal eigen-images';
  eigCard.appendChild(eigTitle);

  const eigGrid = document.createElement('div');
  eigGrid.className = 's7-eig-grid';
  eigCard.appendChild(eigGrid);

  // PC1 cell
  const pc1Cell = document.createElement('div');
  pc1Cell.className = 's7-eig-cell';
  eigGrid.appendChild(pc1Cell);
  const pc1Label = document.createElement('div');
  pc1Label.className = 's7-eig-label';
  renderKatex(pc1Label, 'v_1', false);
  pc1Cell.appendChild(pc1Label);
  const pc1CanvasHost = document.createElement('div');
  pc1CanvasHost.className = 's7-eig-canvas-host';
  pc1Cell.appendChild(pc1CanvasHost);
  const pc1Canvas = ImageCanvas.create(pc1CanvasHost, { scale: 5 });
  const pc1Readout = document.createElement('div');
  pc1Readout.className = 's7-eig-readout mono';
  pc1Cell.appendChild(pc1Readout);

  // PC2 cell
  const pc2Cell = document.createElement('div');
  pc2Cell.className = 's7-eig-cell';
  eigGrid.appendChild(pc2Cell);
  const pc2Label = document.createElement('div');
  pc2Label.className = 's7-eig-label';
  renderKatex(pc2Label, 'v_2', false);
  pc2Cell.appendChild(pc2Label);
  const pc2CanvasHost = document.createElement('div');
  pc2CanvasHost.className = 's7-eig-canvas-host';
  pc2Cell.appendChild(pc2CanvasHost);
  const pc2Canvas = ImageCanvas.create(pc2CanvasHost, { scale: 5 });
  const pc2Readout = document.createElement('div');
  pc2Readout.className = 's7-eig-readout mono';
  pc2Cell.appendChild(pc2Readout);

  // -- right column: prose, control, formula, callout --
  const rightCol = document.createElement('div');
  rightCol.className = 's7-right text-col';
  layout.appendChild(rightCol);

  const heading = document.createElement('h2');
  heading.className = 's7-heading';
  heading.textContent = 'When colors correlate, eigenvectors rotate.';
  rightCol.appendChild(heading);

  const lede = document.createElement('p');
  lede.className = 'muted s7-lede';
  lede.innerHTML =
    'We pulled the same trick as scene 3 — circle plus square — but we drew ' +
    '<span class="mono">(a, b)</span> from a correlated Gaussian instead of independent uniforms. ' +
    'Watch what PCA does.';
  rightCol.appendChild(lede);

  // ρ control
  const ctrl = document.createElement('div');
  ctrl.className = 's7-rho-ctrl';
  rightCol.appendChild(ctrl);

  const ctrlLabel = document.createElement('span');
  ctrlLabel.className = 's7-rho-ctrl-label muted';
  ctrlLabel.textContent = 'correlation ρ:';
  ctrl.appendChild(ctrlLabel);

  const btnRow = document.createElement('div');
  btnRow.className = 's7-rho-btns';
  ctrl.appendChild(btnRow);

  const rhoButtons = RHOS.map((r, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 's7-rho-btn mono';
    b.textContent = r.toFixed(1);
    b.setAttribute('data-idx', String(i));
    b.addEventListener('click', () => setRho(i));
    btnRow.appendChild(b);
    return b;
  });

  const ctrlReadout = document.createElement('span');
  ctrlReadout.className = 's7-rho-readout mono';
  ctrl.appendChild(ctrlReadout);

  // Prose that changes with ρ
  const prose = document.createElement('p');
  prose.className = 's7-prose';
  rightCol.appendChild(prose);

  // Formula block (constant — show closed-form 2x2 eigendecomposition once)
  const formula = document.createElement('div');
  formula.className = 'formula-block s7-formula';
  rightCol.appendChild(formula);
  renderKatex(
    formula,
    '\\Sigma_{(a,b)} = \\sigma^2 \\begin{bmatrix} 1 & \\rho \\\\ \\rho & 1 \\end{bmatrix}, \\quad ' +
    'v_1 = \\tfrac{1}{\\sqrt{2}}\\!\\begin{pmatrix}1\\\\1\\end{pmatrix}, \\quad ' +
    'v_2 = \\tfrac{1}{\\sqrt{2}}\\!\\begin{pmatrix}1\\\\-1\\end{pmatrix}',
    true
  );

  // Callout (always visible — the lesson)
  const callout = document.createElement('div');
  callout.className = 'callout s7-callout';
  callout.innerHTML =
    '<div class="callout-title">the lesson</div>' +
    '<div>PCA returns orthogonal axes of variance. When the latent generative factors are correlated, ' +
    'the principal components are <em>rotations</em> of those factors — not the factors themselves. ' +
    'This is the most important caveat about interpreting PCs.</div>';
  rightCol.appendChild(callout);

  // ---- Scatter plot (D3) ---------------------------------------------------
  const SCATTER_W = 320, SCATTER_H = 320;
  const sMargin = { top: 16, right: 16, bottom: 36, left: 40 };
  const sInnerW = SCATTER_W - sMargin.left - sMargin.right;
  const sInnerH = SCATTER_H - sMargin.top - sMargin.bottom;

  const sx = d3.scaleLinear().domain([-0.2, 1.2]).range([0, sInnerW]);
  const sy = d3.scaleLinear().domain([-0.2, 1.2]).range([sInnerH, 0]);

  const sSvg = d3.select(scatterHost).append('svg')
    .attr('viewBox', `0 0 ${SCATTER_W} ${SCATTER_H}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .attr('class', 's7-scatter-svg');
  const sG = sSvg.append('g').attr('transform', `translate(${sMargin.left}, ${sMargin.top})`);

  // Grid
  const sGrid = sG.append('g').attr('class', 'grid');
  [-0.2, 0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2].forEach(t => {
    sGrid.append('line').attr('x1', sx(t)).attr('x2', sx(t)).attr('y1', 0).attr('y2', sInnerH);
    sGrid.append('line').attr('x1', 0).attr('x2', sInnerW).attr('y1', sy(t)).attr('y2', sy(t));
  });

  // Axes
  const sAx = sG.append('g').attr('class', 'axis s7-axis-x').attr('transform', `translate(0, ${sInnerH})`);
  sAx.append('line').attr('x1', 0).attr('x2', sInnerW).attr('y1', 0).attr('y2', 0);
  [0, 0.5, 1.0].forEach(t => {
    sAx.append('text').attr('class', 's7-tick').attr('x', sx(t)).attr('y', 16).attr('text-anchor', 'middle').text(t.toFixed(1));
  });
  sAx.append('text').attr('class', 's7-axis-label').attr('x', sInnerW / 2).attr('y', 30).attr('text-anchor', 'middle').text('a (circle coefficient)');

  const sAy = sG.append('g').attr('class', 'axis s7-axis-y');
  sAy.append('line').attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', sInnerH);
  [0, 0.5, 1.0].forEach(t => {
    sAy.append('text').attr('class', 's7-tick').attr('x', -8).attr('y', sy(t)).attr('dy', '0.32em').attr('text-anchor', 'end').text(t.toFixed(1));
  });
  sAy.append('text').attr('class', 's7-axis-label')
    .attr('transform', `translate(-28, ${sInnerH / 2}) rotate(-90)`)
    .attr('text-anchor', 'middle').text('b (square coefficient)');

  // Points group (re-rendered on rho change)
  const sPoints = sG.append('g').attr('class', 's7-points');

  // Arrows for PC1, PC2
  // Single arrowhead marker per arrow — we use one defs block, two markers (one per color).
  const sDefs = sSvg.append('defs');
  function makeArrowMarker(id, colorVar) {
    sDefs.append('marker')
      .attr('id', id)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 8).attr('refY', 0)
      .attr('markerWidth', 6).attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', `var(${colorVar})`);
  }
  makeArrowMarker('s7-arrow-pc1', '--c2');  // PC1 → red (--c2)
  makeArrowMarker('s7-arrow-pc2', '--c1');  // PC2 → blue (--c1)

  const sArrows = sG.append('g').attr('class', 's7-arrows');
  const arrPc1 = sArrows.append('line')
    .attr('class', 's7-arrow s7-arrow-pc1')
    .attr('marker-end', 'url(#s7-arrow-pc1)')
    .attr('stroke', 'var(--c2)').attr('stroke-width', 2.4);
  const arrPc2 = sArrows.append('line')
    .attr('class', 's7-arrow s7-arrow-pc2')
    .attr('marker-end', 'url(#s7-arrow-pc2)')
    .attr('stroke', 'var(--c1)').attr('stroke-width', 2.4);

  // Arrow labels
  const arrPc1Label = sArrows.append('text')
    .attr('class', 's7-arrow-label cluster-2')
    .attr('text-anchor', 'middle')
    .text('PC₁');
  const arrPc2Label = sArrows.append('text')
    .attr('class', 's7-arrow-label cluster-1')
    .attr('text-anchor', 'middle')
    .text('PC₂');

  // ρ readout in scatter corner
  const sRhoCorner = sG.append('text')
    .attr('class', 's7-rho-corner mono')
    .attr('x', sInnerW - 8).attr('y', 14).attr('text-anchor', 'end');

  // ---- Render functions -----------------------------------------------------

  function renderScatter(snap) {
    const coeffs = snap.coeffs;
    const sel = sPoints.selectAll('circle.s7-pt').data(coeffs);
    sel.enter()
      .append('circle')
      .attr('class', 's7-pt cluster-3')
      .attr('r', 2.4)
      .attr('cx', d => sx(d[0]))
      .attr('cy', d => sy(d[1]))
      .merge(sel)
      .transition().duration(200)
      .attr('cx', d => sx(d[0]))
      .attr('cy', d => sy(d[1]));
    sel.exit().remove();

    // Arrows: PC1 along (cosθ, sinθ); PC2 perpendicular.
    // For ρ=0, PCs are axis-aligned (PC1 = a-axis, PC2 = b-axis), variances σ²,σ².
    // For ρ>0, PCs are at 45° in (a,b) frame, variances σ²(1+ρ), σ²(1-ρ).
    const rho = snap.rho;
    const cx = 0.5, cy = 0.5;
    let pc1Dir, pc2Dir, pc1Var, pc2Var;
    if (rho === 0) {
      pc1Dir = [1, 0];
      pc2Dir = [0, 1];
      pc1Var = SIGMA2;
      pc2Var = SIGMA2;
    } else {
      const inv = 1 / Math.SQRT2;
      pc1Dir = [inv, inv];
      pc2Dir = [-inv, inv];
      pc1Var = SIGMA2 * (1 + rho);
      pc2Var = SIGMA2 * (1 - rho);
    }
    // Arrow length: 2.5 * sqrt(variance) in (a,b) units (so the arrow visually
    // matches the cloud's spread without overshooting the [−0.2, 1.2] frame).
    const ARR_K = 2.5;
    const l1 = ARR_K * Math.sqrt(Math.max(pc1Var, 1e-9));
    const l2 = ARR_K * Math.sqrt(Math.max(pc2Var, 1e-9));
    const x1a = cx, y1a = cy;
    const x1b = cx + l1 * pc1Dir[0], y1b = cy + l1 * pc1Dir[1];
    const x2b = cx + l2 * pc2Dir[0], y2b = cy + l2 * pc2Dir[1];

    arrPc1.transition().duration(200)
      .attr('x1', sx(x1a)).attr('y1', sy(y1a))
      .attr('x2', sx(x1b)).attr('y2', sy(y1b));
    arrPc2.transition().duration(200)
      .attr('x1', sx(x1a)).attr('y1', sy(y1a))
      .attr('x2', sx(x2b)).attr('y2', sy(y2b));

    // Label positions: a touch past the arrow tip, with small offsets to avoid sitting on the line
    const labelOffset = 14;
    arrPc1Label.transition().duration(200)
      .attr('x', sx(x1b) + labelOffset * pc1Dir[0])
      .attr('y', sy(y1b) - labelOffset * pc1Dir[1] + 4);
    arrPc2Label.transition().duration(200)
      .attr('x', sx(x2b) + labelOffset * pc2Dir[0])
      .attr('y', sy(y2b) - labelOffset * pc2Dir[1] + 4);

    sRhoCorner.text(`ρ = ${rho.toFixed(1)}`);
  }

  function renderEigenImages(snap) {
    // Always pass {signed: true} so the diverging palette is consistent across
    // the entire morph, even at ρ=0 where the values are non-negative.
    ImageCanvas.render(pc1Canvas, snap.eigenvecs[0], { signed: true });
    ImageCanvas.render(pc2Canvas, snap.eigenvecs[1], { signed: true });
    pc1Readout.innerHTML =
      `<span class="s7-readout-lambda">λ₁ = ${snap.eigenvals[0].toFixed(2)}</span>` +
      `<span class="s7-readout-pct muted">${(snap.varRatio[0] * 100).toFixed(1)}%</span>`;
    pc2Readout.innerHTML =
      `<span class="s7-readout-lambda">λ₂ = ${snap.eigenvals[1].toFixed(2)}</span>` +
      `<span class="s7-readout-pct muted">${(snap.varRatio[1] * 100).toFixed(1)}%</span>`;
  }

  function renderProse(snap) {
    if (snap.rho === 0) {
      prose.innerHTML =
        '<em>The latent factors are independent. PCA recovers them — same as scene 3.</em>';
    } else {
      const pct = (snap.varRatio[0] * 100).toFixed(1);
      prose.innerHTML =
        '<em>PC₁ is no longer the circle. It\'s a <strong>sum image</strong>: circle and square ' +
        'rising together. PC₂ is the <strong>contrast</strong>: circle dim, square bright ' +
        '(or vice versa).</em><br><br>' +
        `PC₁ now explains <span class="mono">${pct}%</span> of the variance, up from 50%.`;
    }
  }

  function setRho(i) {
    if (i === rhoIdx) return;
    rhoIdx = i;
    applyAll();
  }

  function applyAll() {
    const snap = snapshots[rhoIdx];
    rhoButtons.forEach((b, i) => b.classList.toggle('is-active', i === rhoIdx));
    ctrlReadout.textContent = `ρ = ${snap.rho.toFixed(1)}`;
    renderScatter(snap);
    renderEigenImages(snap);
    renderProse(snap);
  }

  // ---- Theme reactivity (re-render eigen-image bitmaps) --------------------
  function onThemeChange() {
    const snap = snapshots[rhoIdx];
    ImageCanvas.render(pc1Canvas, snap.eigenvecs[0], { signed: true });
    ImageCanvas.render(pc2Canvas, snap.eigenvecs[1], { signed: true });
  }
  window.addEventListener('theme-change', onThemeChange);

  // Initial paint
  applyAll();

  return {
    onEnter() { applyAll(); },
    onLeave() {},
    onNextKey() { return false; },
    onPrevKey() { return false; },
  };
};
