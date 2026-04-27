// VIZ: diagnostics — owns scene 7 (convergence).
//
// Pedagogical beat: as more trees are added, test error falls fast for the
// first ~10 trees, then plateaus around 7.9%. The OOB error (computed for
// free from each tree's untouched 37%) tracks the test curve from B>=10
// onward — proof that you don't need a separate validation set for an RF.
//
// Color discipline: train is muted+dashed (context only), test is var(--ink)
// (the lesson), OOB is var(--highlight) purple (non-class identity, reads as
// "look here"). cluster-1/cluster-2 (blue/red) are reserved for class
// identity elsewhere — never used here.

window.SCENES.diagnostics = (function () {

  function enter(ctx, { sub, idx }) {
    const { svg, overlay, readout, controls } = ctx;

    // --- 1. Reset stage ----------------------------------------------------
    d3.select(svg).selectAll('*').remove();
    overlay.innerHTML = '';
    controls.innerHTML = '';
    readout.innerHTML = '';

    // --- 2. Pull data ------------------------------------------------------
    const C = (window.DATA && window.DATA.convergence) || null;
    if (!C) {
      readout.innerHTML = '<div class="scene-stub">No convergence data.</div>';
      return;
    }
    const bs = C.bs.slice();
    const trainErr = C.trainErr.slice();
    const testErr = C.testErr.slice();
    const oobErr = C.oobErr.slice();
    const N = bs.length;

    // --- 3. SVG sizing (read bounding rect; do NOT hardcode) --------------
    const stage = svg.parentElement; // .viz-stage
    const rect = stage.getBoundingClientRect();
    const W = Math.max(360, Math.floor(rect.width || 720));
    const H = Math.max(280, Math.floor(rect.height || 540));

    const sel = d3.select(svg)
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    const margin = { top: 56, right: 28, bottom: 56, left: 64 };
    const innerW = Math.max(120, W - margin.left - margin.right);
    const innerH = Math.max(120, H - margin.top - margin.bottom);

    const root = sel.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // --- 4. Title ---------------------------------------------------------
    sel.append('text')
      .attr('class', 'dx-title')
      .attr('x', margin.left)
      .attr('y', 24)
      .text('more trees, less error');

    // --- 5. Scales --------------------------------------------------------
    // Log-x over the actual sample range (1..200). Y-axis sized dynamically
    // from the actual values so train/test/OOB all fit, with 10% headroom.
    const x = d3.scaleLog().domain([1, 200]).range([0, innerW]);
    const allErrs = (C.trainErr || []).concat(C.testErr || []).concat(C.oobErr || []);
    const dataMax = Math.max(0.05, ...allErrs);
    const yMax = Math.min(1, dataMax * 1.1);
    const y = d3.scaleLinear().domain([0, yMax]).range([innerH, 0]);

    // --- 6. Grid + axes ---------------------------------------------------
    const gGrid = root.append('g').attr('class', 'dx-grid');
    gGrid.selectAll('line.h')
      .data(y.ticks(6))
      .enter().append('line')
      .attr('x1', 0).attr('x2', innerW)
      .attr('y1', d => y(d)).attr('y2', d => y(d));

    const xAxis = d3.axisBottom(x)
      .tickValues([1, 2, 3, 5, 10, 20, 50, 100, 200])
      .tickFormat(d => `${d}`);
    const yAxis = d3.axisLeft(y)
      .ticks(6)
      .tickFormat(d => `${(d * 100).toFixed(0)}%`);

    root.append('g')
      .attr('class', 'dx-axis')
      .attr('transform', `translate(0,${innerH})`)
      .call(xAxis);

    root.append('g')
      .attr('class', 'dx-axis')
      .call(yAxis);

    // Axis labels.
    root.append('text')
      .attr('class', 'dx-axis-label')
      .attr('x', innerW / 2)
      .attr('y', innerH + 42)
      .attr('text-anchor', 'middle')
      .text('trees in forest (B)');

    root.append('text')
      .attr('class', 'dx-axis-label')
      .attr('transform', `translate(-46,${innerH / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .text('error rate');

    // --- 7. Plateau annotation -------------------------------------------
    // Plateau computed from the last 5 testErr samples — works for any dataset.
    const lastFive = (C.testErr || []).slice(-5);
    const plateau = lastFive.length ? lastFive.reduce((a, b) => a + b, 0) / lastFive.length : 0.05;
    root.append('line')
      .attr('class', 'plateau-line')
      .attr('x1', 0).attr('x2', innerW)
      .attr('y1', y(plateau)).attr('y2', y(plateau));
    root.append('text')
      .attr('class', 'plateau-label')
      .attr('x', innerW - 6)
      .attr('y', y(plateau) - 4)
      .attr('text-anchor', 'end')
      .text(`≈ ${(plateau * 100).toFixed(1)}% plateau`);

    // --- 8. Lines + dots --------------------------------------------------
    const line = d3.line()
      .x((_, i) => x(bs[i]))
      .y(d => y(d))
      .curve(d3.curveMonotoneX);

    const gLines = root.append('g');
    const gDots = root.append('g');

    // Order matters: train (background) -> oob -> test (foreground).
    gLines.append('path')
      .attr('class', 'dx-line line-train')
      .attr('d', line(trainErr));
    const oobPath = gLines.append('path')
      .attr('class', 'dx-line line-oob')
      .attr('d', line(oobErr));
    gLines.append('path')
      .attr('class', 'dx-line line-test')
      .attr('d', line(testErr));

    function drawDots(arr, klass) {
      gDots.selectAll(null)
        .data(arr)
        .enter().append('circle')
        .attr('class', `curve-dot ${klass}`)
        .attr('data-i', (_, i) => i)
        .attr('cx', (_, i) => x(bs[i]))
        .attr('cy', d => y(d))
        .attr('r', 3);
    }
    drawDots(trainErr, 'train');
    drawDots(oobErr, 'oob');
    drawDots(testErr, 'test');

    // --- 9. Inline legend (top-right of plot area) ------------------------
    const legend = root.append('g')
      .attr('class', 'dx-legend')
      .attr('transform', `translate(${innerW - 132},${8})`);

    const legendRows = [
      { key: 'test',  label: 'test error',  klass: 'test'  },
      { key: 'oob',   label: 'OOB error',   klass: 'oob'   },
      { key: 'train', label: 'train error', klass: 'train' },
    ];
    legendRows.forEach((r, i) => {
      const yy = i * 16;
      legend.append('line')
        .attr('class', `dx-legend-swatch ${r.klass}`)
        .attr('x1', 0).attr('x2', 22)
        .attr('y1', yy).attr('y2', yy);
      legend.append('text')
        .attr('class', `dx-legend-row ${r.klass}`)
        .attr('x', 28)
        .attr('y', yy + 3.5)
        .text(r.label);
    });

    // --- 10. Readout ------------------------------------------------------
    readout.innerHTML = `
      <div class="readout-cell">
        <span class="readout-label">B</span>
        <span class="readout-value" id="dx-ro-B">—</span>
      </div>
      <div class="readout-cell">
        <span class="readout-label">train err</span>
        <span class="readout-value" id="dx-ro-train">—</span>
      </div>
      <div class="readout-cell">
        <span class="readout-label">test err</span>
        <span class="readout-value" id="dx-ro-test">—</span>
      </div>
      <div class="readout-cell">
        <span class="readout-label">OOB err</span>
        <span class="readout-value" id="dx-ro-oob">—</span>
      </div>
    `;
    const roB = readout.querySelector('#dx-ro-B');
    const roTrain = readout.querySelector('#dx-ro-train');
    const roTest = readout.querySelector('#dx-ro-test');
    const roOob = readout.querySelector('#dx-ro-oob');

    function fmtPct(v) { return `${(v * 100).toFixed(1)}%`; }

    function selectIndex(i) {
      i = Math.max(0, Math.min(N - 1, i));
      // Clear previous selection.
      gDots.selectAll('circle.curve-dot').classed('is-selected', false);
      gDots.selectAll(`circle.curve-dot[data-i="${i}"]`).classed('is-selected', true);

      // Hover guide.
      hoverGuide
        .attr('x1', x(bs[i]))
        .attr('x2', x(bs[i]))
        .attr('y1', 0)
        .attr('y2', innerH)
        .style('display', null);

      roB.textContent = String(bs[i]);
      roTrain.textContent = fmtPct(trainErr[i]);
      roTest.textContent = fmtPct(testErr[i]);
      roOob.textContent = fmtPct(oobErr[i]);
    }

    // --- 11. Hover guide & hit area ---------------------------------------
    const hoverGuide = root.append('line')
      .attr('class', 'dx-hover-guide')
      .style('display', 'none');

    // Wide hit rect that maps mouse-x to nearest B index.
    root.append('rect')
      .attr('class', 'dx-hover-hit')
      .attr('x', 0).attr('y', 0)
      .attr('width', innerW).attr('height', innerH)
      .on('mousemove', function (event) {
        const [mx] = d3.pointer(event, this);
        // Find closest sample index by x.
        let best = 0, bestD = Infinity;
        for (let i = 0; i < N; i++) {
          const d = Math.abs(x(bs[i]) - mx);
          if (d < bestD) { bestD = d; best = i; }
        }
        selectIndex(best);
      });

    // Default selection: rightmost (B = 200).
    selectIndex(N - 1);

    // --- 12. Optional control: Highlight OOB ------------------------------
    controls.innerHTML = `
      <div class="controls-row">
        <button id="dx-toggle-oob" type="button">Highlight OOB</button>
        <span class="readout-label">hover the chart to inspect</span>
      </div>
    `;
    const toggleBtn = controls.querySelector('#dx-toggle-oob');
    let oobEmph = false;
    let arrowG = null;

    toggleBtn.addEventListener('click', () => {
      oobEmph = !oobEmph;
      oobPath.classed('is-emphasized', oobEmph);
      if (oobEmph) {
        // Draw a small arrow from above pointing to the OOB dot at B = 30
        // (a representative point where OOB hugs test). Index 7 = B=30.
        const i = 7;
        const tx = x(bs[i]);
        const ty = y(oobErr[i]);
        arrowG = root.append('g').attr('class', 'dx-arrow-group');
        arrowG.append('path')
          .attr('class', 'dx-arrow')
          .attr('d', `M${tx + 28},${ty - 30} L${tx + 6},${ty - 6}`);
        arrowG.append('path')
          .attr('class', 'dx-arrow')
          .attr('d', `M${tx + 6},${ty - 6} L${tx + 12},${ty - 8} M${tx + 6},${ty - 6} L${tx + 8},${ty - 12}`);
        arrowG.append('text')
          .attr('class', 'dx-arrow-label')
          .attr('x', tx + 32)
          .attr('y', ty - 32)
          .attr('text-anchor', 'start')
          .text('OOB ≈ test');
      } else if (arrowG) {
        arrowG.remove();
        arrowG = null;
      }
    });

    // --- 13. Theme reactivity --------------------------------------------
    // CSS variables handle re-coloring; nothing to repaint.
    function onThemeChange() { /* no-op */ }
    window.addEventListener('theme-change', onThemeChange);
    ctx.__diagnosticsThemeListener = onThemeChange;
  }

  function exit(ctx) {
    if (ctx.__diagnosticsThemeListener) {
      window.removeEventListener('theme-change', ctx.__diagnosticsThemeListener);
      ctx.__diagnosticsThemeListener = null;
    }
    d3.select(ctx.svg).selectAll('*').remove();
    ctx.overlay.innerHTML = '';
    ctx.controls.innerHTML = '';
    ctx.readout.innerHTML = '';
  }

  return { enter, exit };
})();
