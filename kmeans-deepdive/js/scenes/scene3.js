/* Scene 3 — Initialization
 * Side-by-side comparison: Random init vs k-means++ on the same small example.
 * Both use a fixed seed so the picture is stable across visits. */

window.scenes.scene3 = function (root) {
  const points = window.DATA.iterDemo.points;
  const K = window.DATA.iterDemo.k;

  // Deterministic centroid placements via seeded RNG.
  const randomCentroids = window.KMEANS.randomInit(
    points, K, window.KMEANS.seedRandom(11));
  const kppCentroids = window.KMEANS.kmeansPlusPlus(
    points, K, window.KMEANS.seedRandom(11));

  // Initial assignments and J for each starting position.
  const randomAssign = window.KMEANS.assignToNearest(points, randomCentroids);
  const randomJ = window.KMEANS.computeJ(points, randomAssign, randomCentroids);
  const kppAssign = window.KMEANS.assignToNearest(points, kppCentroids);
  const kppJ = window.KMEANS.computeJ(points, kppAssign, kppCentroids);

  // ---- DOM ----
  root.innerHTML = '';

  const layout = document.createElement('div');
  layout.className = 'scene-layout center';
  root.appendChild(layout);

  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.flexDirection = 'column';
  wrap.style.height = '100%';
  wrap.style.justifyContent = 'center';
  layout.appendChild(wrap);

  const h2 = document.createElement('h2');
  h2.className = 's3-h2';
  h2.textContent = 'Where do the centroids start?';
  wrap.appendChild(h2);

  const intro = document.createElement('p');
  intro.className = 's3-intro';
  intro.innerHTML =
    `The algorithm needs K starting centroids before it can iterate. The choice matters more than you'd think.`;
  wrap.appendChild(intro);

  const compare = document.createElement('div');
  compare.className = 's3-compare';
  wrap.appendChild(compare);

  // ---- Build a card for one strategy ----
  function buildCard(parent, title, centroidList, assignList, J) {
    const card = document.createElement('div');
    card.className = 's3-card';
    parent.appendChild(card);

    const t = document.createElement('div');
    t.className = 's3-card-title';
    t.textContent = title;
    card.appendChild(t);

    const vw = document.createElement('div');
    vw.className = 'viz-wrap';
    card.appendChild(vw);

    const svg = d3.select(vw)
      .append('svg')
      .attr('viewBox', '0 0 100 100')
      .attr('preserveAspectRatio', 'xMidYMid meet');

    // Voronoi cells (faint), points colored by initial assignment, centroids on top.
    const gCells = svg.append('g').attr('class', 'g-cells');
    const gPoints = svg.append('g').attr('class', 'g-points');
    const gCentroids = svg.append('g').attr('class', 'g-centroids');

    const cap = document.createElement('div');
    cap.className = 's3-card-caption';
    cap.innerHTML =
      `<span class="cap-label">J =</span><span class="mono">${J.toFixed(2)}</span>`;
    card.appendChild(cap);

    return { svg, gCells, gPoints, gCentroids, centroidList, assignList };
  }

  function paintCard(c) {
    const { gCells, gPoints, gCentroids, centroidList, assignList } = c;
    gCells.selectAll('*').remove();
    gPoints.selectAll('*').remove();
    gCentroids.selectAll('*').remove();

    // Voronoi cells (light tinting).
    const cells = window.KMEANS.voronoiCells(centroidList, [0, 0, 100, 100]);
    gCells.selectAll('path.voronoi-cell')
      .data(cells.map((d, i) => ({ d, i })))
      .enter()
      .append('path')
      .attr('class', d => `voronoi-cell cluster-${d.i + 1}`)
      .attr('d', d => d.d);

    // Points colored by their nearest-centroid assignment.
    gPoints.selectAll('circle.point')
      .data(points)
      .enter()
      .append('circle')
      .attr('class', (_, i) => `point cluster-${assignList[i] + 1}`)
      .attr('r', 1.7)
      .attr('cx', p => p.x)
      .attr('cy', p => p.y);

    // Centroids on top.
    gCentroids.selectAll('circle.centroid')
      .data(centroidList)
      .enter()
      .append('circle')
      .attr('class', (_, i) => `centroid cluster-${i + 1}`)
      .attr('r', 2.6)
      .attr('cx', c => c.x)
      .attr('cy', c => c.y);
  }

  const leftCard = buildCard(compare, 'Random', randomCentroids, randomAssign, randomJ);
  const rightCard = buildCard(compare, 'k-means++', kppCentroids, kppAssign, kppJ);

  // ---- Below: explainer + foreshadowing ----

  const explainer = document.createElement('p');
  explainer.className = 's3-explainer';
  explainer.innerHTML =
    `k-means++ picks the first centroid randomly, then each subsequent one with probability proportional to its squared distance from the nearest already-chosen centroid. The result: starting positions that are spread out.`;
  wrap.appendChild(explainer);

  const fore = document.createElement('div');
  fore.className = 'callout s3-foreshadow';
  fore.innerHTML = `
    <div class="callout-title">Foreshadowing</div>
    <div>Scene 8 shows what happens after these two starting positions get fed into the full algorithm.</div>`;
  wrap.appendChild(fore);

  // ---- Render once. ----
  function renderAll() {
    paintCard(leftCard);
    paintCard(rightCard);
  }
  renderAll();

  return {
    onEnter() {
      // Don't reset the inertia panel — preserve J from scene 2 if present.
      // Re-display the canonical J in the panel current line if we have history.
      if (window.InertiaPanel) {
        const hist = window.InertiaPanel.getHistory();
        if (hist && hist.length > 0) {
          window.InertiaPanel.setCurrent(hist[hist.length - 1].J);
        }
      }
      renderAll();
    },
    onLeave() {},
    onNextKey() { return false; },
    onPrevKey() { return false; },
  };
};
