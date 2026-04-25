/* Scene 7 — Run to convergence.
 *
 * Pedagogical beat: zoom out from the slow walkthrough on iterDemo (scenes 2-5)
 * and watch a real k-means++ run on 150 Gaussian-blob points converge in 4
 * iterations. Each click advances one full Lloyd iteration; the inertia panel
 * fills as J falls; the Voronoi snaps into place at the end.
 *
 * Trajectory comes from DATA.runs.canonical (5 entries: init + 4 iters,
 * J: 100376 -> 54316 -> 18035 -> 15950 -> 15950).
 */

window.scenes.scene7 = (function () {

  // -------- One-time CSS injection (the project's index.html only loads
  //          style.css; per-scene CSS files exist but aren't <link>ed). --------
  function ensureStylesheet() {
    if (document.querySelector('link[data-scene-css="7"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/scene7.css';
    link.setAttribute('data-scene-css', '7');
    document.head.appendChild(link);
  }

  return function (root) {
    ensureStylesheet();

    // ---------------------------------------------------------------- data --
    const dataset = window.DATA.datasets.gaussianBlobs;
    const run = window.DATA.runs.canonical;
    const points = dataset.points;
    const trajectory = run.trajectory;
    const STEPS = trajectory.length; // 5
    const BOUNDS = [0, 0, 100, 100];

    // ---------------------------------------------------------------- DOM ---
    root.innerHTML = '';
    const layout = document.createElement('div');
    layout.className = 's7-layout';
    root.appendChild(layout);

    // -- left: viz --
    const vizWrap = document.createElement('div');
    vizWrap.className = 's7-viz-wrap';
    layout.appendChild(vizWrap);

    const svg = d3.select(vizWrap)
      .append('svg')
      .attr('class', 's7-svg')
      .attr('viewBox', '0 0 100 100')
      .attr('preserveAspectRatio', 'xMidYMid meet');

    const gCells     = svg.append('g').attr('class', 'g-cells');
    const gPoints    = svg.append('g').attr('class', 'g-points');
    const gCentroids = svg.append('g').attr('class', 'g-centroids');

    // -- right: text column --
    const text = document.createElement('div');
    text.className = 's7-text';
    layout.appendChild(text);

    const h2 = document.createElement('h2');
    h2.className = 's7-heading';
    h2.textContent = 'Run it to the end.';
    text.appendChild(h2);

    const intro = document.createElement('p');
    intro.className = 's7-intro';
    intro.innerHTML = 'Same algorithm. Real data — 150 points, <em>K = 3</em>. ' +
                      'Each click advances one full iteration: assign, then update. ' +
                      'Watch <em>J</em> fall.';
    text.appendChild(intro);

    const pillRow = document.createElement('div');
    pillRow.className = 's7-pill-row';
    text.appendChild(pillRow);

    const stepPill = document.createElement('span');
    stepPill.className = 's7-step-pill';
    pillRow.appendChild(stepPill);

    const caption = document.createElement('p');
    caption.className = 's7-caption';
    text.appendChild(caption);

    const callout = document.createElement('div');
    callout.className = 's7-callout';
    callout.innerHTML =
      '<div class="s7-callout-title">Converged.</div>' +
      '<p class="s7-callout-body">After 4 iterations, the centroids stop ' +
      'moving. <em>J</em> is at a local minimum.</p>';
    text.appendChild(callout);

    const controls = document.createElement('div');
    controls.className = 's7-controls';
    controls.innerHTML = '<span class="s7-hint"><kbd>←</kbd> / <kbd>→</kbd> to step</span>';
    text.appendChild(controls);

    // ------------------------------------------------------- initial points -
    // Bind once. Color is driven entirely by the .cluster-N class — we mutate
    // the class to retint and let CSS handle the transition.
    const pointSel = gPoints.selectAll('circle.point')
      .data(points)
      .enter()
      .append('circle')
      .attr('class', 'point cluster-1') // overwritten on first render
      .attr('r', 0.9)
      .attr('cx', p => p.x)
      .attr('cy', p => p.y);

    // ------------------------------------------------------------ state ----
    let cursor = 0;
    let lastAnimatedFrom = null; // remember previous centroid positions for animation

    // Render the snapshot at trajectory[c] without animation.
    function renderSnapshot(c) {
      const snap = trajectory[c];

      // points: update class to .cluster-(assignment+1)
      pointSel.attr('class', (_, i) => `point cluster-${snap.assignments[i] + 1}`);

      // centroids: data-join, no transition
      const cSel = gCentroids.selectAll('circle.centroid')
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
      const vSel = gCells.selectAll('path.voronoi-cell')
        .data(cells.map((d, i) => ({ d, i })));
      vSel.exit().remove();
      vSel.enter()
        .append('path')
        .merge(vSel)
        .attr('class', d => `voronoi-cell cluster-${d.i + 1}`)
        .attr('d', d => d.d);
    }

    // Animate centroids from `fromCentroids` to trajectory[c].centroids.
    // Points retint via class swap (CSS transition handles the fade).
    // Voronoi is re-rendered up front (the centroid motion masks the seam).
    function animateTo(c, fromCentroids) {
      const snap = trajectory[c];

      pointSel.attr('class', (_, i) => `point cluster-${snap.assignments[i] + 1}`);

      // Voronoi at the new positions, drawn behind.
      const cells = window.KMEANS.voronoiCells(snap.centroids, BOUNDS);
      const vSel = gCells.selectAll('path.voronoi-cell')
        .data(cells.map((d, i) => ({ d, i })));
      vSel.exit().remove();
      vSel.enter()
        .append('path')
        .merge(vSel)
        .attr('class', d => `voronoi-cell cluster-${d.i + 1}`)
        .attr('d', d => d.d);

      // Centroids: place at `from` then transition to `to`.
      const cSel = gCentroids.selectAll('circle.centroid')
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

    function updateCaption(c) {
      const snap = trajectory[c];
      stepPill.textContent = c === 0
        ? 'Initial state'
        : `Iteration t = ${c}`;

      if (c === 0) {
        caption.innerHTML = '<em>Initial state. K-means++ has chosen 3 starting centroids.</em>';
      } else {
        const J = snap.J;
        const Jprev = trajectory[c - 1].J;
        caption.innerHTML =
          `<em>Iteration ${c}: J = ${J.toFixed(1)} (from ${Jprev.toFixed(1)})</em>`;
      }
    }

    function updateCallout(c) {
      // Convergence detection per spec: trajectory[c].J === trajectory[c-1].J.
      const converged = c >= 1 &&
        Math.abs(trajectory[c].J - trajectory[c - 1].J) < 1e-6;
      callout.classList.toggle('visible', converged);
    }

    // Push J values 0..c into the inertia panel from a clean slate. Used on
    // both initial entry and rewind. We avoid pushing on every forward step
    // and instead push the single current value, to match the natural flow
    // of one J reading per click.
    function syncInertiaPanel(c) {
      window.InertiaPanel.reset();
      for (let i = 0; i <= c; i++) {
        window.InertiaPanel.pushJ(trajectory[i].J);
      }
    }

    // -------------------------------------------------------- step engine --
    function setCursor(c, animate) {
      if (c < 0 || c >= STEPS) return false;

      if (c < cursor) {
        // Rewind: clean snapshot, no animation.
        cursor = c;
        renderSnapshot(c);
        syncInertiaPanel(c);
      } else if (c > cursor) {
        // Forward: step one at a time so we can animate the very last hop.
        while (cursor < c) {
          const from = trajectory[cursor].centroids;
          cursor += 1;
          if (animate && cursor === c) {
            animateTo(cursor, from);
          } else {
            renderSnapshot(cursor);
          }
          window.InertiaPanel.pushJ(trajectory[cursor].J);
        }
      } else {
        // c === cursor: no-op except UI sync (called from onEnter).
        renderSnapshot(c);
      }

      updateCaption(cursor);
      updateCallout(cursor);
      return true;
    }

    // ------------------------------------------------------- entry / exit --
    function enter() {
      cursor = 0;
      lastAnimatedFrom = null;
      renderSnapshot(0);
      window.InertiaPanel.reset();
      window.InertiaPanel.pushJ(trajectory[0].J);
      updateCaption(0);
      updateCallout(0);
    }

    // Initial paint.
    enter();

    // React to theme changes — d3 paths will repaint via CSS, but the Voronoi
    // path geometry is independent of theme so we only need to ensure the SVG
    // doesn't have stale inline fills (we never set any).
    function onThemeChange() { /* nothing to do; classes carry the colors */ }
    window.addEventListener('theme-change', onThemeChange);

    return {
      onEnter() {
        enter();
      },
      onLeave() {
        window.removeEventListener('theme-change', onThemeChange);
      },
      onNextKey() {
        // If we're already at the last step, let the driver advance.
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
