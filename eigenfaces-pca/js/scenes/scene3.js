/* Scene 3 — The mean face.
 * The "ghost of everyone" — average all N faces pixel-wise.
 * STUB: renders the precomputed mean from data/mean.bin. */

window.scenes.scene3 = function (root) {
  const layout = document.createElement('div');
  layout.className = 'scene-layout split-eq';
  root.appendChild(layout);

  const left = document.createElement('div');
  left.className = 'viz-wrap';
  left.style.padding = '24px';
  left.style.alignItems = 'center';
  left.style.justifyContent = 'center';
  layout.appendChild(left);

  const canvas = FaceCanvas.create(left, { w: 64, h: 64, scale: 7 });

  const right = document.createElement('div');
  right.className = 'text-col';
  layout.appendChild(right);

  right.innerHTML = `
    <span class="step-pill">Step 1 — center the data</span>
    <h2>The mean face.</h2>
    <p class="muted">Average every pixel across all 400 faces:</p>
    <div class="formula-block" id="s3-formula"></div>
    <p class="muted">It's nobody — but it's the closest single image to everyone.</p>
  `;

  if (window.katex) {
    katex.render('\\mu = \\frac{1}{N}\\sum_{i=1}^{N} x_i', document.getElementById('s3-formula'), { displayMode: true });
  }

  function show() {
    const F = Faces.get();
    if (!F) return;
    FaceCanvas.render(canvas, F.mean, { min: 0, max: 1 });
  }
  show();
  window.addEventListener('faces-loaded', show, { once: true });

  return {};
};
