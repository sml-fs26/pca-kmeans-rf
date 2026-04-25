/* Scene 5 — Step 2: Move each centroid to the mean of its cluster.
 *
 * 1) State the rule.
 * 2) Spotlight cluster 1; show the new mean as a cross.
 * 3) Spring metaphor: lines from cluster-1 points to the mean; centroid slides.
 * 4) Sweep clusters 2 and 3 the same way.
 * 5) Show new J + push to inertia panel + assert J(t+1) <= J(t).
 * 6) Why specifically the mean (callout: k-medians).
 * 7) Edge case: empty cluster (sidebar).
 *
 * Reads window.kmeansSceneState set by scene 4. If missing (cold entry),
 * recomputes the assignment so this scene works standalone.
 */

window.scenes.scene5 = function (root) {
  const DATA = window.DATA;
  const KMEANS = window.KMEANS;

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
      // Cold entry — run the assignment ourselves.
      s.assignmentsAfterAssign = KMEANS.assignToNearest(
        DATA.iterDemo.points, s.centroidsBeforeAssign);
      s.jAfterAssign = KMEANS.computeJ(
        DATA.iterDemo.points, s.assignmentsAfterAssign, s.centroidsBeforeAssign);
    }
    return s;
  }
  const shared = ensureState();

  // ---- Local data ------------------------------------------------------------
  const points = DATA.iterDemo.points;
  const K = DATA.iterDemo.k;
  // Old centroids = the ones that produced this assignment (= centroidsBeforeAssign).
  const oldCentroids = shared.centroidsBeforeAssign.map(c => ({ x: c.x, y: c.y }));
  const assignments = shared.assignmentsAfterAssign.slice();
  // New centroids = mean of each cluster.
  const newCentroids = KMEANS.updateCentroids(points, assignments, K).map((c, i) =>
    c === null ? oldCentroids[i] : c);
  const jAfterAssign = shared.jAfterAssign;
  const jAfterUpdate = KMEANS.computeJ(points, assignments, newCentroids);

  // Assertion: monotone descent on the update step.
  if (!(jAfterUpdate <= jAfterAssign + 1e-9)) {
    console.error(
      `[scene5] Monotonicity violated: J after update (${jAfterUpdate}) > J after assign (${jAfterAssign})`);
  }

  // Per-cluster point indices.
  const clusterPoints = Array.from({ length: K }, () => []);
  for (let i = 0; i < points.length; i++) clusterPoints[assignments[i]].push(i);

  // Cluster sweep order.
  const CLUSTER_ORDER = [0, 1, 2];
  const SLIDE_DUR = 600; // per-cluster slide duration

  // ---- DOM scaffolding -------------------------------------------------------
  root.innerHTML = '';
  root.classList.add('scene-s5');

  const layout = document.createElement('div');
  layout.className = 'scene-layout';
  root.appendChild(layout);

  const vizWrap = document.createElement('div');
  vizWrap.className = 'viz-wrap';
  layout.appendChild(vizWrap);

  const svg = d3.select(vizWrap).append('svg')
    .attr('viewBox', '0 0 100 100')
    .attr('preserveAspectRatio', 'xMidYMid meet');
  // Voronoi cells at the back: they reshape as centroids slide.
  const gCells = svg.append('g').attr('class', 'g-cells');
  const gPoints = svg.append('g').attr('class', 'g-points');
  const gResid = svg.append('g').attr('class', 'g-resid');
  const gSprings = svg.append('g').attr('class', 'g-springs');
  const gCrosses = svg.append('g').attr('class', 'g-crosses');
  const gOldCentroids = svg.append('g').attr('class', 'g-old-centroids');
  const gCentroids = svg.append('g').attr('class', 'g-centroids');

  const textCol = document.createElement('div');
  textCol.className = 'text-col s5-text';
  layout.appendChild(textCol);

  const stepPill = document.createElement('div');
  stepPill.className = 's5-step-pill';
  textCol.appendChild(stepPill);

  const heading = document.createElement('h2');
  textCol.appendChild(heading);

  const formulaBlock = document.createElement('div');
  formulaBlock.className = 'formula-block';
  textCol.appendChild(formulaBlock);

  const ruleProse = document.createElement('p');
  ruleProse.className = 's5-rule';
  textCol.appendChild(ruleProse);

  const slot = document.createElement('div');
  slot.className = 's5-slot';
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
  const STEPS = 7;
  let cursor = 0;
  let lastAnim = null;

  // For each cluster k, has it "moved" yet (i.e. centroid drawn at new pos)?
  // 0 = not moved (old position), 1 = moved (new position).
  const state = {
    cursor: 0,
    moved: [0, 0, 0],
    spotlightCluster: null, // 0..K-1 or null (no spotlight)
    showResidLines: false, // step 5+
  };

  function resetState() {
    state.cursor = 0;
    state.moved = [0, 0, 0];
    state.spotlightCluster = null;
    state.showResidLines = false;
    lastAnim = null;
  }

  function applyStep(c) {
    state.cursor = c;
    if (c === 1) {
      lastAnim = 'step1';
    } else if (c === 2) {
      state.spotlightCluster = 0;
      lastAnim = 'step2';
    } else if (c === 3) {
      state.moved[0] = 1;
      lastAnim = 'step3';
    } else if (c === 4) {
      state.moved[0] = 1;
      state.moved[1] = 1;
      state.moved[2] = 1;
      state.spotlightCluster = null;
      lastAnim = 'step4';
    } else if (c === 5) {
      state.showResidLines = true;
      lastAnim = 'step5';
    } else if (c === 6) {
      lastAnim = 'step6';
    } else if (c === 7) {
      lastAnim = 'step7';
    }
  }

  // ---- Renderers -------------------------------------------------------------
  function renderText() {
    stepPill.textContent = `Step ${state.cursor} of ${STEPS}`;
    heading.textContent = 'Step 2 — Move each centroid to the mean of its cluster.';
    renderKatex(formulaBlock, '\\mu_k \\leftarrow \\frac{1}{|C_k|} \\sum_{x \\in C_k} x', true);
    ruleProse.textContent =
      'After every point has an assignment, replace each centroid with the mean of the points assigned to it.';

    clearSlot();

    if (state.cursor === 0 || state.cursor === 1) return;

    if (state.cursor === 2 || state.cursor === 3) {
      const p = document.createElement('p');
      p.className = 's5-rule';
      p.innerHTML = 'Look at <span class="mono cluster-1">cluster 1</span>. ' +
        'The centroid will move to the mean of these points.';
      slot.appendChild(p);

      const fb = document.createElement('div');
      fb.className = 'formula-block';
      const n1 = clusterPoints[0].length;
      renderKatex(
        fb,
        `\\mu_1 = \\frac{1}{${n1}} (x_{a} + x_{b} + \\cdots + x_{${n1 > 1 ? 'n' : 'a'}})`,
        true
      );
      slot.appendChild(fb);

      if (state.cursor === 3) {
        const sb = document.createElement('div');
        sb.className = 'sidebar-note';
        sb.innerHTML =
          `<span class="sidebar-title">Why the mean?</span>` +
          `Because the mean minimizes <span class="mono">Σ ‖x − μ‖²</span> over all choices of ` +
          `<span class="mono">μ</span>. Any other point would give a larger sum of squared distances.`;
        slot.appendChild(sb);
      }
      return;
    }

    if (state.cursor === 4) {
      const counter = document.createElement('div');
      counter.className = 's5-counter';
      const initialCount = lastAnim === 'step4' ? 1 : K;
      counter.innerHTML =
        `<span class="label">Updated</span>` +
        `<span data-role="count">${initialCount} / ${K} clusters</span>`;
      slot.appendChild(counter);

      const callout = document.createElement('div');
      callout.className = 'callout';
      callout.dataset.role = 'sweep-done';
      callout.style.opacity = lastAnim === 'step4' ? '0' : '1';
      callout.innerHTML =
        `<div class="callout-title">Done</div>` +
        `<p>All centroids have moved to their cluster's mean.</p>`;
      slot.appendChild(callout);
      return;
    }

    if (state.cursor === 5) {
      const fb = document.createElement('div');
      fb.className = 'formula-block';
      renderKatex(
        fb,
        `J = \\sum_{k=1}^{K} \\sum_{x \\in C_k} \\|x - \\mu_k\\|^2 = ${jAfterUpdate.toFixed(2)}`,
        true
      );
      slot.appendChild(fb);

      const cmp = document.createElement('p');
      cmp.className = 's5-j-compare';
      cmp.innerHTML =
        `<span class="label">J went from</span>${jAfterAssign.toFixed(2)}` +
        ` <span class="label" style="margin: 0 6px;">→</span>${jAfterUpdate.toFixed(2)}.`;
      slot.appendChild(cmp);
      return;
    }

    if (state.cursor === 6 || state.cursor === 7) {
      const callout = document.createElement('div');
      callout.className = 'callout';
      callout.innerHTML =
        `<div class="callout-title">Why the mean and not the median?</div>` +
        `<p>For squared-distance loss (<span class="mono">L²</span>), the centroid is the mean. ` +
        `If we used absolute-distance loss (<span class="mono">L¹</span>), the centroid would be the ` +
        `geometric median — that variant is called <strong>k-medians</strong>. Different distance, ` +
        `different update rule. Same skeleton.</p>`;
      slot.appendChild(callout);
    }

    if (state.cursor === 7) {
      const sb = document.createElement('div');
      sb.className = 'sidebar-note';
      sb.innerHTML =
        `<span class="sidebar-title">What if a cluster ends up empty?</span>` +
        `After assignment, it's possible no point is assigned to a particular centroid. ` +
        `Different implementations handle it differently: re-initialize that centroid (e.g. to a ` +
        `random point), keep it frozen, or drop K by one. Most modern libraries re-init.`;
      slot.appendChild(sb);
    }
  }

  function pointClass(i) {
    const a = assignments[i];
    let cls = `point cluster-${a + 1}`;
    if (state.spotlightCluster != null) {
      cls += a === state.spotlightCluster ? ' s5-vivid' : ' s5-faded';
    }
    return cls;
  }

  function centroidPos(k) {
    return state.moved[k] ? newCentroids[k] : oldCentroids[k];
  }

  // Read live centroid positions from the DOM (d3 transitions write directly
  // to cx/cy attrs, so during an animation the DOM is the source of truth).
  function liveCentroidPositions() {
    const nodes = gCentroids.selectAll('circle.centroid').nodes();
    if (nodes.length !== K) {
      // Pre-DOM: fall back to logical state.
      return newCentroids.map((_, k) => centroidPos(k));
    }
    return nodes.map(n => ({
      x: parseFloat(n.getAttribute('cx')),
      y: parseFloat(n.getAttribute('cy')),
    }));
  }

  function renderVoronoi(centroidsForCells) {
    const src = centroidsForCells || liveCentroidPositions();
    const cellPaths = KMEANS.voronoiCells(src, [0, 0, 100, 100]);
    const data = cellPaths
      .map((d, i) => ({ d, i }))
      .filter(o => o.d != null);
    const sel = gCells.selectAll('path.voronoi-cell').data(data, o => o.i);
    sel.enter()
      .append('path')
      .attr('class', o => `voronoi-cell cluster-${o.i + 1}`)
      .attr('d', o => o.d);
    sel.attr('d', o => o.d);
    sel.exit().remove();
  }

  function renderViz(opts) {
    opts = opts || {};
    const animateMove = opts.animateMove || []; // list of cluster indices to slide

    // Points.
    const pSel = gPoints.selectAll('circle.point').data(points);
    pSel.enter()
      .append('circle')
      .attr('r', 1.5)
      .merge(pSel)
      .attr('cx', p => p.x)
      .attr('cy', p => p.y)
      .attr('class', (_, i) => pointClass(i));
    pSel.exit().remove();

    // Old centroid ghosts: shown when at least one cluster has moved (so the
    // student sees the "before" position). Only ghosts for clusters that have
    // moved.
    gOldCentroids.selectAll('*').remove();
    for (let k = 0; k < K; k++) {
      if (state.moved[k]) {
        gOldCentroids.append('circle')
          .attr('class', `centroid s5-ghost cluster-${k + 1}`)
          .attr('r', 2.6)
          .attr('cx', oldCentroids[k].x)
          .attr('cy', oldCentroids[k].y);
      }
    }

    // "+" cross marking the new mean for the spotlit cluster (steps 2/3).
    gCrosses.selectAll('*').remove();
    if (state.spotlightCluster != null && !state.moved[state.spotlightCluster]) {
      const k = state.spotlightCluster;
      const m = newCentroids[k];
      const g = gCrosses.append('g').attr('class', `s5-mean-cross stroke-cluster-${k + 1}`);
      g.append('line').attr('x1', m.x - 1.6).attr('y1', m.y).attr('x2', m.x + 1.6).attr('y2', m.y)
        .attr('stroke-width', 0.6);
      g.append('line').attr('x1', m.x).attr('y1', m.y - 1.6).attr('x2', m.x).attr('y2', m.y + 1.6)
        .attr('stroke-width', 0.6);
    }

    // Spring lines: shown for the spotlit cluster while step 3 is animating.
    gSprings.selectAll('*').remove();
    if (lastAnim === 'step3' && state.spotlightCluster != null) {
      const k = state.spotlightCluster;
      const m = newCentroids[k];
      clusterPoints[k].forEach(i => {
        const p = points[i];
        gSprings.append('line')
          .attr('class', `s5-spring cluster-${k + 1}`)
          .attr('x1', p.x).attr('y1', p.y)
          .attr('x2', m.x).attr('y2', m.y)
          .attr('opacity', 0)
          .transition().duration(280).attr('opacity', 0.55);
      });
    }

    // Centroids — drawn in current (possibly old) positions.
    const cSel = gCentroids.selectAll('circle.centroid').data(newCentroids);
    cSel.enter()
      .append('circle')
      .attr('r', 2.6)
      .attr('cx', (_, k) => oldCentroids[k].x)
      .attr('cy', (_, k) => oldCentroids[k].y)
      .merge(cSel)
      .attr('class', (_, k) => `centroid cluster-${k + 1}`)
      .each(function (_, k) {
        const target = centroidPos(k);
        if (animateMove.indexOf(k) !== -1) {
          d3.select(this).transition().duration(SLIDE_DUR).ease(d3.easeCubicInOut)
            .attr('cx', target.x).attr('cy', target.y);
        } else {
          d3.select(this).attr('cx', target.x).attr('cy', target.y);
        }
      });
    cSel.exit().remove();

    // Residual lines (step 5+): each point to its (current) assigned centroid.
    gResid.selectAll('*').remove();
    if (state.showResidLines) {
      points.forEach((p, i) => {
        const k = assignments[i];
        const c = centroidPos(k);
        gResid.append('line')
          .attr('class', `distance-line s5-resid`)
          .attr('x1', p.x).attr('y1', p.y)
          .attr('x2', c.x).attr('y2', c.y);
      });
    }

    // Voronoi cells reshape as centroids move. When an animation is starting
    // this frame, the d3.transition hasn't begun yet — cx/cy in the DOM are
    // still at the old values. So driving cells off live DOM positions gives
    // the correct starting shape. Subsequent frames are driven by rAF.
    if (animateMove.length > 0) {
      renderVoronoi(liveCentroidPositions());
    } else {
      const logical = newCentroids.map((_, k) => centroidPos(k));
      renderVoronoi(logical);
    }
  }

  function render(opts) {
    renderText();
    renderViz(opts);
  }

  // ---- Animations ------------------------------------------------------------
  let animTimers = [];
  let voronoiRAF = null;
  function clearAnimTimers() {
    animTimers.forEach(t => clearTimeout(t));
    animTimers = [];
    if (voronoiRAF != null) {
      cancelAnimationFrame(voronoiRAF);
      voronoiRAF = null;
    }
  }

  // Re-render Voronoi cells each frame for `durationMs`, reading live DOM
  // centroid positions. With K=3 paths this is cheap.
  function runVoronoiRAF(durationMs) {
    if (voronoiRAF != null) cancelAnimationFrame(voronoiRAF);
    const start = performance.now();
    function tick(now) {
      renderVoronoi(liveCentroidPositions());
      if (now - start < durationMs) {
        voronoiRAF = requestAnimationFrame(tick);
      } else {
        // Final snap to logical positions to ensure exact alignment.
        const logical = newCentroids.map((_, k) => centroidPos(k));
        renderVoronoi(logical);
        voronoiRAF = null;
      }
    }
    voronoiRAF = requestAnimationFrame(tick);
  }

  function animateClusterSlide(k) {
    // Step 3: spotlight cluster k, springs visible, centroid slides old→new.
    state.moved[k] = 1;
    renderViz({ animateMove: [k] });
    runVoronoiRAF(SLIDE_DUR + 60);
    animTimers.push(setTimeout(() => {
      gSprings.selectAll('*').transition().duration(220).style('opacity', 0).remove();
    }, SLIDE_DUR));
  }

  function playSweep24() {
    // Cluster 0 already moved in step 3. Sweep clusters 1 and 2 in sequence.
    clearAnimTimers();
    const counterEl = slot.querySelector('[data-role="count"]');
    const calloutEl = slot.querySelector('[data-role="sweep-done"]');

    state.moved[1] = 1;
    renderViz({ animateMove: [1] });
    runVoronoiRAF(SLIDE_DUR + 60);
    let done = 1;
    if (counterEl) counterEl.textContent = `${done + 1} / ${K} clusters`;

    animTimers.push(setTimeout(() => {
      state.moved[2] = 1;
      renderViz({ animateMove: [2] });
      runVoronoiRAF(SLIDE_DUR + 60);
      done = 2;
      if (counterEl) counterEl.textContent = `${done + 1} / ${K} clusters`;

      animTimers.push(setTimeout(() => {
        if (calloutEl) {
          calloutEl.style.transition = 'opacity 350ms ease-out';
          calloutEl.style.opacity = '1';
        }
      }, SLIDE_DUR));
    }, SLIDE_DUR));
  }

  function playLatestAnimation() {
    if (lastAnim === 'step3') {
      animateClusterSlide(0);
    } else if (lastAnim === 'step4') {
      // setCursor already held clusters 1+2 at OLD position before rendering.
      // Initialize counter at 1 / K (cluster 0 done from step 3).
      const counterEl = slot.querySelector('[data-role="count"]');
      if (counterEl) counterEl.textContent = `1 / ${K} clusters`;
      playSweep24();
    }
  }

  // ---- Engine ----------------------------------------------------------------
  function setCursor(c, animate) {
    if (c < 0 || c > STEPS) return false;
    if (c === cursor) return false;
    if (c < cursor) {
      clearAnimTimers();
      resetState();
      cursor = 0;
      while (cursor < c) { cursor++; applyStep(cursor); }
      render();
    } else {
      // Forward. For step 3 (animate cluster 0 slide) and step 4 (animate
      // clusters 1+2 slide) the animation drives the centroid positions, so
      // we hold them at their pre-animation positions rather than drawing
      // them at their final positions and then "rewinding" for the slide.
      while (cursor < c) {
        cursor++;
        applyStep(cursor);
        if (animate && cursor === 3) {
          // Hold cluster 0 at OLD pos; the slide will move it to new.
          state.moved[0] = 0;
        }
        if (animate && cursor === 4) {
          // Hold clusters 1+2 at OLD pos; the sweep will move them.
          state.moved[1] = 0;
          state.moved[2] = 0;
        }
        render();
      }
      if (animate) playLatestAnimation();
    }
    pushSharedState();
    return true;
  }

  function pushSharedState() {
    const s = window.kmeansSceneState;
    s.centroidsBeforeUpdate = oldCentroids.map(c => ({ x: c.x, y: c.y }));
    s.centroidsAfterUpdate = newCentroids.map(c => ({ x: c.x, y: c.y }));
    s.assignmentsAfterAssign = assignments.slice();
    s.jAfterAssign = jAfterAssign;
    if (state.cursor >= 5) {
      if (!s._scene5JPushed) {
        try { window.InertiaPanel.pushJ(jAfterUpdate); } catch (e) {}
        s._scene5JPushed = true;
      }
      s.jAfterUpdate = jAfterUpdate;
    }
  }

  function onThemeChange() { render(); }
  window.addEventListener('theme-change', onThemeChange);

  // Initial paint — land on step 1.
  resetState();
  render();
  pushSharedState();
  setCursor(1, false);

  return {
    onEnter() {
      clearAnimTimers();
      // Re-read shared state (in case scene 4 just ran).
      ensureState();
      resetState();
      cursor = 0;
      render();
      setCursor(1, false);
    },
    onLeave() {
      clearAnimTimers();
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
