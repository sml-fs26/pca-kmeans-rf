/* Scene 0 — Hero.
 * Title over a 4×4 grid of faces that slowly drift through PC-coefficient space.
 * Plays even before data lands: starts as empty placeholders, swaps to live
 * morphing faces when window.FACES is ready. */

window.scenes.scene0 = function (root) {
  let raf = null;
  let timers = [];
  function clearTimers() { timers.forEach(t => clearTimeout(t)); timers = []; }
  function stopRaf() { if (raf) cancelAnimationFrame(raf); raf = null; }

  root.classList.add('scene-hero');

  const layout = document.createElement('div');
  layout.className = 'scene-layout center hero-layout';
  root.appendChild(layout);

  const stack = document.createElement('div');
  stack.className = 'hero-stack';
  layout.appendChild(stack);

  const overTitle = document.createElement('p');
  overTitle.className = 'hero-overtitle';
  overTitle.textContent = 'Faces — and a tiny basis that explains them';
  stack.appendChild(overTitle);

  const h1 = document.createElement('h1');
  h1.className = 'hero-title';
  h1.textContent = 'Eigenfaces.';
  stack.appendChild(h1);

  const subtitle = document.createElement('p');
  subtitle.className = 'hero-subtitle';
  subtitle.textContent =
    'A face is 4096 pixels. PCA finds twenty directions that almost get it right — '
    + 'and those directions look like faces themselves.';
  stack.appendChild(subtitle);

  const teaser = document.createElement('div');
  teaser.className = 'hero-teaser face-grid hero-grid';
  teaser.style.gridTemplateColumns = 'repeat(4, max-content)';
  stack.appendChild(teaser);

  const N_TILES = 16;
  const tiles = [];
  for (let i = 0; i < N_TILES; i++) {
    const c = FaceCanvas.create(teaser, { w: 64, h: 64, scale: 1.5 });
    tiles.push(c);
  }

  const cta = document.createElement('p');
  cta.className = 'hero-cta';
  cta.innerHTML = 'Press <kbd>Next →</kbd> to begin.';
  stack.appendChild(cta);

  function animate() {
    const F = Faces.get();
    if (!F) {
      // No data yet — render gentle noise so the grid isn't blank.
      const W = 64, H = 64, D = W * H;
      const v = new Float32Array(D);
      const t = performance.now() / 1000;
      tiles.forEach((c, i) => {
        for (let p = 0; p < D; p++) v[p] = 0.5 + 0.4 * Math.sin(p * 0.05 + t + i);
        FaceCanvas.render(c, v);
      });
      raf = requestAnimationFrame(animate);
      return;
    }
    const K = Math.min(8, F.meta.K);
    const coeffs = new Float32Array(K);
    const out = new Float32Array(F.meta.W * F.meta.H);
    const t = performance.now() / 1000;
    tiles.forEach((c, i) => {
      for (let j = 0; j < K; j++) {
        const phase = (i + 1) * 0.7 + j * 1.3;
        coeffs[j] = 6 * Math.sin(0.25 * t + phase) * Math.sqrt(F.eigenval[j] || 1);
      }
      Faces.reconstruct(coeffs, out);
      FaceCanvas.render(c, out, { min: 0, max: 1 });
    });
    raf = requestAnimationFrame(animate);
  }

  function playEntrance() {
    clearTimers();
    [overTitle, h1, subtitle, teaser, cta].forEach(el => {
      el.style.opacity = 0;
      el.style.transform = 'translateY(8px)';
    });
    [[overTitle, 0], [h1, 100], [subtitle, 280], [teaser, 520], [cta, 1000]].forEach(([el, delay]) => {
      timers.push(setTimeout(() => {
        el.style.transition = 'opacity 600ms ease-out, transform 600ms ease-out';
        el.style.opacity = 1;
        el.style.transform = 'translateY(0)';
      }, delay));
    });
  }

  playEntrance();
  animate();

  return {
    onEnter() { playEntrance(); if (!raf) animate(); },
    onLeave() { clearTimers(); stopRaf(); },
  };
};
