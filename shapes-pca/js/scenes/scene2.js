/* Scene 2 — A picture is just a vector.
 *
 * 4 internal steps (Next consumes within the scene until the last step):
 *   1) Setup: one 32x32 image x_0 on the left, placeholder on the right.
 *   2) Unroll: the image becomes a 1024x1 horizontal strip.
 *   3) Stack: 4 more strips appear below it; on the right, a KaTeX bmatrix.
 *   4) Land: highlight n=200, p=1024, "two intrinsic dimensions in 1024-D pixels".
 */

window.scenes.scene2 = function (root) {
  root.innerHTML = '';
  root.classList.add('scene-s2');

  const variant = PCA.variant('independent2');
  const D = window.DATA.meta.D;

  const STEPS = 4;
  const STEP_LABELS = [
    'Step 1 — A picture',
    'Step 2 — Unroll',
    'Step 3 — Stack',
    'Step 4 — The data matrix',
  ];

  // ---- DOM scaffolding ------------------------------------------------------
  const stepPill = document.createElement('div');
  stepPill.className = 'step-pill s2-step-pill';
  root.appendChild(stepPill);

  const layout = document.createElement('div');
  layout.className = 'scene-layout';
  root.appendChild(layout);

  const leftCol = document.createElement('div');
  leftCol.className = 's2-left';
  layout.appendChild(leftCol);

  const heading = document.createElement('h2');
  heading.className = 's2-heading';
  heading.textContent = 'A picture is just a vector.';
  leftCol.appendChild(heading);

  const lede = document.createElement('p');
  lede.className = 'muted s2-lede';
  leftCol.appendChild(lede);

  // The "image stage": holds the 32x32 image, then the strips.
  const imageStage = document.createElement('div');
  imageStage.className = 's2-image-stage';
  leftCol.appendChild(imageStage);

  // Image cell (32x32, scale 8).
  const imageCell = document.createElement('div');
  imageCell.className = 's2-image-cell';
  imageStage.appendChild(imageCell);
  const imageCanvas = ImageCanvas.create(imageCell, { w: 32, h: 32, scale: 8 });
  const imageCaption = document.createElement('div');
  imageCaption.className = 'image-caption';
  imageCell.appendChild(imageCaption);

  // Strip stack — built and revealed in steps 2/3.
  const stripStack = document.createElement('div');
  stripStack.className = 's2-strip-stack';
  imageStage.appendChild(stripStack);

  const stripCaption = document.createElement('div');
  stripCaption.className = 's2-strip-caption';
  imageStage.appendChild(stripCaption);

  // Right column: formula / callouts.
  const rightCol = document.createElement('div');
  rightCol.className = 's2-right text-col';
  layout.appendChild(rightCol);

  const formulaBlock = document.createElement('div');
  formulaBlock.className = 'formula-block s2-formula';
  rightCol.appendChild(formulaBlock);

  const dimsBlock = document.createElement('div');
  dimsBlock.className = 's2-dims';
  rightCol.appendChild(dimsBlock);

  const calloutSlot = document.createElement('div');
  calloutSlot.className = 's2-callout-slot';
  rightCol.appendChild(calloutSlot);

  // ---- Helpers --------------------------------------------------------------
  function renderKatex(host, src, displayMode) {
    if (!host) return;
    host.textContent = '';
    if (window.katex) {
      try {
        window.katex.render(src, host, { displayMode: !!displayMode, throwOnError: false });
      } catch (e) {
        host.textContent = src;
      }
    } else {
      host.textContent = src;
    }
  }

  function clearChildren(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function makeStripCanvas() {
    // 1024 pixels wide, 1 pixel tall. CSS-stretched to a thin strip.
    const c = document.createElement('canvas');
    c.width = D;
    c.height = 1;
    c.className = 'shape-image s2-strip';
    return c;
  }

  // Pre-render strips for samples 0..4.
  const stripCanvases = [];
  for (let i = 0; i < 5; i++) {
    const c = makeStripCanvas();
    const img = PCA.buildImage(variant, i);
    ImageCanvas.render(c, img);
    stripCanvases.push(c);
  }

  function paintImage() {
    const img = PCA.buildImage(variant, 0);
    ImageCanvas.render(imageCanvas, img);
  }
  function repaintStrips() {
    // re-render the 5 strips from raw data so theme changes flow through.
    for (let i = 0; i < stripCanvases.length; i++) {
      const img = PCA.buildImage(variant, i);
      ImageCanvas.render(stripCanvases[i], img);
    }
  }

  // ---- State ---------------------------------------------------------------
  let cursor = 0; // 0..STEPS-1

  function render() {
    // step pill
    stepPill.textContent = `${STEP_LABELS[cursor]}  ·  Step ${cursor + 1} of ${STEPS}`;

    // lede + image caption tweak per step
    if (cursor === 0) {
      lede.innerHTML = 'Pick one image. Look at it. It\'s a picture.';
      imageCaption.innerHTML = '<em>x<sub>0</sub> &nbsp; · &nbsp; the first sample</em>';
    } else if (cursor === 1) {
      lede.innerHTML = 'Now unroll its 32 × 32 = 1024 pixels into a single row.';
      imageCaption.innerHTML = '<em>x<sub>0</sub> &nbsp; · &nbsp; the first sample</em>';
    } else if (cursor === 2) {
      lede.innerHTML = 'Stack one row per image. That\'s the data matrix <span class="mono">X</span>.';
      imageCaption.innerHTML = '<em>x<sub>0</sub> &nbsp; · &nbsp; the first sample</em>';
    } else {
      lede.innerHTML = 'A 1024-dimensional pixel space. Two intrinsic numbers per image.';
      imageCaption.innerHTML = '<em>x<sub>0</sub> &nbsp; · &nbsp; the first sample</em>';
    }

    // image always visible
    paintImage();

    // strips
    clearChildren(stripStack);
    if (cursor === 0) {
      stripCaption.innerHTML = '';
    } else if (cursor === 1) {
      // Show only the first strip with a caption.
      const labelRow = document.createElement('div');
      labelRow.className = 's2-strip-row';
      const tag = document.createElement('div');
      tag.className = 's2-strip-tag mono';
      tag.textContent = 'x_0';
      labelRow.appendChild(tag);
      labelRow.appendChild(stripCanvases[0]);
      stripStack.appendChild(labelRow);
      stripCaption.innerHTML = '<em>row x<sub>0</sub> ∈ ℝ<sup>1024</sup>, rendered as a thin strip.</em>';
    } else {
      // Steps 3 and 4: show 5 strips stacked + ellipsis row + final x_n row hint.
      for (let i = 0; i < stripCanvases.length; i++) {
        const labelRow = document.createElement('div');
        labelRow.className = 's2-strip-row';
        const tag = document.createElement('div');
        tag.className = 's2-strip-tag mono';
        tag.textContent = `x_${i}`;
        labelRow.appendChild(tag);
        labelRow.appendChild(stripCanvases[i]);
        stripStack.appendChild(labelRow);
      }
      // ellipsis
      const ell = document.createElement('div');
      ell.className = 's2-strip-row s2-strip-ellipsis';
      ell.innerHTML = '<div class="s2-strip-tag mono">⋮</div><div class="s2-strip-dots">⋮ &nbsp; 200 rows in total &nbsp; ⋮</div>';
      stripStack.appendChild(ell);

      stripCaption.innerHTML = '<em>each image becomes one row. n = 200 rows × p = 1024 columns.</em>';
    }

    // KaTeX formula (right column)
    if (cursor === 0) {
      renderKatex(formulaBlock, 'x_0 \\;\\in\\; \\mathbb{R}^{32 \\times 32}', true);
    } else if (cursor === 1) {
      renderKatex(formulaBlock, 'x_0 \\;\\in\\; \\mathbb{R}^{1024}', true);
    } else {
      // Stack / matrix
      const tex =
        'X \\;=\\; \\begin{bmatrix}' +
        '\\;\\;x_1\\;\\;\\\\' +
        '\\;\\;x_2\\;\\;\\\\' +
        '\\vdots\\\\' +
        '\\;\\;x_n\\;\\;' +
        '\\end{bmatrix}' +
        '\\;\\in\\; \\mathbb{R}^{n \\times p}';
      renderKatex(formulaBlock, tex, true);
    }

    // Dimensions readout (steps 3-4)
    clearChildren(dimsBlock);
    if (cursor >= 2) {
      const row = document.createElement('div');
      row.className = 's2-dims-row';

      const n = document.createElement('div');
      n.className = 's2-dim-cell';
      n.innerHTML = '<span class="s2-dim-label">samples</span><span class="s2-dim-value mono">n = 200</span>';
      row.appendChild(n);

      const p = document.createElement('div');
      p.className = 's2-dim-cell';
      p.innerHTML = '<span class="s2-dim-label">pixels per image</span><span class="s2-dim-value mono' +
        (cursor === 3 ? ' s2-dim-highlight' : '') + '">p = 1024</span>';
      row.appendChild(p);

      const k = document.createElement('div');
      k.className = 's2-dim-cell';
      k.innerHTML = '<span class="s2-dim-label">intrinsic numbers</span><span class="s2-dim-value mono' +
        (cursor === 3 ? ' s2-dim-highlight' : '') + '">2</span>';
      row.appendChild(k);

      dimsBlock.appendChild(row);
    }

    // Callout (step 4)
    clearChildren(calloutSlot);
    if (cursor === 3) {
      const c = document.createElement('div');
      c.className = 'callout';
      c.innerHTML =
        '<div class="callout-title">The point</div>' +
        '<p>Two intrinsic dimensions live inside a 1024-dimensional pixel space. ' +
        'PCA\'s job is to find them.</p>';
      calloutSlot.appendChild(c);
    } else if (cursor === 2) {
      const c = document.createElement('div');
      c.className = 'sidebar-note';
      c.innerHTML =
        '<span class="sidebar-title">The shape of X</span>' +
        'Each row is one image. Pixel <em>p</em> always lives in the same column across all rows — that\'s why we can take dot products between images.';
      calloutSlot.appendChild(c);
    }
  }

  function setCursor(c) {
    if (c < 0 || c >= STEPS) return false;
    if (c === cursor) return false;
    cursor = c;
    render();
    return true;
  }

  function onThemeChange() {
    paintImage();
    repaintStrips();
  }
  window.addEventListener('theme-change', onThemeChange);

  // Initial paint.
  render();

  return {
    onEnter() {
      cursor = 0;
      render();
    },
    onLeave() {},
    onNextKey() {
      if (cursor < STEPS - 1) {
        return setCursor(cursor + 1); // consume
      }
      return false; // let driver advance to scene 3
    },
    onPrevKey() {
      if (cursor > 0) {
        return setCursor(cursor - 1); // consume
      }
      return false; // let driver go back
    },
  };
};
