/* Heatmap renderer for the user × film rating matrix.
 *
 * Used across scenes 3–8. Configurable for: row/col label rendering,
 * cell click handlers, row click handlers, swap-mode (click two labels to swap),
 * row spotlighting, and animated reorderings.
 *
 * Usage:
 *   const hm = Heatmap.create(container, { matrix, users, movies });
 *   hm.render({ rowOrder, colOrder });
 *   hm.setRowOrder(newOrder, { animate: true });
 *
 * The matrix coordinate system uses an SVG with viewBox sized to fit the cells.
 * Layout:                width
 *                  ┌────────────────────┐
 *      header row  │  film labels       │  height: HEADER_H
 *                  ├──────┬─────────────┤
 *      side col    │      │             │
 *                  │ user │   cells     │
 *                  │ labs │             │
 *                  └──────┴─────────────┘
 *                   LEFT_W
 */

window.Heatmap = (function () {

  function valueToColor(v, theme) {
    // v in [1, 5]. Map to a sequential ramp.
    // Use a perceptual ramp: 1 = warm-low, 5 = warm-high.
    const t = Math.max(0, Math.min(1, (v - 1) / 4));
    if (theme === 'dark') {
      // Cool-to-warm interpolation in dark mode.
      // Low: deep slate. High: warm cream-orange.
      const c1 = [40, 50, 70];
      const c2 = [220, 170, 100];
      const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
      const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
      const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
      return `rgb(${r},${g},${b})`;
    }
    // Light mode: cream → muted blue (low rating) vs cream → warm orange (high).
    // Use a diverging interpretation centered at 3 (the baseline) so the eye sees
    // "above expectation" vs "below expectation" clearly.
    const tc = (v - 3) / 2; // -1..+1
    const cream = [249, 247, 241];
    const warm  = [184, 50, 58];   // --c2 red
    const cool  = [47, 108, 177];  // --c1 blue
    const target = tc >= 0 ? warm : cool;
    const m = Math.min(1, Math.abs(tc));
    const r = Math.round(cream[0] + (target[0] - cream[0]) * m);
    const g = Math.round(cream[1] + (target[1] - cream[1]) * m);
    const b = Math.round(cream[2] + (target[2] - cream[2]) * m);
    return `rgb(${r},${g},${b})`;
  }

  function textColorForValue(v) {
    // Pick label color so it stays legible on either bright or pale cells.
    const m = Math.abs(v - 3) / 2;
    return m > 0.55 ? '#f9f7f1' : '#1a1a1a';
  }

  // ---------- shorten film title for top labels ----------
  function shortTitle(t) {
    if (t.length <= 16) return t;
    // Keep words; clip with ellipsis.
    if (t.includes(':')) return t.split(':')[0];
    if (t.includes('—')) return t.split('—')[0];
    return t.slice(0, 14) + '…';
  }

  function create(container, opts) {
    const matrix = opts.matrix;
    const users = opts.users;
    const movies = opts.movies;
    const N = users.length;
    const D = movies.length;

    const padding = opts.padding || { top: 8, left: 8, right: 80, bottom: 8 };
    const cellW = opts.cellW || 36;
    const cellH = opts.cellH || 22;
    const leftW = opts.leftW || 110;
    const headerH = opts.headerH || 110;
    const showCellText = opts.showCellText !== false;

    const totalW = padding.left + leftW + cellW * D + padding.right;
    const totalH = padding.top + headerH + cellH * N + padding.bottom;

    container.innerHTML = '';
    const svg = d3.select(container)
      .append('svg')
      .attr('class', 'heatmap-svg')
      .attr('viewBox', `0 0 ${totalW} ${totalH}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    const root = svg.append('g')
      .attr('transform', `translate(${padding.left}, ${padding.top})`);

    const gColLabels = root.append('g').attr('class', 'g-col-labels');
    const gRowLabels = root.append('g').attr('class', 'g-row-labels');
    const gCells = root.append('g').attr('class', 'g-cells')
      .attr('transform', `translate(${leftW}, ${headerH})`);
    const gOverlay = root.append('g').attr('class', 'g-overlay')
      .attr('transform', `translate(${leftW}, ${headerH})`);

    let rowOrder = [...Array(N).keys()];
    let colOrder = [...Array(D).keys()];

    let onRowLabelClick = null;
    let onColLabelClick = null;
    let onRowClick = null;
    let pendingSwap = { row: null, col: null };

    let rowHighlight = null;       // single highlighted row (visual ring)
    let dimNonHighlight = false;   // dim other rows when a row is highlighted

    function getRowOrder() { return rowOrder.slice(); }
    function getColOrder() { return colOrder.slice(); }

    function setRowOrder(order, { animate = false } = {}) {
      rowOrder = order.slice();
      render({ animate });
    }
    function setColOrder(order, { animate = false } = {}) {
      colOrder = order.slice();
      render({ animate });
    }

    function setHighlight(rowIdx, { dim = false } = {}) {
      rowHighlight = rowIdx;
      dimNonHighlight = dim;
      render({ animate: false });
    }

    function clearHighlight() {
      rowHighlight = null;
      dimNonHighlight = false;
      render({ animate: false });
    }

    function setHandlers(h) {
      onRowLabelClick = h.onRowLabelClick || null;
      onColLabelClick = h.onColLabelClick || null;
      onRowClick = h.onRowClick || null;
      render({ animate: false });
    }

    // Built-in swap behavior helpers.
    function enableSwapMode(onAfterSwap) {
      pendingSwap = { row: null, col: null };
      const rowFn = (uIdx) => {
        if (pendingSwap.row == null) {
          pendingSwap.row = uIdx;
          markPendingRow(uIdx, true);
        } else if (pendingSwap.row === uIdx) {
          markPendingRow(uIdx, false);
          pendingSwap.row = null;
        } else {
          const a = rowOrder.indexOf(pendingSwap.row);
          const b = rowOrder.indexOf(uIdx);
          markPendingRow(pendingSwap.row, false);
          pendingSwap.row = null;
          [rowOrder[a], rowOrder[b]] = [rowOrder[b], rowOrder[a]];
          render({ animate: true });
          if (onAfterSwap) onAfterSwap('row');
        }
      };
      const colFn = (mIdx) => {
        if (pendingSwap.col == null) {
          pendingSwap.col = mIdx;
          markPendingCol(mIdx, true);
        } else if (pendingSwap.col === mIdx) {
          markPendingCol(mIdx, false);
          pendingSwap.col = null;
        } else {
          const a = colOrder.indexOf(pendingSwap.col);
          const b = colOrder.indexOf(mIdx);
          markPendingCol(pendingSwap.col, false);
          pendingSwap.col = null;
          [colOrder[a], colOrder[b]] = [colOrder[b], colOrder[a]];
          render({ animate: true });
          if (onAfterSwap) onAfterSwap('col');
        }
      };
      onRowLabelClick = rowFn;
      onColLabelClick = colFn;
      render({ animate: false });
    }

    function disableSwapMode() {
      pendingSwap = { row: null, col: null };
      onRowLabelClick = null;
      onColLabelClick = null;
      gRowLabels.selectAll('.row-label').classed('pending-swap', false);
      gColLabels.selectAll('.col-label').classed('pending-swap', false);
      render({ animate: false });
    }

    function markPendingRow(uIdx, on) {
      gRowLabels.selectAll('.row-label')
        .classed('pending-swap', d => on && d.uIdx === uIdx);
    }
    function markPendingCol(mIdx, on) {
      gColLabels.selectAll('.col-label')
        .classed('pending-swap', d => on && d.mIdx === mIdx);
    }

    function render({ animate = false } = {}) {
      const dur = animate ? 600 : 0;
      const theme = window.Theme ? window.Theme.get() : 'light';

      // ---- Column labels (films) ----
      const colData = colOrder.map((mIdx, i) => ({ mIdx, i, m: movies[mIdx] }));
      const colSel = gColLabels.selectAll('g.col-label').data(colData, d => d.mIdx);

      const colEnter = colSel.enter()
        .append('g')
        .attr('class', 'col-label');

      colEnter.append('text')
        .attr('class', 'col-label-text')
        .attr('text-anchor', 'start')
        .attr('dominant-baseline', 'middle')
        .text(d => shortTitle(d.m.title))
        .append('title').text(d => `${d.m.title} (${d.m.year})`);

      const colMerged = colEnter.merge(colSel);
      colMerged
        .style('cursor', onColLabelClick ? 'pointer' : null)
        .on('click', (_, d) => { if (onColLabelClick) onColLabelClick(d.mIdx); });
      colMerged.transition().duration(dur)
        .attr('transform', d => `translate(${leftW + d.i * cellW + cellW / 2}, ${headerH - 10}) rotate(-55)`);

      colSel.exit().remove();

      // ---- Row labels (users) ----
      const rowData = rowOrder.map((uIdx, i) => ({ uIdx, i, u: users[uIdx] }));
      const rowSel = gRowLabels.selectAll('g.row-label').data(rowData, d => d.uIdx);

      const rowEnter = rowSel.enter()
        .append('g')
        .attr('class', 'row-label');

      rowEnter.append('text')
        .attr('class', 'row-label-text')
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .text(d => d.u.name);

      const rowMerged = rowEnter.merge(rowSel);
      rowMerged
        .style('cursor', (onRowLabelClick || onRowClick) ? 'pointer' : null)
        .on('click', (_, d) => {
          if (onRowLabelClick) onRowLabelClick(d.uIdx);
          else if (onRowClick) onRowClick(d.uIdx);
        });
      rowMerged.transition().duration(dur)
        .attr('transform', d => `translate(${leftW - 8}, ${headerH + d.i * cellH + cellH / 2})`);

      rowSel.exit().remove();

      // ---- Cells ----
      const cellData = [];
      for (let i = 0; i < N; i++) {
        const uIdx = rowOrder[i];
        for (let j = 0; j < D; j++) {
          const mIdx = colOrder[j];
          cellData.push({
            uIdx, mIdx, i, j,
            v: matrix[uIdx][mIdx],
            key: `${uIdx}_${mIdx}`,
          });
        }
      }

      const cellSel = gCells.selectAll('g.cell').data(cellData, d => d.key);

      const cellEnter = cellSel.enter()
        .append('g')
        .attr('class', 'cell');

      cellEnter.append('rect')
        .attr('class', 'cell-rect')
        .attr('width', cellW - 1)
        .attr('height', cellH - 1)
        .attr('rx', 1.5);

      cellEnter.append('text')
        .attr('class', 'cell-text')
        .attr('x', (cellW - 1) / 2)
        .attr('y', (cellH - 1) / 2)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .style('display', showCellText ? null : 'none');

      const cellMerged = cellEnter.merge(cellSel);
      cellMerged
        .style('cursor', onRowClick ? 'pointer' : null)
        .on('click', (_, d) => { if (onRowClick) onRowClick(d.uIdx); });
      cellMerged.transition().duration(dur)
        .attr('transform', d => `translate(${d.j * cellW}, ${d.i * cellH})`);

      cellMerged.select('rect.cell-rect')
        .transition().duration(dur)
        .attr('fill', d => valueToColor(d.v, theme))
        .attr('opacity', d => {
          if (dimNonHighlight && rowHighlight != null && d.uIdx !== rowHighlight) return 0.18;
          return 1;
        });

      cellMerged.select('text.cell-text')
        .text(d => d.v.toFixed(1).replace(/\.0$/, ''))
        .transition().duration(dur)
        .style('fill', d => textColorForValue(d.v))
        .style('opacity', d => {
          if (dimNonHighlight && rowHighlight != null && d.uIdx !== rowHighlight) return 0.18;
          return 1;
        });

      cellSel.exit().remove();

      // ---- Row highlight ring ----
      gOverlay.selectAll('rect.row-ring').remove();
      if (rowHighlight != null) {
        const i = rowOrder.indexOf(rowHighlight);
        if (i >= 0) {
          gOverlay.append('rect')
            .attr('class', 'row-ring')
            .attr('x', -2)
            .attr('y', i * cellH - 2)
            .attr('width', cellW * D + 3)
            .attr('height', cellH + 3)
            .attr('rx', 3)
            .attr('fill', 'none')
            .attr('stroke', 'var(--ink)')
            .attr('stroke-width', 1.5);
        }
      }

      // Re-apply muted/highlighted cluster classes on row labels.
      gRowLabels.selectAll('.row-label')
        .classed('faded', d => dimNonHighlight && rowHighlight != null && d.uIdx !== rowHighlight)
        .classed('highlighted', d => rowHighlight != null && d.uIdx === rowHighlight);
    }

    function getDimensions() {
      return { totalW, totalH, cellW, cellH, leftW, headerH };
    }

    // Re-render when theme changes (color ramp depends on it).
    function onThemeChange() { render({ animate: false }); }
    window.addEventListener('theme-change', onThemeChange);

    function destroy() {
      window.removeEventListener('theme-change', onThemeChange);
      container.innerHTML = '';
    }

    // Initial render.
    if (opts.rowOrder) rowOrder = opts.rowOrder.slice();
    if (opts.colOrder) colOrder = opts.colOrder.slice();
    render({ animate: false });

    return {
      render,
      setRowOrder, setColOrder,
      getRowOrder, getColOrder,
      setHandlers, enableSwapMode, disableSwapMode,
      setHighlight, clearHighlight,
      getDimensions, destroy,
      svg: () => svg,
      gOverlay: () => gOverlay,
      gCells: () => gCells,
    };
  }

  return { create, valueToColor };
})();
