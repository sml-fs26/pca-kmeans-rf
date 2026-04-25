/* Scene 8 — Initialization sensitivity (side-by-side).
 *
 * The punchline of the entire viz: same data, same K, same algorithm —
 * but a different starting point lands you at a vastly different J.
 *
 * Two cards side-by-side: left = badRandom (seed 6, 9 iters, J -> 73621),
 * right = goodKMeansPP (seed 42, 5 iters, J -> 15950). Below them, a
 * comparison J chart overlays both trajectories. Each click advances both
 * sides synchronously; the converged side stays still while the other
 * continues. After both have converged, a callout drives the lesson home.
 *
 * INERTIA-PANEL DECISION: Hide it for this scene. The bottom comparison
 * chart shows BOTH J trajectories at once, which is what the lesson is
 * about; the persistent panel only shows one curve and would either be
 * misleading or redundant. We override the driver's automatic show by
 * adding the `hidden` class on entry and removing it on leave.
 */

window.scenes.scene8 = (function () {

  // -------- One-time CSS injection (mirrors scene7 — index.html only loads
  //          style.css; per-scene CSS files exist but aren't <link>ed). --------
  function ensureStylesheet() {
    if (document.querySelector('link[data-scene-css="8"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/scene8.css';
    link.setAttribute('data-scene-css', '8');
    document.head.appendChild(link);
  }

  return function (root) {
    ensureStylesheet();

    // ---------------------------------------------------------------- data --
    const dataset = window.DATA.datasets.gaussianBlobs;
    const points = dataset.points;
    const badRun  = window.DATA.runs.badRandom;        // 9 entries
    const goodRun = window.DATA.runs.goodKMeansPP;     // 5 entries
    const badT  = badRun.trajectory;
    const goodT = goodRun.trajectory;
    const STEPS = Math.max(badT.length, goodT.length); // 9
    const BOUNDS = [0, 0, 100, 100];

    const finalBadJ  = badT[badT.length - 1].J;
    const finalGoodJ = goodT[goodT.length - 1].J;

    // ---------------------------------------------------------------- DOM ---
    root.innerHTML = '';

    const stack = document.createElement('div');
    stack.className = 's8-stack';
    root.appendChild(stack);

    // ---- header ----
    const header = document.createElement('div');
    header.className = 's8-header';
    stack.appendChild(header);

    const h2 = document.createElement('h2');
    h2.className = 's8-heading';
    h2.textContent = 'Same data. Same algorithm. Two starting points.';
    header.appendChild(h2);

    const intro = document.createElement('p');
    intro.className = 's8-intro';
    intro.textContent = 'Both runs use 150 points and K = 3. The only difference is where the centroids start.';
    header.appendChild(intro);

    // ---- side-by-side viz cards ----
    const split = document.createElement('div');
    split.className = 's8-split';
    stack.appendChild(split);

    function makeCard(side, titleText) {
      const card = document.createElement('div');
      card.className = 's8-card';

      const title = document.createElement('div');
      title.className = 's8-card-title';
      title.textContent = titleText;
      card.appendChild(title);

      const cap = document.createElement('div');
      cap.className = 's8-card-caption';
      card.appendChild(cap);

      const wrap = document.createElement('div');
      wrap.className = 's8-svg-wrap';
      card.appendChild(wrap);

      const svg = d3.select(wrap)
        .append('svg')
        .attr('class', 's8-svg')
        .attr('viewBox', '0 0 100 100')
        .attr('preserveAspectRatio', 'xMidYMid meet');

      const gCells     = svg.append('g').attr('class', 'g-cells');
      const gPoints    = svg.append('g').attr('class', 'g-points');
      const gCentroids = svg.append('g').attr('class', 'g-centroids');

      // Bind points once.
      const pointSel = gPoints.selectAll('circle.point')
        .data(points)
        .enter()
        .append('circle')
        .attr('class', 'point cluster-1')
        .attr('r', 0.9)
        .attr('cx', p => p.x)
        .attr('cy', p => p.y);

      split.appendChild(card);

      return { card, cap, gCells, gPoints, gCentroids, pointSel };
    }

    const left  = makeCard('left',  'Random initialization (seed 6)');
    const right = makeCard('right', 'k-means++ initialization (seed 42)');

    // ---- bottom row: J comparison chart + callout ----
    const bottom = document.createElement('div');
    bottom.className = 's8-bottom';
    stack.appendChild(bottom);

    const jWrap = document.createElement('div');
    jWrap.className = 's8-jchart-wrap';
    bottom.appendChild(jWrap);

    const jTitle = document.createElement('div');
    jTitle.className = 's8-jchart-title';
    jTitle.textContent = 'Objective J vs. iteration';
    jWrap.appendChild(jTitle);

    const jSvg = d3.select(jWrap)
      .append('svg')
      .attr('class', 's8-jchart')
      .attr('viewBox', '0 0 360 110')
      .attr('preserveAspectRatio', 'none');

    const callout = document.createElement('div');
    callout.className = 's8-callout';
    callout.innerHTML =
      '<div class="s8-callout-title">The same algorithm, two answers.</div>' +
      '<p class="s8-callout-body">' +
      'The random init gets trapped in a local minimum where two centroids ' +
      'share one true blob and one centroid is forced to span the other two. ' +
      'k-means++ avoids this by spreading initial centroids out — and ' +
      'converges to roughly five times lower <em>J</em>.</p>';
    bottom.appendChild(callout);

    // ---- footer (controls hint) ----
    const footer = document.createElement('div');
    footer.className = 's8-footer';
    stack.appendChild(footer);

    const stepPill = document.createElement('span');
    stepPill.className = 's8-step-pill';
    footer.appendChild(stepPill);

    const hint = document.createElement('span');
    hint.innerHTML = '<kbd>←</kbd> / <kbd>→</kbd> to step both sides';
    footer.appendChild(hint);

    // -------------------------------------------------------- card render --
    // Render snapshot on a card without animation.
    function renderCard(card, snap) {
      // points
      card.pointSel.attr('class', (_, i) => `point cluster-${snap.assignments[i] + 1}`);

      // centroids
      const cSel = card.gCentroids.selectAll('circle.centroid')
        .data(snap.centroids);
      cSel.exit().remove();
      cSel.enter()
        .append('circle')
        .attr('r', 2.2)
        .merge(cSel)
        .attr('class', (_, i) => `centroid cluster-${i + 1}`)
        .attr('cx', d => d.x)
        .attr('cy', d => d.y);

      // voronoi
      const cells = window.KMEANS.voronoiCells(snap.centroids, BOUNDS);
      const vSel = card.gCells.selectAll('path.voronoi-cell')
        .data(cells.map((d, i) => ({ d, i })));
      vSel.exit().remove();
      vSel.enter()
        .append('path')
        .merge(vSel)
        .attr('class', d => `voronoi-cell cluster-${d.i + 1}`)
        .attr('d', d => d.d);
    }

    // Animate centroids from `fromCentroids` to snap.centroids; replace
    // points / voronoi up front (motion masks the seam).
    function animateCard(card, fromCentroids, snap) {
      card.pointSel.attr('class', (_, i) => `point cluster-${snap.assignments[i] + 1}`);

      const cells = window.KMEANS.voronoiCells(snap.centroids, BOUNDS);
      const vSel = card.gCells.selectAll('path.voronoi-cell')
        .data(cells.map((d, i) => ({ d, i })));
      vSel.exit().remove();
      vSel.enter()
        .append('path')
        .merge(vSel)
        .attr('class', d => `voronoi-cell cluster-${d.i + 1}`)
        .attr('d', d => d.d);

      const cSel = card.gCentroids.selectAll('circle.centroid')
        .data(snap.centroids);
      cSel.exit().remove();
      const cAll = cSel.enter()
        .append('circle')
        .attr('r', 2.2)
        .merge(cSel)
        .attr('class', (_, i) => `centroid cluster-${i + 1}`)
        .attr('cx', (_, i) => fromCentroids[i] ? fromCentroids[i].x : snap.centroids[i].x)
        .attr('cy', (_, i) => fromCentroids[i] ? fromCentroids[i].y : snap.centroids[i].y);

      cAll.transition()
        .duration(700)
        .ease(d3.easeQuadOut)
        .attr('cx', d => d.x)
        .attr('cy', d => d.y);
    }

    function updateCaption(card, snap, c, traj, finalJ) {
      const isFinal = c >= traj.length - 1;
      const J = snap.J;
      if (isFinal && Math.abs(J - finalJ) < 1e-6) {
        card.cap.innerHTML = `Final J = <span class="s8-final">${finalJ.toFixed(1)}</span>`;
      } else {
        card.cap.innerHTML = `Iteration t = ${c} &nbsp;·&nbsp; J = ${J.toFixed(1)}`;
      }
    }

    // ------------------------------------------------- comparison J chart --
    // Layout: x = iteration 0..STEPS-1, y = J (linear).
    const J_W = 360, J_H = 110;
    const J_PAD = { top: 10, right: 56, bottom: 18, left: 38 };
    const J_INNER_W = J_W - J_PAD.left - J_PAD.right;
    const J_INNER_H = J_H - J_PAD.top  - J_PAD.bottom;

    const jXMax = STEPS - 1;
    const allJ = badT.map(d => d.J).concat(goodT.map(d => d.J));
    const jYMax = Math.max.apply(null, allJ);
    const jYMin = Math.min.apply(null, allJ);
    // Pad the Y range a bit so end-dots don't sit on the frame.
    const jYPadAmt = (jYMax - jYMin) * 0.08 || 1;
    const jYHi = jYMax + jYPadAmt;
    const jYLo = Math.max(0, jYMin - jYPadAmt);

    function jx(i) { return J_PAD.left + (i / Math.max(1, jXMax)) * J_INNER_W; }
    function jy(v) { return J_PAD.top + (1 - (v - jYLo) / (jYHi - jYLo)) * J_INNER_H; }

    function drawJChartFrame() {
      jSvg.selectAll('*').remove();

      // Y axis (just a line + 2 ticks: max & min)
      const axisG = jSvg.append('g').attr('class', 'axis');
      // y ticks
      [jYHi, jYLo].forEach(v => {
        axisG.append('line')
          .attr('x1', J_PAD.left).attr('x2', J_PAD.left + J_INNER_W)
          .attr('y1', jy(v)).attr('y2', jy(v))
          .attr('class', 'grid-tick')
          .attr('stroke', 'var(--grid-line)');
        axisG.append('text')
          .attr('x', J_PAD.left - 4).attr('y', jy(v) + 3)
          .attr('text-anchor', 'end')
          .text(Math.round(v).toLocaleString());
      });
      axisG.append('line')
        .attr('x1', J_PAD.left).attr('x2', J_PAD.left)
        .attr('y1', J_PAD.top).attr('y2', J_PAD.top + J_INNER_H)
        .attr('stroke', 'var(--rule)');

      // X axis: integer ticks at 0, 2, 4, 6, 8 (or all if <=4)
      axisG.append('line')
        .attr('x1', J_PAD.left).attr('x2', J_PAD.left + J_INNER_W)
        .attr('y1', J_PAD.top + J_INNER_H).attr('y2', J_PAD.top + J_INNER_H)
        .attr('stroke', 'var(--rule)');
      const xStep = jXMax >= 6 ? 2 : 1;
      for (let i = 0; i <= jXMax; i += xStep) {
        axisG.append('text')
          .attr('x', jx(i)).attr('y', J_PAD.top + J_INNER_H + 11)
          .attr('text-anchor', 'middle')
          .text(String(i));
      }
      // x label (right-aligned, italic)
      jSvg.append('text')
        .attr('x', J_PAD.left + J_INNER_W).attr('y', J_PAD.top + J_INNER_H + 11)
        .attr('text-anchor', 'start')
        .attr('class', 'j-label')
        .attr('dx', 6)
        .text('iter');

      // Two empty paths + endpoint dots for the lines.
      jSvg.append('path').attr('class', 'j-line bad');
      jSvg.append('path').attr('class', 'j-line good');
      jSvg.append('circle').attr('class', 'j-dot bad').attr('r', 2.4);
      jSvg.append('circle').attr('class', 'j-dot good').attr('r', 2.4);
      jSvg.append('text').attr('class', 'j-label j-label-bad');
      jSvg.append('text').attr('class', 'j-label j-label-good');
    }

    // Build the SVG path for traj[0..upTo].
    function buildJPath(traj, upTo) {
      const last = Math.min(upTo, traj.length - 1);
      let d = '';
      for (let i = 0; i <= last; i++) {
        d += (i === 0 ? 'M' : 'L') + jx(i).toFixed(1) + ',' + jy(traj[i].J).toFixed(1) + ' ';
      }
      return d;
    }

    // Draw both lines up to global cursor `c`. If `animate` is true, do a
    // stroke-dasharray draw on the freshly-extended segment.
    function updateJChart(c, animate) {
      const badUpTo  = Math.min(c, badT.length - 1);
      const goodUpTo = Math.min(c, goodT.length - 1);

      const badPath  = jSvg.select('path.j-line.bad');
      const goodPath = jSvg.select('path.j-line.good');
      const badDot   = jSvg.select('circle.j-dot.bad');
      const goodDot  = jSvg.select('circle.j-dot.good');
      const badLabel  = jSvg.select('text.j-label-bad');
      const goodLabel = jSvg.select('text.j-label-good');

      const dBad  = buildJPath(badT,  badUpTo);
      const dGood = buildJPath(goodT, goodUpTo);

      function setPath(sel, d, doDraw) {
        sel.attr('d', d);
        if (!doDraw) {
          sel.attr('stroke-dasharray', null).attr('stroke-dashoffset', null);
          return;
        }
        const node = sel.node();
        if (!node || !node.getTotalLength) return;
        const len = node.getTotalLength();
        sel.attr('stroke-dasharray', len + ' ' + len)
           .attr('stroke-dashoffset', len)
           .transition().duration(420).ease(d3.easeQuadOut)
           .attr('stroke-dashoffset', 0)
           .on('end', function () { d3.select(this).attr('stroke-dasharray', null); });
      }

      setPath(badPath, dBad,  animate);
      setPath(goodPath, dGood, animate);

      // endpoint dots
      badDot.attr('cx', jx(badUpTo)).attr('cy', jy(badT[badUpTo].J));
      goodDot.attr('cx', jx(goodUpTo)).attr('cy', jy(goodT[goodUpTo].J));

      // endpoint labels
      badLabel
        .attr('x', jx(badUpTo) + 6).attr('y', jy(badT[badUpTo].J) + 3)
        .text('random');
      goodLabel
        .attr('x', jx(goodUpTo) + 6).attr('y', jy(goodT[goodUpTo].J) + 3)
        .text('k-means++');
    }

    // -------------------------------------------------------- step engine --
    let cursor = 0;

    function bothConverged(c) {
      // Both runs have reached their final entry.
      return c >= badT.length - 1 && c >= goodT.length - 1;
    }

    function setCursor(c, animate) {
      if (c < 0 || c >= STEPS) return false;

      if (c < cursor) {
        // Rewind: redraw both cards from scratch, no animation; redraw chart.
        cursor = c;
        renderCard(left,  badT[Math.min(c, badT.length - 1)]);
        renderCard(right, goodT[Math.min(c, goodT.length - 1)]);
        updateJChart(c, false);
      } else if (c > cursor) {
        // Forward: step one at a time, animating only on the final hop.
        while (cursor < c) {
          const fromBadIdx  = Math.min(cursor, badT.length - 1);
          const fromGoodIdx = Math.min(cursor, goodT.length - 1);
          cursor += 1;
          const toBadIdx  = Math.min(cursor, badT.length - 1);
          const toGoodIdx = Math.min(cursor, goodT.length - 1);

          const willAnimate = animate && cursor === c;

          // Left card
          if (toBadIdx === fromBadIdx) {
            // already converged; no movement
            renderCard(left, badT[toBadIdx]);
          } else if (willAnimate) {
            animateCard(left, badT[fromBadIdx].centroids, badT[toBadIdx]);
          } else {
            renderCard(left, badT[toBadIdx]);
          }

          // Right card
          if (toGoodIdx === fromGoodIdx) {
            renderCard(right, goodT[toGoodIdx]);
          } else if (willAnimate) {
            animateCard(right, goodT[fromGoodIdx].centroids, goodT[toGoodIdx]);
          } else {
            renderCard(right, goodT[toGoodIdx]);
          }
        }

        updateJChart(c, animate);
      } else {
        // c === cursor (called from onEnter): full repaint.
        renderCard(left,  badT[Math.min(c, badT.length - 1)]);
        renderCard(right, goodT[Math.min(c, goodT.length - 1)]);
        updateJChart(c, false);
      }

      // Captions, pill, callout
      updateCaption(left,  badT[Math.min(cursor, badT.length - 1)],   Math.min(cursor, badT.length - 1),  badT,  finalBadJ);
      updateCaption(right, goodT[Math.min(cursor, goodT.length - 1)], Math.min(cursor, goodT.length - 1), goodT, finalGoodJ);
      stepPill.textContent = `step ${cursor} / ${STEPS - 1}`;
      callout.classList.toggle('visible', bothConverged(cursor));
      return true;
    }

    // ------------------------------------------------------- entry / exit --
    function enter() {
      cursor = 0;

      // Override the driver's automatic show — see header comment.
      const ip = document.getElementById('inertia-panel');
      if (ip) ip.classList.add('hidden');
      document.body.classList.remove('inertia-visible');
      window.InertiaPanel.reset();

      drawJChartFrame();
      renderCard(left,  badT[0]);
      renderCard(right, goodT[0]);
      updateJChart(0, false);
      updateCaption(left,  badT[0],  0, badT,  finalBadJ);
      updateCaption(right, goodT[0], 0, goodT, finalGoodJ);
      stepPill.textContent = `step 0 / ${STEPS - 1}`;
      callout.classList.remove('visible');
    }

    // Theme changes: J chart was drawn with var(--rule) etc; CSS classes carry
    // the line colors. The only inline strokes we set are 'var(--rule)' and
    // 'var(--grid-line)' which are CSS variables and update for free.
    function onThemeChange() { /* nothing to do */ }
    window.addEventListener('theme-change', onThemeChange);

    enter();

    return {
      onEnter() {
        enter();
      },
      onLeave() {
        window.removeEventListener('theme-change', onThemeChange);
        // Don't manually re-show the inertia panel here; main.js's goTo() runs
        // on the *next* scene and sets visibility based on its membership in
        // SCENES_WITH_INERTIA.
      },
      onNextKey() {
        if (cursor >= STEPS - 1) return false;
        return setCursor(cursor + 1, true);
      },
      onPrevKey() {
        if (cursor <= 0) return false;
        return setCursor(cursor - 1, false);
      },
    };
  };
})();
