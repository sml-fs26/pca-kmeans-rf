/* Scene 6 — One shape is a fiction (rank deficiency).
 *
 * Three shapes with one redundant: c = 0.5*a + 0.5*b + ε. PCA discovers the
 * true 2D structure. Four click-steps:
 *   1) State the construction: small sample grid + the equation for c.
 *   2) Show the (a,b,c) scatter on the 2D plane (static SVG isometric).
 *   3) Reveal eigenvalues: bar chart with two real bars and one ~zero pip.
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

  // 3D-isometric scatter of (a,b,c) — static SVG. Projection per spec.
  function buildScatter3D() {
    const wrap = document.createElement('div');
    wrap.className = 's6-scatter-wrap';

    // Use a 100x80 viewBox; we project 3D (a,b,c) into screen coords scaled to
    // fit a ~80x60 region, anchored near the centre.
    const VBW = 100, VBH = 80;
    const svg = d3.select(wrap).append('svg')
      .attr('class', 's6-scatter-svg')
      .attr('viewBox', `0 0 ${VBW} ${VBH}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    // Projection. The spec's projection (a-axis at 30°, b-axis at 150°,
    // c-axis straight up) collapses the plane c = 0.5(a+b) edge-on: any
    // projection where (a+b) and c project to screen-y with weights in a
    // 1:2 ratio degenerates the rank-2 plane into a horizontal line. So we
    // tilt the c-axis off the screen-vertical (pitch the camera down a bit)
    // and pick yaw angles for a, b that are not symmetric about screen-y.
    //
    // Per-axis screen direction. The spec's projection (a-axis at 30°,
    // b-axis at 150°, c-axis straight up) collapses the plane c = 0.5(a+b)
    // edge-on to a horizontal line because (a+b) and c both contribute to
    // screen-y in a 1:2 ratio, exactly matching the plane equation. To break
    // this degeneracy we use a slanted c-axis (up-and-noticeably-to-the-left)
    // so the c=0.5(a+b) plane projects to a proper parallelogram.
    //
    //   a-axis: (cos(-25°), sin(-25°))                  — down-right, length 1
    //   b-axis: (cos(-155°), sin(-155°))                — down-left, length 1
    //   c-axis: (-0.55, 0.83)                           — up-and-left, length ≈ 1
    const L = 26;
    const cx = 50, cy = 52;
    const A_THETA = (-25 * Math.PI) / 180;
    const B_THETA = (-155 * Math.PI) / 180;
    const aDir = [Math.cos(A_THETA), Math.sin(A_THETA)];
    const bDir = [Math.cos(B_THETA), Math.sin(B_THETA)];
    // Empirically: cDir = (cos(150°), sin(150°)) = (-0.866, 0.5). That gives
    // c-axis a 0.5 vertical weight, which is well below 2·sin(25°) ≈ 0.846,
    // so the plane c = 0.5(a+b) projects with sy-weight = -0.173·(a+b) — a
    // ~9 viewBox-unit vertical spread for (a+b) ∈ [0,2]. Visible parallelogram.
    const cDir = [-0.866, 0.5];

    function proj(a, b, c) {
      // sy grows DOWN in SVG; the axis directions encode "up the page" as
      // positive y, so we subtract the y-components.
      const sx = cx + L * (a * aDir[0] + b * bDir[0] + c * cDir[0]);
      const sy = cy - L * (a * aDir[1] + b * bDir[1] + c * cDir[1]);
      return [sx, sy];
    }

    // Plane: c = 0.5*(a + b). Corners (0,0,0), (1,0,0.5), (1,1,1), (0,1,0.5).
    const planeCorners = [
      proj(0, 0, 0),
      proj(1, 0, 0.5),
      proj(1, 1, 1),
      proj(0, 1, 0.5),
    ];
    const planePath = `M ${planeCorners[0][0]} ${planeCorners[0][1]} ` +
      planeCorners.slice(1).map(p => `L ${p[0]} ${p[1]}`).join(' ') + ' Z';
    svg.append('path')
      .attr('class', 's6-plane')
      .attr('d', planePath);

    // Points (200 of them).
    const gPoints = svg.append('g').attr('class', 's6-points');
    const coeffs = variant.coeffs;
    coeffs.forEach(row => {
      const a = row[0], b = row[1], c = row[2];
      const [x, y] = proj(a, b, c);
      gPoints.append('circle')
        .attr('class', 's6-point')
        .attr('cx', x)
        .attr('cy', y)
        .attr('r', 0.55);
    });

    // Axes — drawn last so they sit on top.
    const gAxes = svg.append('g').attr('class', 's6-axes');
    const axisDefs = [
      { name: 'a', tip: proj(1, 0, 0) },
      { name: 'b', tip: proj(0, 1, 0) },
      { name: 'c', tip: proj(0, 0, 1) },
    ];
    const origin = proj(0, 0, 0);
    axisDefs.forEach(ax => {
      gAxes.append('line')
        .attr('class', 's6-axis-line')
        .attr('x1', origin[0]).attr('y1', origin[1])
        .attr('x2', ax.tip[0]).attr('y2', ax.tip[1]);
      // label, just past the tip
      const dx = ax.tip[0] - origin[0];
      const dy = ax.tip[1] - origin[1];
      const len = Math.hypot(dx, dy) || 1;
      const lx = ax.tip[0] + (dx / len) * 2.5;
      const ly = ax.tip[1] + (dy / len) * 2.5;
      gAxes.append('text')
        .attr('class', 's6-axis-label')
        .attr('x', lx).attr('y', ly)
        .attr('text-anchor', 'middle')
        .text(ax.name);
    });

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

  function setStep(c) {
    if (c < 1 || c > STEPS) return false;
    cursor = c;
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
        '<em>All 200 samples sit on a single 2D plane in coefficient space.</em>';
      leftCol.appendChild(buildScatter3D());

      const fb = document.createElement('div');
      fb.className = 'formula-block s6-formula';
      renderKatex(fb, '\\mathrm{rank}\\,\\Sigma_{\\text{coeff}} \\,\\approx\\, 2', true);
      rightSlot.appendChild(fb);

      const sb = document.createElement('div');
      sb.className = 'sidebar-note s6-sidebar';
      sb.innerHTML =
        '<span class="sidebar-title">A 2D plane in ℝ³.</span>' +
        'All 200 points sit on the same 2D plane. The third coordinate is determined by the first two.';
      rightSlot.appendChild(sb);
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
    onLeave() {},
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
