// Scrollytelling controller. Loads data, wires scrollama to scene-render dispatch,
// handles keyboard nav (arrows snap to scenes, scene buttons jump), and hash routing.

async function loadAll() {
  const index = await fetch("data/congresses.json").then(r => r.json());
  const congresses = await Promise.all(
    index.map(meta =>
      fetch(`data/senate/${meta.congress}.json`).then(r => r.json())
    )
  );
  const matrix = await fetch("data/senate/119_matrix.json").then(r => r.json());
  // Manifest of which bioguide IDs have a local headshot.
  let photoSet = new Set();
  try {
    const photos = await fetch("assets/photos/manifest.json").then(r => r.json());
    photoSet = new Set(photos);
  } catch (e) { /* no photos available — gracefully fall back to dots */ }

  const byCongress = new Map(congresses.map(c => [c.congress, c]));
  const orderedNums = index.map(m => m.congress);
  return { index, congresses, byCongress, orderedNums, matrix, photoSet };
}

(async function () {
  const data = await loadAll();
  const svg = document.getElementById("viz");
  const overlay = document.getElementById("viz-overlay");
  const readout = document.getElementById("viz-readout");

  const controls = document.getElementById("viz-controls");
  const ctx = { svg, overlay, readout, controls, data, timeSliderHandlers: null };

  const sceneEls = Array.from(document.querySelectorAll(".scene"));
  let activeIdx = -1;
  let lastVizKind = null;

  function dispatch(idx) {
    if (idx === activeIdx) return;
    activeIdx = idx;
    const el = sceneEls[idx];
    if (!el) return;
    const vizKind = el.dataset.viz;
    const sub = el.dataset.scatterState;

    // Clear hover panel state when leaving a scatter scene.
    if (lastVizKind === "scatter" && vizKind !== "scatter") {
      window._sceneHelpers.clearScatter();
    }
    if (vizKind !== "scatter") {
      ctx.timeSliderHandlers = null;
    }
    // Clear the controls strip unless we're entering the time-slider scene.
    const isTimeScene = vizKind === "scatter" && sub === "time";
    if (!isTimeScene && ctx.controls) ctx.controls.innerHTML = "";
    lastVizKind = vizKind;

    const scene = window.SCENES[vizKind];
    if (scene && scene.enter) scene.enter(ctx, { sub });

    // Update URL hash without triggering scroll.
    const hash = `#scene-${idx + 1}`;
    if (location.hash !== hash) history.replaceState(null, "", hash);
  }

  // Set up scrollama.
  const scroller = scrollama();
  scroller.setup({
    step: ".scene",
    offset: 0.55,
    debug: false,
  }).onStepEnter(({ index }) => dispatch(index));

  window.addEventListener("resize", () => {
    scroller.resize();
    // Re-render current scene to fit new dimensions.
    const idx = activeIdx;
    activeIdx = -1;
    dispatch(idx);
  });

  // Scroll to a given scene index (0-based).
  function scrollToScene(idx) {
    idx = Math.max(0, Math.min(sceneEls.length - 1, idx));
    sceneEls[idx].scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Keyboard nav.
  document.addEventListener("keydown", e => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.key === "ArrowRight" || e.key === "PageDown") {
      scrollToScene(activeIdx + 1);
      e.preventDefault();
    } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
      scrollToScene(activeIdx - 1);
      e.preventDefault();
    } else if (e.key === "ArrowUp" && ctx.timeSliderHandlers) {
      ctx.timeSliderHandlers.step(1);
      e.preventDefault();
    } else if (e.key === "ArrowDown" && ctx.timeSliderHandlers) {
      ctx.timeSliderHandlers.step(-1);
      e.preventDefault();
    } else if (e.key === "Home") {
      scrollToScene(0);
      e.preventDefault();
    } else if (e.key === "End") {
      scrollToScene(sceneEls.length - 1);
      e.preventDefault();
    } else if (/^[1-9]$/.test(e.key)) {
      scrollToScene(+e.key - 1);
      e.preventDefault();
    }
  });

  // Hash routing on load.
  if (location.hash) {
    const m = location.hash.match(/^#scene-(\d+)$/);
    if (m) {
      setTimeout(() => scrollToScene(+m[1] - 1), 50);
    }
  }

  // Always render the first scene so the viz panel isn't blank before user scrolls.
  if (activeIdx === -1) dispatch(0);
})();
