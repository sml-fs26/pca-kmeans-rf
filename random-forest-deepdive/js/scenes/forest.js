// VIZ: forest — owns scenes 5 (grove), 6 (bSlider), 7 (voting).
// The central "what does the forest do" arc.
//
// Each sub renders inside ctx.svg, ctx.overlay, ctx.controls, ctx.readout.
// We dynamically inject a <canvas class="forest-canvas"> as a sibling of #viz
// inside .viz-stage for the bitmap backdrops, and remove it on exit.

(function () {

  const NCLASSES = 3;
  const CLASS_NAMES = window.DATA.meta.classNames;
  const SCATTER = window.DATA.scatter;
  const POINTS = window.DATA.points;
  const TREES = window.DATA.forest2D.trees;
  const BLOW = window.DATA.forest2D.boundariesLow;       // [100][3600] int8
  const BHIGH = window.DATA.forest2D.boundaryHigh;       // {classGrid:int8[40000], probGrid:f[40000]}
  const GRID_LO = window.DATA.meta.boundaryGridResLow;   // 60
  const GRID_HI = window.DATA.meta.boundaryGridResHigh;  // 200
  const ACC = window.DATA.accuracyCurve;                 // [{B,testAccuracy,oobError}]

  // Cross-scene state for scene 7's query point persistence.
  window.rfShared = window.rfShared || { queryXY: null };

  // ------------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------------

  // Resolve cluster color from CSS theme variables. Re-read on each call
  // so theme toggles produce fresh canvas paints when re-entering a scene.
  function classRGB(idx) {
    return Theme.readVar(`--c${idx + 1}`);
  }

  // Parse "#rrggbb" or "rgb(r,g,b)" → {r,g,b}.
  function parseColor(s) {
    s = (s || '').trim();
    if (s.startsWith('#')) {
      let h = s.slice(1);
      if (h.length === 3) h = h.split('').map(c => c + c).join('');
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
      };
    }
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const parts = m[1].split(',').map(v => parseFloat(v.trim()));
      return { r: parts[0] | 0, g: parts[1] | 0, b: parts[2] | 0 };
    }
    return { r: 128, g: 128, b: 128 };
  }

  function getClassPalette() {
    return [0, 1, 2].map(i => parseColor(classRGB(i)));
  }

  function ensureCanvas(stage) {
    let canvas = stage.querySelector('canvas.forest-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.className = 'forest-canvas';
      // Insert before the SVG so SVG sits on top.
      stage.insertBefore(canvas, stage.firstChild);
    }
    // Match physical pixel size to css size for crispness.
    const rect = stage.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { canvas, ctx, w: rect.width, h: rect.height };
  }

  function removeCanvas(stage) {
    const c = stage.querySelector('canvas.forest-canvas');
    if (c) c.remove();
  }

  // Plot scales: data → SVG/canvas pixel coords.
  function makeScales(w, h, padding) {
    const pad = padding || { l: 44, r: 16, t: 16, b: 36 };
    const x = d3.scaleLinear().domain([SCATTER.xMin, SCATTER.xMax]).range([pad.l, w - pad.r]);
    const y = d3.scaleLinear().domain([SCATTER.yMin, SCATTER.yMax]).range([h - pad.b, pad.t]);
    return { x, y, pad };
  }

  // Render a flat int8 majority-class grid (length gridW*gridH) as semi-transparent
  // colored regions onto a destination ImageData rectangle. probSource: optional
  // float array same length used for opacity (0..1); falls back to a constant alpha.
  function rasterGridToImageData(grid, gridW, gridH, dstW, dstH, palette, probSource, alphaScale) {
    dstW = Math.max(1, Math.floor(dstW));
    dstH = Math.max(1, Math.floor(dstH));
    const img = new Uint8ClampedArray(dstW * dstH * 4);
    // Map dst pixel -> grid cell with nearest neighbor (cheap & sharp enough).
    for (let py = 0; py < dstH; py++) {
      const gy = Math.min(gridH - 1, Math.floor(py / dstH * gridH));
      for (let px = 0; px < dstW; px++) {
        const gx = Math.min(gridW - 1, Math.floor(px / dstW * gridW));
        const cell = grid[gy * gridW + gx];
        const c = palette[cell];
        let alpha;
        if (probSource) {
          const p = probSource[gy * gridW + gx];
          // Stretch [1/3, 1] to a pleasing visual range.
          const t = Math.max(0, Math.min(1, (p - 0.34) / (1 - 0.34)));
          alpha = (alphaScale || 1) * (0.10 + 0.55 * t);
        } else {
          alpha = (alphaScale || 1) * 0.20;
        }
        const k = (py * dstW + px) * 4;
        img[k] = c.r;
        img[k + 1] = c.g;
        img[k + 2] = c.b;
        img[k + 3] = Math.round(alpha * 255);
      }
    }
    return new ImageData(img, dstW, dstH);
  }

  // Draw a rasterized grid into an existing canvas region (rect-clipped).
  function drawGridIntoCanvas(ctx, x0, y0, w, h, grid, gridW, gridH, palette, probSource, alphaScale) {
    const wi = Math.max(1, Math.floor(w));
    const hi = Math.max(1, Math.floor(h));
    if (wi < 1 || hi < 1) return;
    const off = document.createElement('canvas');
    off.width = wi;
    off.height = hi;
    const offCtx = off.getContext('2d');
    const img = rasterGridToImageData(grid, gridW, gridH, wi, hi, palette, probSource, alphaScale);
    offCtx.putImageData(img, 0, 0);
    ctx.drawImage(off, x0, y0, w, h);
  }

  // Draw the 333 training points onto an SVG <g>.
  function drawScatterPoints(g, scales) {
    g.selectAll('circle.point').remove();
    g.selectAll('circle.point')
      .data(POINTS)
      .enter().append('circle')
      .attr('class', d => `point cluster-${d.classIdx + 1}`)
      .attr('cx', d => scales.x(d.x))
      .attr('cy', d => scales.y(d.y))
      .attr('r', 2.6)
      .attr('opacity', 0.92);
  }

  function drawAxes(g, scales, w, h) {
    g.selectAll('*').remove();
    const xAxis = d3.axisBottom(scales.x).ticks(6).tickSizeOuter(0);
    const yAxis = d3.axisLeft(scales.y).ticks(6).tickSizeOuter(0);
    g.append('g')
      .attr('class', 'axis')
      .attr('transform', `translate(0, ${h - scales.pad.b})`)
      .call(xAxis);
    g.append('g')
      .attr('class', 'axis')
      .attr('transform', `translate(${scales.pad.l}, 0)`)
      .call(yAxis);
    g.append('text')
      .attr('class', 'forest-axis-label')
      .attr('x', (scales.pad.l + (w - scales.pad.r)) / 2)
      .attr('y', h - 6)
      .attr('text-anchor', 'middle')
      .text(SCATTER.xLabel);
    g.append('text')
      .attr('class', 'forest-axis-label')
      .attr('transform', `translate(12, ${(scales.pad.t + (h - scales.pad.b)) / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .text(SCATTER.yLabel);
  }

  function clearAll(ctx) {
    d3.select(ctx.svg).selectAll('*').remove();
    ctx.overlay.innerHTML = '';
    ctx.readout.innerHTML = '';
    ctx.controls.innerHTML = '';
    ctx.readout.classList.remove('forest-readout-flex');
    removeCanvas(ctx.svg.parentElement);
    if (window.__forestRAF) {
      cancelAnimationFrame(window.__forestRAF);
      window.__forestRAF = null;
    }
    if (window.__forestTimers) {
      window.__forestTimers.forEach(t => {
        if (typeof t === 'number') { clearTimeout(t); clearInterval(t); }
        else if (t && t.interval) clearInterval(t.interval);
      });
      window.__forestTimers = [];
    }
  }

  function trackTimer(t) {
    window.__forestTimers = window.__forestTimers || [];
    window.__forestTimers.push(t);
    return t;
  }

  // ------------------------------------------------------------------------
  // Tree stats (depth, leaves) from the serialized nodes.
  // ------------------------------------------------------------------------
  function treeStats(tree) {
    let depth = 0;
    let leaves = 0;
    for (const n of tree.nodes) {
      if (n.depth > depth) depth = n.depth;
      if (n.isLeaf) leaves++;
    }
    return { depth, leaves };
  }

  // ------------------------------------------------------------------------
  // Scene 5 — grove
  // ------------------------------------------------------------------------

  function renderGrove(ctx) {
    clearAll(ctx);
    const stage = ctx.svg.parentElement;
    const rect = stage.getBoundingClientRect();
    const W = rect.width, H = rect.height;

    // Layout: two panels side by side. Left = 10×10 grid of thumbnails;
    // Right = scatter with axes. The thumbnail grid is square; size it to fill
    // either the available width-budget or the height, whichever is smaller.
    const gap = 18;
    const titlePad = 22;          // reserved space for caption above the grid
    const gridSide = Math.min(W * 0.5, H - titlePad - 12);
    const gridX0 = 8;
    const gridY0 = titlePad;
    const scatterX0 = gridX0 + gridSide + gap;
    const scatterY0 = 0;
    const scatterW = Math.max(160, W - scatterX0 - 6);
    const scatterH = H;

    // Inject canvas backdrop sized to full stage.
    const { canvas, ctx: cctx, w: stageW, h: stageH } = ensureCanvas(stage);
    cctx.clearRect(0, 0, stageW, stageH);
    const palette = getClassPalette();

    // ---- Draw all 100 thumbnails into the canvas ----
    const tilesPerSide = 10;
    const tileSize = gridSide / tilesPerSide;
    const innerPad = 2;
    for (let i = 0; i < 100; i++) {
      const tr = i % tilesPerSide;
      const tc = Math.floor(i / tilesPerSide);
      // Lay out left-to-right, top-to-bottom.
      const tx = gridX0 + tr * tileSize + innerPad;
      const ty = gridY0 + tc * tileSize + innerPad;
      const tw = tileSize - 2 * innerPad;
      const th = tileSize - 2 * innerPad;
      // No prob source for thumbs; use constant alpha. The class colors are saturated enough.
      drawGridIntoCanvas(cctx, tx, ty, tw, th, BLOW[i], GRID_LO, GRID_LO, palette, null, 4.0);
    }

    // ---- SVG: thumbnail frames (interactive), axes, scatter, hover overlay ----
    const svg = d3.select(ctx.svg);
    svg.attr('viewBox', `0 0 ${W} ${H}`).attr('preserveAspectRatio', 'none');

    // Grid caption.
    svg.append('text')
      .attr('class', 'forest-axis-label')
      .attr('x', gridX0 + gridSide / 2)
      .attr('y', titlePad - 8)
      .attr('text-anchor', 'middle')
      .text('100 trees, each its own bootstrap');

    // Group for hover overlay (drawn between scatter background and points).
    const gOverlayCanvasMount = svg.append('g').attr('class', 'g-overlay-img');
    // We'll render the hovered tree's full-plot boundary as an SVG <image> from a per-tree dataURL cache.
    const hoverCache = new Array(100);

    // Scatter (right panel).
    const scales = makeScales(scatterW, scatterH, { l: 50, r: 18, t: 16, b: 40 });
    const gScatter = svg.append('g').attr('transform', `translate(${scatterX0}, ${scatterY0})`);
    const gAxes = gScatter.append('g').attr('class', 'g-axes');
    drawAxes(gAxes, scales, scatterW, scatterH);
    const gOverlayHoverHost = gScatter.append('g').attr('class', 'g-hover-host');
    const gPoints = gScatter.append('g').attr('class', 'g-points');
    drawScatterPoints(gPoints, scales);

    // Per-tree boundary cached as a dataURL for fast SVG <image> overlay.
    function getHoverImage(i) {
      if (hoverCache[i]) return hoverCache[i];
      // Render the tree's grid into an offscreen canvas at the scatter plot's interior size.
      const innerW = Math.max(2, Math.floor(scales.x(SCATTER.xMax) - scales.x(SCATTER.xMin)));
      const innerH = Math.max(2, Math.floor(scales.y(SCATTER.yMin) - scales.y(SCATTER.yMax)));
      const off = document.createElement('canvas');
      off.width = innerW;
      off.height = innerH;
      const octx = off.getContext('2d');
      const img = rasterGridToImageData(BLOW[i], GRID_LO, GRID_LO, innerW, innerH, palette, null, 0.85);
      octx.putImageData(img, 0, 0);
      hoverCache[i] = {
        href: off.toDataURL(),
        x: scales.x(SCATTER.xMin),
        y: scales.y(SCATTER.yMax),
        w: innerW,
        h: innerH,
      };
      return hoverCache[i];
    }

    // Frames + interactive areas for each thumbnail.
    const gFrames = svg.append('g').attr('class', 'g-frames');
    const frameData = d3.range(100).map(i => {
      const tr = i % tilesPerSide;
      const tc = Math.floor(i / tilesPerSide);
      const tx = gridX0 + tr * tileSize + innerPad;
      const ty = gridY0 + tc * tileSize + innerPad;
      const tw = tileSize - 2 * innerPad;
      const th = tileSize - 2 * innerPad;
      return { i, tx, ty, tw, th };
    });
    // Drop-shadows behind each tile (active on hover).
    gFrames.selectAll('rect.grove-shadow')
      .data(frameData).enter().append('rect')
      .attr('class', 'grove-shadow')
      .attr('x', d => d.tx + 2).attr('y', d => d.ty + 3)
      .attr('width', d => d.tw).attr('height', d => d.th)
      .attr('rx', 2);
    gFrames.selectAll('rect.grove-frame')
      .data(frameData).enter().append('rect')
      .attr('class', 'grove-frame')
      .attr('x', d => d.tx).attr('y', d => d.ty)
      .attr('width', d => d.tw).attr('height', d => d.th)
      .attr('rx', 2)
      .on('mouseenter', function (event, d) {
        d3.select(this).classed('active', true);
        gFrames.selectAll('rect.grove-shadow').filter(s => s.i === d.i).classed('active', true);
        const hi = getHoverImage(d.i);
        gOverlayHoverHost.selectAll('image').remove();
        gOverlayHoverHost.append('image')
          .attr('href', hi.href)
          .attr('x', hi.x)
          .attr('y', hi.y)
          .attr('width', hi.w)
          .attr('height', hi.h)
          .attr('preserveAspectRatio', 'none')
          .attr('opacity', 0.55);
        const stats = treeStats(TREES[d.i]);
        renderGroveReadout(ctx, d.i, stats);
      })
      .on('mouseleave', function (event, d) {
        d3.select(this).classed('active', false);
        gFrames.selectAll('rect.grove-shadow').filter(s => s.i === d.i).classed('active', false);
        gOverlayHoverHost.selectAll('image').remove();
        renderGroveReadout(ctx, null, null);
      });

    renderGroveReadout(ctx, null, null);
  }

  function renderGroveReadout(ctx, hoveredIdx, stats) {
    ctx.readout.innerHTML = '';
    ctx.readout.classList.add('forest-readout-flex');
    const wrap = document.createElement('div');
    wrap.className = 'grove-readout';
    if (hoveredIdx == null) {
      wrap.innerHTML = `
        <span class="grove-title">Hover any tree to see its decision boundary alone.</span>
      `;
    } else {
      wrap.innerHTML = `
        <span class="grove-stat"><span class="label">Tree</span>#${hoveredIdx}</span>
        <span class="grove-stat"><span class="label">Depth</span>${stats.depth}</span>
        <span class="grove-stat"><span class="label">Leaves</span>${stats.leaves}</span>
      `;
    }
    ctx.readout.appendChild(wrap);
  }

  // ------------------------------------------------------------------------
  // Scene 6 — bSlider
  // ------------------------------------------------------------------------

  // Aggregate the first B per-tree boundariesLow grids into one (majority + share).
  // Returns { majority: int8[3600], share: float[3600] }.
  // Cached: aggregator caches an incremental "votes" tensor [3600 × 3] so updating
  // B is O(3600) instead of O(B × 3600).
  function makeBoundaryAggregator() {
    const len = GRID_LO * GRID_LO;
    const votes = new Int16Array(len * NCLASSES);
    let appliedB = 0;
    function reset() {
      votes.fill(0);
      appliedB = 0;
    }
    function setB(B) {
      B = Math.max(0, Math.min(100, B | 0));
      if (B === appliedB) return;
      if (B < appliedB) {
        // Subtract trees down to new B.
        for (let i = appliedB - 1; i >= B; i--) {
          const g = BLOW[i];
          for (let k = 0; k < len; k++) votes[k * NCLASSES + g[k]]--;
        }
      } else {
        for (let i = appliedB; i < B; i++) {
          const g = BLOW[i];
          for (let k = 0; k < len; k++) votes[k * NCLASSES + g[k]]++;
        }
      }
      appliedB = B;
    }
    function snapshot() {
      const majority = new Int8Array(len);
      const share = new Float32Array(len);
      for (let k = 0; k < len; k++) {
        const o = k * NCLASSES;
        let best = 0, bestV = votes[o];
        if (votes[o + 1] > bestV) { best = 1; bestV = votes[o + 1]; }
        if (votes[o + 2] > bestV) { best = 2; bestV = votes[o + 2]; }
        majority[k] = best;
        const total = votes[o] + votes[o + 1] + votes[o + 2];
        share[k] = total > 0 ? bestV / total : 1 / 3;
      }
      return { majority, share };
    }
    return { reset, setB, snapshot, getB: () => appliedB };
  }

  function renderBSlider(ctx) {
    clearAll(ctx);
    const stage = ctx.svg.parentElement;
    const rect = stage.getBoundingClientRect();
    const W = rect.width, H = rect.height;

    // Layout: two panels side by side. Left = scatter w/ averaged boundary; Right = accuracy curve.
    const gap = 16;
    const leftW = Math.floor(W * 0.58);
    const rightW = W - leftW - gap;
    const leftX0 = 0;
    const rightX0 = leftW + gap;

    const { canvas, ctx: cctx, w: stageW, h: stageH } = ensureCanvas(stage);
    cctx.clearRect(0, 0, stageW, stageH);
    const palette = getClassPalette();

    const svg = d3.select(ctx.svg);
    svg.attr('viewBox', `0 0 ${W} ${H}`).attr('preserveAspectRatio', 'none');

    // ---- LEFT: scatter with averaged boundary ----
    const lScales = makeScales(leftW, H, { l: 50, r: 12, t: 16, b: 40 });
    const innerL = {
      x: lScales.x(SCATTER.xMin),
      y: lScales.y(SCATTER.yMax),
      w: lScales.x(SCATTER.xMax) - lScales.x(SCATTER.xMin),
      h: lScales.y(SCATTER.yMin) - lScales.y(SCATTER.yMax),
    };

    const gLeft = svg.append('g').attr('transform', `translate(${leftX0}, 0)`);
    const gAxesL = gLeft.append('g').attr('class', 'g-axes');
    drawAxes(gAxesL, lScales, leftW, H);
    const gPointsL = gLeft.append('g').attr('class', 'g-points');
    drawScatterPoints(gPointsL, lScales);

    // ---- RIGHT: accuracy curve ----
    const rPad = { l: 44, r: 16, t: 24, b: 40 };
    const xR = d3.scaleLinear().domain([1, 100]).range([rPad.l, rightW - rPad.r]);
    const accExtent = d3.extent(ACC, d => d.testAccuracy);
    const yMin = Math.max(0, Math.floor((accExtent[0] - 0.02) * 100) / 100);
    const yMax = Math.min(1, Math.ceil((accExtent[1] + 0.01) * 100) / 100);
    const yR = d3.scaleLinear().domain([yMin, yMax]).range([H - rPad.b, rPad.t]);

    const gRight = svg.append('g').attr('transform', `translate(${rightX0}, 0)`);
    gRight.append('g').attr('class', 'axis')
      .attr('transform', `translate(0, ${H - rPad.b})`)
      .call(d3.axisBottom(xR).ticks(6).tickSizeOuter(0));
    gRight.append('g').attr('class', 'axis')
      .attr('transform', `translate(${rPad.l}, 0)`)
      .call(d3.axisLeft(yR).ticks(5).tickFormat(d3.format('.0%')).tickSizeOuter(0));
    gRight.append('text')
      .attr('class', 'forest-axis-label')
      .attr('x', (rPad.l + (rightW - rPad.r)) / 2)
      .attr('y', H - 6)
      .attr('text-anchor', 'middle')
      .text('Number of trees (B)');
    gRight.append('text')
      .attr('class', 'forest-axis-label')
      .attr('transform', `translate(12, ${(rPad.t + (H - rPad.b)) / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .text('Test accuracy');

    const lineGen = d3.line()
      .x(d => xR(d.B))
      .y(d => yR(d.testAccuracy))
      .curve(d3.curveMonotoneX);

    // Faded full curve in muted color first.
    gRight.append('path')
      .datum(ACC)
      .attr('fill', 'none')
      .attr('stroke', 'var(--muted)')
      .attr('stroke-opacity', 0.35)
      .attr('stroke-width', 1.2)
      .attr('d', lineGen);
    // Saturated up-to-B curve.
    const pathSat = gRight.append('path')
      .attr('fill', 'none')
      .attr('stroke', 'var(--ink)')
      .attr('stroke-width', 2.2);
    // Vertical marker line + dot.
    const markerLine = gRight.append('line')
      .attr('y1', rPad.t).attr('y2', H - rPad.b)
      .attr('stroke', 'var(--highlight)')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '3 3');
    const markerDot = gRight.append('circle')
      .attr('r', 4.5)
      .attr('fill', 'var(--highlight)');

    // Aggregator + draw routine (paints onto canvas region of left panel).
    const agg = makeBoundaryAggregator();
    const probGridScratch = new Float32Array(GRID_LO * GRID_LO);

    function paintBoundary(B) {
      agg.setB(B);
      const { majority, share } = agg.snapshot();
      // Clear left region.
      cctx.clearRect(0, 0, leftW, H);
      drawGridIntoCanvas(
        cctx, innerL.x, innerL.y, Math.max(2, Math.floor(innerL.w)), Math.max(2, Math.floor(innerL.h)),
        majority, GRID_LO, GRID_LO, palette, share, 1.0,
      );
    }

    function paintCurve(B) {
      const slice = ACC.slice(0, B);
      pathSat.datum(slice).attr('d', lineGen);
      const cur = ACC[Math.max(0, Math.min(99, B - 1))];
      markerLine.attr('x1', xR(cur.B)).attr('x2', xR(cur.B));
      markerDot.attr('cx', xR(cur.B)).attr('cy', yR(cur.testAccuracy));
    }

    function updateReadout(B) {
      const cur = ACC[Math.max(0, Math.min(99, B - 1))];
      ctx.readout.innerHTML = '';
      ctx.readout.classList.remove('forest-readout-flex');
      const cellB = document.createElement('div');
      cellB.className = 'readout-cell';
      cellB.innerHTML = `<div class="readout-label">B (trees)</div><div class="readout-value">${B}</div>`;
      const cellAcc = document.createElement('div');
      cellAcc.className = 'readout-cell';
      cellAcc.innerHTML = `<div class="readout-label">Test accuracy</div><div class="readout-value">${(cur.testAccuracy * 100).toFixed(1)}%</div>`;
      const cellOob = document.createElement('div');
      cellOob.className = 'readout-cell';
      cellOob.innerHTML = `<div class="readout-label">OOB error</div><div class="readout-value">${(cur.oobError * 100).toFixed(1)}%</div>`;
      ctx.readout.appendChild(cellB);
      ctx.readout.appendChild(cellAcc);
      ctx.readout.appendChild(cellOob);
    }

    // Slider in ctx.controls.
    const ctrl = document.createElement('div');
    ctrl.className = 'b-slider';
    ctrl.innerHTML = `
      <label for="b-range">Trees (B)</label>
      <input id="b-range" type="range" min="1" max="100" step="1" value="1" />
      <div class="b-value" id="b-value">B = 1</div>
    `;
    ctx.controls.innerHTML = '';
    ctx.controls.appendChild(ctrl);
    const slider = ctrl.querySelector('#b-range');
    const valLabel = ctrl.querySelector('#b-value');

    let userInteracted = false;
    function setB(B, fromUser) {
      B = Math.max(1, Math.min(100, B | 0));
      slider.value = String(B);
      valLabel.textContent = `B = ${B}`;
      if (fromUser) userInteracted = true;
      paintBoundary(B);
      paintCurve(B);
      updateReadout(B);
    }
    slider.addEventListener('input', e => setB(+e.target.value, true));

    // Initial render at B=1.
    setB(1, false);

    // Auto-animate B=1 → 100 over ~3s, unless the user interrupts.
    // Use setInterval so headless Chrome's virtual-time-budget advances it
    // (requestAnimationFrame + performance.now() can stay frozen under headless).
    const startTime = Date.now();
    const dur = 3000;
    const stepMs = 30;
    const ivl = setInterval(() => {
      if (userInteracted) { clearInterval(ivl); return; }
      const elapsed = Date.now() - startTime;
      const t = Math.min(1, elapsed / dur);
      const B = 1 + Math.round(t * 99);
      setB(B, false);
      if (t >= 1) clearInterval(ivl);
    }, stepMs);
    window.__forestTimers = window.__forestTimers || [];
    window.__forestTimers.push({ unref: () => clearInterval(ivl), interval: ivl });
  }

  // ------------------------------------------------------------------------
  // Scene 7 — voting
  // ------------------------------------------------------------------------

  function renderVoting(ctx) {
    clearAll(ctx);
    const stage = ctx.svg.parentElement;
    const rect = stage.getBoundingClientRect();
    const W = rect.width, H = rect.height;

    const { canvas, ctx: cctx, w: stageW, h: stageH } = ensureCanvas(stage);
    cctx.clearRect(0, 0, stageW, stageH);
    const palette = getClassPalette();

    // Single panel: scatter with full-forest backdrop.
    const scales = makeScales(W, H, { l: 50, r: 22, t: 18, b: 40 });
    const inner = {
      x: scales.x(SCATTER.xMin),
      y: scales.y(SCATTER.yMax),
      w: scales.x(SCATTER.xMax) - scales.x(SCATTER.xMin),
      h: scales.y(SCATTER.yMin) - scales.y(SCATTER.yMax),
    };

    // Paint the high-res forest decision regions, modulated by winning-class probability.
    drawGridIntoCanvas(
      cctx, inner.x, inner.y, Math.max(2, Math.floor(inner.w)), Math.max(2, Math.floor(inner.h)),
      BHIGH.classGrid, GRID_HI, GRID_HI, palette, BHIGH.probGrid, 1.0,
    );

    const svg = d3.select(ctx.svg);
    svg.attr('viewBox', `0 0 ${W} ${H}`).attr('preserveAspectRatio', 'none');
    const gAxes = svg.append('g').attr('class', 'g-axes');
    drawAxes(gAxes, scales, W, H);
    const gPoints = svg.append('g').attr('class', 'g-points');
    drawScatterPoints(gPoints, scales);

    // Marble layer (for the entry animation).
    const gMarbles = svg.append('g').attr('class', 'g-marbles');

    // Query point at center (or restored from window.rfShared).
    const cxData = (SCATTER.xMin + SCATTER.xMax) / 2;
    const cyData = (SCATTER.yMin + SCATTER.yMax) / 2;
    const restored = window.rfShared.queryXY;
    let qx = restored ? restored[0] : cxData;
    let qy = restored ? restored[1] : cyData;
    qx = Math.max(SCATTER.xMin, Math.min(SCATTER.xMax, qx));
    qy = Math.max(SCATTER.yMin, Math.min(SCATTER.yMax, qy));

    // The query point: outer ring + inner dot + halo.
    const gQuery = svg.append('g').attr('class', 'g-query');
    const halo = gQuery.append('circle').attr('class', 'query-halo').attr('r', 14);
    const queryCircle = gQuery.append('circle').attr('class', 'query-point').attr('r', 8);
    const queryInner = gQuery.append('circle').attr('class', 'query-point-inner').attr('r', 3);

    function placeQuery() {
      const px = scales.x(qx);
      const py = scales.y(qy);
      halo.attr('cx', px).attr('cy', py);
      queryCircle.attr('cx', px).attr('cy', py);
      queryInner.attr('cx', px).attr('cy', py);
    }
    placeQuery();

    // Readout layout: predicted banner + 3 urns. We use a compound DOM in ctx.readout.
    ctx.readout.innerHTML = '';
    ctx.readout.classList.add('forest-readout-flex');
    const banner = document.createElement('div');
    banner.className = 'predicted-banner';
    banner.innerHTML = `
      <span class="label">Predicted</span>
      <span class="name" id="rf-pred-name">—</span>
      <span class="prob" id="rf-pred-prob">—</span>
    `;
    ctx.readout.appendChild(banner);

    const urns = document.createElement('div');
    urns.className = 'urns';
    for (let i = 0; i < NCLASSES; i++) {
      const urn = document.createElement('div');
      urn.className = 'urn';
      urn.dataset.idx = String(i);
      urn.innerHTML = `
        <div class="urn-head">
          <span class="species cluster-${i + 1}">${CLASS_NAMES[i]}</span>
          <span class="count" data-role="count">0</span>
        </div>
        <div class="bar-track"><div class="bar-fill cluster-${i + 1}" data-role="fill"></div></div>
        <span class="pct" data-role="pct">0%</span>
      `;
      urns.appendChild(urn);
    }
    ctx.readout.appendChild(urns);

    function updateUrnsAndBanner(votes, probs, animate) {
      const winner = votes.winner;
      const winnerName = CLASS_NAMES[winner];
      const nameSpan = banner.querySelector('#rf-pred-name');
      nameSpan.textContent = winnerName;
      nameSpan.className = `name cluster-${winner + 1}`;
      banner.querySelector('#rf-pred-prob').textContent = `P = ${(probs[winner] * 100).toFixed(0)}%`;
      const total = votes.counts.reduce((a, b) => a + b, 0) || 1;
      Array.from(urns.children).forEach((urn, i) => {
        urn.classList.toggle('winner', i === winner);
        urn.querySelector('[data-role="count"]').textContent = animate ? '0' : String(votes.counts[i]);
        urn.querySelector('[data-role="fill"]').style.width = animate ? '0%' : `${(votes.counts[i] / total * 100).toFixed(1)}%`;
        urn.querySelector('[data-role="pct"]').textContent = animate ? '0%' : `${(probs[i] * 100).toFixed(1)}%`;
      });
    }

    function fillUrnsLive(votes, probs) {
      const winner = votes.winner;
      const total = votes.counts.reduce((a, b) => a + b, 0) || 1;
      Array.from(urns.children).forEach((urn, i) => {
        urn.classList.toggle('winner', i === winner);
        urn.querySelector('[data-role="count"]').textContent = String(votes.counts[i]);
        urn.querySelector('[data-role="fill"]').style.width = `${(votes.counts[i] / total * 100).toFixed(1)}%`;
        urn.querySelector('[data-role="pct"]').textContent = `${(probs[i] * 100).toFixed(1)}%`;
      });
    }

    function recomputeAndDraw(animate) {
      const point = [qx, qy];
      const votes = RF.forestVotes(TREES, point, NCLASSES);
      const probs = RF.forestProb(TREES, point, NCLASSES);

      if (!animate) {
        updateUrnsAndBanner(votes, probs, false);
        return;
      }
      // Header banner shows winner immediately so the result has a "destination".
      updateUrnsAndBanner(votes, probs, true);

      // Marble animation: 100 marbles fly from the query point to the urn corresponding to each tree's vote.
      // We aggregate per-tree vote then animate them with staggered timing.
      const perTree = TREES.map(tree => RF.predictClass(tree, point));
      // Position of urns in viz-stage coords. The urns DOM sits in #viz-readout
      // which is *outside* the .viz-stage. So the marbles fly toward the bottom
      // of the stage area, aimed at each urn's horizontal center; the count text
      // ticks up as each marble lands.
      const stageRect = stage.getBoundingClientRect();
      const urnTargets = Array.from(urns.children).map(urn => {
        const rrect = urn.getBoundingClientRect();
        return {
          tx: (rrect.left + rrect.width / 2) - stageRect.left,
          ty: H - 6,
          tw: rrect.width,
        };
      });

      const px = scales.x(qx);
      const py = scales.y(qy);
      gMarbles.selectAll('*').remove();
      const counts = [0, 0, 0];
      // Pre-compute target x with a small jitter inside each urn so they don't
      // pile on the same point.
      const marbleData = perTree.map((cls, i) => {
        const t = urnTargets[cls];
        const jitter = (Math.random() - 0.5) * Math.min(t.tw * 0.7, 60);
        return {
          cls,
          i,
          tx: t.tx + jitter,
          ty: t.ty + (Math.random() - 0.5) * 8,
        };
      });

      const marbles = marbleData.map(d => {
        const m = gMarbles.append('circle')
          .attr('class', `marble cluster-${d.cls + 1}`)
          .attr('r', 3.5)
          .attr('cx', px)
          .attr('cy', py)
          .attr('opacity', 0);
        return { node: m, ...d };
      });

      // Stagger marbles over ~2000ms. Random shuffle gives organic feel.
      const order = d3.shuffle(d3.range(perTree.length));
      const totalDur = 2000;
      const flightDur = 850;
      const startDelays = order.map((_, idx) => (idx / perTree.length) * (totalDur - flightDur));

      // Each marble follows a quadratic-Bezier-like path: control point pulled
      // sideways toward the destination's column to give a graceful arc instead
      // of a straight line. We sample positions in a custom tween.
      order.forEach((origIdx, sortIdx) => {
        const m = marbles[origIdx];
        const delay = startDelays[sortIdx];
        const x0 = px, y0 = py;
        const x1 = m.tx, y1 = m.ty;
        // Control point: midway, but biased horizontally toward the target so
        // we get a graceful sweep. Add small random vertical "lift" so marbles
        // don't all overlap.
        const liftAmt = 30 + Math.random() * 40;
        const cx = (x0 + x1) / 2 + (x1 - x0) * 0.15;
        const cy = Math.min(y0, y1) - liftAmt;

        m.node
          .transition().delay(delay).duration(120).ease(d3.easeQuadOut)
          .attr('opacity', 1)
          .transition().duration(flightDur).ease(d3.easeCubicInOut)
          .tween('arc', function () {
            const node = this;
            return function (t) {
              const u = 1 - t;
              const xt = u * u * x0 + 2 * u * t * cx + t * t * x1;
              const yt = u * u * y0 + 2 * u * t * cy + t * t * y1;
              node.setAttribute('cx', xt);
              node.setAttribute('cy', yt);
            };
          })
          .transition().duration(120).ease(d3.easeQuadIn)
          .attr('opacity', 0)
          .on('end', function () {
            counts[m.cls]++;
            const urn = urns.children[m.cls];
            urn.querySelector('[data-role="count"]').textContent = String(counts[m.cls]);
            const total = counts[0] + counts[1] + counts[2];
            urn.querySelector('[data-role="fill"]').style.width = `${(counts[m.cls] / total * 100).toFixed(1)}%`;
            urn.querySelector('[data-role="pct"]').textContent = `${(counts[m.cls] / total * 100).toFixed(1)}%`;
            d3.select(this).remove();
          });
      });

      // Final settle with the soft-prob percentages (so what the user sees matches RF.forestProb).
      trackTimer(setTimeout(() => {
        fillUrnsLive(votes, probs);
      }, totalDur + 200));
    }

    // Drag behavior.
    const drag = d3.drag()
      .on('start', function () {
        queryCircle.classed('dragging', true);
      })
      .on('drag', function (event) {
        // Convert pixel coords to data coords; clamp.
        const newX = scales.x.invert(event.x);
        const newY = scales.y.invert(event.y);
        qx = Math.max(SCATTER.xMin, Math.min(SCATTER.xMax, newX));
        qy = Math.max(SCATTER.yMin, Math.min(SCATTER.yMax, newY));
        window.rfShared.queryXY = [qx, qy];
        placeQuery();
        recomputeAndDraw(false);
      })
      .on('end', function () {
        queryCircle.classed('dragging', false);
      });
    queryCircle.call(drag);
    halo.call(drag);
    queryInner.call(drag);

    // First-entry: animate the marble flight.
    recomputeAndDraw(true);
  }

  // ------------------------------------------------------------------------
  // Scene dispatcher
  // ------------------------------------------------------------------------

  window.SCENES.forest = {
    enter(ctx, { sub }) {
      // Choose sub.
      if (sub === 'grove') renderGrove(ctx);
      else if (sub === 'bSlider') renderBSlider(ctx);
      else if (sub === 'voting') renderVoting(ctx);
      else {
        clearAll(ctx);
        ctx.overlay.innerHTML = `<div class="scene-stub">forest · unknown sub: ${sub}</div>`;
      }
    },
    exit(ctx) {
      clearAll(ctx);
    },
  };

})();
