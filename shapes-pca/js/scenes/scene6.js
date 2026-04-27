/* Scene 6 — One shape is a fiction (rank deficiency).
 *
 * Three shapes with one redundant: c = 0.5*a + 0.5*b + ε. PCA discovers the
 * true 2D structure. Four click-steps:
 *   1) State the construction: small sample grid + the equation for c.
 *   2) Drag-rotate (a,b,c) scatter — points lie on a tilted 2D plane.
 *   3) Same scatter + eigenvalue bars: two real bars and one ~zero pip.
 *   4) Three eigen-images: v1, v2 (real mixtures) and v3 (noise).
 *
 * For the eigen-images we pass {signed: true} per spec — v2/v3 have negative
 * entries, so the diverging blue↔red ramp tells the student "these are mixed".
 */

window.scenes.scene6 = function (root) {
  root.innerHTML = '';
  root.classList.add('scene-s6');

  const variant = PCA.variant('redundant3');

  // ---- Layout ---------------------------------------------------------------
  const layout = document.createElement('div');
  layout.className = 'scene-layout split-eq s6-layout';
  root.appendChild(layout);

  const leftCol = document.createElement('div');
  leftCol.className = 's6-left';
  layout.appendChild(leftCol);

  const rightCol = document.createElement('div');
  rightCol.className = 's6-right';
  layout.appendChild(rightCol);

  const stepPill = document.createElement('div');
  stepPill.className = 'step-pill s6-step-pill';
  rightCol.appendChild(stepPill);

  const heading = document.createElement('h2');
  heading.className = 's6-heading';
  heading.textContent = 'One shape is a fiction.';
  rightCol.appendChild(heading);

  const subhead = document.createElement('p');
  subhead.className = 's6-subhead';
  rightCol.appendChild(subhead);

  // The right column has a "slot" that swaps content per step (formula → rank
  // statement → bar chart → callout). The left column also swaps.
  const rightSlot = document.createElement('div');
  rightSlot.className = 's6-right-slot';
  rightCol.appendChild(rightSlot);

  // ---- KaTeX helper ---------------------------------------------------------
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

  // ---- Builders -------------------------------------------------------------
  function buildSampleGrid() {
    const wrap = document.createElement('div');
    wrap.className = 's6-sample-grid';
    const N = 8;
    for (let i = 0; i < N; i++) {
      const cell = document.createElement('div');
      cell.className = 's6-sample-cell';
      const c = ImageCanvas.create(cell, { w: 32, h: 32, scale: 3 });
      const img = PCA.buildImage(variant, i);
      ImageCanvas.render(c, img, { min: 0, max: 1 });
      wrap.appendChild(cell);
    }
    return wrap;
  }

  // 3D rotatable scatter of (a,b,c). Drag to rotate around vertical (yaw) and
  // horizontal (pitch) axes. yaw/pitch live at scene scope so the rotation
  // persists when the user steps between scenes 2 and 3 (both use this view).
  //
  // Geometry: (a, b) are the floor plane, c points up. The cube wireframe is
  // drawn as orientation cue; the plane c = 0.5(a+b) is the rank-2 manifold
  // the data lives on; 200 sample points are projected and depth-sorted.
  function buildScatter3D() {
    const wrap = document.createElement('div');
    wrap.className = 's6-scatter-wrap';

    const W = 540, H = 420;
    const svgSel = d3.select(wrap).append('svg')
      .attr('class', 's6-scatter-svg')
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');
    const svgEl = svgSel.node();

    const CX = W / 2, CY = H / 2 + 30; // bias y so the cube sits a bit lower
    const SCALE = 170;
    const O = 0.5; // cube is [0,1]^3, recenter to origin

    // Project (a,b,c) → {x, y, depth}. Yaw rotates around world c (vertical);
    // pitch rotates around the screen-x axis after yaw. Screen y grows down,
    // so we subtract the c-component when mapping to screen y.
    function project(p) {
      const a = p[0] - O, b = p[1] - O, c = p[2] - O;
      const cyaw = Math.cos(viewYaw), syaw = Math.sin(viewYaw);
      const a1 =  a * cyaw + b * syaw;
      const b1 = -a * syaw + b * cyaw;
      const c1 = c;
      const cpit = Math.cos(viewPitch), spit = Math.sin(viewPitch);
      const a2 = a1;
      const b2 = b1 * cpit - c1 * spit;   // depth (into the screen)
      const c2 = b1 * spit + c1 * cpit;   // vertical
      return { x: CX + a2 * SCALE, y: CY - c2 * SCALE, depth: b2 };
    }

    // Static geometry definitions.
    const cubeCorners = [
      [0,0,0],[1,0,0],[1,1,0],[0,1,0],
      [0,0,1],[1,0,1],[1,1,1],[0,1,1],
    ];
    const cubeEdgeIdx = [
      [0,1],[1,2],[2,3],[3,0],
      [4,5],[5,6],[6,7],[7,4],
      [0,4],[1,5],[2,6],[3,7],
    ];
    const planeCorners = [[0,0,0],[1,0,0.5],[1,1,1],[0,1,0.5]];
    const axisDefs = [
      { name: 'a (circle)',   tip: [1, 0, 0] },
      { name: 'b (square)',   tip: [0, 1, 0] },
      { name: 'c (triangle)', tip: [0, 0, 1] },
    ];
    const coeffs = variant.coeffs;

    // Layer groups, in painter's order: cube wireframe → plane → points → axes.
    const gCube   = svgSel.append('g').attr('class', 's6-cube-edges');
    const planeEl = svgSel.append('path').attr('class', 's6-plane');
    const gPoints = svgSel.append('g').attr('class', 's6-points');
    const gAxes   = svgSel.append('g').attr('class', 's6-axes');

    function render() {
      // Cube edges
      const edgeData = cubeEdgeIdx.map(([i, j]) => ({
        p1: project(cubeCorners[i]),
        p2: project(cubeCorners[j]),
      }));
      const eSel = gCube.selectAll('line').data(edgeData);
      eSel.enter().append('line').attr('class', 's6-cube-edge').merge(eSel)
        .attr('x1', d => d.p1.x).attr('y1', d => d.p1.y)
        .attr('x2', d => d.p2.x).attr('y2', d => d.p2.y);
      eSel.exit().remove();

      // Plane (c = 0.5(a+b))
      const planeProj = planeCorners.map(project);
      planeEl.attr('d',
        `M ${planeProj[0].x} ${planeProj[0].y} ` +
        planeProj.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ') + ' Z'
      );

      // Points — sort back→front so closer dots draw on top.
      const pts = coeffs.map(p => {
        const pr = project(p);
        return { x: pr.x, y: pr.y, d: pr.depth };
      });
      pts.sort((u, v) => u.d - v.d);
      const pSel = gPoints.selectAll('circle').data(pts);
      pSel.enter().append('circle').attr('class', 's6-point').attr('r', 3.6)
        .merge(pSel)
        .attr('cx', d => d.x).attr('cy', d => d.y);
      pSel.exit().remove();

      // Axes (drawn last)
      const origin = project([0, 0, 0]);
      const aData = axisDefs.map(ax => {
        const tip = project(ax.tip);
        const dx = tip.x - origin.x, dy = tip.y - origin.y;
        const L = Math.hypot(dx, dy) || 1;
        return {
          name: ax.name,
          tipX: tip.x, tipY: tip.y,
          labelX: tip.x + (dx / L) * 18,
          labelY: tip.y + (dy / L) * 18,
        };
      });
      const aSel = gAxes.selectAll('g.s6-axis').data(aData);
      const aEnter = aSel.enter().append('g').attr('class', 's6-axis');
      aEnter.append('line').attr('class', 's6-axis-line');
      aEnter.append('text').attr('class', 's6-axis-label')
        .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle');
      const aMerge = aEnter.merge(aSel);
      aMerge.select('line')
        .attr('x1', origin.x).attr('y1', origin.y)
        .attr('x2', d => d.tipX).attr('y2', d => d.tipY);
      aMerge.select('text')
        .attr('x', d => d.labelX).attr('y', d => d.labelY)
        .text(d => d.name);
      aSel.exit().remove();
    }

    render();

    // ---- Drag-to-rotate interaction ---------------------------------------
    let dragging = false, yaw0 = 0, pitch0 = 0, x0 = 0, y0 = 0;
    function onPointerDown(e) {
      dragging = true;
      yaw0 = viewYaw; pitch0 = viewPitch;
      x0 = e.clientX; y0 = e.clientY;
      if (e.pointerId != null) {
        try { svgEl.setPointerCapture(e.pointerId); } catch (_) {}
      }
      svgEl.classList.add('is-dragging');
      e.preventDefault();
    }
    function onPointerMove(e) {
      if (!dragging) return;
      const dx = e.clientX - x0;
      const dy = e.clientY - y0;
      viewYaw = yaw0 + dx * 0.01;
      viewPitch = pitch0 + dy * 0.01;
      const lim = Math.PI / 2 - 0.05;
      if (viewPitch >  lim) viewPitch =  lim;
      if (viewPitch < -lim) viewPitch = -lim;
      render();
    }
    function onPointerUp(e) {
      dragging = false;
      svgEl.classList.remove('is-dragging');
      if (e.pointerId != null) {
        try { svgEl.releasePointerCapture(e.pointerId); } catch (_) {}
      }
    }
    svgEl.addEventListener('pointerdown', onPointerDown);
    svgEl.addEventListener('pointermove', onPointerMove);
    svgEl.addEventListener('pointerup', onPointerUp);
    svgEl.addEventListener('pointercancel', onPointerUp);

    cleanups.push(() => {
      svgEl.removeEventListener('pointerdown', onPointerDown);
      svgEl.removeEventListener('pointermove', onPointerMove);
      svgEl.removeEventListener('pointerup', onPointerUp);
      svgEl.removeEventListener('pointercancel', onPointerUp);
    });

    const tip = document.createElement('p');
    tip.className = 's6-scatter-tip muted';
    tip.innerHTML = '<em>drag to rotate · the plane stays flat no matter the angle</em>';
    wrap.appendChild(tip);

    return wrap;
  }

  function buildEvalChart() {
    const wrap = document.createElement('div');
    wrap.className = 's6-eval-chart-wrap';

    const VBW = 100, VBH = 60;
    const M = { top: 6, right: 6, bottom: 14, left: 12 };
    const innerW = VBW - M.left - M.right;
    const innerH = VBH - M.top - M.bottom;

    const svg = d3.select(wrap).append('svg')
      .attr('class', 's6-bar-svg')
      .attr('viewBox', `0 0 ${VBW} ${VBH}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    const evals = variant.eigenvals;
    const labels = ['λ₁', 'λ₂', 'λ₃'];
    const maxEval = Math.max.apply(null, evals);

    const xScale = d3.scaleBand()
      .domain(labels.map((_, i) => i))
      .range([M.left, M.left + innerW])
      .padding(0.3);
    const yScale = d3.scaleLinear()
      .domain([0, maxEval * 1.05])
      .range([M.top + innerH, M.top]);

    const yTicks = yScale.ticks(4);
    const gGrid = svg.append('g').attr('class', 'grid');
    yTicks.forEach(t => {
      gGrid.append('line')
        .attr('x1', M.left).attr('x2', M.left + innerW)
        .attr('y1', yScale(t)).attr('y2', yScale(t));
    });

    const gBars = svg.append('g').attr('class', 's6-bars');
    evals.forEach((lam, i) => {
      const bx = xScale(i);
      const bw = xScale.bandwidth();
      // Ensure even tiny λ3 shows a 1-pixel pip so the eye sees "essentially zero"
      // rather than nothing at all.
      const minPip = 0.25;
      const rawH = yScale(0) - yScale(lam);
      const bh = Math.max(rawH, lam > 1e-6 ? minPip : 0);
      const by = yScale(0) - bh;
      gBars.append('rect')
        .attr('class', 'cluster-1 s6-bar')
        .attr('x', bx)
        .attr('y', by)
        .attr('width', bw)
        .attr('height', bh);
      gBars.append('text')
        .attr('class', 's6-bar-value')
        .attr('x', bx + bw / 2)
        .attr('y', Math.min(by - 1.2, yScale(0) - 1.5))
        .attr('text-anchor', 'middle')
        .text(lam < 0.1 ? lam.toFixed(3) : lam.toFixed(2));
    });

    const gAx = svg.append('g').attr('class', 'axis s6-axis');
    labels.forEach((name, i) => {
      const cx = xScale(i) + xScale.bandwidth() / 2;
      gAx.append('text')
        .attr('class', 's6-x-label')
        .attr('x', cx)
        .attr('y', yScale(0) + 4.4)
        .attr('text-anchor', 'middle')
        .text(name);
    });
    gAx.append('line')
      .attr('class', 's6-baseline')
      .attr('x1', M.left).attr('x2', M.left + innerW)
      .attr('y1', yScale(0)).attr('y2', yScale(0));

    const cap = document.createElement('p');
    cap.className = 's6-chart-caption muted';
    cap.innerHTML = '<em>λ₃ / λ₁ ≈ 0.001. The third direction is noise.</em>';
    wrap.appendChild(cap);

    return wrap;
  }

  function buildSignedLegend() {
    const wrap = document.createElement('div');
    wrap.className = 's6-signed-legend';
    wrap.innerHTML =
      '<div class="s6-legend-title">Reading the eigen-images</div>' +
      '<div class="s6-legend-grid">' +
        '<div class="s6-legend-row">' +
          '<span class="s6-legend-bar"></span>' +
          '<span class="s6-legend-text">' +
            '<strong class="s6-legend-strong-neg">deep blue</strong> &mdash; large negative entry' +
            ' &middot; <span class="muted">cream &mdash; near zero</span> &middot; ' +
            '<strong class="s6-legend-strong-pos">deep red</strong> &mdash; large positive entry' +
          '</span>' +
        '</div>' +
        '<p class="s6-legend-caption">' +
          'Hue tells you the <em>sign</em> of the pixel; intensity tells you the ' +
          '<em>magnitude</em>. A pure circle would be all red; a contrast like ' +
          '<span class="mono">v<sub>2</sub></span> shows red where one shape lives and blue where the other does.' +
        '</p>' +
      '</div>';
    return wrap;
  }

  function buildEigenImagesRow() {
    const row = document.createElement('div');
    row.className = 's6-eigen-row';
    const evals = variant.eigenvals;
    for (let j = 0; j < 3; j++) {
      const cell = document.createElement('div');
      cell.className = 's6-eigen-cell';

      const c = ImageCanvas.create(cell, { w: 32, h: 32, scale: 6 });
      // signed: true — these are mixed eigenvectors (v2, v3 have negatives;
      // v1 is non-negative but we render with the diverging palette per spec
      // to make the "mixed" point visually).
      ImageCanvas.render(c, variant.eigenvecs[j], { signed: true });

      const cap = document.createElement('div');
      cap.className = 'image-caption s6-eigen-caption';
      const tex = document.createElement('span');
      const lam = evals[j];
      const lamStr = lam < 0.1 ? lam.toFixed(3) : lam.toFixed(2);
      renderKatex(tex, `v_${j + 1}\\;(\\lambda = ${lamStr})`, false);
      cap.appendChild(tex);
      cell.appendChild(cap);

      row.appendChild(cell);
    }
    return row;
  }

  // ---- Step engine ----------------------------------------------------------
  const STEPS = 4;
  let cursor = 0;

  // Camera state for the 3D scatter — persists across step rebuilds so the
  // user's chosen rotation carries between steps 2 and 3.
  let viewYaw = -Math.PI / 5;
  let viewPitch = Math.PI / 7;

  // Per-step teardown handlers (e.g., pointer listeners on the rotatable SVG).
  let cleanups = [];
  function clearCleanups() {
    cleanups.forEach(fn => { try { fn(); } catch (_) {} });
    cleanups = [];
  }

  function setStep(c) {
    if (c < 1 || c > STEPS) return false;
    cursor = c;
    clearCleanups();
    leftCol.innerHTML = '';
    rightSlot.innerHTML = '';
    stepPill.textContent = `Step ${cursor} of ${STEPS}`;

    if (cursor === 1) {
      subhead.innerHTML =
        '<em>Three shapes — circle, square, triangle. But the triangle’s intensity is ' +
        'determined by the other two: <span class="mono">c = 0.5·a + 0.5·b + ε</span>. ' +
        'The third number is a lie.</em>';

      // Left: small sample grid.
      leftCol.appendChild(buildSampleGrid());

      // Right: equation.
      const fb = document.createElement('div');
      fb.className = 'formula-block s6-formula';
      renderKatex(
        fb,
        'c = 0.5\\,a + 0.5\\,b + \\varepsilon, \\quad \\varepsilon \\sim \\mathcal{N}(0, 0.02^2)',
        true
      );
      rightSlot.appendChild(fb);
    } else if (cursor === 2) {
      subhead.innerHTML =
        '<em>Every dot is one of the 200 images, plotted at its coefficient triple ' +
        '<span class="mono">(a, b, c)</span>. They all lie on the same tilted 2D plane.</em>';
      leftCol.appendChild(buildScatter3D());

      const explainer = document.createElement('div');
      explainer.className = 's6-explainer';
      explainer.innerHTML =
        '<span class="s6-explainer-title">How to read the cube</span>' +
        '<ul class="s6-explainer-list">' +
          '<li><span class="mono">a</span> &mdash; how much <em>circle</em> went into this image.</li>' +
          '<li><span class="mono">b</span> &mdash; how much <em>square</em>.</li>' +
          '<li><span class="mono">c</span> &mdash; how much <em>triangle</em>, but ' +
            '<span class="mono">c &asymp; 0.5·a + 0.5·b</span>, so this axis is ' +
            'almost determined by the other two.</li>' +
        '</ul>' +
        '<p class="s6-explainer-coda">The dots aren&rsquo;t scattered through the cube &mdash; ' +
        'they&rsquo;re trapped on a single tilted plane. ' +
        'PCA only needs <em>two</em> directions to describe them.</p>';
      rightSlot.appendChild(explainer);

      const fb = document.createElement('div');
      fb.className = 'formula-block s6-formula';
      renderKatex(fb, '\\mathrm{rank}\\,\\Sigma_{\\text{coeff}} \\,\\approx\\, 2', true);
      rightSlot.appendChild(fb);
    } else if (cursor === 3) {
      subhead.innerHTML =
        '<em>PCA confirms it: only two directions carry real variance.</em>';
      leftCol.appendChild(buildScatter3D());
      rightSlot.appendChild(buildEvalChart());
    } else if (cursor === 4) {
      subhead.innerHTML =
        '<em>Two real eigen-images, one fictional. Red and blue tell you the entries are signed mixtures.</em>';
      // Move the eigen-images into the left (which has more room) and put a
      // callout on the right.
      leftCol.appendChild(buildEigenImagesRow());
      leftCol.appendChild(buildSignedLegend());

      const callout = document.createElement('div');
      callout.className = 'callout s6-callout';
      callout.innerHTML =
        '<div class="callout-title">PCA finds the true dimensionality</div>' +
        '<p>PCA found two real directions and one fictional one. ' +
        'The fictional one has near-zero variance because it captures only the noise <span class="mono">ε</span>.</p>';
      rightSlot.appendChild(callout);
    }
    return true;
  }

  function onThemeChange() {
    setStep(cursor);
  }
  window.addEventListener('theme-change', onThemeChange);

  setStep(1);

  return {
    onEnter() {
      setStep(1);
    },
    onLeave() {
      clearCleanups();
    },
    onNextKey() {
      if (cursor < STEPS) {
        setStep(cursor + 1);
        return true;
      }
      return false;
    },
    onPrevKey() {
      if (cursor > 1) {
        setStep(cursor - 1);
        return true;
      }
      return false;
    },
  };
};
