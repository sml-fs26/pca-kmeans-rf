/* Scene 2 — What we're minimizing (Objective J)
 * Internal step engine: 5 substeps reveal points → centroids → lines → cluster
 * highlight → total J. The persistent inertia panel gets its first push at step 5. */

window.scenes.scene2 = function (root) {
  // ---- Static data: the small worked example ----
  const points = window.DATA.iterDemo.points;
  const centroids = window.DATA.iterDemo.initialCentroids;
  const K = window.DATA.iterDemo.k;
  const assignments = window.KMEANS.assignToNearest(points, centroids);
  const totalJ = window.KMEANS.computeJ(points, assignments, centroids);

  // Per-cluster J for highlight step (cluster 1 = index 0).
  const clusterJ = new Array(K).fill(0);
  for (let i = 0; i < points.length; i++) {
    clusterJ[assignments[i]] +=
      window.KMEANS.pointJContribution(points[i], centroids[assignments[i]]);
  }

  // ---- Internal cursor ----
  const STEPS = 5;
  let cursor = 0;
  let textFadeTimer = null;
  let lineDrawTimers = [];

  // ---- DOM ----
  root.innerHTML = '';
  const layout = document.createElement('div');
  layout.className = 'scene-layout';
  root.appendChild(layout);

  // Left: viz
  const vizCol = document.createElement('div');
  vizCol.style.display = 'flex';
  vizCol.style.flexDirection = 'column';
  vizCol.style.minHeight = '0';
  layout.appendChild(vizCol);

  const vizWrap = document.createElement('div');
  vizWrap.className = 'viz-wrap';
  vizWrap.style.flex = '1';
  vizCol.appendChild(vizWrap);

  const svg = d3.select(vizWrap)
    .append('svg')
    .attr('viewBox', '0 0 100 100')
    .attr('preserveAspectRatio', 'xMidYMid meet');

  // Voronoi cells go behind everything else (DOM order = paint order).
  const gCells = svg.append('g').attr('class', 'g-cells');
  const gLines = svg.append('g').attr('class', 'g-lines');
  const gPoints = svg.append('g').attr('class', 'g-points');
  const gCentroids = svg.append('g').attr('class', 'g-centroids');

  // Right: narrative column
  const textCol = document.createElement('div');
  textCol.className = 'text-col s2-narrative';
  layout.appendChild(textCol);

  const stepPill = document.createElement('div');
  stepPill.className = 's2-step-pill';
  textCol.appendChild(stepPill);

  const stepText = document.createElement('div');
  stepText.className = 's2-step-text';
  textCol.appendChild(stepText);

  // ---- Helpers ----

  function clearLineTimers() {
    lineDrawTimers.forEach(t => clearTimeout(t));
    lineDrawTimers = [];
  }

  function clearViz() {
    clearLineTimers();
    gPoints.selectAll('*').remove();
    gCentroids.selectAll('*').remove();
    gLines.selectAll('*').remove();
    gCells.selectAll('*').remove();
  }

  // Render the Voronoi partition for the current centroids.
  // animateIn=true on first render (step 2) for a soft fade-in.
  function drawVoronoi(animateIn) {
    const cellPaths = window.KMEANS.voronoiCells(centroids, [0, 0, 100, 100]);
    const data = cellPaths
      .map((d, i) => ({ d, i }))
      .filter(o => o.d != null);
    const sel = gCells.selectAll('path.voronoi-cell').data(data, o => o.i);
    const enter = sel.enter()
      .append('path')
      .attr('class', o => `voronoi-cell cluster-${o.i + 1}`)
      .attr('d', o => o.d)
      .style('opacity', animateIn ? 0 : 1);
    if (animateIn) {
      enter.transition().duration(400).style('opacity', 1);
    }
    sel.attr('d', o => o.d);
    sel.exit().remove();
  }

  function drawPointsNeutral() {
    const sel = gPoints.selectAll('circle.point').data(points);
    sel.enter()
      .append('circle')
      .attr('class', 'point s2-neutral')
      .attr('r', 1.6)
      .attr('cx', p => p.x)
      .attr('cy', p => p.y);
  }

  function recolorPointsByAssignment() {
    gPoints.selectAll('circle.point')
      .attr('class', (_, i) => `point cluster-${assignments[i] + 1}`);
  }

  function drawCentroids() {
    const sel = gCentroids.selectAll('circle.centroid').data(centroids);
    const enter = sel.enter()
      .append('circle')
      .attr('class', (_, i) => `centroid cluster-${i + 1}`)
      .attr('r', 0)
      .attr('cx', c => c.x)
      .attr('cy', c => c.y)
      .style('opacity', 0);
    enter.transition()
      .duration(400)
      .ease(d3.easeBackOut.overshoot(2))
      .attr('r', 2.6)
      .style('opacity', 1);
  }

  function drawCentroidsImmediate() {
    gCentroids.selectAll('circle.centroid').data(centroids).enter()
      .append('circle')
      .attr('class', (_, i) => `centroid cluster-${i + 1}`)
      .attr('r', 2.6)
      .attr('cx', c => c.x)
      .attr('cy', c => c.y);
  }

  function drawLines(animate) {
    // One dashed line per point → its assigned centroid.
    const lineData = points.map((p, i) => ({
      p, c: centroids[assignments[i]], cluster: assignments[i] + 1
    }));
    const sel = gLines.selectAll('line.distance-line').data(lineData);
    const enter = sel.enter()
      .append('line')
      .attr('class', 'distance-line')
      .attr('x1', d => d.p.x)
      .attr('y1', d => d.p.y)
      .attr('x2', d => d.c.x)
      .attr('y2', d => d.c.y);

    if (animate) {
      enter
        .style('opacity', 0)
        .each(function () {
          const node = this;
          const len = node.getTotalLength
            ? node.getTotalLength()
            : Math.hypot(node.x2.baseVal.value - node.x1.baseVal.value,
                         node.y2.baseVal.value - node.y1.baseVal.value);
          d3.select(node)
            .attr('stroke-dasharray', `${len} ${len}`)
            .attr('stroke-dashoffset', len)
            .style('opacity', 1)
            .transition()
            .duration(600)
            .ease(d3.easeCubicOut)
            .attr('stroke-dashoffset', 0)
            .on('end', function () {
              // Restore the dashed look for non-selected lines.
              d3.select(this)
                .attr('stroke-dasharray', '3 3')
                .attr('stroke-dashoffset', 0);
            });
        });
    }
  }

  function highlightCluster(clusterIdx /* 0-based */) {
    gLines.selectAll('line.distance-line')
      .attr('class', (d, i) =>
        assignments[i] === clusterIdx
          ? 'distance-line selected'
          : 'distance-line');
  }

  function unhighlightAllLines() {
    gLines.selectAll('line.distance-line')
      .attr('class', 'distance-line');
  }

  // ---- Text rendering ----

  function setText(html, pillText) {
    if (textFadeTimer) { clearTimeout(textFadeTimer); textFadeTimer = null; }
    stepText.classList.add('fading');
    stepPill.textContent = pillText || '';
    textFadeTimer = setTimeout(() => {
      stepText.innerHTML = html;
      // Render any KaTeX placeholders.
      stepText.querySelectorAll('[data-katex]').forEach(el => {
        const tex = el.getAttribute('data-katex');
        const display = el.getAttribute('data-display') === 'true';
        try {
          window.katex.render(tex, el, { throwOnError: false, displayMode: display });
        } catch (e) { /* swallow */ }
      });
      stepText.classList.remove('fading');
    }, 180);
  }

  // ---- Substep content ----

  function textFor(step) {
    switch (step) {
      case 1:
        return {
          pill: 'Step 1 of 5',
          html: `<p>We start by dropping <span class="mono">K</span> centroids into random positions. (Here <span class="mono">K = 3</span>.) These will be the cluster representatives &mdash; but right now they&rsquo;re just placed somewhere.</p>`
        };
      case 2:
        return {
          pill: 'Step 2 of 5',
          html: `<p>Color every point by which centroid is closest to it. The space splits into <span class="mono">K</span> regions &mdash; one per centroid.</p>`
        };
      case 3:
        return {
          pill: 'Step 3 of 5',
          html: `<p>From every point, draw a line to its nearest centroid. The <em>squared</em> length of that line is one term in the loss function we&rsquo;re going to minimize.</p>`
        };
      case 4:
        return {
          pill: 'Step 4 of 5',
          html: `
            <p>The loss is the sum of those squared lengths &mdash; summed inside each cluster, then across all clusters.</p>
            <div class="formula-block"><span data-katex="J_{C_k} = \\sum_{x \\in C_k} \\|x - \\mu_k\\|^2" data-display="true"></span></div>
            <p class="s2-partial-sum"><span class="ps-label">Cluster 1 partial:</span><span class="mono">${clusterJ[0].toFixed(2)}</span></p>`
        };
      case 5:
        return {
          pill: 'Step 5 of 5',
          html: `
            <div class="formula-block"><span data-katex="J = \\sum_{k=1}^{K} \\sum_{x \\in C_k} \\|x - \\mu_k\\|^2" data-display="true"></span></div>
            <p><span class="mono">J</span> is k-means&rsquo; loss function. It measures how tightly each cluster huddles around its centroid &mdash; small when points sit close to their representative, large when they&rsquo;re spread out.</p>
            <p>k-means is the algorithm that makes <span class="mono">J</span> small. Everything from here is about that.</p>
            <p class="muted" style="font-size:13px">Total J = <span class="mono">${totalJ.toFixed(2)}</span></p>`
        };
      default:
        return { pill: '', html: '' };
    }
  }

  // ---- Apply state for a given step (incremental) ----

  function applyStep(c) {
    if (c === 1) {
      // Step 1 — neutral points + centroids dropped in their starting positions.
      drawPointsNeutral();
      drawCentroids();
    } else if (c === 2) {
      // Step 2 — partition the plane and color points by their nearest centroid.
      drawVoronoi(true);
      recolorPointsByAssignment();
    } else if (c === 3) {
      drawLines(true);
    } else if (c === 4) {
      highlightCluster(0); // cluster 1 (0-based)
      // Push J to the inertia panel ONLY at step 5; do nothing here.
    } else if (c === 5) {
      unhighlightAllLines();
      // Persistent inertia panel: reset to fresh history then push the canonical J.
      if (window.InertiaPanel) {
        window.InertiaPanel.reset();
        window.InertiaPanel.pushJ(totalJ);
      }
    }
    const t = textFor(c);
    setText(t.html, t.pill);
  }

  // ---- Reset state and replay forward to a target cursor ----

  function resetState() {
    clearViz();
    if (window.InertiaPanel) window.InertiaPanel.reset();
    setText('', '');
  }

  function setCursor(c) {
    if (c < 1) c = 1;            // never below 1 (cursor 0 = blank initial)
    if (c > STEPS) return false; // signal driver to advance scene
    if (c < cursor) {
      // Rewind: replay from clean state.
      resetState();
      cursor = 0;
      while (cursor < c) {
        cursor++;
        applyStep(cursor);
      }
    } else {
      while (cursor < c) {
        cursor++;
        applyStep(cursor);
      }
    }
    return true;
  }

  function reInit() {
    resetState();
    cursor = 0;
    setCursor(1);
  }

  // Initial paint.
  reInit();

  return {
    onEnter() {
      reInit();
    },
    onLeave() {
      clearLineTimers();
      if (textFadeTimer) { clearTimeout(textFadeTimer); textFadeTimer = null; }
    },
    onNextKey() {
      // If at last step already, signal driver to advance.
      if (cursor >= STEPS) return false;
      return setCursor(cursor + 1);
    },
    onPrevKey() {
      // If at first step (cursor === 1), signal driver to go back.
      if (cursor <= 1) return false;
      return setCursor(cursor - 1);
    },
  };
};
