/* Scene 6 — One viewer in 2D.
 *
 * Click any row of the heatmap to "project" that viewer into the
 * (action↔romance, blockbuster↔indie) plane on the right.
 *
 * Projection (the human-interpretable one — not yet PCA):
 *   For each user u with rating row r_u ∈ R^12:
 *     a_score = (1/D) * Σ_f r_u[f] · sign(film f is action)
 *     b_score = (1/D) * Σ_f r_u[f] · sign(film f is blockbuster)
 *
 * This is a deliberate stepping-stone to PCA: students see that *if* you
 * already know the right two directions in 12-D space, projecting reduces
 * the matrix to a 2D scatter. Scene 7/8 will then show how PCA discovers
 * those directions automatically.
 */

window.scenes.scene6 = function (root) {
  const D = window.MOVIES_DATA;
  const N = D.users.length;
  const M = D.movies.length;

  // Direction weights (length M) — "action" axis, "blockbuster" axis.
  const wAction = D.movies.map(m => m.a);
  const wBlock  = D.movies.map(m => m.b);

  function projectUser(uIdx) {
    const r = D.ratings.matrix[uIdx];
    let aSum = 0, bSum = 0;
    for (let f = 0; f < M; f++) {
      aSum += r[f] * wAction[f];
      bSum += r[f] * wBlock[f];
    }
    return { a: aSum / M, b: bSum / M };
  }

  const projections = D.users.map((_, i) => projectUser(i));
  const aMax = Math.max(...projections.map(p => Math.abs(p.a))) * 1.2;
  const bMax = Math.max(...projections.map(p => Math.abs(p.b))) * 1.2;

  // ---- Layout ----
  const layout = document.createElement('div');
  layout.className = 'scene-layout split-eq s6-layout';
  root.appendChild(layout);

  const leftCol = document.createElement('div');
  leftCol.className = 's6-left';
  layout.appendChild(leftCol);

  const heatWrap = document.createElement('div');
  heatWrap.className = 'viz-wrap s6-heat-wrap';
  leftCol.appendChild(heatWrap);

  const heatHint = document.createElement('p');
  heatHint.className = 's6-heat-hint';
  heatHint.innerHTML = '<em>Click any viewer name (or any row) to project them.</em>';
  leftCol.appendChild(heatHint);

  const rightCol = document.createElement('div');
  rightCol.className = 's6-right';
  layout.appendChild(rightCol);

  const planeWrap = document.createElement('div');
  planeWrap.className = 'viz-wrap s6-plane-wrap';
  rightCol.appendChild(planeWrap);

  const explain = document.createElement('div');
  explain.className = 's6-explain';
  rightCol.appendChild(explain);

  // ---- Heatmap (sorted) ----
  const hm = Heatmap.create(heatWrap, {
    matrix: D.ratings.matrix,
    users: D.users,
    movies: D.movies,
    rowOrder: D.shuffle.sortedRowOrder,
    colOrder: D.shuffle.sortedColOrder,
    cellW: 30, cellH: 22, leftW: 80, headerH: 110,
    showCellText: false,
  });

  // ---- 2D plane SVG ----
  const W = 380, H = 380;
  const PAD = 36;
  const planeSvg = d3.select(planeWrap).append('svg')
    .attr('class', 's6-plane-svg')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  const xScale = d3.scaleLinear().domain([-aMax, aMax]).range([PAD, W - PAD]);
  const yScale = d3.scaleLinear().domain([-bMax, bMax]).range([H - PAD, PAD]);

  // Axes (cross at origin).
  const gAxes = planeSvg.append('g').attr('class', 's6-axes');
  gAxes.append('line')
    .attr('x1', PAD).attr('x2', W - PAD)
    .attr('y1', yScale(0)).attr('y2', yScale(0))
    .attr('stroke', 'var(--rule)').attr('stroke-width', 1);
  gAxes.append('line')
    .attr('y1', PAD).attr('y2', H - PAD)
    .attr('x1', xScale(0)).attr('x2', xScale(0))
    .attr('stroke', 'var(--rule)').attr('stroke-width', 1);

  // Axis labels.
  gAxes.append('text')
    .attr('class', 's6-axis-label')
    .attr('x', W - PAD).attr('y', yScale(0) - 6)
    .attr('text-anchor', 'end')
    .text('action →');
  gAxes.append('text')
    .attr('class', 's6-axis-label')
    .attr('x', PAD).attr('y', yScale(0) - 6)
    .attr('text-anchor', 'start')
    .text('← romance');
  gAxes.append('text')
    .attr('class', 's6-axis-label')
    .attr('x', xScale(0) + 6).attr('y', PAD + 4)
    .attr('text-anchor', 'start')
    .text('↑ blockbuster');
  gAxes.append('text')
    .attr('class', 's6-axis-label')
    .attr('x', xScale(0) + 6).attr('y', H - PAD)
    .attr('text-anchor', 'start')
    .text('↓ indie');

  const gPoints = planeSvg.append('g').attr('class', 's6-points');
  const gLabels = planeSvg.append('g').attr('class', 's6-point-labels');

  // Pre-place all 16 points as faint ghosts.
  function drawGhosts() {
    gPoints.selectAll('circle.s6-ghost')
      .data(projections)
      .enter()
      .append('circle')
      .attr('class', 's6-ghost')
      .attr('cx', d => xScale(d.a))
      .attr('cy', d => yScale(d.b))
      .attr('r', 3.5)
      .attr('fill', 'none')
      .attr('stroke', 'var(--rule)')
      .attr('stroke-width', 1);
  }
  drawGhosts();

  const revealed = new Set();

  function clusterFor(uIdx) {
    return D.categories[D.users[uIdx].category].cluster;
  }

  function revealUser(uIdx) {
    if (revealed.has(uIdx)) return;
    revealed.add(uIdx);
    const p = projections[uIdx];
    const cluster = clusterFor(uIdx);

    const c = gPoints.append('circle')
      .attr('class', `s6-revealed cluster-${cluster}`)
      .attr('cx', xScale(p.a))
      .attr('cy', yScale(p.b))
      .attr('r', 0)
      .attr('stroke', 'var(--bg)')
      .attr('stroke-width', 1.5);
    c.transition().duration(420).ease(d3.easeBackOut.overshoot(2)).attr('r', 6);

    const t = gLabels.append('text')
      .attr('class', 's6-point-label')
      .attr('x', xScale(p.a) + 9)
      .attr('y', yScale(p.b) + 4)
      .style('opacity', 0)
      .text(D.users[uIdx].name);
    t.transition().delay(180).duration(300).style('opacity', 1);
  }

  function highlightInHeatmap(uIdx) {
    hm.setHighlight(uIdx, { dim: true });
  }

  function clearHeatmapHighlight() {
    hm.clearHighlight();
  }

  function renderExplain(uIdx) {
    if (uIdx == null) {
      explain.innerHTML = `
        <div class="s6-formula formula-block">
          <span data-katex="\\text{action}_u = \\tfrac{1}{12}\\sum_{f} r_{u,f}\\,\\mathrm{sign}(f\\text{ is action})" data-display="true"></span>
          <span data-katex="\\text{block}_u = \\tfrac{1}{12}\\sum_{f} r_{u,f}\\,\\mathrm{sign}(f\\text{ is blockbuster})" data-display="true"></span>
        </div>
        <p class="muted s6-prompt">Each viewer's rating row collapses to two numbers — and one point on the plane.</p>
      `;
      renderKatexIn(explain);
      return;
    }
    const u = D.users[uIdx];
    const p = projections[uIdx];
    explain.innerHTML = `
      <p class="s6-current"><strong>${u.name}</strong> · <span class="muted">${u.blurb}</span></p>
      <div class="s6-projvals">
        <div class="s6-projrow"><span class="s6-projlabel">action score</span><span class="s6-projval mono">${p.a.toFixed(2)}</span></div>
        <div class="s6-projrow"><span class="s6-projlabel">blockbuster score</span><span class="s6-projval mono">${p.b.toFixed(2)}</span></div>
      </div>
      <p class="muted s6-prompt">Click another viewer to add their point — or hit <kbd>→</kbd> to move on.</p>
    `;
  }

  function renderKatexIn(el) {
    el.querySelectorAll('[data-katex]').forEach(node => {
      const tex = node.getAttribute('data-katex');
      const display = node.getAttribute('data-display') === 'true';
      try { window.katex.render(tex, node, { displayMode: display, throwOnError: false }); }
      catch (e) {}
    });
  }

  hm.setHandlers({
    onRowClick: (uIdx) => {
      revealUser(uIdx);
      highlightInHeatmap(uIdx);
      renderExplain(uIdx);
    },
  });

  renderExplain(null);

  return {
    onEnter() {
      // Reset accumulated reveals each visit.
      revealed.clear();
      gPoints.selectAll('.s6-revealed').remove();
      gLabels.selectAll('.s6-point-label').remove();
      clearHeatmapHighlight();
      renderExplain(null);
    },
    onLeave() {
      clearHeatmapHighlight();
    },
  };
};
