/* Scene 1 — Meet the cast.
 * 40-face grid (one face per Olivetti subject), hover for subject ID.
 * STUB: lays out the grid and renders faces if data is ready; otherwise placeholders. */

window.scenes.scene1 = function (root) {
  const layout = document.createElement('div');
  layout.className = 'scene-layout center';
  root.appendChild(layout);

  const header = document.createElement('div');
  header.className = 's1-header';
  layout.appendChild(header);

  const h2 = document.createElement('h2');
  h2.textContent = 'Meet the cast.';
  header.appendChild(h2);

  const lede = document.createElement('p');
  lede.className = 'muted';
  lede.textContent = 'Forty subjects, ten poses each. Four hundred faces. Each one is a 64×64 grayscale image — that is, a vector of 4096 numbers.';
  header.appendChild(lede);

  const grid = document.createElement('div');
  grid.className = 'face-grid s1-grid';
  grid.style.gridTemplateColumns = 'repeat(10, max-content)';
  grid.style.marginTop = '16px';
  layout.appendChild(grid);

  const tooltip = document.createElement('div');
  tooltip.className = 's1-tooltip muted';
  tooltip.style.position = 'absolute';
  tooltip.style.pointerEvents = 'none';
  tooltip.style.opacity = '0';
  root.appendChild(tooltip);

  function buildGrid() {
    grid.innerHTML = '';
    const F = Faces.get();
    if (!F) {
      const note = document.createElement('p');
      note.className = 'muted';
      note.textContent = '⏳ waiting for data/* — run precompute/build-data.py';
      grid.appendChild(note);
      return;
    }
    // One face per subject — pick the first pose of each.
    const subjects = F.labels.subjects;
    const seen = new Set();
    const D = F.meta.W * F.meta.H;
    for (let i = 0; i < subjects.length && seen.size < 40; i++) {
      const s = subjects[i];
      if (seen.has(s)) continue;
      seen.add(s);
      const c = FaceCanvas.create(grid, { w: F.meta.W, h: F.meta.H, scale: 1.5 });
      c.classList.add('interactive');
      const view = F.faces.subarray(i * D, (i + 1) * D);
      FaceCanvas.render(c, view);
      c.addEventListener('mousemove', e => {
        tooltip.textContent = `subject ${s + 1}`;
        tooltip.style.left = (e.clientX + 12) + 'px';
        tooltip.style.top  = (e.clientY + 12) + 'px';
        tooltip.style.opacity = '1';
      });
      c.addEventListener('mouseleave', () => { tooltip.style.opacity = '0'; });
    }
  }

  buildGrid();
  window.addEventListener('faces-loaded', buildGrid, { once: true });

  return {};
};
