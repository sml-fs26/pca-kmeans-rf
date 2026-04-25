/* Scene 4 — Step 1: Assign each point to the nearest centroid.
 *
 * Walks the student through one full assignment substep:
 *   1) State the rule (with the argmin formula).
 *   2) Spotlight a single boundary-ish point.
 *   3) Draw all K distance lines.
 *   4) Highlight the shortest; flip the spotlight point's color.
 *   5) Sweep across all 24 points, snap-coloring each by its nearest centroid.
 *   6) Show J for this assignment + push it to the inertia panel.
 *   7) Why this step is principled (callout).
 *   8) Edge case: ties (sidebar).
 *
 * Cross-scene state lives on window.kmeansSceneState so scenes 5/6 can read.
 */

window.scenes.scene4 = function (root) {
  const DATA = window.DATA;
  const KMEANS = window.KMEANS;

  // ---- Cross-scene state init (idempotent) -----------------------------------
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

  // ---- Local data ------------------------------------------------------------
  const points = DATA.iterDemo.points;
  const initialCentroids = DATA.iterDemo.initialCentroids.map(c => ({ x: c.x, y: c.y }));
  const K = DATA.iterDemo.k;

  // Final assignments / J (cached).
  const finalAssignments = KMEANS.assignToNearest(points, initialCentroids);
  const finalJ = KMEANS.computeJ(points, finalAssignments, initialCentroids);

  // Pick a "boundary-ish" spotlight: the point whose nearest two centroids are
  // closest in distance — pedagogically interesting.
  const SPOTLIGHT_IDX = (function () {
    let best = 0, bestRatio = -1;
    for (let i = 0; i < points.length; i++) {
      const ds = initialCentroids.map(c => KMEANS.dist2(points[i], c)).slice().sort((a, b) => a - b);
      const r = ds[0] / ds[1];
      if (r > bestRatio) { bestRatio = r; best = i; }
    }
    return best;
  })();
  const SPOTLIGHT_CLUSTER = finalAssignments[SPOTLIGHT_IDX]; // 0..K-1

  // Sweep order: spotlight first (its color was already flipped in step 4 — we
  // re-include it in the sweep just for visual consistency), then the rest.
  const SWEEP_ORDER = (function () {
    const rest = [];
    for (let i = 0; i < points.length; i++) if (i !== SPOTLIGHT_IDX) rest.push(i);
    return [SPOTLIGHT_IDX, ...rest];
  })();

  // Sweep timing: ~3.5s total, evenly distributed.
  const SWEEP_TOTAL_MS = 3500;
  const SWEEP_PER = Math.max(60, Math.floor(SWEEP_TOTAL_MS / points.length));
  const SWEEP_LINE_LIFE = Math.max(80, SWEEP_PER * 0.85);

  // ---- DOM scaffolding -------------------------------------------------------
  root.innerHTML = '';
  root.classList.add('scene-s4');

  const layout = document.createElement('div');
  layout.className = 'scene-layout';
  root.appendChild(layout);

  const vizWrap = document.createElement('div');
  vizWrap.className = 'viz-wrap';
  layout.appendChild(vizWrap);

  const svg = d3.select(vizWrap).append('svg')
    .attr('viewBox', '0 0 100 100')
    .attr('preserveAspectRatio', 'xMidYMid meet');
  // Voronoi cells go behind everything else.
  const gCells = svg.append('g').attr('class', 'g-cells');
  const gPoints = svg.append('g').attr('class', 'g-points');
  const gLines = svg.append('g').attr('class', 'g-lines');
  const gSpotlight = svg.append('g').attr('class', 'g-spotlight');
  const gCentroids = svg.append('g').attr('class', 'g-centroids');

  const textCol = document.createElement('div');
  textCol.className = 'text-col s4-text';
  layout.appendChild(textCol);

  const stepPill = document.createElement('div');
  stepPill.className = 's4-step-pill';
  textCol.appendChild(stepPill);

  const heading = document.createElement('h2');
  textCol.appendChild(heading);

  const formulaBlock = document.createElement('div');
  formulaBlock.className = 'formula-block';
  textCol.appendChild(formulaBlock);

  const ruleProse = document.createElement('p');
  ruleProse.className = 's4-rule';
  textCol.appendChild(ruleProse);

  const slot = document.createElement('div');
  slot.className = 's4-slot';
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
  function clearLines() { gLines.selectAll('*').remove(); }
  function clearSpotlightRing() { gSpotlight.selectAll('*').remove(); }

  function clusterClass(i, assignments) {
    const a = assignments[i];
    return a == null || a < 0 ? 's4-neutral' : `cluster-${a + 1}`;
  }

  // ---- State (driven by step engine) ----------------------------------------
  const STEPS = 8;
  let cursor = 0;
  let lastAnim = null;

  const state = {
    cursor: 0,
    assignments: [],
    showSpotlight: false,
    showSpotlightLines: false,
    spotlightLineSelected: false,
    sweepDone: false,
    showResidualLines: false,
  };

  function resetState() {
    state.cursor = 0;
    state.assignments = points.map(() => -1);
    state.showSpotlight = false;
    state.showSpotlightLines = false;
    state.spotlightLineSelected = false;
    state.sweepDone = false;
    state.showResidualLines = false;
    lastAnim = null;
  }

  function applyStep(c) {
    state.cursor = c;
    if (c === 1) {
      lastAnim = 'step1';
    } else if (c === 2) {
      state.showSpotlight = true;
      lastAnim = 'step2';
    } else if (c === 3) {
      state.showSpotlightLines = true;
      lastAnim = 'step3';
    } else if (c === 4) {
      state.spotlightLineSelected = true;
      state.assignments[SPOTLIGHT_IDX] = SPOTLIGHT_CLUSTER;
      lastAnim = 'step4';
    } else if (c === 5) {
      state.showSpotlightLines = false;
      state.spotlightLineSelected = false;
      state.showSpotlight = false;
      for (let i = 0; i < points.length; i++) {
        state.assignments[i] = finalAssignments[i];
      }
      state.sweepDone = true;
      lastAnim = 'step5';
    } else if (c === 6) {
      state.showResidualLines = true;
      lastAnim = 'step6';
    } else if (c === 7) {
      lastAnim = 'step7';
    } else if (c === 8) {
      lastAnim = 'step8';
    }
  }

  // ---- Renderers -------------------------------------------------------------
  function renderText() {
    stepPill.textContent = `Step ${state.cursor} of ${STEPS}`;
    heading.textContent = 'Step 1 — Assign each point to the nearest centroid.';
    renderKatex(formulaBlock, 'c_i = \\arg\\min_{k \\in \\{1,\\dots,K\\}} \\|x_i - \\mu_k\\|^2', true);
    ruleProse.innerHTML =
      'For every point <span class="mono">x<sub>i</sub></span>, compute its squared distance to ' +
      'each of the <span class="mono">K</span> centroids. Assign it to whichever centroid is closest.';

    clearSlot();

    if (state.cursor === 0 || state.cursor === 1) return;

    if (state.cursor === 2) {
      const p = document.createElement('p');
      p.className = 's4-rule';
      p.innerHTML = 'Take <span class="mono">x<sub>i</sub></span> — this point. We need to compare ' +
        'its distance to each centroid.';
      slot.appendChild(p);
      return;
    }

    if (state.cursor === 3 || state.cursor === 4) {
      const sp = points[SPOTLIGHT_IDX];
      const ds = initialCentroids.map(c => KMEANS.dist2(sp, c));
      let minIdx = 0;
      for (let k = 1; k < K; k++) if (ds[k] < ds[minIdx]) minIdx = k;

      const ul = document.createElement('ul');
      ul.className = 's4-distance-list';
      for (let k = 0; k < K; k++) {
        const li = document.createElement('li');
        li.classList.add(`cluster-${k + 1}`);
        if (k === minIdx) li.classList.add('is-shortest');

        const swatch = document.createElement('span');
        swatch.className = `swatch cluster-${k + 1}`;
        li.appendChild(swatch);

        const expr = document.createElement('span');
        renderKatex(expr, `\\|x_i - \\mu_${k + 1}\\|^2 = ${ds[k].toFixed(2)}`, false);
        li.appendChild(expr);
        ul.appendChild(li);
      }
      slot.appendChild(ul);

      if (state.cursor === 4) {
        const callout = document.createElement('div');
        callout.className = 'callout';
        callout.innerHTML =
          `<div class="callout-title">Choose the closest</div>` +
          `<p>Closest is <span class="mono">μ<sub>${minIdx + 1}</sub></span>. ` +
          `So <span class="mono">x<sub>i</sub></span> belongs to cluster ${minIdx + 1}.</p>`;
        slot.appendChild(callout);
      }
      return;
    }

    if (state.cursor === 5) {
      const counter = document.createElement('div');
      counter.className = 's4-counter';
      const initialCount = lastAnim === 'step5' ? 0 : points.length;
      counter.innerHTML =
        `<span class="label">Assigned</span>` +
        `<span data-role="count">${initialCount} / ${points.length}</span>`;
      slot.appendChild(counter);

      const callout = document.createElement('div');
      callout.className = 'callout';
      callout.style.opacity = lastAnim === 'step5' ? '0' : '1';
      callout.dataset.role = 'sweep-done';
      callout.innerHTML =
        `<div class="callout-title">Done</div>` +
        `<p>All ${points.length} points now have a cluster assignment.</p>`;
      slot.appendChild(callout);
      return;
    }

    if (state.cursor === 6) {
      const fb = document.createElement('div');
      fb.className = 'formula-block';
      renderKatex(
        fb,
        `J = \\sum_{k=1}^{K} \\sum_{x \\in C_k} \\|x - \\mu_k\\|^2 = ${finalJ.toFixed(2)}`,
        true
      );
      slot.appendChild(fb);

      const p = document.createElement('p');
      p.className = 's4-rule';
      p.textContent = 'This is the value of J after this assignment step.';
      slot.appendChild(p);
      return;
    }

    if (state.cursor === 7 || state.cursor === 8) {
      const callout = document.createElement('div');
      callout.className = 'callout';
      callout.innerHTML =
        `<div class="callout-title">Why this step?</div>` +
        `<p>Holding the centroids fixed, this assignment minimizes <span class="mono">J</span>. ` +
        `There's no other way to assign ${points.length} points to ${K} fixed centroids that gives a smaller J.</p>`;
      slot.appendChild(callout);
    }

    if (state.cursor === 8) {
      const sb = document.createElement('div');
      sb.className = 'sidebar-note';
      sb.innerHTML =
        `<span class="sidebar-title">What about ties?</span>` +
        `If a point is exactly equidistant from two centroids, the implementation breaks ties ` +
        `(typically by lower index). It's vanishingly rare on continuous data.`;
      slot.appendChild(sb);
    }
  }

  function renderVoronoi() {
    // Cells track the (fixed-in-this-scene) initialCentroids. They appear at
    // step 1 with reduced opacity (.faded), then fade up to normal opacity
    // once the sweep commits the assignment at step 5+.
    if (state.cursor < 1) {
      gCells.selectAll('*').remove();
      return;
    }
    const cellPaths = KMEANS.voronoiCells(initialCentroids, [0, 0, 100, 100]);
    const data = cellPaths
      .map((d, i) => ({ d, i }))
      .filter(o => o.d != null);
    const useFaded = state.cursor < 5;
    const sel = gCells.selectAll('path.voronoi-cell').data(data, o => o.i);
    sel.enter()
      .append('path')
      .attr('class', o =>
        `voronoi-cell cluster-${o.i + 1}` + (useFaded ? ' faded' : ''))
      .attr('d', o => o.d);
    sel
      .attr('class', o =>
        `voronoi-cell cluster-${o.i + 1}` + (useFaded ? ' faded' : ''))
      .attr('d', o => o.d);
    sel.exit().remove();
  }

  function renderViz() {
    renderVoronoi();
    // Points.
    const pSel = gPoints.selectAll('circle.point').data(points);
    pSel.enter()
      .append('circle')
      .attr('r', 1.5)
      .merge(pSel)
      .attr('cx', p => p.x)
      .attr('cy', p => p.y)
      .attr('class', (_, i) => {
        const base = `point ${clusterClass(i, state.assignments)}`;
        const tail = state.showSpotlight && i !== SPOTLIGHT_IDX ? ' s4-faded' : '';
        return base + tail;
      });
    pSel.exit().remove();

    // Centroids.
    const cSel = gCentroids.selectAll('circle.centroid').data(initialCentroids);
    cSel.enter()
      .append('circle')
      .attr('r', 2.6)
      .merge(cSel)
      .attr('cx', c => c.x)
      .attr('cy', c => c.y)
      .attr('class', (_, i) => `centroid cluster-${i + 1}`);
    cSel.exit().remove();

    // Spotlight ring.
    clearSpotlightRing();
    if (state.showSpotlight) {
      const p = points[SPOTLIGHT_IDX];
      const ring = gSpotlight.append('circle')
        .attr('class', 's4-spotlight-ring')
        .attr('cx', p.x).attr('cy', p.y).attr('r', 3);
      if (lastAnim === 'step2') {
        ring.attr('opacity', 0).transition().duration(280).attr('opacity', 0.85);
      } else {
        ring.attr('opacity', 0.85);
      }
    }

    // Distance lines from spotlight.
    clearLines();
    if (state.showSpotlightLines) {
      const sp = points[SPOTLIGHT_IDX];
      const ds = initialCentroids.map(c => KMEANS.dist2(sp, c));
      let minIdx = 0;
      for (let k = 1; k < K; k++) if (ds[k] < ds[minIdx]) minIdx = k;

      initialCentroids.forEach((c, k) => {
        const isMin = k === minIdx;
        const cls = `distance-line s4-line cluster-${k + 1}` +
          (state.spotlightLineSelected
            ? (isMin ? ' selected' : ' dimmed')
            : '');
        const l = gLines.append('line')
          .attr('class', cls)
          .attr('x1', sp.x).attr('y1', sp.y)
          .attr('x2', sp.x).attr('y2', sp.y);

        if (lastAnim === 'step3') {
          l.transition().duration(380).delay(120 * k)
            .attr('x2', c.x).attr('y2', c.y);
        } else {
          l.attr('x2', c.x).attr('y2', c.y);
        }
      });
    }

    // Residual lines (each pt -> assigned centroid) — step 6+.
    if (state.showResidualLines) {
      points.forEach((p, i) => {
        const a = state.assignments[i];
        if (a < 0) return;
        const c = initialCentroids[a];
        gLines.append('line')
          .attr('class', `distance-line s4-line faded`)
          .attr('x1', p.x).attr('y1', p.y)
          .attr('x2', c.x).attr('y2', c.y);
      });
    }
  }

  function render() {
    renderText();
    renderViz();
  }

  // ---- Animations ------------------------------------------------------------
  let sweepTimers = [];
  function clearSweepTimers() {
    sweepTimers.forEach(t => clearTimeout(t));
    sweepTimers = [];
  }

  function playSweep() {
    clearSweepTimers();
    clearLines();
    // Visually reset all points to neutral (without touching state.assignments,
    // so the canonical state still reflects a fully-assigned step 5).
    gPoints.selectAll('circle.point')
      .attr('class', 'point s4-neutral');

    const counterEl = slot.querySelector('[data-role="count"]');
    const calloutEl = slot.querySelector('[data-role="sweep-done"]');

    let processed = 0;
    SWEEP_ORDER.forEach((i, orderIdx) => {
      const t = orderIdx * SWEEP_PER;
      sweepTimers.push(setTimeout(() => {
        const p = points[i];
        const ds = initialCentroids.map(c => KMEANS.dist2(p, c));
        let minIdx = 0;
        for (let k = 1; k < K; k++) if (ds[k] < ds[minIdx]) minIdx = k;

        const lines = initialCentroids.map((c, k) =>
          gLines.append('line')
            .attr('class', `distance-line s4-line cluster-${k + 1}` +
              (k === minIdx ? ' selected' : ' dimmed'))
            .attr('x1', p.x).attr('y1', p.y)
            .attr('x2', c.x).attr('y2', c.y)
            .attr('opacity', 0.95)
        );

        sweepTimers.push(setTimeout(() => {
          gPoints.selectAll('circle.point')
            .filter((_, idx) => idx === i)
            .attr('class', `point cluster-${minIdx + 1}`);
          lines.forEach(l => l.transition().duration(120).style('opacity', 0).remove());
          processed++;
          if (counterEl) counterEl.textContent = `${processed} / ${points.length}`;
          if (processed === points.length && calloutEl) {
            calloutEl.style.transition = 'opacity 350ms ease-out';
            calloutEl.style.opacity = '1';
          }
        }, SWEEP_LINE_LIFE));
      }, t));
    });
  }

  function playLatestAnimation() {
    if (lastAnim === 'step5') {
      playSweep();
    }
  }

  // ---- Engine wiring ---------------------------------------------------------
  function setCursor(c, animate) {
    if (c < 0 || c > STEPS) return false;
    if (c === cursor) return false;
    if (c < cursor) {
      clearSweepTimers();
      resetState();
      cursor = 0;
      while (cursor < c) { cursor++; applyStep(cursor); }
      render();
    } else {
      while (cursor < c) {
        cursor++;
        applyStep(cursor);
        if (animate && cursor === 5) {
          // Hold all points neutral for the sweep animation; the canonical
          // assignments still hold the final cluster ids (so a rewind into
          // step 5 from a later step shows the colored end-state correctly).
          for (let i = 0; i < points.length; i++) state.assignments[i] = -1;
        }
        render();
        if (animate && cursor === 5) {
          // Restore the canonical assignments so the saved state remains
          // correct; the sweep animation visually colors points by direct
          // d3 attr writes rather than re-rendering.
          for (let i = 0; i < points.length; i++) state.assignments[i] = finalAssignments[i];
        }
      }
      if (animate) playLatestAnimation();
    }
    pushSharedState();
    return true;
  }

  function pushSharedState() {
    const s = window.kmeansSceneState;
    if (!s.centroidsBeforeAssign) {
      s.centroidsBeforeAssign = initialCentroids.map(c => ({ x: c.x, y: c.y }));
    }
    if (state.cursor >= 6) {
      if (!s._scene4JPushed) {
        try { window.InertiaPanel.pushJ(finalJ); } catch (e) {}
        s._scene4JPushed = true;
      }
      s.assignmentsAfterAssign = finalAssignments.slice();
      s.jAfterAssign = finalJ;
    }
  }

  function onThemeChange() { render(); }
  window.addEventListener('theme-change', onThemeChange);

  // Initial paint — land on step 1 (the rule) so the scene shows content
  // immediately on first visit.
  resetState();
  render();
  setCursor(1, false);

  return {
    onEnter() {
      clearSweepTimers();
      resetState();
      cursor = 0;
      render();
      // Auto-advance to step 1 so the student lands on the rule.
      setCursor(1, false);
    },
    onLeave() {
      clearSweepTimers();
    },
    onNextKey() {
      return setCursor(cursor + 1, true);
    },
    onPrevKey() {
      if (cursor <= 1) return false;
      return setCursor(cursor - 1, false);
    },
  };
};
