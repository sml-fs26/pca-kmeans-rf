/* Scene 1 — Setup
 * Frame the input: k-means takes (1) data, (2) a chosen K.
 * Left: scatter of currently-selected dataset (neutral, no clusters yet).
 * Right: dataset cards + K selector + footnote. */

window.scenes.scene1 = function (root) {
  // ---- Persistent scene state (closure) ----
  const DATASET_KEYS = ['gaussianBlobs', 'smiley', 'uniform', 'twoMoons'];
  const K_OPTIONS = [2, 3, 4, 5, 6];
  let selectedKey = 'gaussianBlobs';
  let selectedK = window.DATA.datasets.gaussianBlobs.meta.kHint;

  // ---- Build static DOM ----
  root.innerHTML = '';

  const layout = document.createElement('div');
  layout.className = 'scene-layout right-text';
  root.appendChild(layout);

  // Left: viz card
  const vizCol = document.createElement('div');
  vizCol.style.display = 'flex';
  vizCol.style.flexDirection = 'column';
  vizCol.style.minHeight = '0';
  layout.appendChild(vizCol);

  const vizWrap = document.createElement('div');
  vizWrap.className = 'viz-wrap';
  vizWrap.style.flex = '1';
  vizCol.appendChild(vizWrap);

  const caption = document.createElement('div');
  caption.className = 'viz-caption';
  caption.innerHTML = `<span class="vc-name"></span><span class="vc-k"></span>`;
  vizWrap.appendChild(caption);

  const svg = d3.select(vizWrap)
    .append('svg')
    .attr('viewBox', '0 0 100 100')
    .attr('preserveAspectRatio', 'xMidYMid meet');

  const gPoints = svg.append('g').attr('class', 'g-points');

  // Right: text column
  const textCol = document.createElement('div');
  textCol.className = 'text-col';
  textCol.style.maxWidth = '60ch';
  layout.appendChild(textCol);

  const h2 = document.createElement('h2');
  h2.textContent = 'We start with two things.';
  textCol.appendChild(h2);

  const intro = document.createElement('p');
  intro.className = 'scene1-intro';
  intro.innerHTML = `k-means takes a set of points and a chosen number of clusters K. That's it. The algorithm doesn't know what the clusters mean.`;
  textCol.appendChild(intro);

  const dataTitle = document.createElement('div');
  dataTitle.className = 'scene1-section-title';
  dataTitle.innerHTML = '<strong>The data.</strong>';
  textCol.appendChild(dataTitle);

  const cardRow = document.createElement('div');
  cardRow.className = 'dataset-card-row';
  textCol.appendChild(cardRow);

  const cardEls = {};
  DATASET_KEYS.forEach(key => {
    const ds = window.DATA.datasets[key];
    if (!ds) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dataset-card';
    btn.setAttribute('data-key', key);
    btn.innerHTML = `
      <span class="dc-name"></span>
      <span class="dc-meta"></span>
      <span class="dc-desc"></span>`;
    btn.querySelector('.dc-name').textContent = ds.meta.name;
    btn.querySelector('.dc-meta').textContent = `${ds.meta.n} points`;
    btn.querySelector('.dc-desc').textContent = ds.meta.description;
    btn.addEventListener('click', () => selectDataset(key));
    cardRow.appendChild(btn);
    cardEls[key] = btn;
  });

  const kTitle = document.createElement('div');
  kTitle.className = 'scene1-section-title';
  kTitle.innerHTML = '<strong>The number of clusters, K.</strong>';
  textCol.appendChild(kTitle);

  const kRow = document.createElement('div');
  kRow.className = 'k-row';
  textCol.appendChild(kRow);

  const kBtnEls = {};
  K_OPTIONS.forEach(k => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'k-btn';
    b.textContent = `K = ${k}`;
    b.addEventListener('click', () => selectK(k));
    kRow.appendChild(b);
    kBtnEls[k] = b;
  });

  const footnote = document.createElement('p');
  footnote.className = 'scene1-footnote';
  footnote.textContent =
    "For the next few scenes, we'll work on a small Gaussian-blobs example with K = 3 to keep the math readable. You can come back here later.";
  textCol.appendChild(footnote);

  // ---- State application ----

  function selectDataset(key) {
    if (!window.DATA.datasets[key]) return;
    selectedKey = key;
    // Reset K to this dataset's kHint.
    selectedK = window.DATA.datasets[key].meta.kHint;
    renderCards();
    renderK();
    renderViz(true);
    renderCaption();
  }

  function selectK(k) {
    selectedK = k;
    renderK();
    renderCaption();
  }

  function renderCards() {
    Object.entries(cardEls).forEach(([key, el]) => {
      el.classList.toggle('active', key === selectedKey);
      el.setAttribute('aria-pressed', key === selectedKey ? 'true' : 'false');
    });
  }

  function renderK() {
    Object.entries(kBtnEls).forEach(([k, el]) => {
      el.classList.toggle('active', Number(k) === selectedK);
      el.setAttribute('aria-pressed', Number(k) === selectedK ? 'true' : 'false');
    });
  }

  function renderCaption() {
    const ds = window.DATA.datasets[selectedKey];
    if (!ds) return;
    caption.querySelector('.vc-name').textContent = ds.meta.name;
    caption.querySelector('.vc-k').textContent = `K = ${selectedK}`;
  }

  function renderViz(animate) {
    const ds = window.DATA.datasets[selectedKey];
    if (!ds) return;

    const sel = gPoints.selectAll('circle.point-neutral')
      .data(ds.points, (_, i) => i);

    if (animate) {
      // Fade out existing, then bind new.
      const exiting = sel.exit();
      exiting
        .transition()
        .duration(280)
        .style('opacity', 0)
        .remove();

      // For currently-bound nodes, fade them out and replace positions.
      sel
        .transition()
        .duration(280)
        .style('opacity', 0)
        .on('end', function () { d3.select(this).remove(); });

      // After fade-out, draw a fresh selection.
      setTimeout(() => {
        gPoints.selectAll('circle.point-neutral').remove();
        const incoming = gPoints.selectAll('circle.point-neutral')
          .data(ds.points)
          .enter()
          .append('circle')
          .attr('class', 'point point-neutral')
          .attr('r', 1.4)
          .attr('cx', p => p.x)
          .attr('cy', p => p.y)
          .style('opacity', 0);
        incoming
          .transition()
          .duration(380)
          .style('opacity', 1);
      }, 300);
    } else {
      sel.exit().remove();
      const enter = sel.enter()
        .append('circle')
        .attr('class', 'point point-neutral')
        .attr('r', 1.4)
        .style('opacity', 0);
      enter.merge(sel)
        .attr('cx', p => p.x)
        .attr('cy', p => p.y)
        .style('opacity', 1);
    }
  }

  function fullRender() {
    renderCards();
    renderK();
    renderCaption();
    renderViz(false);
  }

  // Initial paint.
  fullRender();

  return {
    onEnter() {
      // Restore last-selected (already in closure) and re-render without animation.
      fullRender();
    },
    onLeave() {},
    onNextKey() { return false; },
    onPrevKey() { return false; },
  };
};
