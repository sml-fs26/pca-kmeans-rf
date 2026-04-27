// VIZ: formula — owns scene 8 (variance formula with sliders for B and rho).
//
// Pedagogical goal: dramatize Var(T-bar) = rho*sigma^2 + (1-rho)*sigma^2/B.
// Three pre-set rho curves (0.2, 0.5, 0.85) show how the floor (rho*sigma^2)
// rises with rho, and the (1-rho)/B term is what averaging actually kills.
// A user-controlled fourth curve responds to the rho slider; a vertical guide
// + readout track the B slider.

window.SCENES.formula = {
  enter(ctx, { sub }) {
    const { svg, overlay, readout, controls } = ctx;
    const SIGMA2 = 1.0;
    const BMAX = 200;

    // --- Reset stage --------------------------------------------------------
    d3.select(svg).selectAll('*').remove();
    overlay.innerHTML = '';
    readout.innerHTML = '';
    controls.innerHTML = '';

    // --- KaTeX into the prose-side hosts -----------------------------------
    // The HTML embeds <div id="prose-formula"> inside the scene's prose. Render the
    // formula there too, so readers who land via hash routing see math even if the
    // viz column hasn't sized yet.
    const proseHost = document.getElementById('prose-formula');
    if (proseHost) {
      proseHost.innerHTML = '';
      try {
        katex.render(
          '\\mathrm{Var}(\\bar{T}) = \\rho\\,\\sigma^{2} + \\dfrac{(1-\\rho)\\,\\sigma^{2}}{B}',
          proseHost,
          { throwOnError: false, displayMode: true }
        );
      } catch (e) { /* swallow */ }
    }

    // --- Overlay: large formula header above the chart ---------------------
    const formulaHeader = document.createElement('div');
    formulaHeader.className = 'fm-formula';
    overlay.appendChild(formulaHeader);
    try {
      katex.render(
        '\\mathrm{Var}(\\bar{T}) \\;=\\; \\rho\\,\\sigma^{2} \\;+\\; \\dfrac{(1-\\rho)\\,\\sigma^{2}}{B}',
        formulaHeader,
        { throwOnError: false, displayMode: true }
      );
    } catch (e) {}

    const captionEl = document.createElement('div');
    captionEl.className = 'fm-caption';
    captionEl.textContent =
      'Lower ρ ⇒ lower floor — but trees with low ρ are individually weaker. ' +
      'The forest lives in this tradeoff.';
    overlay.appendChild(captionEl);

    // --- SVG chart layout ---------------------------------------------------
    const stage = svg.parentElement; // .viz-stage
    const W = stage.clientWidth || 720;
    const H = stage.clientHeight || 540;
    const sel = d3.select(svg);
    sel.attr('viewBox', `0 0 ${W} ${H}`)
       .attr('preserveAspectRatio', 'xMidYMid meet');

    // Reserve top space for the absolutely-positioned formula header & caption.
    const margin = { top: 130, right: 28, bottom: 56, left: 64 };
    const innerW = Math.max(120, W - margin.left - margin.right);
    const innerH = Math.max(120, H - margin.top - margin.bottom);

    const root = sel.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales: B on log scale 1..100; variance 0..sigma2 linear.
    const x = d3.scaleLog().domain([1, 100]).range([0, innerW]).clamp(true);
    const y = d3.scaleLinear().domain([0, SIGMA2 * 1.05]).range([innerH, 0]);

    // Background grid
    const gGrid = root.append('g').attr('class', 'fm-grid');
    gGrid.selectAll('line.h')
      .data(y.ticks(6))
      .enter().append('line')
      .attr('x1', 0).attr('x2', innerW)
      .attr('y1', d => y(d)).attr('y2', d => y(d));

    // Axes
    const xAxis = d3.axisBottom(x)
      .tickValues([1, 2, 3, 5, 10, 20, 30, 50, 100])
      .tickFormat(d => `${d}`);
    const yAxis = d3.axisLeft(y)
      .ticks(6)
      .tickFormat(d => d.toFixed(1));

    root.append('g')
      .attr('class', 'fm-axis')
      .attr('transform', `translate(0,${innerH})`)
      .call(xAxis);

    root.append('g')
      .attr('class', 'fm-axis')
      .call(yAxis);

    // Axis labels
    root.append('text')
      .attr('class', 'fm-axis-label')
      .attr('x', innerW / 2)
      .attr('y', innerH + 42)
      .attr('text-anchor', 'middle')
      .text('Number of trees, B (log scale)');

    root.append('text')
      .attr('class', 'fm-axis-label')
      .attr('transform', `translate(-46,${innerH / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .text('Variance of forest mean');

    // --- Pre-set rho curves -------------------------------------------------
    const presets = [
      { rho: 0.20, classToken: 'cluster-1', label: 'ρ = 0.20' },
      { rho: 0.50, classToken: 'cluster-2', label: 'ρ = 0.50' },
      { rho: 0.85, classToken: 'cluster-3', label: 'ρ = 0.85  ≈ penguin forest' },
    ];

    // Sample B densely along the log axis so curves look smooth.
    const Bsamples = (() => {
      const out = [];
      const N = 220;
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        out.push(Math.pow(10, t * Math.log10(100))); // 1..100 on log
      }
      return out;
    })();

    const lineGen = d3.line()
      .x(d => x(d.B))
      .y(d => y(d.v))
      .curve(d3.curveMonotoneX);

    const gFloors = root.append('g').attr('class', 'fm-floors');
    const gCurves = root.append('g').attr('class', 'fm-curves');
    const gUserFloor = root.append('g').attr('class', 'fm-user-floor');
    const gUserCurve = root.append('g').attr('class', 'fm-user-curve');
    const gGuide = root.append('g').attr('class', 'fm-guide');
    const gMarkers = root.append('g').attr('class', 'fm-markers');
    const gLabels = root.append('g').attr('class', 'fm-floor-labels');

    // Draw each preset curve + dashed floor.
    presets.forEach(p => {
      const data = Bsamples.map(B => ({ B, v: RF.varianceAtB(p.rho, SIGMA2, B) }));
      gCurves.append('path')
        .attr('class', `fm-curve stroke-${p.classToken}`)
        .attr('d', lineGen(data));

      const floorY = y(p.rho * SIGMA2);
      gFloors.append('line')
        .attr('class', `fm-floor stroke-${p.classToken}`)
        .attr('x1', 0).attr('x2', innerW)
        .attr('y1', floorY).attr('y2', floorY);

      gLabels.append('text')
        .attr('class', `fm-floor-label ${p.classToken}`)
        .attr('x', innerW - 6)
        .attr('y', floorY - 6)
        .attr('text-anchor', 'end')
        .text(`${p.label} · floor = ${(p.rho * SIGMA2).toFixed(2)}`);
    });

    // --- User curve & floor (driven by rho slider) -------------------------
    const userCurvePath = gUserCurve.append('path')
      .attr('class', 'fm-curve fm-user-line');
    const userFloorLine = gUserFloor.append('line')
      .attr('class', 'fm-floor fm-user-floor-line')
      .attr('x1', 0).attr('x2', innerW);
    const userFloorLabel = gLabels.append('text')
      .attr('class', 'fm-floor-label fm-user-floor-label')
      .attr('text-anchor', 'start')
      .attr('x', 8);

    // Vertical B guide
    const guideLine = gGuide.append('line')
      .attr('class', 'fm-guide-line')
      .attr('y1', 0).attr('y2', innerH);
    const guideLabel = gGuide.append('text')
      .attr('class', 'fm-guide-label')
      .attr('y', -8)
      .attr('text-anchor', 'middle');

    // Marker dot on the user's curve at the chosen B.
    const markerDot = gMarkers.append('circle')
      .attr('class', 'fm-marker-dot')
      .attr('r', 5);

    // --- Controls -----------------------------------------------------------
    controls.innerHTML = `
      <div class="fm-controls">
        <div class="fm-row">
          <label class="fm-label" for="fm-B">B</label>
          <input type="range" id="fm-B" min="1" max="200" step="1" value="50">
          <span class="fm-value" id="fm-B-val">50</span>
        </div>
        <div class="fm-row">
          <label class="fm-label" for="fm-rho">ρ</label>
          <input type="range" id="fm-rho" min="0" max="1" step="0.05" value="0.85">
          <span class="fm-value" id="fm-rho-val">0.85</span>
        </div>
      </div>
    `;

    const Binput = controls.querySelector('#fm-B');
    const RhoInput = controls.querySelector('#fm-rho');
    const Bval = controls.querySelector('#fm-B-val');
    const RhoVal = controls.querySelector('#fm-rho-val');

    // --- Readout ------------------------------------------------------------
    readout.innerHTML = `
      <div class="readout-cell">
        <span class="readout-label">B (trees)</span>
        <span class="readout-value" id="fm-ro-B">—</span>
      </div>
      <div class="readout-cell">
        <span class="readout-label">ρ (correlation)</span>
        <span class="readout-value" id="fm-ro-rho">—</span>
      </div>
      <div class="readout-cell">
        <span class="readout-label">Variance</span>
        <span class="readout-value" id="fm-ro-var">—</span>
      </div>
      <div class="readout-cell">
        <span class="readout-label">Floor (ρσ²)</span>
        <span class="readout-value" id="fm-ro-floor">—</span>
      </div>
    `;
    const roB = readout.querySelector('#fm-ro-B');
    const roRho = readout.querySelector('#fm-ro-rho');
    const roVar = readout.querySelector('#fm-ro-var');
    const roFloor = readout.querySelector('#fm-ro-floor');

    // --- Render loop --------------------------------------------------------
    function render() {
      const B = +Binput.value;
      const rho = +RhoInput.value;

      Bval.textContent = String(B);
      RhoVal.textContent = rho.toFixed(2);

      // User curve over 1..100 (chart's x domain).
      const userData = Bsamples.map(b => ({ B: b, v: RF.varianceAtB(rho, SIGMA2, b) }));
      userCurvePath.attr('d', lineGen(userData));

      const floor = rho * SIGMA2;
      const floorY = y(floor);
      userFloorLine.attr('y1', floorY).attr('y2', floorY);
      userFloorLabel
        .attr('y', floorY - 6)
        .text(`your ρ = ${rho.toFixed(2)} · floor = ${floor.toFixed(2)}`);

      // Guide at min(B, 100) — chart only goes to 100, but the slider can go higher
      // so users can feel "more trees beyond the chart still don't help much".
      const Bclamp = Math.min(100, Math.max(1, B));
      const gx = x(Bclamp);
      guideLine.attr('x1', gx).attr('x2', gx);
      guideLabel
        .attr('x', gx)
        .text(B > 100 ? `B = ${B} (off-chart)` : `B = ${B}`);

      const v = RF.varianceAtB(rho, SIGMA2, B);
      // Marker placed on the user's curve at the slider's B (clamped).
      markerDot.attr('cx', gx).attr('cy', y(RF.varianceAtB(rho, SIGMA2, Bclamp)));

      roB.textContent = String(B);
      roRho.textContent = rho.toFixed(2);
      roVar.textContent = v.toFixed(4);
      roFloor.textContent = floor.toFixed(4);
    }

    Binput.addEventListener('input', render);
    RhoInput.addEventListener('input', render);
    render();
  },

  exit(ctx) {
    ctx.overlay.innerHTML = '';
    ctx.controls.innerHTML = '';
    ctx.readout.innerHTML = '';
    d3.select(ctx.svg).selectAll('*').remove();
  },
};
