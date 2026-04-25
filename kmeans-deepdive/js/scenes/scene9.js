/* Scene 9 — Takeaways.
 * Cement the four key insights from the deep-dive: J always decreases,
 * convergence is only local, init matters (k-means++), choosing K is separate. */

window.scenes.scene9 = function (root) {
  let cardTimers = [];

  function clearTimers() {
    cardTimers.forEach(t => clearTimeout(t));
    cardTimers = [];
  }

  // ---- Static DOM ----
  const layout = document.createElement('div');
  layout.className = 'scene-layout center takeaways-layout';
  root.appendChild(layout);

  const stack = document.createElement('div');
  stack.className = 'takeaways-stack';
  layout.appendChild(stack);

  const heading = document.createElement('h2');
  heading.className = 'takeaways-heading';
  heading.textContent = 'What to remember.';
  stack.appendChild(heading);

  // Card grid.
  const grid = document.createElement('div');
  grid.className = 'takeaways-grid';
  stack.appendChild(grid);

  // Card 1 — J always decreases. We render the J formula via KaTeX inline.
  const card1 = makeCard(
    1,
    'J always decreases.',
    `The objective <span class="kf" id="takeaway-J-formula"></span> is monotonically non-increasing. Both steps — assigning points to the nearest centroid, and moving each centroid to its cluster's mean — reduce J. The algorithm always terminates.`
  );

  // Card 2 — local optimum.
  const card2 = makeCard(
    2,
    'But only at a local optimum.',
    `Lloyd's algorithm converges, yet there's no guarantee the J it converges to is the smallest possible J. Two runs from different initializations can land at very different solutions.`
  );

  // Card 3 — initialization matters.
  const card3 = makeCard(
    3,
    'Initialization matters.',
    `Random seeding is fragile. <strong>k-means++</strong> picks centroids that are spread out, dramatically reducing the chance of a bad local optimum. In practice, always use it (or a similar smart-init).`
  );

  // Card 4 — choosing K.
  const card4 = makeCard(
    4,
    'Choosing K is a separate problem.',
    `k-means takes K as input. Picking K is its own discipline — elbow methods, silhouette scores, gap statistic, BIC. None of them is universal.`
  );

  [card1, card2, card3, card4].forEach(c => grid.appendChild(c));

  // Render the J formula via KaTeX (inline).
  try {
    const formulaHost = card1.querySelector('#takeaway-J-formula');
    if (formulaHost && window.katex) {
      window.katex.render(
        'J = \\sum_{k=1}^{K} \\sum_{x \\in C_k} \\|x - \\mu_k\\|^2',
        formulaHost,
        { displayMode: false, throwOnError: false }
      );
    }
  } catch (e) {
    // Quietly degrade — fallback text already in the span via the colon prefix.
    console.warn('KaTeX render (scene 9) failed:', e);
  }

  // Closing line.
  const closing = document.createElement('p');
  closing.className = 'takeaways-closing';
  closing.textContent =
    "You've stepped through every decision Lloyd's algorithm makes. Run it on your own data next.";
  stack.appendChild(closing);

  // Back-to-start link.
  const backWrap = document.createElement('div');
  backWrap.className = 'takeaways-back';
  const backBtn = document.createElement('button');
  backBtn.className = 'btn takeaways-back-btn';
  backBtn.textContent = '← Back to start';
  backBtn.addEventListener('click', () => {
    if (window.SceneEngine && typeof window.SceneEngine.goTo === 'function') {
      window.SceneEngine.goTo(0);
    }
  });
  backWrap.appendChild(backBtn);
  stack.appendChild(backWrap);

  // ---- Helpers ----
  function makeCard(num, titleText, bodyHTML) {
    const card = document.createElement('article');
    card.className = 'takeaway-card';
    card.setAttribute('data-num', String(num));

    const numEl = document.createElement('div');
    numEl.className = 'takeaway-num';
    numEl.textContent = String(num).padStart(2, '0');
    card.appendChild(numEl);

    const t = document.createElement('h3');
    t.className = 'takeaway-title';
    t.textContent = titleText;
    card.appendChild(t);

    const body = document.createElement('p');
    body.className = 'takeaway-body';
    body.innerHTML = bodyHTML;
    card.appendChild(body);

    return card;
  }

  function playCardEntrance() {
    clearTimers();

    const cards = grid.querySelectorAll('.takeaway-card');
    [heading, ...cards, closing, backWrap].forEach(el => {
      el.style.opacity = 0;
      el.style.transform = 'translateY(8px)';
    });

    cardTimers.push(setTimeout(() => {
      heading.style.transition = 'opacity 500ms ease-out, transform 500ms ease-out';
      heading.style.opacity = 1;
      heading.style.transform = 'translateY(0)';
    }, 0));

    const baseDelay = 240;
    const stagger = 150;
    cards.forEach((card, i) => {
      cardTimers.push(setTimeout(() => {
        card.style.transition = 'opacity 500ms ease-out, transform 500ms ease-out';
        card.style.opacity = 1;
        card.style.transform = 'translateY(0)';
      }, baseDelay + i * stagger));
    });

    const tailDelay = baseDelay + cards.length * stagger + 80;
    cardTimers.push(setTimeout(() => {
      closing.style.transition = 'opacity 500ms ease-out, transform 500ms ease-out';
      closing.style.opacity = 1;
      closing.style.transform = 'translateY(0)';
    }, tailDelay));

    cardTimers.push(setTimeout(() => {
      backWrap.style.transition = 'opacity 500ms ease-out, transform 500ms ease-out';
      backWrap.style.opacity = 1;
      backWrap.style.transform = 'translateY(0)';
    }, tailDelay + 120));
  }

  // Initial play.
  playCardEntrance();

  return {
    onEnter() {
      playCardEntrance();
    },
    onLeave() {
      clearTimers();
    },
    onNextKey() { return false; },
    onPrevKey() { return false; },
  };
};
