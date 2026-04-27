// forest scenes — gallery (sub: 'gallery') and forest vote (sub: 'vote').
// Scene 5: 4×4 grid of small-multiple trees, each on its own bootstrap.
// Scene 6: probability surface from B trees in {1,4,16,64,200}, slider-driven.

window.SCENES.forest = (function () {
  // Per-enter state (so exit can clean up).
  let state = null;

  function clear(ctx) {
    d3.select(ctx.svg).selectAll('*').remove();
    ctx.overlay.innerHTML = '';
    ctx.controls.innerHTML = '';
    ctx.readout.innerHTML = '';
  }

  function svgSize(ctx) {
    const r = ctx.svg.getBoundingClientRect();
    return { w: Math.max(100, r.width), h: Math.max(100, r.height) };
  }

  // ───── Scene 5: gallery ───────────────────────────────────────────────
  function renderGallery(ctx) {
    const { w, h } = svgSize(ctx);
    const svg = d3.select(ctx.svg);

    const grid = DATA.grid;
    const points = DATA.dataset.points;
    const trees = DATA.forestGallery.trees;
    const boundaries = DATA.forestGallery.treeBoundaries;
    const N = Math.min(16, trees.length, boundaries.length);

    const gutter = 8;
    const cellW = (w - 5 * gutter) / 4;
    const cellH = (h - 5 * gutter) / 4;

    const root = svg.append('g').attr('class', 'forest-gallery-root');

    // Build 16 cells
    const cellsData = d3.range(N).map(k => {
      const col = k % 4;
      const row = Math.floor(k / 4);
      const x = gutter + col * (cellW + gutter);
      const y = gutter + row * (cellH + gutter);
      return { k, x, y, w: cellW, h: cellH };
    });

    const cellG = root.selectAll('g.gallery-cell')
      .data(cellsData)
      .enter().append('g')
      .attr('class', 'gallery-cell')
      .attr('transform', d => `translate(${d.x},${d.y})`);

    // For each cell, build a tiny moons frame.
    cellG.each(function (d) {
      const g = d3.select(this);

      // Border rect.
      g.append('rect')
        .attr('class', 'gallery-cell-border')
        .attr('x', 0).attr('y', 0)
        .attr('width', d.w).attr('height', d.h);

      // Mini scales — small inner pad so points don't kiss the border.
      const padX = 4, padY = 4;
      const sx = d3.scaleLinear().domain([grid.xMin, grid.xMax]).range([padX, d.w - padX]);
      const sy = d3.scaleLinear().domain([grid.yMin, grid.yMax]).range([d.h - padY, padY]);

      // Region cells from this tree's boundary.
      const cellsG = g.append('g').attr('class', 'gallery-region');
      const flat = RF.flatten2D(boundaries[d.k]);
      RF.renderGridCells(cellsG, flat, grid, sx, sy);

      // Points.
      const ptsG = g.append('g').attr('class', 'gallery-points');
      ptsG.selectAll('circle')
        .data(points)
        .enter().append('circle')
        .attr('class', p => 'point ' + (p.label === 0 ? 'cluster-1' : 'cluster-2'))
        .attr('cx', p => sx(p.x))
        .attr('cy', p => sy(p.y))
        .attr('r', 1.5);

      // Label "tree N".
      g.append('text')
        .attr('class', 'tree-label')
        .attr('x', 6).attr('y', 12)
        .text(`tree ${d.k + 1}`);

      // Hover hit area (transparent, on top).
      g.append('rect')
        .attr('class', 'gallery-cell-hit')
        .attr('x', 0).attr('y', 0)
        .attr('width', d.w).attr('height', d.h)
        .on('mouseover', function () {
          g.classed('hover', true);
          g.raise();
          renderGalleryReadout(ctx, d.k + 1);
        })
        .on('mouseout', function () {
          g.classed('hover', false);
          renderGalleryReadout(ctx, null);
        });
    });

    renderGalleryReadout(ctx, null);

    // Theme reactivity — CSS classes do the work, but a small redraw on
    // theme-change keeps the screenshot stable if any computed colour leaks.
    const onTheme = () => { /* CSS handles colors */ };
    window.addEventListener('theme-change', onTheme);

    state = {
      sub: 'gallery',
      onTheme,
      cleanup() { window.removeEventListener('theme-change', onTheme); },
    };
  }

  function renderGalleryReadout(ctx, hoveredId) {
    const total = 16;
    ctx.readout.innerHTML = `
      <div class="readout-cell">
        <div class="readout-label">trees shown</div>
        <div class="readout-value">${total}</div>
      </div>
      <div class="readout-cell">
        <div class="readout-label">bootstraps</div>
        <div class="readout-value">${total}</div>
      </div>
      <div class="readout-cell">
        <div class="readout-label">viewing</div>
        <div class="readout-value">${hoveredId ? 'tree ' + hoveredId : '—'}</div>
      </div>
    `;
  }

  // ───── Scene 6: vote ──────────────────────────────────────────────────

  // Heuristic: count grid cells where at least one 4-neighbour is on the
  // opposite side of the 0.5 boundary. Lower = smoother.
  function boundarySmoothness(probGrid, grid) {
    const nx = grid.nx, ny = grid.ny;
    let count = 0;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const p = probGrid[j * nx + i];
        const pSide = p >= 0.5 ? 1 : 0;
        // Right neighbour.
        if (i + 1 < nx) {
          const q = probGrid[j * nx + (i + 1)];
          const qSide = q >= 0.5 ? 1 : 0;
          if (qSide !== pSide) { count++; continue; }
        }
        // Down neighbour.
        if (j + 1 < ny) {
          const q = probGrid[(j + 1) * nx + i];
          const qSide = q >= 0.5 ? 1 : 0;
          if (qSide !== pSide) { count++; continue; }
        }
      }
    }
    return count;
  }

  function meanProb(probGrid) {
    let s = 0;
    for (let i = 0; i < probGrid.length; i++) s += probGrid[i];
    return s / probGrid.length;
  }

  function renderVote(ctx) {
    const { w, h } = svgSize(ctx);
    const svg = d3.select(ctx.svg);

    const grid = DATA.grid;
    const points = DATA.dataset.points;
    const ckpts = DATA.probSurfaceCheckpoints;
    const Bvals = [1, 4, 16, 64, 200];

    const padX = 24, padY = 20;
    const scaleX = d3.scaleLinear().domain([grid.xMin, grid.xMax]).range([padX, w - padX]);
    const scaleY = d3.scaleLinear().domain([grid.yMin, grid.yMax]).range([h - padY, padY]);

    const root = svg.append('g').attr('class', 'forest-vote-root');

    // Probability surface group.
    const probG = root.append('g').attr('class', 'forest-prob');

    // Points group on top.
    const ptsG = root.append('g').attr('class', 'forest-points');
    ptsG.selectAll('circle')
      .data(points)
      .enter().append('circle')
      .attr('class', p => 'point ' + (p.label === 0 ? 'cluster-1' : 'cluster-2'))
      .attr('cx', p => scaleX(p.x))
      .attr('cy', p => scaleY(p.y))
      .attr('r', 3);

    // Pre-compute flat probability grids per checkpoint.
    const flats = {};
    Bvals.forEach(b => { flats[b] = RF.flatten2D(ckpts[String(b)]); });

    // Slider control.
    const initialIdx = Bvals.length - 1; // start at B=200 — the smooth endpoint.
    ctx.controls.innerHTML = `
      <div class="controls-row">
        <label for="rf-B">trees in forest</label>
        <input id="rf-B" type="range" min="0" max="${Bvals.length - 1}" step="1" value="${initialIdx}" data-rf-B="1">
        <span class="value" id="rf-B-val">${Bvals[initialIdx]}</span>
      </div>
    `;
    const slider = ctx.controls.querySelector('#rf-B');
    const valueLabel = ctx.controls.querySelector('#rf-B-val');

    function draw(B) {
      const flat = flats[B];
      RF.renderProbCells(probG, flat, grid, scaleX, scaleY);
      // 200ms crossfade: re-bind fill-opacity via transition.
      probG.selectAll('rect.prob-cell')
        .transition().duration(200)
        .attr('fill-opacity', function () {
          // The class set by renderProbCells already sets region-1/region-2.
          // We re-apply opacity directly from data via the existing data binding.
          const d = d3.select(this).datum();
          return Math.abs(d.p - 0.5) * 0.5 + 0.05;
        });

      const mp = meanProb(flat);
      const sm = boundarySmoothness(flat, grid);
      ctx.readout.innerHTML = `
        <div class="readout-cell">
          <div class="readout-label">B trees</div>
          <div class="readout-value">${B}</div>
        </div>
        <div class="readout-cell">
          <div class="readout-label">mean p(class 1)</div>
          <div class="readout-value">${mp.toFixed(3)}</div>
        </div>
        <div class="readout-cell">
          <div class="readout-label">boundary edges</div>
          <div class="readout-value">${sm}</div>
        </div>
      `;
      valueLabel.textContent = B;
    }

    function onSlide() {
      const idx = +slider.value;
      const B = Bvals[idx];
      draw(B);
    }
    slider.addEventListener('input', onSlide);

    // Initial render.
    draw(Bvals[initialIdx]);

    const onTheme = () => { /* CSS handles colors; cells re-tinted via class */ };
    window.addEventListener('theme-change', onTheme);

    state = {
      sub: 'vote',
      onTheme,
      cleanup() {
        slider.removeEventListener('input', onSlide);
        window.removeEventListener('theme-change', onTheme);
        // Cancel any in-flight transitions.
        probG.selectAll('rect.prob-cell').interrupt();
      },
    };
  }

  // ───── lifecycle ──────────────────────────────────────────────────────

  function enter(ctx, { sub, idx }) {
    if (state && state.cleanup) state.cleanup();
    state = null;
    clear(ctx);

    if (sub === 'gallery') renderGallery(ctx);
    else if (sub === 'vote') renderVote(ctx);
    else {
      ctx.readout.innerHTML = `<div class="scene-stub">forest / ${sub} (scene ${idx + 1})</div>`;
    }
  }

  function exit(ctx) {
    if (state && state.cleanup) state.cleanup();
    state = null;
    d3.select(ctx.svg).selectAll('*').interrupt();
  }

  return { enter, exit };
})();
