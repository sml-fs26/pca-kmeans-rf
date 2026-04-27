/* Scene 0 — Hero. "The eigenvectors hide in plain sight."
 *
 * A static landing scene: oversized headline, italic subhead, then a museum-style
 * 6 x 4 grid of 24 sample images from the independent2 variant. No interaction
 * beyond Next.
 */

window.scenes.scene0 = function (root) {
  root.innerHTML = '';
  root.classList.add('scene-s0');

  const wrap = document.createElement('div');
  wrap.className = 's0-wrap';
  root.appendChild(wrap);

  const h1 = document.createElement('h1');
  h1.className = 's0-headline';
  h1.textContent = 'The eigenvectors hide in plain sight.';
  wrap.appendChild(h1);

  const accent = document.createElement('div');
  accent.className = 's0-accent';
  wrap.appendChild(accent);

  const subhead = document.createElement('p');
  subhead.className = 's0-subhead';
  subhead.innerHTML = '<em>PCA on 200 images of a circle and a square. The answer is going to be obvious.</em>';
  wrap.appendChild(subhead);

  const panel = document.createElement('div');
  panel.className = 's0-panel';
  wrap.appendChild(panel);

  const grid = document.createElement('div');
  grid.className = 's0-grid';
  panel.appendChild(grid);

  function buildGrid() {
    grid.innerHTML = '';
    if (!window.DATA || !window.DATA.variants || !window.DATA.variants.independent2) {
      return;
    }
    const variant = PCA.variant('independent2');
    const N = 24;
    for (let i = 0; i < N; i++) {
      const cell = document.createElement('div');
      cell.className = 's0-cell';
      const c = ImageCanvas.create(cell, { w: 32, h: 32, scale: 2 });
      const img = PCA.buildImage(variant, i);
      ImageCanvas.render(c, img);
      grid.appendChild(cell);
    }
  }

  function buildCaption() {
    const caption = document.createElement('p');
    caption.className = 's0-caption';
    caption.innerHTML = '<em>200 images. Two numbers per image: how dark the circle, how dark the square.</em>';
    wrap.appendChild(caption);
  }

  buildGrid();
  buildCaption();

  function onThemeChange() { buildGrid(); }
  window.addEventListener('theme-change', onThemeChange);

  return {
    onEnter() {
      // Cold entry safe: rebuild on enter so a theme change before first visit
      // still produces a correctly-coloured grid.
      buildGrid();
    },
    onLeave() {},
  };
};
