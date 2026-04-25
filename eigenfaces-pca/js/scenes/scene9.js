/* Scene 9 — Takeaways.
 * Closing copy + scree plot of variance explained. */

window.scenes.scene9 = function (root) {
  const layout = document.createElement('div');
  layout.className = 'scene-layout split-eq';
  root.appendChild(layout);

  const left = document.createElement('div');
  left.className = 'viz-wrap';
  layout.appendChild(left);
  const svg = d3.select(left).append('svg').attr('class', 'scree-svg');

  const right = document.createElement('div');
  right.className = 'text-col';
  layout.appendChild(right);

  right.innerHTML = `
    <h2>Twenty numbers per face.</h2>
    <p class="muted">PCA found a <em>twenty-dimensional subspace</em> that explains the lion's share of the variance in 4096-dimensional pixel space.</p>
    <div class="callout">
      <div class="callout-title">why this matters</div>
      The same idea — find a small subspace that captures most of the data — powers JPEG, modern face-ID embeddings, and the latent spaces inside every diffusion model. Eigenfaces is just the first time it's applied to something the audience recognizes themselves in.
    </div>
    <p class="muted">↗ Try the steerable face. Drag PC1, watch lighting flip. Drag PC2, watch a smile appear. Twenty knobs — and a face.</p>
  `;

  function build() {
    svg.selectAll('*').remove();
    const F = Faces.get();
    if (!F) {
      svg.append('text').attr('x', 20).attr('y', 30)
        .attr('fill', 'var(--muted)').text('⏳ waiting for data');
      return;
    }
    const W = left.clientWidth || 500;
    const H = left.clientHeight || 380;
    svg.attr('viewBox', `0 0 ${W} ${H}`);
    const pad = { l: 50, r: 20, t: 30, b: 40 };

    const ratio = F.varRatio;
    const cum = new Float32Array(ratio.length);
    let s = 0;
    for (let i = 0; i < ratio.length; i++) { s += ratio[i]; cum[i] = s; }

    const x = d3.scaleLinear().domain([1, ratio.length]).range([pad.l, W - pad.r]);
    const y = d3.scaleLinear().domain([0, 1]).range([H - pad.b, pad.t]);

    svg.append('g').attr('class', 'axis')
      .attr('transform', `translate(0,${H - pad.b})`).call(d3.axisBottom(x).ticks(8));
    svg.append('g').attr('class', 'axis')
      .attr('transform', `translate(${pad.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('.0%')));

    svg.append('text').attr('x', W / 2).attr('y', H - 6)
      .attr('text-anchor', 'middle').attr('fill', 'var(--muted)').attr('font-size', 11)
      .text('component k');
    svg.append('text').attr('transform', `rotate(-90) translate(${-(H / 2)},14)`)
      .attr('text-anchor', 'middle').attr('fill', 'var(--muted)').attr('font-size', 11)
      .text('cumulative variance explained');

    const line = d3.line()
      .x((_, i) => x(i + 1))
      .y(d => y(d));
    svg.append('path')
      .datum(Array.from(cum))
      .attr('fill', 'none')
      .attr('stroke', 'var(--accent)')
      .attr('stroke-width', 1.6)
      .attr('d', line);

    svg.append('g').selectAll('rect')
      .data(Array.from(ratio))
      .enter().append('rect')
      .attr('x', (_, i) => x(i + 1) - 2)
      .attr('y', d => y(d))
      .attr('width', 4)
      .attr('height', d => H - pad.b - y(d))
      .attr('fill', 'var(--c1)')
      .attr('opacity', 0.55);
  }

  build();
  window.addEventListener('faces-loaded', build, { once: true });
  window.addEventListener('resize', build);

  return { onLeave() { window.removeEventListener('resize', build); } };
};
