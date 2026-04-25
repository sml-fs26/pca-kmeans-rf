/* Scene 4 — Subtract the mean.
 * Pick a face, animate x − μ, get the spooky residual.
 * STUB: three side-by-side canvases (face, μ, residual) plus a face picker. */

window.scenes.scene4 = function (root) {
  let pick = 0;

  const layout = document.createElement('div');
  layout.className = 'scene-layout center';
  layout.style.gridTemplateRows = 'auto 1fr';
  root.appendChild(layout);

  const head = document.createElement('div');
  head.innerHTML = `
    <span class="step-pill">Step 1 (cont.) — what makes you, you</span>
    <h2>Subtract the mean.</h2>
    <p class="muted">Every face splits into a shared part (μ) and a personal residual (x − μ). PCA only ever looks at the residual.</p>
    <div class="formula-block" id="s4-formula"></div>
  `;
  layout.appendChild(head);

  if (window.katex) {
    katex.render('\\tilde x_i \\;=\\; x_i \\;-\\; \\mu', document.getElementById('s4-formula'), { displayMode: true });
  }

  const triplet = document.createElement('div');
  triplet.style.display = 'grid';
  triplet.style.gridTemplateColumns = 'auto auto auto auto auto';
  triplet.style.alignItems = 'center';
  triplet.style.justifyContent = 'center';
  triplet.style.gap = '20px';
  layout.appendChild(triplet);

  function colWith(label) {
    const col = document.createElement('div');
    col.style.display = 'flex';
    col.style.flexDirection = 'column';
    col.style.alignItems = 'center';
    const c = FaceCanvas.create(col, { w: 64, h: 64, scale: 4 });
    const cap = document.createElement('div');
    cap.className = 'face-caption';
    cap.textContent = label;
    col.appendChild(cap);
    return { col, canvas: c };
  }

  const a = colWith('x');
  const sign1 = document.createElement('div'); sign1.textContent = '−'; sign1.style.fontSize = '32px'; sign1.style.color = 'var(--muted)';
  const b = colWith('μ');
  const sign2 = document.createElement('div'); sign2.textContent = '='; sign2.style.fontSize = '32px'; sign2.style.color = 'var(--muted)';
  const c = colWith('x − μ  (residual)');

  triplet.appendChild(a.col); triplet.appendChild(sign1); triplet.appendChild(b.col);
  triplet.appendChild(sign2); triplet.appendChild(c.col);

  const picker = document.createElement('div');
  picker.style.marginTop = '16px';
  picker.style.textAlign = 'center';
  picker.innerHTML = `<button class="btn small" id="s4-prev">← prev face</button> <span id="s4-label" class="mono muted" style="margin: 0 12px;"></span> <button class="btn small" id="s4-next">next face →</button>`;
  layout.appendChild(picker);

  function render() {
    const F = Faces.get();
    if (!F) { document.getElementById('s4-label').textContent = '⏳ waiting for data'; return; }
    const D = F.meta.W * F.meta.H;
    const x = F.faces.subarray(pick * D, (pick + 1) * D);
    const xFloat = new Float32Array(D);
    for (let i = 0; i < D; i++) xFloat[i] = x[i] / 255;
    const resid = new Float32Array(D);
    for (let i = 0; i < D; i++) resid[i] = xFloat[i] - F.mean[i];
    FaceCanvas.render(a.canvas, x);
    FaceCanvas.render(b.canvas, F.mean, { min: 0, max: 1 });
    FaceCanvas.render(c.canvas, resid, { signed: true });
    document.getElementById('s4-label').textContent = `face #${pick}`;
  }

  document.getElementById('s4-prev').addEventListener('click', () => {
    const F = Faces.get(); if (!F) return;
    pick = (pick - 1 + F.meta.N) % F.meta.N; render();
  });
  document.getElementById('s4-next').addEventListener('click', () => {
    const F = Faces.get(); if (!F) return;
    pick = (pick + 1) % F.meta.N; render();
  });

  render();
  window.addEventListener('faces-loaded', render, { once: true });

  return {};
};
