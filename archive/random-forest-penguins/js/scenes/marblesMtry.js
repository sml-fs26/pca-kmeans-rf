// VIZ: marblesMtry — owns scenes 3 (bootstrap) and 4 (mtry).
//
// Scene 3: animate N=30 marble draws with replacement; show fraction-unique
//          climbing toward 1 - 1/e and mark out-of-bag rows in the bag at the end.
// Scene 4: render the precomputed tree for a chosen mtry; a slider re-renders
//          the tree (transition) and re-randomises which mtry features are
//          highlighted in the chip strip above the tree.

(function () {
  // ----------------------------------------------------------------------
  // module-scoped state so exit() can stop in-flight animations / timers.
  // ----------------------------------------------------------------------
  let bootstrapTimer = null;          // setTimeout chain for the draw animation
  let mtryRng = null;                 // tiny seedable rng for chip highlight

  function clearAll(ctx) {
    if (bootstrapTimer) { clearTimeout(bootstrapTimer); bootstrapTimer = null; }
    d3.select(ctx.svg).selectAll('*').remove();
    ctx.overlay.innerHTML = '';
    ctx.readout.innerHTML = '';
    ctx.controls.innerHTML = '';
  }

  function dims(svg) {
    const r = svg.getBoundingClientRect();
    // Headless Chrome occasionally measures 0×0 before layout. Fall back to a
    // sensible default so all numbers below stay finite.
    return {
      w: r.width  > 0 ? r.width  : 760,
      h: r.height > 0 ? r.height : 480,
    };
  }

  function setReadout(readout, items) {
    readout.innerHTML = items.map(([label, value]) => `
      <div class="readout-cell">
        <div class="readout-label">${label}</div>
        <div class="readout-value">${value}</div>
      </div>
    `).join('');
  }

  function setReadoutWithCaption(readout, items, caption) {
    readout.innerHTML =
      items.map(([label, value]) => `
        <div class="readout-cell">
          <div class="readout-label">${label}</div>
          <div class="readout-value">${value}</div>
        </div>
      `).join('') +
      `<div class="mm-caption">${caption}</div>`;
  }

  // ======================================================================
  // SCENE 3 — bootstrap
  // ======================================================================

  function enterBootstrap(ctx) {
    clearAll(ctx);

    const data = window.DATA.bootstrapDemo;
    const N = data.n;
    const seq = data.drawSequence;
    const curve = data.uniqueFractionCurve;
    const finalCounts = data.finalCounts;

    const { w, h } = dims(ctx.svg);

    const svg = d3.select(ctx.svg);
    svg.attr('viewBox', `0 0 ${w} ${h}`).attr('preserveAspectRatio', 'xMidYMid meet');

    // ---- Layout regions ----
    // Left third: bag of N marbles
    // Middle third: tray showing draws (with stacks for duplicates)
    // Right third upper: fraction-unique inset chart
    // Right third lower: live counter
    const pad = 24;
    const sectionGap = 16;
    const leftW   = (w - 2 * pad - 2 * sectionGap) * 0.32;
    const midW    = (w - 2 * pad - 2 * sectionGap) * 0.34;
    const rightW  = (w - 2 * pad - 2 * sectionGap) * 0.34;

    const leftX  = pad;
    const midX   = pad + leftW + sectionGap;
    const rightX = pad + leftW + sectionGap + midW + sectionGap;

    const topY = pad + 8;
    const bagH = h - 2 * pad - 16;

    // ---- Bag (left) ----
    const bagG = svg.append('g').attr('class', 'mm-bag-g');
    bagG.append('text')
      .attr('x', leftX + leftW / 2)
      .attr('y', topY)
      .attr('text-anchor', 'middle')
      .attr('class', 'mm-section-title')
      .text('the bag · 30 training rows');

    bagG.append('rect')
      .attr('x', leftX).attr('y', topY + 10)
      .attr('width', leftW).attr('height', bagH - 10)
      .attr('rx', 8).attr('ry', 8)
      .attr('class', 'mm-bag-outline');

    // 6 cols × 5 rows of marbles in the bag
    const bagCols = 6, bagRows = 5;
    const bagInnerPad = 14;
    const bagAreaX = leftX + bagInnerPad;
    const bagAreaY = topY + 10 + bagInnerPad;
    const bagAreaW = leftW - 2 * bagInnerPad;
    const bagAreaH = bagH - 10 - 2 * bagInnerPad;
    const cellW = bagAreaW / bagCols;
    const cellH = bagAreaH / bagRows;
    const marbleR = Math.min(cellW, cellH) * 0.36;

    function bagPos(idx) {
      const c = idx % bagCols;
      const r = Math.floor(idx / bagCols);
      return {
        x: bagAreaX + (c + 0.5) * cellW,
        y: bagAreaY + (r + 0.5) * cellH,
      };
    }

    const marbles = bagG.append('g').attr('class', 'mm-bag-marbles');
    const marbleSel = marbles.selectAll('circle.mm-marble')
      .data(d3.range(N))
      .enter()
      .append('circle')
      .attr('class', 'mm-marble')
      .attr('cx', i => bagPos(i).x)
      .attr('cy', i => bagPos(i).y)
      .attr('r',  marbleR)
      .attr('data-idx', i => i);

    bagG.append('g').attr('class', 'mm-bag-labels')
      .selectAll('text')
      .data(d3.range(N))
      .enter()
      .append('text')
      .attr('class', 'mm-marble-label')
      .attr('data-idx', i => i)
      .attr('x', i => bagPos(i).x)
      .attr('y', i => bagPos(i).y)
      .text(i => i + 1);

    // ---- Tray (middle) ----
    const trayG = svg.append('g').attr('class', 'mm-tray-g');
    trayG.append('text')
      .attr('x', midX + midW / 2)
      .attr('y', topY)
      .attr('text-anchor', 'middle')
      .attr('class', 'mm-section-title')
      .text('drawn with replacement');

    trayG.append('rect')
      .attr('x', midX).attr('y', topY + 10)
      .attr('width', midW).attr('height', bagH - 10)
      .attr('rx', 4).attr('ry', 4)
      .attr('class', 'mm-tray-outline');

    // Same 6×5 grid in the tray; duplicates stack as small rosettes around the centre.
    const trayInnerPad = 14;
    const trayAreaX = midX + trayInnerPad;
    const trayAreaY = topY + 10 + trayInnerPad;
    const trayAreaW = midW - 2 * trayInnerPad;
    const trayAreaH = bagH - 10 - 2 * trayInnerPad;
    const tCellW = trayAreaW / bagCols;
    const tCellH = trayAreaH / bagRows;
    const trayR  = Math.min(tCellW, tCellH) * 0.22;
    function trayPos(idx) {
      const c = idx % bagCols;
      const r = Math.floor(idx / bagCols);
      return {
        x: trayAreaX + (c + 0.5) * tCellW,
        y: trayAreaY + (r + 0.5) * tCellH,
      };
    }
    // Sub-positions for duplicates within a tray cell. Up to 6 stacked.
    function trayDuplicateOffset(slot) {
      const angle = (slot - 1) * (2 * Math.PI / 6) - Math.PI / 2;
      const ring = Math.min(tCellW, tCellH) * 0.22;
      if (slot === 0) return { dx: 0, dy: 0 };
      return { dx: Math.cos(angle) * ring, dy: Math.sin(angle) * ring };
    }

    const trayMarblesG = trayG.append('g').attr('class', 'mm-tray-marbles');

    // ---- Inset chart (right, top) ----
    const chartH = (h - 2 * pad - 16) * 0.55;
    const chartX = rightX;
    const chartY = topY + 10;
    const chartG = svg.append('g').attr('class', 'mm-chart-g')
      .attr('transform', `translate(${chartX},${chartY})`);

    chartG.append('text')
      .attr('x', rightW / 2).attr('y', -4)
      .attr('text-anchor', 'middle')
      .attr('class', 'mm-section-title')
      .text('fraction-unique vs draws');

    const chartM = { top: 22, right: 14, bottom: 26, left: 32 };
    const innerW = rightW - chartM.left - chartM.right;
    const innerH = chartH - chartM.top - chartM.bottom;

    const xs = d3.scaleLinear().domain([0, N]).range([0, innerW]);
    const ys = d3.scaleLinear().domain([0, 1]).range([innerH, 0]);

    const chartInner = chartG.append('g')
      .attr('transform', `translate(${chartM.left},${chartM.top})`);

    // Axes
    chartInner.append('g')
      .attr('class', 'mm-chart-axis')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(xs).ticks(5).tickSize(3));
    chartInner.append('g')
      .attr('class', 'mm-chart-axis')
      .call(d3.axisLeft(ys).ticks(4).tickSize(3).tickFormat(d3.format('.1f')));

    // Asymptote at 1 - 1/e ≈ 0.632
    const asym = 1 - 1 / Math.E;
    chartInner.append('line')
      .attr('class', 'mm-chart-asymptote')
      .attr('x1', 0).attr('x2', innerW)
      .attr('y1', ys(asym)).attr('y2', ys(asym));
    chartInner.append('text')
      .attr('class', 'mm-chart-asymptote-label')
      .attr('x', innerW - 4).attr('y', ys(asym) - 4)
      .attr('text-anchor', 'end')
      .text('1 − 1/e ≈ 0.632');

    // Empty curve path that gets re-set on every frame.
    const linePath = chartInner.append('path')
      .attr('class', 'mm-chart-curve');
    const progressDot = chartInner.append('circle')
      .attr('class', 'mm-chart-progress-dot')
      .attr('r', 2.5)
      .attr('cx', xs(0)).attr('cy', ys(0))
      .attr('opacity', 0);

    const lineGen = d3.line()
      .x(d => xs(d.drawCount))
      .y(d => ys(d.uniqueFraction));

    // ---- Live counter (right, bottom) ----
    const counterY = topY + 10 + chartH + 18;
    const counterG = svg.append('g')
      .attr('transform', `translate(${rightX + rightW / 2},${counterY})`);
    counterG.append('text')
      .attr('class', 'mm-counter-label')
      .attr('text-anchor', 'middle').attr('y', 0)
      .text('unique rows so far');
    const counterValue = counterG.append('text')
      .attr('class', 'mm-counter-value')
      .attr('text-anchor', 'middle').attr('y', 30)
      .text('0 / 30');
    const counterPct = counterG.append('text')
      .attr('class', 'mm-counter-label')
      .attr('text-anchor', 'middle').attr('y', 50)
      .text('0%');

    // ---- Initial readout ----
    setReadoutWithCaption(
      ctx.readout,
      [['N', '30'], ['drawn', '0 / 30'], ['unique', '0 (0%)']],
      'Drawing rows with replacement…'
    );

    // ---- Animation loop ----
    const seenCount = new Array(N).fill(0);
    let drawIdx = 0;
    const stepMs = 130;            // ~130ms per draw -> 30 draws ≈ 3.9s
    const flightMs = Math.max(80, stepMs - 20);

    // Force a "first frame" of the curve at draw 0 so the line draws on cleanly.
    linePath.datum([{ drawCount: 0, uniqueFraction: 0 }]).attr('d', lineGen);

    function step() {
      if (drawIdx >= seq.length) {
        finishBootstrap();
        return;
      }
      const idx = seq[drawIdx];
      seenCount[idx] += 1;

      // Animate a flying marble from bag → tray.
      const from = bagPos(idx);
      const slot = seenCount[idx] - 1;        // 0..5
      const target = trayPos(idx);
      const off = trayDuplicateOffset(slot);
      const tx = target.x + off.dx;
      const ty = target.y + off.dy;

      svg.append('circle')
        .attr('class', 'mm-tray-marble')
        .attr('cx', from.x).attr('cy', from.y).attr('r', marbleR * 0.95)
        .attr('opacity', 0.9)
        .transition().duration(flightMs).ease(d3.easeCubicOut)
        .attr('cx', tx).attr('cy', ty).attr('r', trayR)
        .on('end', function () {
          // Park it in the tray group permanently.
          const node = this;
          trayMarblesG.node().appendChild(node);
        });

      // Mark the bag marble as "drawn at least once" (subtle colour bump).
      marbleSel.filter(d => d === idx).classed('mm-marble-drawn', true);

      // Update curve up through this draw.
      drawIdx += 1;
      const partial = curve.slice(0, drawIdx);
      // Prepend a (0, 0) anchor so the line starts at the origin.
      linePath.datum([{ drawCount: 0, uniqueFraction: 0 }].concat(partial))
        .attr('d', lineGen);
      const last = partial[partial.length - 1];
      progressDot
        .attr('opacity', 1)
        .attr('cx', xs(last.drawCount))
        .attr('cy', ys(last.uniqueFraction));

      // Update counter (use derived "unique so far" from seenCount because the
      // curve's uniqueFraction is monotone-by-construction — we want to show
      // the same number).
      const uniqueSoFar = seenCount.filter(c => c > 0).length;
      const pct = Math.round((uniqueSoFar / N) * 100);
      counterValue.text(`${uniqueSoFar} / ${N}`);
      counterPct.text(`${pct}%`);

      setReadoutWithCaption(
        ctx.readout,
        [['N', '30'], ['drawn', `${drawIdx} / 30`], ['unique', `${uniqueSoFar} (${pct}%)`]],
        'Drawing rows with replacement…'
      );

      bootstrapTimer = setTimeout(step, stepMs);
    }

    function finishBootstrap() {
      bootstrapTimer = null;
      // Mark out-of-bag marbles in the bag using finalCounts (authoritative).
      const oob = [];
      for (let i = 0; i < N; i++) if (finalCounts[i] === 0) oob.push(i);

      marbleSel.filter(d => finalCounts[d] === 0)
        .classed('mm-marble-oob', true);
      // Recolour their labels too.
      d3.select(ctx.svg).selectAll('text.mm-marble-label')
        .filter(d => finalCounts[d] === 0)
        .classed('mm-marble-label-oob', true);

      const uniqueFinal = N - oob.length;
      const pct = Math.round((uniqueFinal / N) * 100);
      const oobPct = Math.round((oob.length / N) * 100);

      setReadoutWithCaption(
        ctx.readout,
        [
          ['N', '30'],
          ['drawn', '30 / 30'],
          ['unique', `${uniqueFinal} (${pct}%)`],
          ['out-of-bag', `${oob.length} (${oobPct}%)`],
        ],
        `${oob.length} rows were never drawn — out-of-bag for this tree. Asymptotically about 37 % of rows.`
      );
    }

    // Kick off after a short pause so the layout is visible before motion starts.
    bootstrapTimer = setTimeout(step, 250);
  }

  // ======================================================================
  // SCENE 4 — mtry
  // ======================================================================

  // Mulberry32 — tiny seeded RNG so re-randomising chips is reproducible per-call.
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function pickK(rng, n, k) {
    const arr = d3.range(n);
    // Fisher–Yates partial shuffle.
    for (let i = 0; i < k; i++) {
      const j = i + Math.floor(rng() * (n - i));
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return new Set(arr.slice(0, k));
  }

  function enterMtry(ctx) {
    clearAll(ctx);

    const meta = window.DATA.meta;
    const fLabels = meta.featureLabels;       // length 4
    const fNames  = meta.featureNames;
    const cNames  = meta.classNames;
    const trees   = window.DATA.mtryDemo.treesByMtry;

    const { w, h } = dims(ctx.svg);
    const svg = d3.select(ctx.svg);
    svg.attr('viewBox', `0 0 ${w} ${h}`).attr('preserveAspectRatio', 'xMidYMid meet');

    // Layout: chip strip across the top (~14% of height); tree fills the rest.
    const pad = 24;
    const stripTop  = pad;
    const stripH    = 56;
    const chipPadX  = 8;
    const stripInnerW = w - 2 * pad;
    const chipW = (stripInnerW - 3 * chipPadX) / 4;
    const chipH = stripH;

    // ---- Chip strip ----
    const stripG = svg.append('g')
      .attr('class', 'mm-chip-strip')
      .attr('transform', `translate(${pad},${stripTop})`);

    stripG.append('text')
      .attr('class', 'mm-section-title')
      .attr('x', 0).attr('y', -6)
      .text('available features at each split');

    const chipG = stripG.selectAll('g.mm-chip')
      .data(d3.range(4))
      .enter()
      .append('g')
      .attr('class', 'mm-chip')
      .attr('transform', i => `translate(${i * (chipW + chipPadX)},0)`);

    chipG.append('rect')
      .attr('class', 'mm-chip-rect')
      .attr('width', chipW).attr('height', chipH)
      .attr('rx', 4).attr('ry', 4);

    chipG.append('text')
      .attr('class', 'mm-chip-label')
      .attr('x', chipW / 2).attr('y', chipH / 2)
      .text(i => fLabels[i]);

    // ---- Tree area ----
    const treeTop    = stripTop + stripH + 28;
    const treeBottom = h - pad - 8;
    const treeLeft   = pad + 12;
    const treeRight  = w - pad - 12;
    const treeW = treeRight - treeLeft;
    const treeH = treeBottom - treeTop;

    const treeG = svg.append('g')
      .attr('class', 'mm-tree-g')
      .attr('transform', `translate(${treeLeft},${treeTop})`);

    // ---- Build d3 hierarchy from a flat node list ----
    function buildHierarchy(nodes) {
      function recur(id) {
        const n = nodes[id];
        if (n.isLeaf) return { ...n, _id: id, children: null };
        return {
          ...n, _id: id,
          children: [recur(n.left), recur(n.right)],
        };
      }
      return recur(0);
    }

    let currentMtry = 2;
    let mtryRngLocal = makeRng(7);

    function renderTree(mtry) {
      const tree = trees[String(mtry)];
      const root = d3.hierarchy(buildHierarchy(tree.nodes));
      const layout = d3.tree().size([treeW, treeH]);
      layout(root);

      // ---- Edges ----
      const edgeSel = treeG.selectAll('path.mm-edge')
        .data(root.links(), d => `${d.source.data._id}->${d.target.data._id}`);
      edgeSel.exit().transition().duration(400).attr('opacity', 0).remove();
      edgeSel.enter().append('path')
        .attr('class', 'mm-edge')
        .attr('opacity', 0)
        .attr('d', linkPath)
        .merge(edgeSel)
        .transition().duration(600)
        .attr('opacity', 1)
        .attr('d', linkPath);

      // ---- Nodes ----
      const nodeSel = treeG.selectAll('g.mm-node')
        .data(root.descendants(), d => d.data._id);
      nodeSel.exit().transition().duration(400).attr('opacity', 0).remove();

      const nodeEnter = nodeSel.enter().append('g')
        .attr('class', 'mm-node')
        .attr('opacity', 0)
        .attr('transform', d => `translate(${d.x},${d.y})`);

      // Internal: rounded rectangle with feature label + threshold inside
      // Leaf: circle filled with majority-class colour
      nodeEnter.each(function (d) {
        const g = d3.select(this);
        if (d.data.isLeaf) {
          const r = 16;
          g.append('circle')
            .attr('class', `mm-node-leaf cluster-${d.data.majorityClass + 1}`)
            .attr('r', r);
          g.append('text')
            .attr('class', 'mm-leaf-label')
            .attr('y', 0)
            .text(cNames[d.data.majorityClass][0]);   // initial: A / C / G
          g.append('text')
            .attr('class', 'mm-leaf-label')
            .attr('y', 11)
            .style('font-size', '7.5px')
            .text(`n=${d.data.samples}`);
        } else {
          const rectW = 96, rectH = 36;
          g.append('rect')
            .attr('class', 'mm-node-internal')
            .attr('x', -rectW / 2).attr('y', -rectH / 2)
            .attr('width', rectW).attr('height', rectH)
            .attr('rx', 4).attr('ry', 4);
          // Short feature name (e.g. bill_length_mm → bill length)
          g.append('text')
            .attr('class', 'mm-node-label')
            .attr('y', -7)
            .text(shortFeatureLabel(fLabels[d.data.feature]));
          g.append('text')
            .attr('class', 'mm-node-label-sub')
            .attr('y', 8)
            .text(`≤ ${formatThreshold(d.data.threshold, d.data.feature)}`);
        }
      });

      const merged = nodeEnter.merge(nodeSel);
      merged.transition().duration(600)
        .attr('opacity', 1)
        .attr('transform', d => `translate(${d.x},${d.y})`);
    }

    function linkPath(d) {
      // Smooth vertical link.
      const sx = d.source.x, sy = d.source.y;
      const tx = d.target.x, ty = d.target.y;
      const my = (sy + ty) / 2;
      return `M${sx},${sy} C${sx},${my} ${tx},${my} ${tx},${ty}`;
    }

    function shortFeatureLabel(label) {
      // "Bill length (mm)" → "bill length"; strip units in parens, lower-case.
      return label.replace(/\s*\(.+\)\s*$/, '').toLowerCase();
    }

    function formatThreshold(t, featureIdx) {
      // body_mass_g (idx 3) is in grams: drop decimals.
      if (featureIdx === 3) return Math.round(t).toLocaleString();
      // Otherwise 1 decimal place is plenty.
      return (Math.abs(t - Math.round(t)) < 0.05)
        ? String(Math.round(t))
        : t.toFixed(1);
    }

    function highlightChips(mtry) {
      const subset = pickK(mtryRngLocal, 4, mtry);
      const chips = stripG.selectAll('g.mm-chip');
      chips.select('rect.mm-chip-rect')
        .classed('mm-chip-on', i => subset.has(i));
      chips.select('text.mm-chip-label')
        .classed('mm-chip-label-on', i => subset.has(i));
    }

    function captionFor(mtry) {
      if (mtry === 4) {
        return 'When mtry = 4, every split picks the best of all 4 features. ' +
               'Trees become highly correlated — they’d all look alike.';
      }
      return `When mtry = ${mtry}, each split picks the best of ${mtry} random features ` +
             `out of ${4}. Lower mtry means more diverse, weaker trees.`;
    }

    function refresh(mtry, { reroll = true } = {}) {
      currentMtry = mtry;
      if (reroll) highlightChips(mtry);
      renderTree(mtry);
      const t = trees[String(mtry)];
      const internalCount = t.nodes.filter(n => !n.isLeaf).length;
      const leafCount     = t.nodes.filter(n =>  n.isLeaf).length;
      setReadoutWithCaption(
        ctx.readout,
        [
          ['mtry',    String(mtry)],
          ['features', `${mtry} of 4`],
          ['nodes',    String(t.nodes.length)],
          ['leaves',   String(leafCount)],
          ['splits',   String(internalCount)],
        ],
        captionFor(mtry)
      );
    }

    // ---- Slider control ----
    ctx.controls.innerHTML = `
      <div class="mm-slider">
        <div class="mm-slider-row">
          <span class="mm-slider-label">mtry</span>
          <input type="range" id="mm-mtry-range" min="1" max="4" step="1" value="2">
          <span class="mm-slider-value" id="mm-mtry-value">2 / 4</span>
        </div>
      </div>`;

    const range = ctx.controls.querySelector('#mm-mtry-range');
    const valueLabel = ctx.controls.querySelector('#mm-mtry-value');
    range.addEventListener('input', () => {
      const v = +range.value;
      valueLabel.textContent = `${v} / 4`;
      refresh(v);
    });

    // First paint.
    refresh(2);
  }

  // ======================================================================
  // Scene dispatcher
  // ======================================================================

  window.SCENES.marblesMtry = {
    enter(ctx, { sub /*, idx */ }) {
      if (sub === 'bootstrap')   enterBootstrap(ctx);
      else if (sub === 'mtry')   enterMtry(ctx);
      else                       clearAll(ctx);   // unknown sub — fail soft
    },
    exit(ctx) {
      if (bootstrapTimer) { clearTimeout(bootstrapTimer); bootstrapTimer = null; }
      d3.select(ctx.svg).selectAll('*').interrupt();
      ctx.overlay.innerHTML = '';
    },
  };
})();
