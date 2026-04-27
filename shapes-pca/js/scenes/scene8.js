/* Scene 8 — Three lessons (takeaways).
 *
 * Three side-by-side cards, one per dataset/lesson:
 *   1. Disjoint shapes  → "PCA recovers the basis."
 *   2. Redundant factors → "PCA discovers true dimensionality."
 *   3. Correlated factors → "PCA is not factor analysis."
 *
 * No internal step engine. Prev returns to scene 7. */

window.scenes.scene8 = function (root) {
  const indep = PCA.variant('independent2');
  const redu = PCA.variant('redundant3');
  const corr = PCA.variant('correlated2');
  const corrSnap = corr.snapshots[3]; // ρ = 0.9

  // ---- DOM scaffolding ------------------------------------------------------
  root.innerHTML = '';
  root.classList.add('scene-s8');

  const layout = document.createElement('div');
  layout.className = 'scene-layout center s8-layout';
  root.appendChild(layout);

  const heading = document.createElement('h2');
  heading.className = 's8-heading';
  heading.textContent = 'Three lessons.';
  layout.appendChild(heading);

  const lede = document.createElement('p');
  lede.className = 'muted s8-lede';
  lede.textContent = 'A short retrospective on what PCA returned for each dataset.';
  layout.appendChild(lede);

  const grid = document.createElement('div');
  grid.className = 's8-grid';
  layout.appendChild(grid);

  // -- Card 1: Disjoint shapes ---------------------------------------------
  const card1 = makeCard({
    num: '01',
    headline: 'PCA recovers the basis.',
    body: 'When the data lives on a sum of disjoint pieces, the eigenvectors are exactly those pieces.',
    caption: 'independent₂ — eigenvector v₁',
  });
  grid.appendChild(card1.root);
  // Render the circle eigenvector (auto-grayscale).
  const c1Canvas = ImageCanvas.create(card1.canvasHost, { scale: 5 });
  ImageCanvas.render(c1Canvas, indep.eigenvecs[0]);

  // -- Card 2: Redundant factors -------------------------------------------
  const card2 = makeCard({
    num: '02',
    headline: 'PCA discovers true dimensionality.',
    body: 'Redundant factors collapse to near-zero eigenvalues. The data\'s intrinsic rank is recovered.',
    caption: 'redundant₃ — eigenvalue spectrum',
  });
  grid.appendChild(card2.root);
  // Tiny SVG bar chart of redundant3.eigenvals — the third bar collapses to ≈0.
  drawEigenvalSpectrum(card2.canvasHost, redu.eigenvals);

  // -- Card 3: Correlated factors ------------------------------------------
  const card3 = makeCard({
    num: '03',
    headline: 'PCA is not factor analysis.',
    body: 'Correlated latent factors produce rotated principal components. PCA finds variance, not generative factors.',
    caption: `correlated₂ at ρ=${corrSnap.rho.toFixed(1)} — eigenvector v₁`,
  });
  grid.appendChild(card3.root);
  // Render ρ=0.9 v1 (sum-image), signed palette to match scene 7.
  const c3Canvas = ImageCanvas.create(card3.canvasHost, { scale: 5 });
  ImageCanvas.render(c3Canvas, corrSnap.eigenvecs[0], { signed: true });

  // -- Closing line ---------------------------------------------------------
  const closing = document.createElement('p');
  closing.className = 's8-closing';
  closing.innerHTML = '<em>Three datasets. One algorithm. Three different stories.</em>';
  layout.appendChild(closing);

  // ---- Card factory ---------------------------------------------------------
  function makeCard({ num, headline, body, caption }) {
    const wrap = document.createElement('article');
    wrap.className = 's8-card';

    const numEl = document.createElement('div');
    numEl.className = 's8-card-num';
    numEl.textContent = num;
    wrap.appendChild(numEl);

    const canvasHost = document.createElement('div');
    canvasHost.className = 's8-card-canvas-host';
    wrap.appendChild(canvasHost);

    const cap = document.createElement('div');
    cap.className = 's8-card-caption';
    cap.textContent = caption;
    wrap.appendChild(cap);

    const h = document.createElement('h3');
    h.className = 's8-card-headline';
    h.textContent = headline;
    wrap.appendChild(h);

    const p = document.createElement('p');
    p.className = 's8-card-body';
    p.innerHTML = `<em>${body}</em>`;
    wrap.appendChild(p);

    return { root: wrap, canvasHost };
  }

  // ---- Eigenvalue spectrum mini chart (tiny SVG bar chart) -----------------
  function drawEigenvalSpectrum(host, vals) {
    const W = 160, H = 160;
    const margin = { top: 14, right: 8, bottom: 22, left: 16 };
    const innerW = W - margin.left - margin.right;
    const innerH = H - margin.top - margin.bottom;

    const svg = d3.select(host).append('svg')
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .attr('class', 's8-spectrum-svg');

    // Frame the SVG so it sits inside the same panel chrome as the canvases.
    svg.append('rect')
      .attr('x', 0).attr('y', 0).attr('width', W).attr('height', H)
      .attr('fill', 'var(--image-bg)')
      .attr('stroke', 'var(--image-frame)')
      .attr('stroke-width', 1)
      .attr('rx', 4);

    const g = svg.append('g').attr('transform', `translate(${margin.left}, ${margin.top})`);

    const labels = vals.map((_, i) => `λ${i + 1}`);
    const x = d3.scaleBand().domain(labels).range([0, innerW]).padding(0.28);
    const yMax = Math.max(...vals, 1);
    const y = d3.scaleLinear().domain([0, yMax]).range([innerH, 0]).nice();

    // Bars
    g.append('g').selectAll('rect').data(vals).enter()
      .append('rect')
      .attr('class', 'cluster-1')
      .attr('x', (_, i) => x(labels[i]))
      .attr('y', d => y(d))
      .attr('width', x.bandwidth())
      .attr('height', d => Math.max(0, innerH - y(d)));

    // Tick labels (just λ1, λ2, λ3 below)
    g.append('g').selectAll('text').data(labels).enter()
      .append('text')
      .attr('class', 's8-spectrum-tick')
      .attr('x', d => x(d) + x.bandwidth() / 2)
      .attr('y', innerH + 14)
      .attr('text-anchor', 'middle')
      .text(d => d);

    // Numeric value above each bar
    g.append('g').selectAll('text.val').data(vals).enter()
      .append('text')
      .attr('class', 's8-spectrum-val')
      .attr('x', (_, i) => x(labels[i]) + x.bandwidth() / 2)
      .attr('y', d => Math.max(10, y(d) - 4))
      .attr('text-anchor', 'middle')
      .text(d => d < 0.05 ? '≈0' : d.toFixed(1));

    // Baseline
    g.append('line')
      .attr('x1', 0).attr('x2', innerW)
      .attr('y1', innerH).attr('y2', innerH)
      .attr('stroke', 'var(--rule)');
  }

  // ---- Theme reactivity (re-render eigen-image bitmaps) --------------------
  function onThemeChange() {
    ImageCanvas.render(c1Canvas, indep.eigenvecs[0]);
    ImageCanvas.render(c3Canvas, corrSnap.eigenvecs[0], { signed: true });
  }
  window.addEventListener('theme-change', onThemeChange);

  return {
    onEnter() {},
    onLeave() {},
    onNextKey() { return false; },
    onPrevKey() { return false; },
  };
};
