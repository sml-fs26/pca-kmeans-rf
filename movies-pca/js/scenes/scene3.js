/* Scene 3 — The shuffled rating matrix.
 * 16 × 12 heatmap with the precomputed shuffled row/col order.
 * No interaction here; the goal is to provoke the question
 * "is there structure in this?" */

window.scenes.scene3 = function (root) {
  const D = window.MOVIES_DATA;

  const layout = document.createElement('div');
  layout.className = 'scene-layout s3-layout';
  root.appendChild(layout);

  // ---- Left: heatmap ----
  const vizCol = document.createElement('div');
  vizCol.className = 's3-viz-col';
  layout.appendChild(vizCol);

  const vizWrap = document.createElement('div');
  vizWrap.className = 'viz-wrap s3-viz-wrap';
  vizCol.appendChild(vizWrap);

  Heatmap.create(vizWrap, {
    matrix: D.ratings.matrix,
    users: D.users,
    movies: D.movies,
    rowOrder: D.shuffle.rowOrder,
    colOrder: D.shuffle.colOrder,
    cellW: 38, cellH: 24, leftW: 90, headerH: 130,
    showCellText: true,
  });

  // ---- Right: prose + legend ----
  const textCol = document.createElement('div');
  textCol.className = 'text-col s3-text';
  layout.appendChild(textCol);

  textCol.innerHTML = `
    <h2>The rating matrix.</h2>
    <p>Sixteen rows — one per viewer. Twelve columns — one per film. Each cell is a rating from <span class="mono">1</span> to <span class="mono">5</span>.</p>
    <p>The rows and columns are in <strong>random order</strong>.</p>
    <div class="callout">
      <div class="callout-title">Look at it</div>
      <p style="margin:0">Stare for a moment. Is there structure here? Squint. It feels noisy — but the same sixteen people rated all twelve films. Tastes don't change between films.</p>
    </div>
    <div class="s3-legend">
      <div class="s3-legend-row">
        <span class="s3-legend-swatch" style="background: rgb(47,108,177)"></span>
        <span>low rating (1)</span>
      </div>
      <div class="s3-legend-row">
        <span class="s3-legend-swatch" style="background: rgb(249,247,241)"></span>
        <span>middle (3)</span>
      </div>
      <div class="s3-legend-row">
        <span class="s3-legend-swatch" style="background: rgb(184,50,58)"></span>
        <span>high rating (5)</span>
      </div>
    </div>
  `;

  return {};
};
