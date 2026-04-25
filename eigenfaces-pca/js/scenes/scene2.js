/* Scene 2 — A face is just numbers.
 * Click a pixel → reveal its grayscale value. Punchline: a face is a 4096-vector.
 * STUB: shows the canvas + click handler; the value-reveal panel is a TODO. */

window.scenes.scene2 = function (root) {
  const layout = document.createElement('div');
  layout.className = 'scene-layout split-eq';
  root.appendChild(layout);

  const left = document.createElement('div');
  left.className = 'viz-wrap s2-viz';
  left.style.padding = '24px';
  left.style.alignItems = 'center';
  left.style.justifyContent = 'center';
  layout.appendChild(left);

  const canvas = FaceCanvas.create(left, { w: 64, h: 64, scale: 7 });
  canvas.classList.add('interactive');

  const right = document.createElement('div');
  right.className = 'text-col';
  layout.appendChild(right);

  const h2 = document.createElement('h2');
  h2.textContent = 'A face is just numbers.';
  right.appendChild(h2);

  const p = document.createElement('p');
  p.className = 'muted';
  p.textContent = 'Click a pixel. Each one is a single number from 0 (black) to 255 (white). Stack 64 × 64 of them into a vector and you have a point in ℝ⁴⁰⁹⁶.';
  right.appendChild(p);

  const readout = document.createElement('div');
  readout.className = 'mono';
  readout.style.marginTop = '12px';
  readout.style.fontSize = '13px';
  readout.style.color = 'var(--ink-soft)';
  readout.textContent = '(click a pixel)';
  right.appendChild(readout);

  function show() {
    const F = Faces.get();
    if (!F) {
      readout.textContent = '⏳ waiting for data — run precompute/build-data.py';
      return;
    }
    const D = F.meta.W * F.meta.H;
    const view = F.faces.subarray(0, D); // first face for now
    FaceCanvas.render(canvas, view);
  }

  canvas.addEventListener('click', e => {
    const F = Faces.get();
    if (!F) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * F.meta.W);
    const y = Math.floor(((e.clientY - rect.top)  / rect.height) * F.meta.H);
    const idx = y * F.meta.W + x;
    const v = F.faces[idx];
    readout.textContent = `pixel (${x}, ${y}) = ${v}`;
  });

  show();
  window.addEventListener('faces-loaded', show, { once: true });

  return {};
};
