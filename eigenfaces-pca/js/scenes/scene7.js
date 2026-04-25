/* Scene 7 — Steer a face.
 * Mean face on canvas. 4 sliders for PC1..PC4. Drag to morph in real time.
 * STUB: working sliders + reconstruct on every input. */

window.scenes.scene7 = function (root) {
  const N_SLIDERS = 4;

  const layout = document.createElement('div');
  layout.className = 'scene-layout split-eq';
  root.appendChild(layout);

  const left = document.createElement('div');
  left.className = 'viz-wrap';
  left.style.padding = '24px';
  left.style.alignItems = 'center';
  left.style.justifyContent = 'center';
  layout.appendChild(left);

  const canvas = FaceCanvas.create(left, { w: 64, h: 64, scale: 6 });

  const right = document.createElement('div');
  right.className = 'text-col';
  layout.appendChild(right);

  right.innerHTML = `
    <h2>Steer a face.</h2>
    <p class="muted">Slide each principal component. The face morphs in real time — a soundboard for human appearance.</p>
  `;

  const sliders = [];
  for (let j = 0; j < N_SLIDERS; j++) {
    const row = document.createElement('div');
    row.className = 'slider-row';
    row.innerHTML = `
      <label>PC${j + 1}</label>
      <input type="range" min="-3" max="3" step="0.05" value="0">
      <span class="slider-val">0.00</span>
    `;
    right.appendChild(row);
    sliders.push(row.querySelector('input'));
  }

  const reset = document.createElement('button');
  reset.className = 'btn small';
  reset.textContent = 'reset to mean';
  reset.style.marginTop = '8px';
  right.appendChild(reset);

  const buf = new Float32Array(64 * 64);
  const coeffs = new Float32Array(N_SLIDERS);

  function render() {
    const F = Faces.get();
    if (!F) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    for (let j = 0; j < N_SLIDERS; j++) {
      const s = parseFloat(sliders[j].value);
      // Slider value × √λ_j gives a perceptually well-scaled step in PC-space.
      coeffs[j] = s * Math.sqrt(F.eigenval[j] || 1);
      sliders[j].parentElement.querySelector('.slider-val').textContent = s.toFixed(2);
    }
    Faces.reconstruct(coeffs, buf);
    FaceCanvas.render(canvas, buf, { min: 0, max: 1 });
  }

  sliders.forEach(s => s.addEventListener('input', render));
  reset.addEventListener('click', () => {
    sliders.forEach(s => { s.value = 0; });
    render();
  });

  render();
  window.addEventListener('faces-loaded', render, { once: true });

  return {};
};
