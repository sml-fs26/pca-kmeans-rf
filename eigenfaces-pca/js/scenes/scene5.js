/* Scene 5 — The eigenfaces.
 * Top-16 eigenfaces in a 4×4 grid, hover for PC index and λ.
 * STUB: renders eigen vectors with the diverging signed ramp. */

window.scenes.scene5 = function (root) {
  const layout = document.createElement('div');
  layout.className = 'scene-layout right-text';
  root.appendChild(layout);

  const left = document.createElement('div');
  left.className = 'viz-wrap s5-grid-wrap';
  left.style.padding = '20px';
  left.style.alignItems = 'center';
  left.style.justifyContent = 'flex-start';
  layout.appendChild(left);

  const grid = document.createElement('div');
  grid.className = 'face-grid';
  grid.style.gridTemplateColumns = 'repeat(4, max-content)';
  left.appendChild(grid);

  const right = document.createElement('div');
  right.className = 'text-col';
  layout.appendChild(right);

  right.innerHTML = `
    <span class="step-pill">Step 2 — diagonalize the covariance</span>
    <h2>The eigenfaces.</h2>
    <p class="muted">The eigenvectors of the covariance matrix are themselves length-4096 vectors. Painted as 64×64 images, they look like archetypes: lighting, glasses, gender, smile. Red = positive, blue = negative.</p>
    <div class="formula-block" id="s5-formula"></div>
    <p class="muted s5-readout mono" id="s5-readout">hover an eigenface</p>
  `;

  if (window.katex) {
    katex.render('C v_j = \\lambda_j v_j', document.getElementById('s5-formula'), { displayMode: true });
  }

  function build() {
    grid.innerHTML = '';
    const F = Faces.get();
    if (!F) {
      const note = document.createElement('p');
      note.className = 'muted';
      note.textContent = '⏳ waiting for data — run precompute/build-data.py';
      grid.appendChild(note);
      return;
    }
    const K = Math.min(16, F.meta.K);
    for (let j = 0; j < K; j++) {
      const col = document.createElement('div');
      const c = FaceCanvas.create(col, { w: F.meta.W, h: F.meta.H, scale: 1.5 });
      c.classList.add('interactive');
      const ef = Faces.eigenface(j);
      FaceCanvas.render(c, ef, { signed: true });
      const cap = document.createElement('div');
      cap.className = 'face-caption';
      cap.textContent = `PC${j + 1}`;
      col.appendChild(cap);
      const lam = F.eigenval[j];
      c.addEventListener('mouseenter', () => {
        document.getElementById('s5-readout').textContent =
          `PC${j + 1}  ·  λ = ${lam.toExponential(3)}  ·  variance ${(F.varRatio[j] * 100).toFixed(1)}%`;
      });
      grid.appendChild(col);
    }
  }
  build();
  window.addEventListener('faces-loaded', build, { once: true });

  return {};
};
