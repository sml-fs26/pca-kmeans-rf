/* Scene 9 — Takeaways. */

window.scenes.scene9 = function (root) {
  let cardTimers = [];
  function clearTimers() { cardTimers.forEach(t => clearTimeout(t)); cardTimers = []; }

  const layout = document.createElement('div');
  layout.className = 'scene-layout center s9-layout';
  root.appendChild(layout);

  const stack = document.createElement('div');
  stack.className = 's9-stack';
  layout.appendChild(stack);

  const heading = document.createElement('h2');
  heading.className = 's9-heading';
  heading.textContent = 'What to remember.';
  stack.appendChild(heading);

  const grid = document.createElement('div');
  grid.className = 's9-grid';
  stack.appendChild(grid);

  function makeCard(num, title, html) {
    const card = document.createElement('article');
    card.className = 's9-card';
    card.innerHTML = `
      <div class="s9-num">${String(num).padStart(2, '0')}</div>
      <h3 class="s9-card-title">${title}</h3>
      <p class="s9-card-body">${html}</p>
    `;
    return card;
  }

  const c1 = makeCard(1,
    'High dimensions can hide low-dimensional structure.',
    `Sixteen rating vectors in <span class="mono">R<sup>12</sup></span> turned out to live near a <strong>2-D plane</strong>. Two latent attributes — action↔romance and blockbuster↔indie — explained most of what the viewers cared about.`
  );
  const c2 = makeCard(2,
    'PCA finds the directions of greatest variance.',
    `It diagonalizes the covariance <span class="kf" id="s9-sigma"></span>. The eigenvectors are directions in the original 12-D space; the eigenvalues say how much variance each direction captures.`
  );
  const c3 = makeCard(3,
    'No labels were used.',
    `We never told PCA who was an action fan. It recovered the structure from the rating numbers alone — that's why it's <em>unsupervised</em>.`
  );
  const c4 = makeCard(4,
    'PCA picks axes to align with variance, not with meaning.',
    `PC1 and PC2 aren\'t exactly "action" and "blockbuster" — they\'re a rotation of those latent axes. Interpreting them is on you. The clusters are real either way.`
  );

  [c1, c2, c3, c4].forEach(c => grid.appendChild(c));

  // Render KaTeX inline.
  try {
    const host = c2.querySelector('#s9-sigma');
    if (host && window.katex) {
      window.katex.render('\\Sigma = \\tfrac{1}{N}\\,\\tilde{X}^{\\top}\\tilde{X}', host,
        { displayMode: false, throwOnError: false });
    }
  } catch (e) {}

  const closing = document.createElement('p');
  closing.className = 's9-closing';
  closing.textContent =
    'Now look at it the other way: when your data has thousands of features, this is the first move.';
  stack.appendChild(closing);

  const back = document.createElement('div');
  back.className = 's9-back';
  const backBtn = document.createElement('button');
  backBtn.className = 'btn s9-back-btn';
  backBtn.textContent = '← Back to start';
  backBtn.addEventListener('click', () => {
    if (window.SceneEngine) window.SceneEngine.goTo(0);
  });
  back.appendChild(backBtn);
  stack.appendChild(back);

  function playEntrance() {
    clearTimers();
    const cards = grid.querySelectorAll('.s9-card');
    [heading, ...cards, closing, back].forEach(el => {
      el.style.opacity = 0;
      el.style.transform = 'translateY(8px)';
    });
    cardTimers.push(setTimeout(() => {
      heading.style.transition = 'opacity 500ms ease-out, transform 500ms ease-out';
      heading.style.opacity = 1;
      heading.style.transform = 'translateY(0)';
    }, 0));
    const base = 240, step = 140;
    cards.forEach((card, i) => {
      cardTimers.push(setTimeout(() => {
        card.style.transition = 'opacity 500ms ease-out, transform 500ms ease-out';
        card.style.opacity = 1;
        card.style.transform = 'translateY(0)';
      }, base + i * step));
    });
    const tail = base + cards.length * step + 60;
    cardTimers.push(setTimeout(() => {
      closing.style.transition = 'opacity 500ms ease-out, transform 500ms ease-out';
      closing.style.opacity = 1;
      closing.style.transform = 'translateY(0)';
    }, tail));
    cardTimers.push(setTimeout(() => {
      back.style.transition = 'opacity 500ms ease-out, transform 500ms ease-out';
      back.style.opacity = 1;
      back.style.transform = 'translateY(0)';
    }, tail + 120));
  }

  playEntrance();

  return {
    onEnter() { playEntrance(); },
    onLeave() { clearTimers(); },
  };
};
