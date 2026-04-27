// VIZ: similarity — owns scene 9 (tree similarity MDS map + clusters).
//
// Pedagogical goal: 100 trees aren't 100 unique voices — they cluster into a
// handful (here, 5) of similar trees. LEFT: 2D MDS scatter colored by cluster.
// RIGHT: when a cluster is clicked, render the representative tree's decision
// boundary on a small scatter of training points.

window.SCENES.similarity = {
  enter(ctx, { sub }) {
    const { svg, overlay, readout, controls } = ctx;
    const sim = ctx.data.similarity;
    const forest2D = ctx.data.forest2D;
    const points = ctx.data.points;
    const scatter = ctx.data.scatter;
    const meta = ctx.data.meta;
    const gridRes = meta.boundaryGridResLow;

    // --- Reset stage --------------------------------------------------------
    d3.select(svg).selectAll('*').remove();
    overlay.innerHTML = '';
    controls.innerHTML = '';
    readout.innerHTML = '';

    // --- Cluster centroids in MDS space (for "representative tree" lookup) -
    const K = sim.nClusters;
    const sums = Array.from({ length: K }, () => ({ x: 0, y: 0, n: 0 }));
    sim.clusterIdx.forEach((c, i) => {
      sums[c].x += sim.mdsCoords[i].x;
      sums[c].y += sim.mdsCoords[i].y;
      sums[c].n += 1;
    });
    const centroids = sums.map(s => ({ x: s.x / s.n, y: s.y / s.n, n: s.n }));

    // For each cluster, find the tree closest to its centroid.
    const reps = centroids.map((c, k) => {
      let best = -1, bestD = Infinity;
      for (let i = 0; i < sim.mdsCoords.length; i++) {
        if (sim.clusterIdx[i] !== k) continue;
        const dx = sim.mdsCoords[i].x - c.x;
        const dy = sim.mdsCoords[i].y - c.y;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = i; }
      }
      return best;
    });

    const counts = centroids.map(c => c.n);

    // --- Layout -------------------------------------------------------------
    const stage = svg.parentElement;
    const W = stage.clientWidth || 720;
    const H = stage.clientHeight || 540;
    const sel = d3.select(svg);
    sel.attr('viewBox', `0 0 ${W} ${H}`)
       .attr('preserveAspectRatio', 'xMidYMid meet');

    // Top caption strip is rendered via overlay HTML (not SVG) for crisp text.
    const captionEl = document.createElement('div');
    captionEl.className = 'sm-caption';
    captionEl.innerHTML =
      `<span>100 trees, but only <strong>${K}</strong> distinct voices.</span>` +
      `<span class="sm-cluster-badges">${
        counts.map((n, k) =>
          `<span class="sm-badge cluster-${k + 1}">cluster ${k + 1} · ${n}</span>`
        ).join('')
      }</span>`;
    overlay.appendChild(captionEl);

    // Pixel margins for the two side-by-side panels.
    const reservedTop = 56;          // caption strip
    const margin = { top: reservedTop + 16, right: 18, bottom: 50, left: 56 };
    const gap = 24;
    const panelW = (W - margin.left - margin.right - gap) / 2;
    const panelH = H - margin.top - margin.bottom;

    // --- LEFT panel: MDS scatter -------------------------------------------
    const mdsX = sim.mdsCoords.map(p => p.x);
    const mdsY = sim.mdsCoords.map(p => p.y);
    const xPad = (d3.max(mdsX) - d3.min(mdsX)) * 0.08;
    const yPad = (d3.max(mdsY) - d3.min(mdsY)) * 0.08;
    const mx = d3.scaleLinear()
      .domain([d3.min(mdsX) - xPad, d3.max(mdsX) + xPad])
      .range([0, panelW]);
    const my = d3.scaleLinear()
      .domain([d3.min(mdsY) - yPad, d3.max(mdsY) + yPad])
      .range([panelH, 0]);

    const gMds = sel.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    gMds.append('rect')
      .attr('class', 'sm-panel-bg')
      .attr('x', -8).attr('y', -8)
      .attr('width', panelW + 16).attr('height', panelH + 16);

    gMds.append('text')
      .attr('class', 'sm-panel-title')
      .attr('x', 0).attr('y', -14)
      .text('Tree similarity (2D MDS)');

    // Axes
    gMds.append('g')
      .attr('class', 'sm-axis')
      .attr('transform', `translate(0,${panelH})`)
      .call(d3.axisBottom(mx).ticks(5).tickFormat(d => d.toFixed(2)));
    gMds.append('g')
      .attr('class', 'sm-axis')
      .call(d3.axisLeft(my).ticks(5).tickFormat(d => d.toFixed(2)));

    gMds.append('text')
      .attr('class', 'sm-axis-label')
      .attr('x', panelW / 2).attr('y', panelH + 38)
      .attr('text-anchor', 'middle')
      .text('MDS dimension 1');
    gMds.append('text')
      .attr('class', 'sm-axis-label')
      .attr('transform', `translate(-40,${panelH / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .text('MDS dimension 2');

    // Convex-hull-ish: light circle around each cluster centroid for visual cohesion.
    const gHulls = gMds.append('g').attr('class', 'sm-hulls');
    centroids.forEach((c, k) => {
      // Estimate radius as max distance from centroid to its members in screen px.
      let rmax = 0;
      for (let i = 0; i < sim.mdsCoords.length; i++) {
        if (sim.clusterIdx[i] !== k) continue;
        const dx = mx(sim.mdsCoords[i].x) - mx(c.x);
        const dy = my(sim.mdsCoords[i].y) - my(c.y);
        rmax = Math.max(rmax, Math.hypot(dx, dy));
      }
      gHulls.append('circle')
        .attr('class', `sm-hull cluster-${k + 1}`)
        .attr('data-cluster', k)
        .attr('cx', mx(c.x))
        .attr('cy', my(c.y))
        .attr('r', rmax + 8);
    });

    // Points
    const gPts = gMds.append('g').attr('class', 'sm-points');
    const ptSel = gPts.selectAll('circle.sm-point')
      .data(sim.mdsCoords.map((p, i) => ({ x: p.x, y: p.y, idx: i, c: sim.clusterIdx[i] })))
      .enter()
      .append('circle')
      .attr('class', d => `sm-point cluster-${d.c + 1}`)
      .attr('data-cluster', d => d.c)
      .attr('data-idx', d => d.idx)
      .attr('cx', d => mx(d.x))
      .attr('cy', d => my(d.y))
      .attr('r', 5);

    // Tooltip layer (overlay HTML so font sizing is consistent).
    const tooltip = document.createElement('div');
    tooltip.className = 'sm-tooltip';
    tooltip.style.display = 'none';
    overlay.appendChild(tooltip);

    function showTooltip(html, clientX, clientY) {
      const stageRect = stage.getBoundingClientRect();
      tooltip.innerHTML = html;
      tooltip.style.display = 'block';
      tooltip.style.left = (clientX - stageRect.left + 12) + 'px';
      tooltip.style.top = (clientY - stageRect.top + 12) + 'px';
    }
    function hideTooltip() { tooltip.style.display = 'none'; }

    ptSel
      .on('mouseenter', function (event, d) {
        d3.select(this).classed('sm-point-hover', true).attr('r', 7);
        showTooltip(
          `Tree #${d.idx} · cluster ${d.c + 1}`,
          event.clientX, event.clientY
        );
      })
      .on('mousemove', function (event) {
        const stageRect = stage.getBoundingClientRect();
        tooltip.style.left = (event.clientX - stageRect.left + 12) + 'px';
        tooltip.style.top = (event.clientY - stageRect.top + 12) + 'px';
      })
      .on('mouseleave', function () {
        d3.select(this).classed('sm-point-hover', false).attr('r', 5);
        hideTooltip();
      })
      .on('click', function (event, d) {
        selectCluster(d.c);
      });

    // Hulls also clickable (large hit target for the cluster).
    gHulls.selectAll('circle.sm-hull')
      .on('click', function () {
        const k = +this.getAttribute('data-cluster');
        selectCluster(k);
      })
      .on('mouseenter', function () {
        d3.select(this).classed('sm-hull-hover', true);
      })
      .on('mouseleave', function () {
        d3.select(this).classed('sm-hull-hover', false);
      });

    // --- RIGHT panel: representative tree boundary -------------------------
    const rightX = margin.left + panelW + gap;
    const gRight = sel.append('g')
      .attr('transform', `translate(${rightX},${margin.top})`);

    gRight.append('rect')
      .attr('class', 'sm-panel-bg')
      .attr('x', -8).attr('y', -8)
      .attr('width', panelW + 16).attr('height', panelH + 16);

    const rightTitle = gRight.append('text')
      .attr('class', 'sm-panel-title')
      .attr('x', 0).attr('y', -14)
      .text('Representative tree');

    // Boundary scales align with the training scatter.
    const bx = d3.scaleLinear().domain([scatter.xMin, scatter.xMax]).range([0, panelW]);
    const by = d3.scaleLinear().domain([scatter.yMin, scatter.yMax]).range([panelH, 0]);

    // Axes for the right panel
    gRight.append('g')
      .attr('class', 'sm-axis')
      .attr('transform', `translate(0,${panelH})`)
      .call(d3.axisBottom(bx).ticks(5));
    gRight.append('g')
      .attr('class', 'sm-axis')
      .call(d3.axisLeft(by).ticks(5));
    gRight.append('text')
      .attr('class', 'sm-axis-label')
      .attr('x', panelW / 2).attr('y', panelH + 38)
      .attr('text-anchor', 'middle')
      .text(scatter.xLabel);
    gRight.append('text')
      .attr('class', 'sm-axis-label')
      .attr('transform', `translate(-40,${panelH / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .text(scatter.yLabel);

    const gBoundary = gRight.append('g').attr('class', 'sm-boundary');
    const gTrainPts = gRight.append('g').attr('class', 'sm-train-pts');
    const placeholder = gRight.append('text')
      .attr('class', 'sm-placeholder')
      .attr('x', panelW / 2).attr('y', panelH / 2)
      .attr('text-anchor', 'middle')
      .text('Click a cluster to see a representative tree');

    // Pre-paint training points (transparent until a cluster is selected).
    const trainPts = points.filter(p => p.split === 'train');
    gTrainPts.selectAll('circle.sm-train')
      .data(trainPts)
      .enter().append('circle')
      .attr('class', d => `sm-train cluster-${d.classIdx + 1}`)
      .attr('cx', d => bx(d.x))
      .attr('cy', d => by(d.y))
      .attr('r', 2.4);
    gTrainPts.style('opacity', 0);

    // Render a tree's boundary as 60x60 colored rects.
    function drawBoundary(treeIdx) {
      gBoundary.selectAll('*').remove();
      const grid = forest2D.boundariesLow[treeIdx];
      const cellW = panelW / gridRes;
      const cellH = panelH / gridRes;
      // Build batches per class to minimize DOM count via a single path-per-class? Use rects keyed by class.
      const cells = [];
      for (let j = 0; j < gridRes; j++) {
        for (let i = 0; i < gridRes; i++) {
          const c = grid[j * gridRes + i];
          cells.push({ i, j, c });
        }
      }
      gBoundary.selectAll('rect.sm-cell')
        .data(cells)
        .enter().append('rect')
        .attr('class', d => `sm-cell cluster-${d.c + 1}`)
        .attr('x', d => d.i * cellW)
        .attr('y', d => (gridRes - 1 - d.j) * cellH)  // flip y so origin is bottom-left
        .attr('width', cellW + 0.4)
        .attr('height', cellH + 0.4);
    }

    // --- Selection state ----------------------------------------------------
    let selectedCluster = null;

    function selectCluster(k) {
      if (selectedCluster === k) {
        // Toggle off: clear.
        selectedCluster = null;
        rightTitle.text('Representative tree');
        gBoundary.selectAll('*').remove();
        gTrainPts.style('opacity', 0);
        placeholder.style('display', null);
        ptSel.classed('sm-point-dim', false).classed('sm-point-active', false);
        gHulls.selectAll('circle.sm-hull').classed('sm-hull-active', false);
        readoutFor(null);
        return;
      }
      selectedCluster = k;
      const treeIdx = reps[k];
      placeholder.style('display', 'none');
      drawBoundary(treeIdx);
      gTrainPts.style('opacity', 1);
      rightTitle.text(`Cluster ${k + 1} · representative: tree #${treeIdx}`);
      ptSel
        .classed('sm-point-dim', d => d.c !== k)
        .classed('sm-point-active', d => d.idx === treeIdx);
      gHulls.selectAll('circle.sm-hull')
        .classed('sm-hull-active', function () { return +this.getAttribute('data-cluster') === k; });
      readoutFor(k, treeIdx);
    }

    // --- Readout ------------------------------------------------------------
    readout.innerHTML = `
      <div class="readout-cell">
        <span class="readout-label">Trees</span>
        <span class="readout-value">100</span>
      </div>
      <div class="readout-cell">
        <span class="readout-label">Clusters</span>
        <span class="readout-value">${K}</span>
      </div>
      <div class="readout-cell">
        <span class="readout-label">Selected</span>
        <span class="readout-value" id="sm-ro-sel">—</span>
      </div>
      <div class="readout-cell">
        <span class="readout-label">Cluster size</span>
        <span class="readout-value" id="sm-ro-size">—</span>
      </div>
    `;
    const roSel = readout.querySelector('#sm-ro-sel');
    const roSize = readout.querySelector('#sm-ro-size');

    function readoutFor(k, treeIdx) {
      if (k == null) {
        roSel.textContent = '—';
        roSize.textContent = '—';
      } else {
        roSel.textContent = `tree #${treeIdx}`;
        roSize.textContent = String(counts[k]);
      }
    }
  },

  exit(ctx) {
    ctx.overlay.innerHTML = '';
    ctx.controls.innerHTML = '';
    ctx.readout.innerHTML = '';
    d3.select(ctx.svg).selectAll('*').remove();
  },
};
