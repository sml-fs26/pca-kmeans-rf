/* Scene 7 — What PCA does.
 *
 * Internal step engine reveals the math one piece at a time:
 *   Step 1: We don't know the axes — pretend we don't. PCA finds them from data.
 *   Step 2: Center the data:  X̃ = X − x̄
 *   Step 3: Covariance:        Σ = (1/N) X̃ᵀ X̃
 *   Step 4: Eigenvectors:      Σ vₖ = λₖ vₖ;  pick the top 2.
 *   Step 5: Project:           zᵤ = Vᵀ (xᵤ − x̄)
 */

window.scenes.scene7 = function (root) {
  const STEPS = 5;
  let cursor = 1;

  const layout = document.createElement('div');
  layout.className = 'scene-layout center s7-layout';
  root.appendChild(layout);

  const stack = document.createElement('div');
  stack.className = 's7-stack';
  layout.appendChild(stack);

  const stepPill = document.createElement('div');
  stepPill.className = 'step-pill';
  stack.appendChild(stepPill);

  const heading = document.createElement('h2');
  heading.className = 's7-heading';
  stack.appendChild(heading);

  const lede = document.createElement('p');
  lede.className = 's7-lede';
  stack.appendChild(lede);

  const formula = document.createElement('div');
  formula.className = 'formula-block s7-formula';
  stack.appendChild(formula);

  const annotation = document.createElement('p');
  annotation.className = 's7-annotation muted';
  stack.appendChild(annotation);

  const stepList = document.createElement('ol');
  stepList.className = 's7-steplist';
  stack.appendChild(stepList);
  for (let i = 0; i < STEPS; i++) {
    const li = document.createElement('li');
    li.className = 's7-steplist-item';
    li.dataset.idx = i + 1;
    li.textContent = ['set the stage', 'center the data', 'covariance', 'eigenvectors', 'project'][i];
    stepList.appendChild(li);
  }

  function renderKatex(host, src, displayMode = true) {
    host.textContent = '';
    try { window.katex.render(src, host, { displayMode, throwOnError: false }); }
    catch (e) { host.textContent = src; }
  }

  function applyStep(c) {
    stepPill.textContent = `Step ${c} of ${STEPS}`;
    stepList.querySelectorAll('.s7-steplist-item').forEach(li => {
      const i = parseInt(li.dataset.idx, 10);
      li.classList.toggle('active', i === c);
      li.classList.toggle('done', i < c);
    });

    if (c === 1) {
      heading.textContent = 'What PCA does.';
      lede.innerHTML = 'In Scene 6 we cheated — we knew the two directions to project onto. PCA finds them <strong>from the rating data alone</strong>, no labels needed.';
      formula.classList.add('hidden');
      annotation.textContent = '';
    } else if (c === 2) {
      heading.textContent = 'Step 1 — center.';
      lede.textContent = 'Subtract the mean rating of each film. Each row now describes how this viewer differs from average.';
      formula.classList.remove('hidden');
      renderKatex(formula, '\\tilde{X} = X - \\mathbf{1}\\,\\bar{x}^{\\top}, \\qquad \\bar{x}_f = \\tfrac{1}{N}\\sum_{u} X_{u,f}');
      annotation.innerHTML = `<span class="mono">X</span> is 16 × 12: 16 viewers, 12 films. <span class="mono">x̄</span> is the per-film mean (length 12).`;
    } else if (c === 3) {
      heading.textContent = 'Step 2 — covariance.';
      lede.textContent = 'Build the 12 × 12 covariance matrix. Big diagonal entries flag films with strong disagreement; big off-diagonals flag films viewers tend to agree on together.';
      formula.classList.remove('hidden');
      renderKatex(formula, '\\Sigma = \\tfrac{1}{N}\\,\\tilde{X}^{\\top}\\tilde{X}');
      annotation.innerHTML = `<span class="mono">Σ</span> captures every pairwise rating relationship between films, in one symmetric 12 × 12 matrix.`;
    } else if (c === 4) {
      heading.textContent = 'Step 3 — eigenvectors.';
      lede.innerHTML = 'Find the directions in 12-D film-space along which the data varies most. The eigenvectors of <span class="mono">Σ</span> with the largest eigenvalues — that\'s where the variance lives.';
      formula.classList.remove('hidden');
      renderKatex(formula, '\\Sigma\\,v_k = \\lambda_k\\,v_k, \\qquad \\lambda_1 \\geq \\lambda_2 \\geq \\dots \\geq \\lambda_{12} \\geq 0');
      annotation.innerHTML = `Take <span class="mono">V = [v₁\\, v₂]</span>: the top two eigenvectors. Each is a direction in 12-D film-space.`;
    } else if (c === 5) {
      heading.textContent = 'Step 4 — project.';
      lede.textContent = 'For every viewer, compute their coordinate along v₁ and v₂. That\'s the 2D representation.';
      formula.classList.remove('hidden');
      renderKatex(formula, 'z_u = V^{\\top}(x_u - \\bar{x}) \\in \\mathbb{R}^{2}');
      annotation.innerHTML = `Each viewer's 12-D rating row becomes a 2-D point. PCA discovered the axes; next scene shows what they look like.`;
    }
  }

  function setCursor(c) {
    if (c < 1 || c > STEPS) return false;
    cursor = c;
    applyStep(c);
    return true;
  }

  applyStep(cursor);

  return {
    onEnter() { cursor = 1; applyStep(cursor); },
    onLeave() {},
    onNextKey() {
      if (cursor >= STEPS) return false;
      return setCursor(cursor + 1);
    },
    onPrevKey() {
      if (cursor <= 1) return false;
      return setCursor(cursor - 1);
    },
  };
};
