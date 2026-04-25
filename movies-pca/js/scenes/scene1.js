/* Scene 1 — Meet the films.
 * Twelve film cards in a 4×3 grid. No category labels yet: the student is
 * meant to recognize them as movies they know, not as data points. */

window.scenes.scene1 = function (root) {
  const D = window.MOVIES_DATA;

  const layout = document.createElement('div');
  layout.className = 'scene-layout center s1-layout';
  root.appendChild(layout);

  const header = document.createElement('div');
  header.className = 's1-header';
  layout.appendChild(header);

  const h2 = document.createElement('h2');
  h2.textContent = 'Twelve films.';
  header.appendChild(h2);

  const lede = document.createElement('p');
  lede.className = 's1-lede';
  lede.textContent =
    'Twelve movies you might have an opinion about. We\'ll ask sixteen people to rate every one of them, and see what falls out.';
  header.appendChild(lede);

  const grid = document.createElement('div');
  grid.className = 's1-grid';
  layout.appendChild(grid);

  D.movies.forEach((m, i) => {
    const card = document.createElement('article');
    card.className = 's1-card';
    card.style.animationDelay = `${80 + i * 40}ms`;

    const yr = document.createElement('div');
    yr.className = 's1-card-year';
    yr.textContent = m.year;
    card.appendChild(yr);

    const t = document.createElement('h3');
    t.className = 's1-card-title';
    t.textContent = m.title;
    card.appendChild(t);

    const tag = document.createElement('p');
    tag.className = 's1-card-tag';
    tag.textContent = m.tag;
    card.appendChild(tag);

    grid.appendChild(card);
  });

  return {};
};
