/* Scene 4 — Sort it yourself.
 *
 * Click two row labels to swap rows. Click two column labels to swap columns.
 * A live "smoothness" score ticks down as the student finds clusters; the
 * sorted-order target value is shown for reference.
 *
 * Reset button restores the shuffled order.
 * Auto-sort button animates to the canonical category-blocked order.
 */

window.scenes.scene4 = function (root) {
  const D = window.MOVIES_DATA;
  const N = D.users.length;
  const M = D.movies.length;

  // ---- Smoothness metric: sum of absolute differences between
  //      orthogonally-adjacent cells under the current ordering.
  //      Lower = smoother = better-clustered.
  function smoothness(rowOrder, colOrder) {
    let s = 0;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < M; j++) {
        const v = D.ratings.matrix[rowOrder[i]][colOrder[j]];
        if (j + 1 < M) {
          s += Math.abs(v - D.ratings.matrix[rowOrder[i]][colOrder[j + 1]]);
        }
        if (i + 1 < N) {
          s += Math.abs(v - D.ratings.matrix[rowOrder[i + 1]][colOrder[j]]);
        }
      }
    }
    return s;
  }

  // Reference values for the score bar.
  const sortedSmooth = smoothness(D.shuffle.sortedRowOrder, D.shuffle.sortedColOrder);
  const shuffledSmooth = smoothness(D.shuffle.rowOrder, D.shuffle.colOrder);

  function clarityPct(currentSmooth) {
    // 0% at shuffled-baseline, 100% at sorted-target. Clamp.
    const r = (shuffledSmooth - currentSmooth) / (shuffledSmooth - sortedSmooth);
    return Math.max(0, Math.min(1, r));
  }

  // ---- Layout ----
  const layout = document.createElement('div');
  layout.className = 'scene-layout s4-layout';
  root.appendChild(layout);

  // Left: heatmap + control bar
  const vizCol = document.createElement('div');
  vizCol.className = 's4-viz-col';
  layout.appendChild(vizCol);

  const vizWrap = document.createElement('div');
  vizWrap.className = 'viz-wrap s4-viz-wrap';
  vizCol.appendChild(vizWrap);

  const controlBar = document.createElement('div');
  controlBar.className = 's4-control-bar';
  vizCol.appendChild(controlBar);

  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn small';
  resetBtn.textContent = '↺ Reset';
  controlBar.appendChild(resetBtn);

  const autoBtn = document.createElement('button');
  autoBtn.className = 'btn small primary';
  autoBtn.textContent = '✨ Sort it for me';
  controlBar.appendChild(autoBtn);

  const clarityWrap = document.createElement('div');
  clarityWrap.className = 's4-clarity-wrap';
  controlBar.appendChild(clarityWrap);

  const clarityLabel = document.createElement('span');
  clarityLabel.className = 's4-clarity-label';
  clarityLabel.textContent = 'block clarity';
  clarityWrap.appendChild(clarityLabel);

  const clarityBar = document.createElement('div');
  clarityBar.className = 's4-clarity-bar';
  clarityWrap.appendChild(clarityBar);
  const clarityFill = document.createElement('div');
  clarityFill.className = 's4-clarity-fill';
  clarityBar.appendChild(clarityFill);

  const clarityVal = document.createElement('span');
  clarityVal.className = 's4-clarity-val mono';
  clarityWrap.appendChild(clarityVal);

  // Right: instructions
  const textCol = document.createElement('div');
  textCol.className = 'text-col s4-text';
  layout.appendChild(textCol);

  textCol.innerHTML = `
    <h2>Sort it yourself.</h2>
    <p>Try to find structure by hand. The values don't change — only their arrangement.</p>
    <ol class="s4-rules">
      <li>Click <strong>two viewer names</strong> on the left to swap their rows.</li>
      <li>Click <strong>two film titles</strong> on top to swap their columns.</li>
      <li>Watch the <em>block-clarity</em> bar climb as patches of similar colour grow.</li>
    </ol>
    <p class="muted s4-tip">Stuck? Hit <strong>Sort it for me</strong> to see the structure pop out.</p>
  `;

  // ---- Heatmap + interactions ----
  const hm = Heatmap.create(vizWrap, {
    matrix: D.ratings.matrix,
    users: D.users,
    movies: D.movies,
    rowOrder: D.shuffle.rowOrder,
    colOrder: D.shuffle.colOrder,
    cellW: 38, cellH: 24, leftW: 90, headerH: 130,
    showCellText: true,
  });

  function updateClarity() {
    const s = smoothness(hm.getRowOrder(), hm.getColOrder());
    const pct = clarityPct(s);
    clarityFill.style.width = `${(pct * 100).toFixed(1)}%`;
    clarityVal.textContent = `${Math.round(pct * 100)}%`;
    if (pct >= 0.95) clarityWrap.classList.add('s4-clarity-done');
    else clarityWrap.classList.remove('s4-clarity-done');
  }

  hm.enableSwapMode(updateClarity);
  updateClarity();

  resetBtn.addEventListener('click', () => {
    hm.disableSwapMode();
    hm.setRowOrder(D.shuffle.rowOrder, { animate: true });
    hm.setColOrder(D.shuffle.colOrder, { animate: true });
    setTimeout(() => { hm.enableSwapMode(updateClarity); updateClarity(); }, 700);
  });

  autoBtn.addEventListener('click', () => {
    hm.disableSwapMode();
    hm.setRowOrder(D.shuffle.sortedRowOrder, { animate: true });
    hm.setColOrder(D.shuffle.sortedColOrder, { animate: true });
    setTimeout(() => { hm.enableSwapMode(updateClarity); updateClarity(); }, 800);
  });

  return {
    onEnter() {
      // Restart from shuffled order each visit.
      hm.disableSwapMode();
      hm.setRowOrder(D.shuffle.rowOrder, { animate: false });
      hm.setColOrder(D.shuffle.colOrder, { animate: false });
      hm.enableSwapMode(updateClarity);
      updateClarity();
    },
    onLeave() { hm.disableSwapMode(); },
  };
};
