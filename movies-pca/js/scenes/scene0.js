/* Scene 0 — Title hero.
 * Serif title over a small teaser heatmap (already in sorted/blocked form). */

window.scenes.scene0 = function (root) {
  let entranceTimers = [];
  function clearTimers() { entranceTimers.forEach(t => clearTimeout(t)); entranceTimers = []; }

  root.classList.add('scene-hero');

  const layout = document.createElement('div');
  layout.className = 'scene-layout center hero-layout';
  root.appendChild(layout);

  const stack = document.createElement('div');
  stack.className = 'hero-stack';
  layout.appendChild(stack);

  const overTitle = document.createElement('p');
  overTitle.className = 'hero-overtitle';
  overTitle.textContent = 'A movie-rating intuition for';
  stack.appendChild(overTitle);

  const h1 = document.createElement('h1');
  h1.className = 'hero-title';
  h1.textContent = 'Principal Component Analysis.';
  stack.appendChild(h1);

  const subtitle = document.createElement('p');
  subtitle.className = 'hero-subtitle';
  subtitle.textContent =
    'Sixteen viewers. Twelve films. One hidden two-dimensional structure — and a method that finds it from the ratings alone.';
  stack.appendChild(subtitle);

  const teaser = document.createElement('div');
  teaser.className = 'hero-teaser';
  stack.appendChild(teaser);

  const D = window.MOVIES_DATA;
  if (D) {
    Heatmap.create(teaser, {
      matrix: D.ratings.matrix,
      users: D.users,
      movies: D.movies,
      rowOrder: D.shuffle.sortedRowOrder,
      colOrder: D.shuffle.sortedColOrder,
      cellW: 28, cellH: 18, leftW: 70, headerH: 90,
      showCellText: false,
    });
  }

  const cta = document.createElement('p');
  cta.className = 'hero-cta';
  cta.innerHTML = 'Press <kbd>Next →</kbd> to begin.';
  stack.appendChild(cta);

  function playEntrance() {
    clearTimers();
    [overTitle, h1, subtitle, teaser, cta].forEach(el => {
      el.style.opacity = 0;
      el.style.transform = 'translateY(8px)';
    });
    const timings = [
      [overTitle, 0],
      [h1, 100],
      [subtitle, 280],
      [teaser, 520],
      [cta, 1000],
    ];
    timings.forEach(([el, delay]) => {
      entranceTimers.push(setTimeout(() => {
        el.style.transition = 'opacity 600ms ease-out, transform 600ms ease-out';
        el.style.opacity = 1;
        el.style.transform = 'translateY(0)';
      }, delay));
    });
  }

  playEntrance();

  return {
    onEnter() { playEntrance(); },
    onLeave() { clearTimers(); },
  };
};
