/* Scene 8 — Everyone in 2D.
 * Scatter on PC1/PC2 of all N faces. Hover a point → face thumbnail pops up.
 * STUB: working scatter (D3) + thumbnail-on-hover, colored by subject mod 6.
 * TODO for the real version: a "color by subject vs. by pose" toggle. */

window.scenes.scene8 = function (root) {
  const layout = document.createElement('div');
  layout.className = 'scene-layout right-text';
  root.appendChild(layout);

  const left = document.createElement('div');
  left.className = 'viz-wrap';
  layout.appendChild(left);

  const svg = d3.select(left).append('svg').attr('class', 'scatter-svg');

  const right = document.createElement('div');
  right.className = 'text-col';
  layout.appendChild(right);

  right.innerHTML = `
    <h2>Everyone, projected.</h2>
    <p class="muted">Each face becomes a point at its (PC1, PC2) coordinates. Same-subject poses cluster — PCA discovered identity from raw pixels alone.</p>
    <div id="s8-thumb-wrap" style="margin-top:24px; min-height:160px; display:flex; flex-direction:column; align-items:center;">
      <div class="muted" style="font-size:13px; margin-bottom:8px;">hover a point</div>
    </div>
  `;

  let thumbCanvas = null;

  function build() {
    svg.selectAll('*').remove();
    const F = Faces.get();
    if (!F) {
      svg.append('text').attr('x', 20).attr('y', 30)
        .attr('fill', 'var(--muted)').text('⏳ waiting for data — run precompute/build-data.py');
      return;
    }
    const node = left;
    const W = node.clientWidth || 600;
    const H = node.clientHeight || 400;
    svg.attr('viewBox', `0 0 ${W} ${H}`);

    const pad = { l: 40, r: 20, t: 20, b: 30 };
    const N = F.meta.N, K = F.meta.K;
    const xs = new Float32Array(N), ys = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      xs[i] = F.proj[i * K + 0];
      ys[i] = F.proj[i * K + 1];
    }
    const x = d3.scaleLinear().domain(d3.extent(xs)).nice().range([pad.l, W - pad.r]);
    const y = d3.scaleLinear().domain(d3.extent(ys)).nice().range([H - pad.b, pad.t]);

    svg.append('g').attr('class', 'axis')
      .attr('transform', `translate(0,${H - pad.b})`).call(d3.axisBottom(x).ticks(5));
    svg.append('g').attr('class', 'axis')
      .attr('transform', `translate(${pad.l},0)`).call(d3.axisLeft(y).ticks(5));

    const D = F.meta.W * F.meta.H;
    svg.append('g').selectAll('circle')
      .data(d3.range(N)).enter().append('circle')
      .attr('class', d => `scatter-point subject-${(F.labels.subjects[d] % 6) + 1}`)
      .attr('cx', d => x(xs[d]))
      .attr('cy', d => y(ys[d]))
      .attr('r', 3.2)
      .on('mouseenter', (event, d) => {
        const wrap = document.getElementById('s8-thumb-wrap');
        wrap.innerHTML = '';
        if (!thumbCanvas) thumbCanvas = FaceCanvas.create(null, { w: F.meta.W, h: F.meta.H, scale: 3 });
        wrap.appendChild(thumbCanvas);
        const cap = document.createElement('div');
        cap.className = 'face-caption';
        cap.textContent = `subject ${F.labels.subjects[d] + 1}, pose ${(d % 10) + 1}`;
        wrap.appendChild(cap);
        FaceCanvas.render(thumbCanvas, F.faces.subarray(d * D, (d + 1) * D));
      });
  }

  build();
  window.addEventListener('faces-loaded', build, { once: true });
  window.addEventListener('resize', build);

  return { onLeave() { window.removeEventListener('resize', build); } };
};
