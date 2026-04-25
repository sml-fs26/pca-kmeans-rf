/* Scene 5 — Two hidden axes.
 *
 * Sorted matrix (rows + cols both BA, IA, BR, IR). The 4 matching categories
 * sit on the main diagonal as bright blocks; opposing categories on the
 * anti-diagonal as dark blocks. Step-through reveals row groups, then col
 * groups, then names the two latent axes that explain the structure.
 */

window.scenes.scene5 = function (root) {
  const D = window.MOVIES_DATA;
  const STEPS = 4; // 1: just sorted matrix, 2: row stripes, 3: col stripes, 4: quadrant labels
  let cursor = 1;

  const layout = document.createElement('div');
  layout.className = 'scene-layout s5-layout';
  root.appendChild(layout);

  const vizCol = document.createElement('div');
  vizCol.className = 's5-viz-col';
  layout.appendChild(vizCol);

  const vizWrap = document.createElement('div');
  vizWrap.className = 'viz-wrap s5-viz-wrap';
  vizCol.appendChild(vizWrap);

  const textCol = document.createElement('div');
  textCol.className = 'text-col s5-text';
  layout.appendChild(textCol);

  const stepPill = document.createElement('div');
  stepPill.className = 'step-pill';
  textCol.appendChild(stepPill);

  const heading = document.createElement('h2');
  textCol.appendChild(heading);

  const body = document.createElement('div');
  body.className = 's5-body';
  textCol.appendChild(body);

  // ---- Heatmap (sorted) ----
  const hm = Heatmap.create(vizWrap, {
    matrix: D.ratings.matrix,
    users: D.users,
    movies: D.movies,
    rowOrder: D.shuffle.sortedRowOrder,
    colOrder: D.shuffle.sortedColOrder,
    cellW: 38, cellH: 24, leftW: 90, headerH: 130,
    showCellText: true,
  });

  // After the heatmap exists, draw overlays into its overlay group based on
  // step. We need access to cell dimensions.
  const dims = hm.getDimensions();
  const overlay = hm.gOverlay();

  // Both rows and cols sorted BA, IA, BR, IR.
  const ROW_GROUPS = [
    { code: 'BA', start: 0,  count: 4, cluster: 1 },
    { code: 'IA', start: 4,  count: 4, cluster: 3 },
    { code: 'BR', start: 8,  count: 4, cluster: 2 },
    { code: 'IR', start: 12, count: 4, cluster: 4 },
  ];
  const COL_GROUPS = [
    { code: 'BA', start: 0, count: 3, cluster: 1 },
    { code: 'IA', start: 3, count: 3, cluster: 3 },
    { code: 'BR', start: 6, count: 3, cluster: 2 },
    { code: 'IR', start: 9, count: 3, cluster: 4 },
  ];

  function clearOverlays() {
    overlay.selectAll('.s5-overlay').remove();
  }

  function drawRowStripes() {
    overlay.selectAll('rect.s5-row-stripe')
      .data(ROW_GROUPS)
      .enter()
      .append('rect')
      .attr('class', d => `s5-overlay s5-row-stripe`)
      .attr('x', -2)
      .attr('y', d => d.start * dims.cellH - 1)
      .attr('width', dims.cellW * D.movies.length + 3)
      .attr('height', d => d.count * dims.cellH + 1)
      .attr('rx', 4)
      .attr('fill', 'none')
      .attr('stroke', d => `var(--c${d.cluster})`)
      .attr('stroke-width', 2)
      .style('opacity', 0)
      .transition().duration(450).style('opacity', 0.85);

    // Side labels: short category names next to each row stripe.
    overlay.selectAll('text.s5-row-cat-label')
      .data(ROW_GROUPS)
      .enter()
      .append('text')
      .attr('class', 's5-overlay s5-row-cat-label')
      .attr('x', -10)
      .attr('y', d => d.start * dims.cellH + d.count * dims.cellH / 2)
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'middle')
      .attr('fill', d => `var(--c${d.cluster})`)
      .style('opacity', 0)
      .text(d => D.categories[d.code].short)
      .transition().delay(200).duration(400).style('opacity', 1);
  }

  function drawColStripes() {
    overlay.selectAll('rect.s5-col-stripe')
      .data(COL_GROUPS)
      .enter()
      .append('rect')
      .attr('class', d => `s5-overlay s5-col-stripe`)
      .attr('x', d => d.start * dims.cellW - 1)
      .attr('y', -2)
      .attr('width', d => d.count * dims.cellW + 1)
      .attr('height', dims.cellH * D.users.length + 3)
      .attr('rx', 4)
      .attr('fill', 'none')
      .attr('stroke', d => `var(--c${d.cluster})`)
      .attr('stroke-width', 2)
      .style('opacity', 0)
      .transition().duration(450).style('opacity', 0.85);

    // Top labels: short category names above each col stripe.
    overlay.selectAll('text.s5-col-cat-label')
      .data(COL_GROUPS)
      .enter()
      .append('text')
      .attr('class', 's5-overlay s5-col-cat-label')
      .attr('x', d => d.start * dims.cellW + d.count * dims.cellW / 2)
      .attr('y', -10)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'baseline')
      .attr('fill', d => `var(--c${d.cluster})`)
      .style('opacity', 0)
      .text(d => D.categories[d.code].short)
      .transition().delay(200).duration(400).style('opacity', 1);
  }

  function drawDiagonalHighlight() {
    // Highlight the four matching diagonal blocks with a soft border + glow.
    ROW_GROUPS.forEach(rg => {
      COL_GROUPS.forEach(cg => {
        if (rg.code !== cg.code) return;
        overlay.append('rect')
          .attr('class', 's5-overlay s5-diag-block')
          .attr('x', cg.start * dims.cellW - 2)
          .attr('y', rg.start * dims.cellH - 2)
          .attr('width', cg.count * dims.cellW + 3)
          .attr('height', rg.count * dims.cellH + 3)
          .attr('rx', 4)
          .attr('fill', 'none')
          .attr('stroke', `var(--c${rg.cluster})`)
          .attr('stroke-width', 3)
          .style('opacity', 0)
          .transition().delay(150).duration(450).style('opacity', 1);
      });
    });
  }

  function applyStep(c) {
    clearOverlays();
    if (c >= 2) drawRowStripes();
    if (c >= 3) drawColStripes();
    if (c >= 4) drawDiagonalHighlight();
    renderText(c);
  }

  function renderText(c) {
    stepPill.textContent = `Step ${c} of ${STEPS}`;
    if (c === 1) {
      heading.textContent = 'Two hidden axes.';
      body.innerHTML = `
        <p>The same matrix — sorted by hand. Four blocks of viewers, four blocks of films. Each viewer has a secret category we never told you about:</p>
        <ul class="s5-axis-list">
          <li><strong>BB·Act</strong> — blockbuster action fans</li>
          <li><strong>In·Act</strong> — indie action fans</li>
          <li><strong>BB·Rom</strong> — blockbuster romance fans</li>
          <li><strong>In·Rom</strong> — indie romance fans</li>
        </ul>
        <p class="muted">Press <kbd>→</kbd> to overlay them.</p>
      `;
    } else if (c === 2) {
      heading.textContent = 'Four viewer groups.';
      body.innerHTML = `<p>The 16 viewers fall into four groups of four. Same with the films, by genre and budget. Their tastes line up with the labels — top rows are action fans, bottom rows romance fans; blockbuster taste sits inside each.</p>`;
    } else if (c === 3) {
      heading.textContent = 'Same four groups for films.';
      body.innerHTML = `<p>The films sort the same way: BB·Act, In·Act, BB·Rom, In·Rom. Now look diagonally — wherever a viewer group meets <em>its own</em> film group, the cells are bright. Where opposites meet, they're cool.</p>`;
    } else if (c === 4) {
      heading.textContent = 'Two latent attributes.';
      body.innerHTML = `
        <p>Four bright blocks on the diagonal. But the categories aren't independent — they sit on a 2×2 grid:</p>
        <div class="s5-attr-grid">
          <span></span>
          <span class="s5-attr-h">action</span>
          <span class="s5-attr-h">romance</span>
          <span class="s5-attr-v">blockbuster</span>
          <span class="cluster-1">BB·Act</span>
          <span class="cluster-2">BB·Rom</span>
          <span class="s5-attr-v">indie</span>
          <span class="cluster-3">In·Act</span>
          <span class="cluster-4">In·Rom</span>
        </div>
        <div class="callout">
          <div class="callout-title">The point</div>
          <p style="margin:0">Each viewer's whole 12-dimensional rating row is determined by just <strong>two attributes</strong>: <em>action ↔ romance</em> and <em>blockbuster ↔ indie</em>. The structure lives in 2D — the next scenes show how to find it without knowing the labels.</p>
        </div>
      `;
    }
  }

  function setCursor(c) {
    if (c < 1) return false;
    if (c > STEPS) return false;
    cursor = c;
    applyStep(c);
    return true;
  }

  applyStep(cursor);

  return {
    onEnter() {
      cursor = 1;
      applyStep(cursor);
    },
    onLeave() {
      clearOverlays();
    },
    onNextKey() {
      if (cursor >= STEPS) return false;
      return setCursor(cursor + 1);
    },
    onPrevKey() {
      if (cursor <= 1) return false;
      return setCursor(cursor - 1);
    },
  };
};
