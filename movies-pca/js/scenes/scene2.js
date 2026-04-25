/* Scene 2 — Meet the viewers.
 * Sixteen persona cards. Names + one-liner taste blurbs.
 * No categories shown yet — that's the discovery in scenes 4–5. */

window.scenes.scene2 = function (root) {
  const D = window.MOVIES_DATA;

  const layout = document.createElement('div');
  layout.className = 'scene-layout center s2-layout';
  root.appendChild(layout);

  const header = document.createElement('div');
  header.className = 's2-header';
  layout.appendChild(header);

  const h2 = document.createElement('h2');
  h2.textContent = 'Sixteen viewers.';
  header.appendChild(h2);

  const lede = document.createElement('p');
  lede.className = 's2-lede';
  lede.textContent =
    'A small audience. Different tastes — though we won\'t say in what direction. They\'re about to rate every film.';
  header.appendChild(lede);

  const grid = document.createElement('div');
  grid.className = 's2-grid';
  layout.appendChild(grid);

  D.users.forEach((u, i) => {
    const card = document.createElement('article');
    card.className = 's2-card';
    card.style.animationDelay = `${60 + i * 30}ms`;

    const initial = document.createElement('div');
    initial.className = 's2-card-initial';
    initial.textContent = u.name.charAt(0);
    card.appendChild(initial);

    const body = document.createElement('div');
    body.className = 's2-card-body';

    const name = document.createElement('h3');
    name.className = 's2-card-name';
    name.textContent = u.name;
    body.appendChild(name);

    const blurb = document.createElement('p');
    blurb.className = 's2-card-blurb';
    blurb.textContent = u.blurb;
    body.appendChild(blurb);

    card.appendChild(body);
    grid.appendChild(card);
  });

  return {};
};
