/* Scene 8 — Everyone, projected.
 *
 * The climactic animation: every viewer's 12-D rating row condenses into
 * a single colored ball, then flies into the PC1 × PC2 plane discovered by PCA.
 *
 * The heatmap and the scatter plane share one SVG so the balls can animate
 * across the boundary in a single coordinate system.
 *
 * Steps:
 *   1) Static: heatmap (sorted) on the left, empty plane on the right. CTA "Project!".
 *   2) Each row condenses to a colored ball at its right edge (row → ball).
 *   3) Balls fly to their PC1/PC2 coordinates.
 *   4) Variance breakdown + category legend.
 *
 * Replay button restarts the animation.
 */

window.scenes.scene8 = function (root) {
  const D = window.MOVIES_DATA;
  const N = D.users.length;
  const M = D.movies.length;

  // Layout in SVG units: 1200 × 540
  const W = 1200, H = 540;

  // Heatmap region (left) ----
  const heatX = 60, heatY = 60;
  const cellW = 30, cellH = 22;
  const heatLeftLabel = 70;
  const heatHeaderH = 90;
  const heatW = heatLeftLabel + cellW * M;  // 70 + 360 = 430
  const heatH = heatHeaderH + cellH * N;    // 90 + 352 = 442

  // Plane region (right) ----
  const planeX = 600, planeY = 30;
  const planeW = 560, planeH = 480;
  const planePad = 36;

  // ---- Compute domains for plane ----
  const proj = D.pca.projections; // 16 × 2
  const pcMax = Math.max(
    ...proj.flatMap(p => [Math.abs(p[0]), Math.abs(p[1])])
  ) * 1.2;

  function planeXScale(z1) {
    return planeX + planePad + (z1 + pcMax) / (2 * pcMax) * (planeW - 2 * planePad);
  }
  function planeYScale(z2) {
    return planeY + planePad + (pcMax - z2) / (2 * pcMax) * (planeH - 2 * planePad);
  }

  // ---- Layout ----
  const layout = document.createElement('div');
  layout.className = 'scene-layout center s8-layout';
  root.appendChild(layout);

  const stack = document.createElement('div');
  stack.className = 's8-stack';
  layout.appendChild(stack);

  const header = document.createElement('div');
  header.className = 's8-header';
  stack.appendChild(header);

  header.innerHTML = `
    <h2 class="s8-heading">Everyone, projected.</h2>
    <p class="s8-lede">Each viewer's 12-D rating row collapses into a single point in the plane PCA discovered. No category labels were used to find the axes — only the ratings.</p>
  `;

  const svgWrap = document.createElement('div');
  svgWrap.className = 'viz-wrap s8-svg-wrap';
  stack.appendChild(svgWrap);

  // Eigenviewer panel — appears after the animation finishes. PCA's two
  // principal directions are 12-vectors; rendered as thin rating strips,
  // they look like rating profiles of two fictional archetypal viewers.
  const eigenPanel = document.createElement('div');
  eigenPanel.className = 's8-eigen-panel hidden';
  stack.appendChild(eigenPanel);

  const svg = d3.select(svgWrap).append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .attr('class', 's8-svg');

  // ---- Heatmap group ----
  const gHeat = svg.append('g').attr('class', 's8-heat')
    .attr('transform', `translate(${heatX}, ${heatY})`);

  // Build cells (16 × 12).
  const sortedRows = D.shuffle.sortedRowOrder;
  const sortedCols = D.shuffle.sortedColOrder;

  function valueColor(v) {
    return Heatmap.valueToColor(v, window.Theme ? window.Theme.get() : 'light');
  }

  const cellGroups = [];
  for (let i = 0; i < N; i++) {
    const uIdx = sortedRows[i];
    const rowG = gHeat.append('g')
      .attr('class', `s8-row s8-row-${uIdx}`)
      .attr('transform', `translate(0, ${heatHeaderH + i * cellH})`);
    cellGroups[uIdx] = rowG;

    // Row label.
    rowG.append('text')
      .attr('class', 's8-row-label')
      .attr('x', heatLeftLabel - 8)
      .attr('y', cellH / 2)
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'middle')
      .text(D.users[uIdx].name);

    // Cells.
    for (let j = 0; j < M; j++) {
      const mIdx = sortedCols[j];
      const v = D.ratings.matrix[uIdx][mIdx];
      rowG.append('rect')
        .attr('class', 's8-cell')
        .attr('x', heatLeftLabel + j * cellW)
        .attr('y', 0)
        .attr('width', cellW - 1)
        .attr('height', cellH - 1)
        .attr('rx', 1.5)
        .attr('fill', valueColor(v));
    }
  }

  // Column labels.
  for (let j = 0; j < M; j++) {
    const mIdx = sortedCols[j];
    const x = heatLeftLabel + j * cellW + cellW / 2;
    gHeat.append('text')
      .attr('class', 's8-col-label')
      .attr('transform', `translate(${x}, ${heatHeaderH - 8}) rotate(-55)`)
      .attr('text-anchor', 'start')
      .attr('dominant-baseline', 'middle')
      .text(shortTitle(D.movies[mIdx].title));
  }

  function shortTitle(t) {
    if (t.length <= 16) return t;
    if (t.includes(':')) return t.split(':')[0];
    if (t.includes('—')) return t.split('—')[0];
    return t.slice(0, 14) + '…';
  }

  // ---- Plane group ----
  const gPlane = svg.append('g').attr('class', 's8-plane');

  // Background panel.
  gPlane.append('rect')
    .attr('class', 's8-plane-bg')
    .attr('x', planeX).attr('y', planeY)
    .attr('width', planeW).attr('height', planeH)
    .attr('fill', 'none')
    .attr('stroke', 'var(--rule)')
    .attr('stroke-dasharray', '4 4')
    .attr('rx', 6);

  // Cross axes (origin lines).
  const x0 = planeXScale(0), y0 = planeYScale(0);
  gPlane.append('line')
    .attr('class', 's8-axis')
    .attr('x1', planeX + planePad).attr('x2', planeX + planeW - planePad)
    .attr('y1', y0).attr('y2', y0);
  gPlane.append('line')
    .attr('class', 's8-axis')
    .attr('x1', x0).attr('x2', x0)
    .attr('y1', planeY + planePad).attr('y2', planeY + planeH - planePad);

  // Axis end labels.
  gPlane.append('text')
    .attr('class', 's8-axis-end')
    .attr('x', planeX + planeW - planePad).attr('y', y0 - 6)
    .attr('text-anchor', 'end')
    .text('PC1 →');
  gPlane.append('text')
    .attr('class', 's8-axis-end')
    .attr('x', x0 + 6).attr('y', planeY + planePad)
    .attr('text-anchor', 'start')
    .text('↑ PC2');

  // Plane title.
  gPlane.append('text')
    .attr('class', 's8-plane-title')
    .attr('x', planeX + planeW / 2)
    .attr('y', planeY + 18)
    .attr('text-anchor', 'middle')
    .text('First two principal components');

  // ---- Floating balls layer (on top) ----
  const gBalls = svg.append('g').attr('class', 's8-balls');

  // ---- Animation control ----
  let cursor = 1;
  const STEPS = 4;
  let animTimers = [];

  function clearAnim() {
    animTimers.forEach(t => clearTimeout(t));
    animTimers = [];
    gBalls.selectAll('*').remove();
  }

  function resetVisuals() {
    clearAnim();
    // Restore all heatmap rows (cells + labels) to full opacity.
    gHeat.selectAll('.s8-cell').style('opacity', 1);
    gHeat.selectAll('.s8-row-label').style('opacity', 1);
  }

  function rowRightEdge(uIdx) {
    // Coordinate where a row's rightmost cell ends in svg coords.
    const i = sortedRows.indexOf(uIdx);
    return {
      x: heatX + heatLeftLabel + cellW * M - cellW / 2,
      y: heatY + heatHeaderH + i * cellH + cellH / 2,
    };
  }

  function clusterFor(uIdx) {
    return D.categories[D.users[uIdx].category].cluster;
  }

  function condenseRows(callback) {
    // Phase A: each row's cells collapse to a single colored ball at the
    // row's right edge.
    D.users.forEach((u, uIdx) => {
      const i = sortedRows.indexOf(uIdx);
      const baseDelay = i * 60;
      const cluster = clusterFor(uIdx);
      const start = rowRightEdge(uIdx);

      animTimers.push(setTimeout(() => {
        // Fade the row's cells.
        cellGroups[uIdx].selectAll('.s8-cell')
          .transition().duration(420).style('opacity', 0);
        cellGroups[uIdx].select('.s8-row-label')
          .transition().duration(420).style('opacity', 0.4);

        // Spawn the ball at the right edge.
        gBalls.append('circle')
          .attr('class', `s8-ball cluster-${cluster}`)
          .attr('data-uidx', uIdx)
          .attr('cx', start.x)
          .attr('cy', start.y)
          .attr('r', 0)
          .attr('stroke', 'var(--bg)')
          .attr('stroke-width', 1.5)
          .transition().duration(380).ease(d3.easeBackOut.overshoot(2))
          .attr('r', 7);
      }, baseDelay));
    });

    const totalDelay = N * 60 + 500;
    animTimers.push(setTimeout(() => { if (callback) callback(); }, totalDelay));
  }

  function flyToPlane(callback) {
    // Phase B: balls fly to their PC1/PC2 positions.
    gBalls.selectAll('.s8-ball').each(function () {
      const node = d3.select(this);
      const uIdx = +node.attr('data-uidx');
      const p = proj[uIdx];
      const tx = planeXScale(p[0]);
      const ty = planeYScale(p[1]);
      node.transition()
        .delay(80 + Math.random() * 120)
        .duration(1100)
        .ease(d3.easeCubicInOut)
        .attr('cx', tx)
        .attr('cy', ty);
    });

    // After flight, fade name labels in next to the dots.
    animTimers.push(setTimeout(() => {
      gBalls.selectAll('.s8-ball').each(function () {
        const node = d3.select(this);
        const uIdx = +node.attr('data-uidx');
        const p = proj[uIdx];
        const tx = planeXScale(p[0]);
        const ty = planeYScale(p[1]);
        gBalls.append('text')
          .attr('class', 's8-ball-label')
          .attr('x', tx + 10)
          .attr('y', ty + 4)
          .style('opacity', 0)
          .text(D.users[uIdx].name)
          .transition().duration(400).style('opacity', 1);
      });
      if (callback) callback();
    }, 1400));
  }

  function showVarianceBreakdown() {
    const lambdas = D.pca.eigenvalues;
    const total = D.pca.totalVariance;
    const v1 = (100 * lambdas[0] / total).toFixed(1);
    const v2 = (100 * lambdas[1] / total).toFixed(1);
    const v12 = (100 * (lambdas[0] + lambdas[1]) / total).toFixed(1);

    gPlane.selectAll('.s8-variance-text').remove();
    gPlane.append('text')
      .attr('class', 's8-variance-text')
      .attr('x', planeX + planeW - planePad)
      .attr('y', planeY + planeH - planePad + 22)
      .attr('text-anchor', 'end')
      .style('opacity', 0)
      .text(`PC1 explains ${v1}% · PC2 explains ${v2}% · together ${v12}%`)
      .transition().duration(500).style('opacity', 1);

    showEigenviewers();
  }

  // ---- Eigenviewer panel ---------------------------------------------------
  // PC1 and PC2 are themselves 12-vectors over the same 12 films. So each PC
  // *is* a fictional viewer's rating profile — the "average" archetype that
  // PCA discovered. Showing it as a rating strip makes "what does PC1 mean?"
  // concrete: it's how this archetypal viewer would rate the 12 films.
  let eigenPanelBuilt = false;
  function showEigenviewers() {
    if (!eigenPanelBuilt) buildEigenPanel();
    eigenPanel.classList.remove('hidden');
  }

  function buildEigenPanel() {
    eigenPanelBuilt = true;
    eigenPanel.innerHTML = '';

    const intro = document.createElement('p');
    intro.className = 's8-eigen-intro';
    intro.innerHTML =
      '<strong>What ARE PC₁ and PC₂?</strong> ' +
      'Each principal component is itself a 12-number vector over the same films. ' +
      'Read them as the rating profiles of two fictional <em>eigenviewers</em> — ' +
      'archetypes PCA distilled from the data.';
    eigenPanel.appendChild(intro);

    const grid = document.createElement('div');
    grid.className = 's8-eigen-grid';
    eigenPanel.appendChild(grid);

    grid.appendChild(buildEigenRow({
      pcLabel: 'PC₁',
      pcVec: D.pca.pc1,
      pcLambda: D.pca.eigenvalues[0],
      pcVarPct: 100 * D.pca.eigenvalues[0] / D.pca.totalVariance,
      eigenName: 'Avi',
      eigenBlurb: 'Loves blockbusters, lukewarm on indies. Doesn\'t care much whether it\'s action or romance &mdash; only how big the budget is.',
    }));

    grid.appendChild(buildEigenRow({
      pcLabel: 'PC₂',
      pcVec: D.pca.pc2,
      pcLambda: D.pca.eigenvalues[1],
      pcVarPct: 100 * D.pca.eigenvalues[1] / D.pca.totalVariance,
      eigenName: 'Bea',
      eigenBlurb: 'Lives for action, allergic to romance. Indie or blockbuster — whatever, just give them a chase scene.',
    }));

    const coda = document.createElement('p');
    coda.className = 's8-eigen-coda muted';
    coda.innerHTML =
      'Avi and Bea aren\'t real viewers in the dataset &mdash; they\'re the two ' +
      'directions PCA found by analyzing the 16 real viewers\' ratings. ' +
      'Every real viewer\'s row is well-approximated as ' +
      '<span class="mono">x̄ + z<sub>1</sub>·Avi + z<sub>2</sub>·Bea</span> ' +
      '— their two PC scores tell us how much of each archetype they are.';
    eigenPanel.appendChild(coda);
  }

  function buildEigenRow({ pcLabel, pcVec, pcLambda, pcVarPct, eigenName, eigenBlurb }) {
    const row = document.createElement('div');
    row.className = 's8-eigen-row';

    const head = document.createElement('div');
    head.className = 's8-eigen-head';
    head.innerHTML =
      `<span class="s8-eigen-pc mono">${pcLabel}</span>` +
      `<span class="s8-eigen-name">&ldquo;${eigenName}&rdquo;</span>` +
      `<span class="s8-eigen-meta muted mono">` +
        `λ = ${pcLambda.toFixed(2)} &middot; ${pcVarPct.toFixed(1)}% variance` +
      `</span>`;
    row.appendChild(head);

    const blurb = document.createElement('p');
    blurb.className = 's8-eigen-blurb';
    blurb.innerHTML = eigenBlurb;
    row.appendChild(blurb);

    const stripWrap = document.createElement('div');
    stripWrap.className = 's8-eigen-strip-wrap';
    row.appendChild(stripWrap);

    // Re-order PC entries to match the heatmap's sortedColOrder, so the
    // user can compare against the same column layout shown above.
    const maxAbs = Math.max(...pcVec.map(Math.abs));
    sortedCols.forEach(mIdx => {
      const cell = document.createElement('div');
      cell.className = 's8-eigen-cell';
      const v = pcVec[mIdx];
      const t = v / (maxAbs || 1);  // -1..1
      cell.style.background = divergingColor(t);
      cell.title = `${D.movies[mIdx].title}: ${v.toFixed(3)}`;
      stripWrap.appendChild(cell);
    });

    // Movie title labels under the strip.
    const labels = document.createElement('div');
    labels.className = 's8-eigen-labels';
    sortedCols.forEach(mIdx => {
      const tag = document.createElement('span');
      tag.className = 's8-eigen-mlabel';
      tag.textContent = shortTitle(D.movies[mIdx].title);
      labels.appendChild(tag);
    });
    row.appendChild(labels);

    return row;
  }

  function divergingColor(t) {
    // t in [-1, 1] → CSS rgb. Negative → blue, zero → cream, positive → red.
    // We read CSS variables so the panel respects the active theme.
    const root = document.documentElement;
    const cs = getComputedStyle(root);
    const parseRGB = (name, fallback) => {
      const v = (cs.getPropertyValue(name) || '').trim();
      const m = v.match(/^#([0-9a-f]{6})$/i);
      if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
      return fallback;
    };
    const neg = parseRGB('--diverging-neg', [47, 108, 177]);
    const mid = parseRGB('--diverging-mid', [240, 238, 232]);
    const pos = parseRGB('--diverging-pos', [184, 50, 58]);
    const u = Math.max(-1, Math.min(1, t));
    let rgb;
    if (u >= 0) {
      rgb = mid.map((m, i) => Math.round(m + (pos[i] - m) * u));
    } else {
      rgb = mid.map((m, i) => Math.round(m + (neg[i] - m) * (-u)));
    }
    return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  }

  function runAnimation() {
    resetVisuals();
    cursor = 2;
    condenseRows(() => {
      cursor = 3;
      flyToPlane(() => {
        cursor = 4;
        showVarianceBreakdown();
      });
    });
  }

  // ---- Footer prompt + controls ----
  const footerRow = document.createElement('div');
  footerRow.className = 's8-footer';
  stack.appendChild(footerRow);

  const projectBtn = document.createElement('button');
  projectBtn.className = 'btn primary s8-project-btn';
  projectBtn.textContent = '✨ Run PCA — project everyone';
  footerRow.appendChild(projectBtn);

  const replayBtn = document.createElement('button');
  replayBtn.className = 'btn small s8-replay-btn hidden';
  replayBtn.textContent = '↺ Replay';
  footerRow.appendChild(replayBtn);

  const legend = document.createElement('div');
  legend.className = 's8-legend';
  footerRow.appendChild(legend);

  ['BA', 'IA', 'BR', 'IR'].forEach(code => {
    const cat = D.categories[code];
    const item = document.createElement('span');
    item.className = `s8-legend-item cluster-${cat.cluster}`;
    item.innerHTML = `<span class="s8-legend-swatch" style="background: var(--c${cat.cluster})"></span>${cat.label}`;
    legend.appendChild(item);
  });

  projectBtn.addEventListener('click', () => {
    projectBtn.classList.add('hidden');
    replayBtn.classList.remove('hidden');
    runAnimation();
  });

  // Dev affordance: `#scene=8&run` auto-triggers the animation on enter.
  function shouldAutoRun() {
    return /[#&?]run\b/.test(window.location.hash);
  }
  if (shouldAutoRun()) {
    setTimeout(() => projectBtn.click(), 200);
  }

  replayBtn.addEventListener('click', () => {
    gPlane.selectAll('.s8-variance-text').remove();
    eigenPanel.classList.add('hidden');
    runAnimation();
  });

  // Re-paint cell colors on theme change.
  function onTheme() {
    if (cursor === 1) {
      gHeat.selectAll('.s8-cell').each(function (_, idx) {
        // We don't have easy index→value here; just replay valueColor by data binding.
      });
      // Cheap path: redo all cells.
      gHeat.selectAll('.s8-row').each(function () {
        const rowG = d3.select(this);
        const uIdx = parseInt(rowG.attr('class').match(/s8-row-(\d+)/)[1], 10);
        rowG.selectAll('.s8-cell').nodes().forEach((rectNode, j) => {
          const mIdx = sortedCols[j];
          d3.select(rectNode).attr('fill', valueColor(D.ratings.matrix[uIdx][mIdx]));
        });
      });
    }
  }
  window.addEventListener('theme-change', onTheme);

  return {
    onEnter() {
      // Reset the scene to its pre-animation state.
      resetVisuals();
      gPlane.selectAll('.s8-variance-text').remove();
      projectBtn.classList.remove('hidden');
      replayBtn.classList.add('hidden');
      eigenPanel.classList.add('hidden');
      cursor = 1;
    },
    onLeave() {
      clearAnim();
    },
  };
};
