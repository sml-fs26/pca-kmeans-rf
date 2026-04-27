// Scrollytelling controller. Wires scrollama → window.SCENES[vizKind].enter,
// handles keyboard nav, hash routing (#scene-N), and the dark-mode toggle.

(function () {
  Theme.init();
  document.getElementById('theme-toggle').addEventListener('click', () => Theme.toggle());

  const svg = document.getElementById('viz');
  const overlay = document.getElementById('viz-overlay');
  const readout = document.getElementById('viz-readout');
  const controls = document.getElementById('viz-controls');

  // ctx is the per-render context handed to every scene's enter().
  // Scenes own everything inside svg/overlay/controls/readout while active.
  const ctx = { svg, overlay, readout, controls, data: window.DATA };

  const sceneEls = Array.from(document.querySelectorAll('.scene'));
  let activeIdx = -1;
  let lastVizKind = null;

  function dispatch(idx) {
    if (idx === activeIdx) return;
    const el = sceneEls[idx];
    if (!el) return;
    const vizKind = el.dataset.viz;
    const sub = el.dataset.sub || null;

    // Let outgoing viz clean up if it's switching to a different viz kind.
    if (lastVizKind && lastVizKind !== vizKind) {
      const outgoing = window.SCENES[lastVizKind];
      if (outgoing && outgoing.exit) outgoing.exit(ctx);
    }

    activeIdx = idx;
    lastVizKind = vizKind;

    const scene = window.SCENES[vizKind];
    if (scene && scene.enter) {
      scene.enter(ctx, { sub, idx });
    } else {
      d3.select(svg).selectAll('*').remove();
      overlay.innerHTML = `<div class="scene-stub">Missing handler: ${vizKind}</div>`;
    }

    document.querySelectorAll('.scene-nav button').forEach(b => {
      b.classList.toggle('active', +b.dataset.sceneTarget === idx + 1);
    });

    const hash = `#scene-${idx + 1}`;
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }

  const scroller = scrollama();
  scroller.setup({ step: '.scene', offset: 0.55, debug: false })
    .onStepEnter(({ index }) => dispatch(index));

  window.addEventListener('resize', () => {
    scroller.resize();
    const idx = activeIdx;
    activeIdx = -1;
    dispatch(idx);
  });

  function scrollToScene(idx) {
    idx = Math.max(0, Math.min(sceneEls.length - 1, idx));
    sceneEls[idx].scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { scrollToScene(activeIdx + 1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { scrollToScene(activeIdx - 1); e.preventDefault(); }
    else if (e.key === 'Home') { scrollToScene(0); e.preventDefault(); }
    else if (e.key === 'End') { scrollToScene(sceneEls.length - 1); e.preventDefault(); }
  });

  // Number-key jumps: 1..9 + 0 (= 10), q (= 11), w (= 12). Scaling beyond 12 needs more keys.
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (/^[1-9]$/.test(e.key)) { scrollToScene(+e.key - 1); e.preventDefault(); }
    else if (e.key === '0') { scrollToScene(9); e.preventDefault(); }
    else if (e.key === 'q' || e.key === 'Q') { scrollToScene(10); e.preventDefault(); }
    else if (e.key === 'w' || e.key === 'W') { scrollToScene(11); e.preventDefault(); }
  });

  document.querySelectorAll('.scene-nav button').forEach(b => {
    b.addEventListener('click', () => scrollToScene(+b.dataset.sceneTarget - 1));
  });

  // Hash routing on load (#scene-N) — use instant scroll, not smooth, so that
  // headless screenshots (and refresh-on-scene) land on the right frame immediately.
  if (location.hash) {
    const m = location.hash.match(/^#scene-(\d+)/);
    if (m) {
      const idx = Math.max(0, Math.min(sceneEls.length - 1, +m[1] - 1));
      sceneEls[idx].scrollIntoView({ block: 'start' });
      dispatch(idx);
    }
  }

  // Render the first scene immediately so the viz panel isn't blank before scroll.
  if (activeIdx === -1) dispatch(0);
})();
