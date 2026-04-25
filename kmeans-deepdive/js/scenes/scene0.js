/* Scene 0 — Title hero.
 * Greets the student with a serif title and a teaser visual: the converged final
 * state of a clean k-means++ run on the gaussianBlobs dataset (Voronoi cells +
 * 150 colored points + 3 ringed centroids), with a soft cascading entrance. */

window.scenes.scene0 = function (root) {
  // Persist references between renders / replays so onEnter can restart cleanly.
  let entranceTimers = [];

  function clearTimers() {
    entranceTimers.forEach(t => clearTimeout(t));
    entranceTimers = [];
  }

  // ---- Build static DOM ----
  root.classList.add('scene-hero');

  const layout = document.createElement('div');
  layout.className = 'scene-layout center hero-layout';
  root.appendChild(layout);

  const stack = document.createElement('div');
  stack.className = 'hero-stack';
  layout.appendChild(stack);

  const overTitle = document.createElement('p');
  overTitle.className = 'hero-overtitle';
  overTitle.textContent = 'An interactive deep-dive';
  stack.appendChild(overTitle);

  const h1 = document.createElement('h1');
  h1.className = 'hero-title';
  h1.textContent = 'k-means.';
  stack.appendChild(h1);

  const subtitle = document.createElement('p');
  subtitle.className = 'hero-subtitle';
  subtitle.textContent =
    'Step through the algorithm, one decision at a time. See why it works — and where it goes wrong.';
  stack.appendChild(subtitle);

  // ---- Teaser visual: SVG of the converged canonical run ----
  const vizWrap = document.createElement('div');
  vizWrap.className = 'hero-viz';
  stack.appendChild(vizWrap);

  const svg = d3.select(vizWrap)
    .append('svg')
    .attr('viewBox', '0 0 100 100')
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .attr('class', 'hero-svg');

  const gCells = svg.append('g').attr('class', 'g-cells');
  const gPoints = svg.append('g').attr('class', 'g-points');
  const gCentroids = svg.append('g').attr('class', 'g-centroids');

  const caption = document.createElement('p');
  caption.className = 'hero-caption';
  caption.textContent =
    'Three Gaussian blobs. k-means with k-means++ initialization, converged.';
  stack.appendChild(caption);

  const cta = document.createElement('p');
  cta.className = 'hero-cta';
  cta.innerHTML = 'Press <kbd>Next →</kbd> to begin.';
  stack.appendChild(cta);

  // ---- Render the converged state ----
  function render() {
    const ds = window.DATA && window.DATA.datasets && window.DATA.datasets.gaussianBlobs;
    const run = window.DATA && window.DATA.runs && window.DATA.runs.canonical;
    if (!ds || !run) return;

    const points = ds.points;
    const finalState = run.trajectory[run.trajectory.length - 1];
    const centroids = finalState.centroids;
    const assignments = finalState.assignments;

    // Voronoi cells
    const cells = window.KMEANS.voronoiCells(centroids, [0, 0, 100, 100]);
    const cellSel = gCells.selectAll('path.voronoi-cell')
      .data(cells.map((d, i) => ({ d, i })));
    cellSel.exit().remove();
    cellSel.enter()
      .append('path')
      .attr('class', d => `voronoi-cell cluster-${d.i + 1}`)
      .merge(cellSel)
      .attr('d', d => d.d);

    // Points
    const pointSel = gPoints.selectAll('circle.point')
      .data(points);
    pointSel.exit().remove();
    pointSel.enter()
      .append('circle')
      .attr('class', (_, i) => `point cluster-${assignments[i] + 1}`)
      .attr('r', 1.4)
      .merge(pointSel)
      .attr('cx', p => p.x)
      .attr('cy', p => p.y)
      .attr('class', (_, i) => `point cluster-${assignments[i] + 1}`);

    // Centroids
    const centroidSel = gCentroids.selectAll('circle.centroid')
      .data(centroids);
    centroidSel.exit().remove();
    centroidSel.enter()
      .append('circle')
      .attr('class', (_, i) => `centroid cluster-${i + 1}`)
      .attr('r', 2.6)
      .merge(centroidSel)
      .attr('cx', c => c.x)
      .attr('cy', c => c.y);
  }

  // ---- Entrance animation ----
  function playEntrance() {
    clearTimers();

    // Reset opacities for replay.
    gCells.selectAll('path.voronoi-cell').style('opacity', 0);
    gPoints.selectAll('circle.point').style('opacity', 0);
    gCentroids.selectAll('circle.centroid').style('opacity', 0).attr('r', 0);

    // Title elements: also fade in for replay (CSS provides initial fade-in
    // on first paint; we redo it on revisit for consistency).
    [overTitle, h1, subtitle, caption, cta].forEach(el => {
      el.style.opacity = 0;
      el.style.transform = 'translateY(6px)';
    });

    const titleTimings = [
      [overTitle, 0],
      [h1, 80],
      [subtitle, 220],
      [caption, 1300],
      [cta, 1500],
    ];
    titleTimings.forEach(([el, delay]) => {
      entranceTimers.push(setTimeout(() => {
        el.style.transition = 'opacity 600ms ease-out, transform 600ms ease-out';
        el.style.opacity = 1;
        el.style.transform = 'translateY(0)';
      }, delay));
    });

    // 1) Voronoi cells fade in.
    entranceTimers.push(setTimeout(() => {
      gCells.selectAll('path.voronoi-cell')
        .transition()
        .duration(600)
        .style('opacity', 1);
    }, 350));

    // 2) Points stagger-appear.
    const points = gPoints.selectAll('circle.point').nodes();
    const pointStart = 800;
    const pointStep = 4;
    points.forEach((node, i) => {
      entranceTimers.push(setTimeout(() => {
        d3.select(node)
          .transition()
          .duration(260)
          .style('opacity', 1);
      }, pointStart + i * pointStep));
    });

    // 3) Centroids pop in last.
    const centroidPopAt = pointStart + points.length * pointStep + 120;
    gCentroids.selectAll('circle.centroid').each(function (_, i) {
      entranceTimers.push(setTimeout(() => {
        d3.select(this)
          .transition()
          .duration(380)
          .ease(d3.easeBackOut.overshoot(2.2))
          .attr('r', 2.6)
          .style('opacity', 1);
      }, centroidPopAt + i * 110));
    });
  }

  // Initial paint.
  render();
  playEntrance();

  return {
    onEnter() {
      // d3-rendered SVG uses theme-aware CSS classes, so the colors update on
      // theme-change automatically; we only need to replay the entrance.
      playEntrance();
    },
    onLeave() {
      clearTimers();
    },
    onNextKey() { return false; },
    onPrevKey() { return false; },
  };
};
