/* Scene 6 — Reconstruction.
 * Slider k = 1..50. Watch reconstruction grow next to the original. MSE curve below.
 * STUB: original | reconstruction side-by-side; slider drives reconstructFace().
 * TODO for the real version: animated MSE-vs-k chart underneath. */

window.scenes.scene6 = function (root) {
  let pick = 0;

  const layout = document.createElement('div');
  layout.className = 'scene-layout center';
  layout.style.gridTemplateRows = 'auto auto 1fr';
  root.appendChild(layout);

  const head = document.createElement('div');
  head.innerHTML = `
    <span class="step-pill">Step 3 — keep the top k components</span>
    <h2>Reconstruction.</h2>
    <p class="muted">Drop all but the top k principal components. Around k ≈ 10 the face snaps into recognition.</p>
    <div class="formula-block" id="s6-formula"></div>
  `;
  layout.appendChild(head);

  if (window.katex) {
    katex.render(
      "\\hat x \\;=\\; \\mu \\;+\\; \\sum_{j=1}^{k}\\,\\langle \\tilde x,\\,v_j\\rangle\\,v_j",
      document.getElementById('s6-formula'), { displayMode: true });
  }

  const pair = document.createElement('div');
  pair.style.display = 'grid';
  pair.style.gridTemplateColumns = 'auto auto';
  pair.style.gap = '24px';
  pair.style.justifyContent = 'center';
  pair.style.alignItems = 'center';
  pair.style.marginTop = '8px';
  layout.appendChild(pair);

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

  const orig = colWith('original');
  const rec  = colWith('reconstruction');
  pair.appendChild(orig.col);
  pair.appendChild(rec.col);

  const controls = document.createElement('div');
  controls.style.maxWidth = '520px';
  controls.style.margin = '20px auto 0';
  controls.style.width = '100%';
  controls.innerHTML = `
    <div class="slider-row">
      <label for="s6-k">k</label>
      <input id="s6-k" type="range" min="1" max="50" value="5">
      <span id="s6-kval" class="slider-val">5</span>
    </div>
    <div class="slider-row">
      <span></span>
      <span class="muted mono" id="s6-mse" style="text-align:center;">MSE — / —</span>
      <span></span>
    </div>
    <div style="text-align:center; margin-top:12px;">
      <button class="btn small" id="s6-prev">← prev face</button>
      <span id="s6-face" class="mono muted" style="margin: 0 12px;"></span>
      <button class="btn small" id="s6-next">next face →</button>
    </div>
  `;
  layout.appendChild(controls);

  const buf = new Float32Array(64 * 64);

  function render() {
    const F = Faces.get();
    if (!F) { document.getElementById('s6-face').textContent = '⏳ waiting for data'; return; }
    const D = F.meta.W * F.meta.H;
    const k = parseInt(document.getElementById('s6-k').value, 10);
    const xRaw = F.faces.subarray(pick * D, (pick + 1) * D);
    FaceCanvas.render(orig.canvas, xRaw);
    Faces.reconstructFace(pick, k, buf);
    FaceCanvas.render(rec.canvas, buf, { min: 0, max: 1 });
    // MSE in [0,1] units against the rescaled original
    let s = 0;
    for (let i = 0; i < D; i++) { const d = (xRaw[i] / 255) - buf[i]; s += d * d; }
    const mse = s / D;
    document.getElementById('s6-kval').textContent = k;
    document.getElementById('s6-mse').textContent = `MSE ${mse.toFixed(4)}  ·  k = ${k}`;
    document.getElementById('s6-face').textContent = `face #${pick}`;
  }

  document.getElementById('s6-k').addEventListener('input', render);
  document.getElementById('s6-prev').addEventListener('click', () => {
    const F = Faces.get(); if (!F) return;
    pick = (pick - 1 + F.meta.N) % F.meta.N; render();
  });
  document.getElementById('s6-next').addEventListener('click', () => {
    const F = Faces.get(); if (!F) return;
    pick = (pick + 1) % F.meta.N; render();
  });

  render();
  window.addEventListener('faces-loaded', render, { once: true });

  return {};
};
