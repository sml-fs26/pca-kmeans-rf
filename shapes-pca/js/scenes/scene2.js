/* Scene 2 — A picture is just a vector.
 *
 * Four internal steps:
 *   0 — A picture: the 32x32 image rendered as 32 horizontal row-canvases.
 *   1 — Unroll: animation. Rows fan apart, then translate + squish to land
 *       in a single horizontal strip (the 1024-pixel vector). When advancing
 *       forward we play the animation; when stepping back from step 2 we
 *       snap directly to the strip layout.
 *   2 — Stack: the strip from step 1 stays at the top, four more sample
 *       strips appear below + an ellipsis row hinting at n=200.
 *   3 — Data matrix: same layout, with n / p / 2-intrinsic-numbers callout.
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

  // The animation stage holds either the row-canvases (steps 0 and 1) or the
  // multi-strip stack (steps 2 and 3).
  const animStage = document.createElement('div');
  animStage.className = 's2-anim-stage';
  leftCol.appendChild(animStage);

  const stageCaption = document.createElement('div');
  stageCaption.className = 's2-stage-caption';
  leftCol.appendChild(stageCaption);

  // Right column: formula + dims + callout.
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
      try { window.katex.render(src, host, { displayMode: !!displayMode, throwOnError: false }); }
      catch (e) { host.textContent = src; }
    } else { host.textContent = src; }
  }
  function clearChildren(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  // ---- Row canvases (sample 0) ---------------------------------------------
  // Each row of the 32x32 image becomes a 32x1 native canvas, displayed via
  // CSS at the size dictated by the current stage state.
  const sample0 = PCA.buildImage(variant, 0);
  const rowCanvases = [];
  for (let r = 0; r < 32; r++) {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 1;
    c.className = 'shape-image s2-row';
    c.style.setProperty('--row-idx', String(r));
    rowCanvases.push(c);
  }
  function paintRowCanvases() {
    const img = PCA.buildImage(variant, 0);
    const rowVec = new Float32Array(32);
    rowCanvases.forEach((c, r) => {
      for (let col = 0; col < 32; col++) rowVec[col] = img[r * 32 + col];
      ImageCanvas.render(c, rowVec, { w: 32, h: 1 });
    });
  }
  paintRowCanvases();

  // ---- Strip canvases for samples 1..4 (used in steps 2-3) -----------------
  const stripCanvases1to4 = [];
  for (let i = 1; i < 5; i++) {
    const c = document.createElement('canvas');
    c.width = D; c.height = 1;
    c.className = 'shape-image s2-strip';
    stripCanvases1to4.push(c);
  }
  function paintExtraStrips() {
    for (let i = 0; i < stripCanvases1to4.length; i++) {
      const img = PCA.buildImage(variant, i + 1);
      ImageCanvas.render(stripCanvases1to4[i], img);
    }
  }
  paintExtraStrips();

  // Composite strip-of-rows used as the x_0 row in steps 2-3 (built once,
  // reused). Wrapping the same row canvases lets the layout transition from
  // step 1 into step 2 visually, and avoids rendering pixels twice.
  const compositeStrip = document.createElement('div');
  compositeStrip.className = 's2-composite-strip';
  rowCanvases.forEach(c => compositeStrip.appendChild(c));

  // ---- Stage states ---------------------------------------------------------
  // Three high-level layouts:
  //   image  — rows stacked vertically (looks like the original 32x32).
  //   strip  — rows laid out horizontally as one long thin strip.
  //   stack  — strip-of-rows at top + 4 extra strips below + ellipsis row.
  // Plus a transient 'fanned' state we trigger mid-animation.
  function buildStack() {
    clearChildren(animStage);

    const x0Row = document.createElement('div');
    x0Row.className = 's2-strip-row s2-strip-row-x0';
    const tag0 = document.createElement('div');
    tag0.className = 's2-strip-tag mono';
    tag0.textContent = 'x_0';
    x0Row.appendChild(tag0);
    x0Row.appendChild(compositeStrip);
    animStage.appendChild(x0Row);

    for (let i = 0; i < stripCanvases1to4.length; i++) {
      const r = document.createElement('div');
      r.className = 's2-strip-row';
      const tag = document.createElement('div');
      tag.className = 's2-strip-tag mono';
      tag.textContent = `x_${i + 1}`;
      r.appendChild(tag);
      r.appendChild(stripCanvases1to4[i]);
      animStage.appendChild(r);
    }

    const ell = document.createElement('div');
    ell.className = 's2-strip-row s2-strip-ellipsis';
    ell.innerHTML =
      '<div class="s2-strip-tag mono">⋮</div>' +
      '<div class="s2-strip-dots">⋮ &nbsp; 200 rows in total &nbsp; ⋮</div>';
    animStage.appendChild(ell);
  }

  function setStageState(state) {
    animStage.classList.remove('is-image', 'is-fanned', 'is-strip', 'is-stack');
    if (state === 'stack') {
      buildStack();
      animStage.classList.add('is-stack');
      return;
    }
    // image / fanned / strip — make sure the stage holds just the row canvases.
    if (animStage.firstChild !== rowCanvases[0]) {
      clearChildren(animStage);
      // Re-parent the rows out of compositeStrip if they were wrapped.
      rowCanvases.forEach(c => animStage.appendChild(c));
    }
    animStage.classList.add('is-' + state);
  }

  // ---- State + render -------------------------------------------------------
  let cursor = 0;
  let animTimeouts = [];
  function clearAnimTimeouts() {
    animTimeouts.forEach(t => clearTimeout(t));
    animTimeouts = [];
  }

  function render(forward) {
    clearAnimTimeouts();
    stepPill.textContent = `${STEP_LABELS[cursor]}  ·  Step ${cursor + 1} of ${STEPS}`;

    // Lede + caption per step.
    if (cursor === 0) {
      lede.innerHTML = "Pick one image. Look at it. It's a picture.";
      stageCaption.innerHTML = '<em>x<sub>0</sub> &nbsp; · &nbsp; the first sample, 32 × 32 = 1024 pixels.</em>';
    } else if (cursor === 1) {
      lede.innerHTML = 'Slice it into rows. Lay them end-to-end. The image becomes one 1024-pixel vector.';
      stageCaption.innerHTML = '<em>row 0, then row 1, then row 2 … row 31. Same pixels, different shape.</em>';
    } else if (cursor === 2) {
      lede.innerHTML = "One row per image. That's the data matrix <span class=\"mono\">X</span>.";
      stageCaption.innerHTML = '<em>each image is now a row in <span class="mono">X</span>.</em>';
    } else {
      lede.innerHTML = 'A 1024-dimensional pixel space. Two intrinsic numbers per image.';
      stageCaption.innerHTML = '<em>n = 200 samples · p = 1024 pixels.</em>';
    }

    // Stage layout per step.
    if (cursor === 0) {
      setStageState('image');
    } else if (cursor === 1) {
      if (forward) {
        // Animate image → fanned → strip.
        setStageState('image');
        animTimeouts.push(setTimeout(() => setStageState('fanned'), 60));
        animTimeouts.push(setTimeout(() => setStageState('strip'), 520));
      } else {
        setStageState('strip');
      }
    } else {
      // Steps 2 and 3 share the stack layout.
      setStageState('stack');
    }

    // Right column — formula.
    if (cursor === 0) {
      renderKatex(formulaBlock, 'x_0 \\;\\in\\; \\mathbb{R}^{32 \\times 32}', true);
    } else if (cursor === 1) {
      renderKatex(formulaBlock, 'x_0 \\;\\in\\; \\mathbb{R}^{1024}', true);
    } else {
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

    // Dims (steps 2-3).
    clearChildren(dimsBlock);
    if (cursor >= 2) {
      const row = document.createElement('div');
      row.className = 's2-dims-row';

      const n = document.createElement('div');
      n.className = 's2-dim-cell';
      n.innerHTML = '<span class="s2-dim-label">samples</span>' +
        '<span class="s2-dim-value mono">n = 200</span>';
      row.appendChild(n);

      const p = document.createElement('div');
      p.className = 's2-dim-cell';
      p.innerHTML = '<span class="s2-dim-label">pixels per image</span>' +
        '<span class="s2-dim-value mono' + (cursor === 3 ? ' s2-dim-highlight' : '') + '">p = 1024</span>';
      row.appendChild(p);

      const k = document.createElement('div');
      k.className = 's2-dim-cell';
      k.innerHTML = '<span class="s2-dim-label">intrinsic numbers</span>' +
        '<span class="s2-dim-value mono' + (cursor === 3 ? ' s2-dim-highlight' : '') + '">2</span>';
      row.appendChild(k);

      dimsBlock.appendChild(row);
    }

    // Callout slot.
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

  function setCursor(c, forward) {
    if (c < 0 || c >= STEPS) return false;
    if (c === cursor) return false;
    cursor = c;
    render(forward);
    return true;
  }

  function onThemeChange() {
    paintRowCanvases();
    paintExtraStrips();
  }
  window.addEventListener('theme-change', onThemeChange);

  // Initial paint.
  render(false);

  return {
    onEnter() {
      cursor = 0;
      render(false);
    },
    onLeave() {
      clearAnimTimeouts();
    },
    onNextKey() {
      if (cursor < STEPS - 1) return setCursor(cursor + 1, true); // consume
      return false;
    },
    onPrevKey() {
      if (cursor > 0) return setCursor(cursor - 1, false);
      return false;
    },
  };
};
