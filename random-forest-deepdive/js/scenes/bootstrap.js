// Scene 4: bootstrap. 200 draws with replacement → ~60% in-bag, ~40% out-of-bag.

window.SCENES.bootstrap = (function () {

  function svgSize(svg) {
    const r = svg.getBoundingClientRect();
    return { w: Math.max(200, r.width), h: Math.max(200, r.height) };
  }

  function clearCtx(ctx) {
    d3.select(ctx.svg).selectAll('*').remove();
    ctx.overlay.innerHTML = '';
    ctx.controls.innerHTML = '';
    ctx.readout.innerHTML = '';
  }

  function readoutCells(ctx, cells) {
    ctx.readout.innerHTML = cells.map(c => `
      <div class="readout-cell">
        <div class="readout-label">${c.label}</div>
        <div class="readout-value">${c.value}</div>
      </div>
    `).join('');
  }
  function fmtPct(x) { return (x * 100).toFixed(1) + '%'; }

  function renderSample(ctx) {
    clearCtx(ctx);
    const svg = d3.select(ctx.svg);
    const { w, h } = svgSize(ctx.svg);
    svg.attr('viewBox', `0 0 ${w} ${h}`).attr('preserveAspectRatio', 'none');

    const { x: sx, y: sy } = RF.makeScales(DATA.grid, w, h, 24, 24);

    svg.append('rect')
      .attr('x', 0).attr('y', 0).attr('width', w).attr('height', h)
      .attr('fill', 'none').attr('stroke', 'var(--rule)').attr('stroke-width', 1);

    const pts = DATA.dataset.points;
    const mult = DATA.bootstrapDemo.multiplicities;
    const inBag = DATA.bootstrapDemo.inBag;

    const haloG = svg.append('g').attr('class', 'halo-layer');
    const oobG  = svg.append('g').attr('class', 'oob-layer');
    const ptsG  = svg.append('g').attr('class', 'points-layer');

    ptsG.selectAll('circle.point')
      .data(pts)
      .enter().append('circle')
      .attr('cx', d => sx(d.x))
      .attr('cy', d => sy(d.y))
      .attr('class', (d, i) => {
        const cls = ['point', 'cluster-' + (d.label === 0 ? 1 : 2)];
        if (!inBag[i]) cls.push('oob-point');
        return cls.join(' ');
      })
      .attr('r', (d, i) => inBag[i] ? (3.5 + 1.0 * Math.sqrt(mult[i])) : 2.6);

    oobG.selectAll('circle.oob-ring')
      .data(pts.map((p, i) => ({ p, i })).filter(d => !inBag[d.i]))
      .enter().append('circle')
      .attr('class', 'oob-ring')
      .attr('cx', d => sx(d.p.x))
      .attr('cy', d => sy(d.p.y))
      .attr('r', 7)
      .attr('fill', 'none');

    const haloData = [];
    pts.forEach((p, i) => {
      const m = mult[i];
      if (m >= 2) {
        for (let k = 0; k < Math.min(m - 1, 2); k++) {
          haloData.push({ p, i, k });
        }
      }
    });
    haloG.selectAll('circle.bag-halo')
      .data(haloData)
      .enter().append('circle')
      .attr('class', 'bag-halo')
      .attr('cx', d => sx(d.p.x))
      .attr('cy', d => sy(d.p.y))
      .attr('r', d => 6 + d.k * 3)
      .attr('fill', 'none');

    function play() {
      haloG.selectAll('circle.bag-halo')
        .attr('opacity', 0)
        .transition().delay((d, i) => 200 + i * 8).duration(280)
        .attr('opacity', 0.55);
      oobG.selectAll('circle.oob-ring')
        .attr('opacity', 0)
        .transition().delay((d, i) => 600 + i * 6).duration(280)
        .attr('opacity', 1);
    }

    ctx.controls.innerHTML = `
      <div class="controls-row">
        <button id="replay-btn">replay draw</button>
        <span class="value">200 draws · seed 42</span>
      </div>
    `;
    ctx.controls.querySelector('#replay-btn').addEventListener('click', play);
    play();

    const s = DATA.bootstrapDemo.stats;
    readoutCells(ctx, [
      { label: 'drawn',        value: '200' },
      { label: 'unique',       value: `${s.nUnique} (${fmtPct(s.pctUnique)})` },
      { label: 'out-of-bag',   value: `${s.nOOB} (${fmtPct(s.pctOOB)})` },
      { label: 'expected oob', value: fmtPct(s.expectedPctOOB) + ' (1/e)' },
    ]);
  }

  function enter(ctx) { renderSample(ctx); }
  function exit(ctx) {
    d3.select(ctx.svg).selectAll('*').interrupt();
  }
  return { enter, exit };
})();
