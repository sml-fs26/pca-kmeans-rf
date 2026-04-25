/* Scene 6 — Step 3: Did we converge?
 *
 * 1) State the question; show old → new arrows.
 * 2) Show Δ_k labels per centroid + the stop rule.
 * 3) Apply the stop rule (max Δ vs ε).
 * 4) The big claim — monotone descent (with a tiny inset J(t) plot).
 * 5) The counter-punch — local optimum (warning callout).
 *
 * Reads window.kmeansSceneState set by scenes 4/5. If missing (cold entry),
 * runs the assign + update logic itself.
 */

window.scenes.scene6 = function (root) {
  const DATA = window.DATA;
  const KMEANS = window.KMEANS;

  const EPSILON = 0.5;

  // ---- Cross-scene state init (cold-entry safe) -----------------------------
  function ensureState() {
    if (!window.kmeansSceneState) {
      window.kmeansSceneState = {
        points: DATA.iterDemo.points,
        k: DATA.iterDemo.k,
        centroidsBeforeAssign: DATA.iterDemo.initialCentroids.map(c => ({ x: c.x, y: c.y })),
        assignmentsAfterAssign: null,
        centroidsBeforeUpdate: null,
        centroidsAfterUpdate: null,
        jBeforeAssign: null,
        jAfterAssign: null,
        jAfterUpdate: null,
      };
    }
    const s = window.kmeansSceneState;
    if (!s.centroidsBeforeAssign) {
      s.centroidsBeforeAssign = DATA.iterDemo.initialCentroids.map(c => ({ x: c.x, y: c.y }));
    }
    if (!s.assignmentsAfterAssign) {
      s.assignmentsAfterAssign = KMEANS.assignToNearest(
        DATA.iterDemo.points, s.centroidsBeforeAssign);
      s.jAfterAssign = KMEANS.computeJ(
        DATA.iterDemo.points, s.assignmentsAfterAssign, s.centroidsBeforeAssign);
    }
    if (!s.centroidsBeforeUpdate || !s.centroidsAfterUpdate) {
      s.centroidsBeforeUpdate = s.centroidsBeforeAssign.map(c => ({ x: c.x, y: c.y }));
      s.centroidsAfterUpdate = KMEANS.updateCentroids(
        DATA.iterDemo.points, s.assignmentsAfterAssign, DATA.iterDemo.k
      ).map((c, i) => c === null ? s.centroidsBeforeUpdate[i] : c);
      s.jAfterUpdate = KMEANS.computeJ(
        DATA.iterDemo.points, s.assignmentsAfterAssign, s.centroidsAfterUpdate);
    }
    return s;
  }
  const shared = ensureState();

  // ---- Local data ------------------------------------------------------------
  const points = DATA.iterDemo.points;
  const K = DATA.iterDemo.k;
  const oldCentroids = shared.centroidsBeforeUpdate.map(c => ({ x: c.x, y: c.y }));
  const newCentroids = shared.centroidsAfterUpdate.map(c => ({ x: c.x, y: c.y }));
  const assignments = shared.assignmentsAfterAssign.slice();

  const deltas = newCentroids.map((c, i) => KMEANS.dist(c, oldCentroids[i]));
  const maxDelta = Math.max(...deltas);
  const argMaxDelta = deltas.indexOf(maxDelta);
  const converged = maxDelta < EPSILON;

  // J values for the inset plot. Pull from inertia panel history if it has 3+,
  // else fall back to what we know (jAfterAssign, jAfterUpdate) plus a synthetic
  // J at iter 0 if needed.
  function getJSeries() {
    let hist = [];
    try { hist = window.InertiaPanel.getHistory(); } catch (e) { hist = []; }
    if (hist.length >= 2) return hist.map(h => h.J);
    // Fallback: make at least J(after-assign), J(after-update).
    const arr = [];
    if (shared.jBeforeAssign != null) arr.push(shared.jBeforeAssign);
    if (shared.jAfterAssign != null) arr.push(shared.jAfterAssign);
    if (shared.jAfterUpdate != null) arr.push(shared.jAfterUpdate);
    return arr;
  }

  // ---- DOM scaffolding -------------------------------------------------------
  root.innerHTML = '';
  root.classList.add('scene-s6');

  const layout = document.createElement('div');
  layout.className = 'scene-layout right-text';
  root.appendChild(layout);

  const vizWrap = document.createElement('div');
  vizWrap.className = 'viz-wrap';
  layout.appendChild(vizWrap);

  const svg = d3.select(vizWrap).append('svg')
    .attr('viewBox', '0 0 100 100')
    .attr('preserveAspectRatio', 'xMidYMid meet');
  // Voronoi layers go all the way at the back: old (faded, dashed) underneath
  // new (normal). Together they visualize "how much did the partition move?".
  const gCellsOld = svg.append('g').attr('class', 'g-cells-old');
  const gCellsNew = svg.append('g').attr('class', 'g-cells-new');
  // Subtle background points (so the centroids have context).
  const gPoints = svg.append('g').attr('class', 'g-points');
  const gOld = svg.append('g').attr('class', 'g-old-centroids');
  const gNew = svg.append('g').attr('class', 'g-new-centroids');
  const gArrows = svg.append('g').attr('class', 'g-arrows');
  const gDeltaLabels = svg.append('g').attr('class', 'g-delta-labels');
  const gInset = svg.append('g').attr('class', 'g-inset'); // J(t) inset

  // Arrowhead marker definition (we draw it manually with paths to support theme).

  const textCol = document.createElement('div');
  textCol.className = 'text-col s6-text';
  layout.appendChild(textCol);

  const stepPill = document.createElement('div');
  stepPill.className = 's6-step-pill';
  textCol.appendChild(stepPill);

  const heading = document.createElement('h2');
  textCol.appendChild(heading);

  const slot = document.createElement('div');
  slot.className = 's6-slot';
  textCol.appendChild(slot);

  // ---- Helpers ---------------------------------------------------------------
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

  function clearSlot() { slot.innerHTML = ''; }

  // ---- State -----------------------------------------------------------------
  const STEPS = 5;
  let cursor = 0;
  let lastAnim = null;

  const state = {
    cursor: 0,
    showArrows: false,
    showDeltaLabels: false,
    highlightMax: false,
    showInset: false,
  };

  function resetState() {
    state.cursor = 0;
    state.showArrows = false;
    state.showDeltaLabels = false;
    state.highlightMax = false;
    state.showInset = false;
    lastAnim = null;
  }

  function applyStep(c) {
    state.cursor = c;
    if (c === 1) {
      state.showArrows = true;
      lastAnim = 'step1';
    } else if (c === 2) {
      state.showArrows = true;
      state.showDeltaLabels = true;
      lastAnim = 'step2';
    } else if (c === 3) {
      state.showArrows = true;
      state.showDeltaLabels = true;
      state.highlightMax = true;
      lastAnim = 'step3';
    } else if (c === 4) {
      state.showArrows = true;
      state.showDeltaLabels = true;
      state.highlightMax = true;
      state.showInset = true;
      lastAnim = 'step4';
    } else if (c === 5) {
      state.showArrows = true;
      state.showDeltaLabels = true;
      state.highlightMax = true;
      state.showInset = true;
      lastAnim = 'step5';
    }
  }

  // ---- Renderers -------------------------------------------------------------
  function renderText() {
    stepPill.textContent = `Step ${state.cursor} of ${STEPS}`;
    heading.textContent = 'Step 3 — Did we converge?';

    clearSlot();

    if (state.cursor === 0) return;

    if (state.cursor === 1) {
      const p = document.createElement('p');
      p.textContent =
        'After one full iteration — assignment, then update — we ask: did anything actually move?';
      slot.appendChild(p);
      return;
    }

    if (state.cursor === 2 || state.cursor === 3 || state.cursor === 4 || state.cursor === 5) {
      const fb = document.createElement('div');
      fb.className = 'formula-block';
      renderKatex(fb, '\\Delta_k = \\| \\mu_k^{(t+1)} - \\mu_k^{(t)} \\|', true);
      slot.appendChild(fb);

      // Delta table.
      const tbl = document.createElement('div');
      tbl.className = 's6-delta-table';
      for (let k = 0; k < K; k++) {
        const lbl = document.createElement('span');
        lbl.className = 'lbl';
        lbl.textContent = `Δ${subscript(k + 1)}`;
        tbl.appendChild(lbl);

        const val = document.createElement('span');
        val.className = 'val' + (k === argMaxDelta ? ' is-max' : '');
        val.textContent = `= ${deltas[k].toFixed(2)}`;
        tbl.appendChild(val);
      }
      slot.appendChild(tbl);

      const stop = document.createElement('div');
      stop.className = 's6-stoprule';
      stop.innerHTML =
        `stop when&nbsp;&nbsp;max<sub>k</sub>&nbsp;Δ<sub>k</sub>&nbsp;&lt;&nbsp;ε` +
        `<span class="eps">ε = ${EPSILON.toFixed(2)}</span>`;
      slot.appendChild(stop);
    }

    if (state.cursor === 3 || state.cursor === 4 || state.cursor === 5) {
      const callout = document.createElement('div');
      callout.className = 'callout';
      if (converged) {
        callout.innerHTML =
          `<div class="callout-title">Stop rule</div>` +
          `<p>max Δ = ${maxDelta.toFixed(2)} &lt; ε. The algorithm has converged.</p>`;
      } else {
        callout.innerHTML =
          `<div class="callout-title">Stop rule</div>` +
          `<p>max Δ = ${maxDelta.toFixed(2)} ≥ ε. The algorithm continues — back to the assignment step.</p>`;
      }
      slot.appendChild(callout);
    }

    if (state.cursor === 4 || state.cursor === 5) {
      const callout = document.createElement('div');
      callout.className = 'callout';
      callout.innerHTML =
        `<div class="callout-title">Why this loop always halts.</div>` +
        `<p>Both steps reduce J. The assignment step minimizes J holding centroids fixed. ` +
        `The update step minimizes J holding assignments fixed. So the sequence ` +
        `<span class="mono">J(t)</span> is monotonically non-increasing. Bounded below by zero. ` +
        `It must converge.</p>`;
      slot.appendChild(callout);
    }

    if (state.cursor === 5) {
      const callout = document.createElement('div');
      callout.className = 'callout warning';
      callout.innerHTML =
        `<div class="callout-title">But not always to the best answer.</div>` +
        `<p>Convergence is to a <strong>local</strong> optimum — there's no guarantee it's the ` +
        `best clustering. Different starting centroids can converge to different J values. ` +
        `We'll show this in scene 8.</p>`;
      slot.appendChild(callout);
    }
  }

  function subscript(n) {
    const map = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };
    return String(n).split('').map(d => map[d] || d).join('');
  }

  function renderVoronoiLayer(g, centroidsList, extraClass) {
    const cellPaths = KMEANS.voronoiCells(centroidsList, [0, 0, 100, 100]);
    const data = cellPaths
      .map((d, i) => ({ d, i }))
      .filter(o => o.d != null);
    const sel = g.selectAll('path.voronoi-cell').data(data, o => o.i);
    sel.enter()
      .append('path')
      .attr('class', o => `voronoi-cell cluster-${o.i + 1}${extraClass ? ' ' + extraClass : ''}`)
      .attr('d', o => o.d);
    sel
      .attr('class', o => `voronoi-cell cluster-${o.i + 1}${extraClass ? ' ' + extraClass : ''}`)
      .attr('d', o => o.d);
    sel.exit().remove();
  }

  function renderViz() {
    // Voronoi: old partition (faded, dashed) under new partition (normal).
    renderVoronoiLayer(gCellsOld, oldCentroids, 'previous');
    renderVoronoiLayer(gCellsNew, newCentroids);

    // Faint background points (for context).
    const pSel = gPoints.selectAll('circle.point').data(points);
    pSel.enter().append('circle').attr('r', 1.2).merge(pSel)
      .attr('cx', p => p.x)
      .attr('cy', p => p.y)
      .attr('class', (_, i) => `point cluster-${assignments[i] + 1}`)
      .attr('opacity', 0.45);
    pSel.exit().remove();

    // Old centroids (ghost).
    const oldSel = gOld.selectAll('circle').data(oldCentroids);
    oldSel.enter().append('circle').attr('r', 2.6).merge(oldSel)
      .attr('cx', c => c.x).attr('cy', c => c.y)
      .attr('class', (_, k) => `centroid s6-old cluster-${k + 1}`);
    oldSel.exit().remove();

    // New centroids.
    const newSel = gNew.selectAll('circle').data(newCentroids);
    newSel.enter().append('circle').attr('r', 2.6).merge(newSel)
      .attr('cx', c => c.x).attr('cy', c => c.y)
      .attr('class', (_, k) => `centroid s6-new cluster-${k + 1}`);
    newSel.exit().remove();

    // Arrows + delta labels.
    gArrows.selectAll('*').remove();
    gDeltaLabels.selectAll('*').remove();

    if (state.showArrows) {
      for (let k = 0; k < K; k++) {
        const a = oldCentroids[k];
        const b = newCentroids[k];
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        if (len < 1e-6) continue;

        const isMax = state.highlightMax && k === argMaxDelta;
        const tag = isMax ? ' is-max' : '';

        // Shorten so arrow tip doesn't overlap centroid (radius ~2.6).
        const ux = dx / len, uy = dy / len;
        const padStart = 3.0;
        const padEnd = 3.4;
        const x1 = a.x + ux * padStart;
        const y1 = a.y + uy * padStart;
        const x2 = b.x - ux * padEnd;
        const y2 = b.y - uy * padEnd;

        gArrows.append('line')
          .attr('class', 's6-arrow' + tag)
          .attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2);

        // Arrowhead — small triangle at (x2, y2) pointing in (ux, uy).
        const headLen = 1.6, headW = 1.0;
        const hx = x2 + ux * headLen;
        const hy = y2 + uy * headLen;
        const px = -uy, py = ux; // perpendicular
        const p1x = x2 + px * headW, p1y = y2 + py * headW;
        const p2x = x2 - px * headW, p2y = y2 - py * headW;
        gArrows.append('path')
          .attr('class', 's6-arrow-head' + tag)
          .attr('d', `M ${hx},${hy} L ${p1x},${p1y} L ${p2x},${p2y} Z`);

        if (state.showDeltaLabels) {
          const mx = (a.x + b.x) / 2 + px * 2.4;
          const my = (a.y + b.y) / 2 + py * 2.4;
          gDeltaLabels.append('text')
            .attr('class', 's6-delta-label' + tag)
            .attr('x', mx).attr('y', my)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .text(`Δ${subscript(k + 1)} = ${deltas[k].toFixed(2)}`);
        }
      }
    }

    // J(t) inset plot.
    gInset.selectAll('*').remove();
    if (state.showInset) {
      const Js = getJSeries();
      if (Js.length >= 1) {
        // Inset rectangle: bottom-left of the panel.
        const X0 = 3, Y0 = 70, W = 28, H = 22;
        gInset.append('rect')
          .attr('class', 's6-jplot-frame')
          .attr('x', X0).attr('y', Y0).attr('width', W).attr('height', H)
          .attr('rx', 0.6);
        gInset.append('text')
          .attr('class', 's6-jplot-title')
          .attr('x', X0 + 1).attr('y', Y0 + 2.6)
          .text('J(t)');

        const yMax = Math.max(...Js), yMin = Math.min(...Js);
        const yRange = yMax - yMin || 1;
        const xMax = Math.max(1, Js.length - 1);
        const innerPad = 2;
        const px0 = X0 + innerPad, py0 = Y0 + innerPad + 2.4;
        const pw = W - 2 * innerPad, ph = H - 2 * innerPad - 2.4;

        const xy = Js.map((J, i) => ({
          x: px0 + (i / xMax) * pw,
          y: py0 + (1 - (J - yMin) / yRange) * ph,
        }));

        const path = xy.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
        gInset.append('path')
          .attr('class', 's6-jplot-line')
          .attr('d', path);

        xy.forEach((p, i) => {
          gInset.append('circle')
            .attr('class', 's6-jplot-dot')
            .attr('cx', p.x).attr('cy', p.y).attr('r', 0.55);
          gInset.append('text')
            .attr('class', 's6-jplot-label')
            .attr('x', p.x).attr('y', Y0 + H - 0.6)
            .attr('text-anchor', 'middle')
            .text(String(i));
        });
      }
    }
  }

  function render() {
    renderText();
    renderViz();
  }

  // ---- Engine ----------------------------------------------------------------
  function setCursor(c, animate) {
    if (c < 0 || c > STEPS) return false;
    if (c === cursor) return false;
    if (c < cursor) {
      resetState();
      cursor = 0;
      while (cursor < c) { cursor++; applyStep(cursor); }
      render();
    } else {
      while (cursor < c) { cursor++; applyStep(cursor); render(); }
      // No special animations to play; renderViz handles drawing.
    }
    return true;
  }

  function onThemeChange() { render(); }
  window.addEventListener('theme-change', onThemeChange);

  // Initial paint — land on step 1.
  resetState();
  render();
  setCursor(1, false);

  return {
    onEnter() {
      ensureState();
      resetState();
      cursor = 0;
      render();
      setCursor(1, false);
    },
    onLeave() {},
    onNextKey() {
      return setCursor(cursor + 1, true);
    },
    onPrevKey() {
      if (cursor <= 1) return false;
      return setCursor(cursor - 1, false);
    },
  };
};
