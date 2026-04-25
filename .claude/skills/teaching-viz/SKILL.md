---
name: teaching-viz
description: Build single-file, browser-only educational visualizations for the Informatik II (D-MAVT) course. Use this whenever the user asks for a "visualization", "interactive viz", "scene", "animation", or "explainer" tied to a CS concept (DP, recursion, sorting, graphs, etc.) — particularly anything that should sit under `2026/visualizations/` or `website/visualizations/` in the informatik2_mavt repo. Defines aesthetic, libraries, file layout, step-engine pattern, and verification checklist.
---

# Teaching-viz skill

Cohesive set of conventions for the `informatik2_mavt/2026/visualizations/` series. Every viz in that folder follows these rules. Read once, then apply throughout the build.

## Hard requirements (non-negotiable)

1. **Single self-contained `index.html`.** Inline CSS, inline JS, inline data. Browser-openable via `file://`. No build step.
2. **No `fetch()`, no relative `import()`, no relative `<img src=>` / `<link href=>` / `<script src=>`.** Past viz shipped broken because of `await fetch('data.json')` failing on `file://`. If a JSON file exists for documentation/auditing, also inline its contents as a JS const inside the HTML.
3. **Mirror to two locations** after every meaningful edit:
   - `2026/visualizations/<name>/index.html` (source)
   - `2026/website/visualizations/<name>/index.html` (deployed copy)
4. **Verify before reporting done:**
   - `node` syntax check on the script body (stub the DOM if needed; see snippet below).
   - `open <path>` to launch in default browser; describe what you saw. If broken (blank page, console errors, overlap), fix before reporting.
   - Check the file contains none of: `await fetch`, `import(`, `src="./`, `href="./` (KaTeX/Google fonts CDN are fine).

## File anatomy

```
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title><Topic> — Informatik II</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;600;700&family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">

  <style> /* see "Aesthetic" below */ </style>
</head>
<body>
  <div class="topbar"> brand · accent · scene title · dot pager </div>
  <div class="stage" id="stage"> <!-- one .scene div per scene --> </div>
  <div class="controls">
    <button id="prevBtn">← Prev</button>
    <button id="nextBtn" class="primary">Next →</button>
  </div>

  <script type="module">
    import * as d3 from "https://esm.sh/d3@7";
    import gsap   from "https://esm.sh/gsap@3.12.5";
    import katex  from "https://esm.sh/katex@0.16.9";
    /* ... inlined data + scene builders + driver ... */
  </script>
</body>
</html>
```

For viz where ES modules and the GSAP/D3 imports aren't needed, drop `type="module"` and use plain `<script>`. Default to `type="module"` so you can `import` from CDN.

## Aesthetic — the cream-paper look

Copy these conventions from any existing viz (e.g. `coin-change/index.html`) — never invent your own.

- **Background:** `--paper: #fbf8ea` with a faint grid:
  ```css
  background-color: var(--paper);
  background-image:
    linear-gradient(to right,  rgba(201,185,138,0.28) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(201,185,138,0.28) 1px, transparent 1px);
  background-size: 28px 28px;
  ```
- **Pen palette:** `--pink #e6006c`, `--blue #2a5bff`, `--red #dc2626`, `--green #16a34a`, `--orange #f97316`, `--purple #7c3aed`, `--muted #6b6b63`, `--ink #111`. The pink is the brand accent; use it sparingly for emphasis.
- **Fonts:**
  - `Caveat` (cursive) — titles, prose, hand-drawn labels, callouts. Default for human voice.
  - `JetBrains Mono` — code, numbers, formula tokens, S-table values.
  - `Inter` — UI chrome (buttons, pills, body text inside cards).
- **Topbar:** `Informatik 2 · <accent>Topic</accent>` on the left, scene title in the middle (or omit per-scene title for scene 0 / single-scene viz), small dot pager on the right.
- **Cards:** rounded `border-radius: 14px`, `border: 1.5–2px solid` muted, `background: #fffdf3` (slightly warmer than paper), with optional offset shadow `box-shadow: 2–4px 4px 0 var(--ink)` on prominent ones.
- **Buttons:** rounded pills, hand-drawn shadow, `Caveat` font for primary buttons, `Inter` for tool buttons. The primary "Next →" is pink-on-white with bold border.
- **SVG drawings:** `viewBox="0 0 W H"` with `preserveAspectRatio="xMidYMid meet"`. Use a `feTurbulence` + `feDisplacementMap` filter to give shapes a gentle hand-drawn jitter (`tile-rough` filter pattern from `fibonacci-tiling`).
- **Arrows:** quadratic/cubic bezier curves, dashed stroke for transient/animated arrows, solid for finalized ones. Colour-match to the originating element.
- **Hand-drawn labels** on the SVG use `font-family="Caveat,cursive"` and sit slightly off the geometry they annotate.

## Scene engine pattern

Every multi-scene viz uses the same shape (lifted from `switzerland-shortest-path` / `fibonacci-tiling`):

```js
const scenes = [
  { title: "<topbar title for scene 0, or empty>", build: buildScene1 },
  { title: "<…>",                                   build: buildScene2 },
  /* … */
];

let current = -1;
const sceneNodes = [];
const sceneState = []; // for re-entry (onEnter)

function goTo(idx){
  if (idx < 0 || idx >= scenes.length) return;
  if (idx === current) return;
  /* fade-out old, fade-in new, update dots, prev/next disabled state */
  if (!sceneNodes[idx]){
    const node = document.createElement("div");
    node.className = "scene";
    stage.appendChild(node);
    sceneNodes[idx] = node;
    sceneState[idx] = scenes[idx].build(node) || {};
  } else if (sceneState[idx]?.onEnter){
    sceneState[idx].onEnter();
  }
  setTimeout(() => sceneNodes[idx].classList.add("active"), 20);
}

prevBtn.addEventListener("click", () => goTo(current - 1));
nextBtn.addEventListener("click", () => goTo(current + 1));
window.addEventListener("keydown", e => {
  if (e.target?.tagName?.match(/input|textarea|select/i)) return;
  if (e.key === "ArrowRight") goTo(current + 1);
  else if (e.key === "ArrowLeft") goTo(current - 1);
});
```

Each `buildSceneN(root)` builds DOM into `root` and returns `{ onEnter? }` — the optional `onEnter` re-runs animations when the user navigates back to a scene already built.

## Step engine (within-scene "Next" button)

Some scenes have their own internal step counter (e.g. tracing through code line by line, filling a table cell by cell). Use this pattern:

```js
const STEPS = [
  { text: "…", actions: [{type: "highlightLine", line: 1}] },
  { text: "…", actions: [{type: "writeCell", idx: 2, value: 2}] },
  /* … */
];

let cursor = 0;
function setCursorTo(target, animate){
  target = Math.max(0, Math.min(STEPS.length - 1, target));
  if (target < cursor){ resetState(); cursor = 0; } // rewind via replay
  while (cursor < target){
    cursor++;
    const anims = applyStep(state, cursor);
    if (animate && cursor === target) anims.forEach(playAnim);
  }
  render(state);
  updateUI();
}
```

Critical rules:
- **Prev = rewind via reset+replay.** Don't try to write inverse mutations. Disable animations during fast-forward.
- **State is the source of truth, animations are decoration.** `render(state)` should produce a correct snapshot from scratch, no matter how you got there.
- **One DOM action per step.** Resist cramming several visual changes into one click.

## Progressive reveal (the most-frequent ask)

The user repeatedly asks for "items appearing one by one in a logical order" rather than a wall of content. For complex slides — especially summary/poster slides like *Subproblem · Recurrence · Table · Implementation* — **dispatch a small Plan agent to decide the order of appearance** before writing the build code. Brief that agent with:

- The full content of the slide (every text block, formula, code block, arrow).
- The pedagogical narrative the slide should tell.
- A request to return an ordered list `[{group: <name>, content: <description>, dependsOn: <prior groups>, narration: <optional>}]`.

Then implement the reveal as a `gsap.timeline()` with stagger, OR a click-driven "Next" that advances one element per click (`stepBtn` pattern above). Prefer click-driven when there are >5 reveal steps.

For each scene that has multiple cards, panels, or formula blocks: **start every revealed element at `opacity: 0`** and animate to 1 with `gsap.to(el, {opacity: 1, duration: 0.5}, t)`. Don't use CSS keyframe animations for staggered reveal — GSAP timelines are easier to coordinate and the user has a working pattern in `switzerland-shortest-path` scenes 6–7.

## Inline data convention

```js
const DATA = {
  /* … the entire JSON payload … */
};
```

Any companion `data.json` / `verify.py` lives in the same folder for human auditing but is **never** loaded at runtime. The HTML must be self-sufficient.

## KaTeX usage

```js
katex.render(
  "S(v) \\;=\\; \\min_{w \\in N(v)} \\bigl\\{ \\mathrm{dist}(v,w) + S(w) \\bigr\\}",
  document.getElementById("formula-container"),
  { throwOnError: false, displayMode: true }
);
```

In a JS string literal, `\\` produces a single `\` for KaTeX. Use `\mathrm{name}` for function names like `dist`, `min`, `max`. Use `\bigl\{ … \bigr\}` for visible curly braces (escape the brace with `\{`).

## Verification snippet (Node parse check)

```bash
node -e "
const fs = require('fs');
const s = fs.readFileSync('PATH/TO/index.html', 'utf8');
const m = s.match(/<script[^>]*>([\\s\\S]*?)<\\/script>/);
let body = m[1].replace(/^\\s*import[^;]+;\\s*$/gm, '');
body = 'const d3={select:()=>({selectAll:()=>({data:()=>({enter:()=>({append:()=>({})})})})}),create:()=>({node:()=>null,append:()=>({}),attr:()=>({}),selectAll:()=>({})}),range:()=>[],sum:()=>0};const gsap={timeline:()=>({to:()=>({}),call:()=>({}),kill:()=>{}}),to:()=>{},set:()=>{},from:()=>{}};const katex={render:()=>{},renderToString:()=>\"\"};\\n' + body;
try { new Function(body); console.log('PARSE OK'); } catch(e){ console.log('PARSE ERROR:', e.message); }
"
```

If the script tag is `type="module"`, the regex still works; the import-stripping line removes the top-level `import` declarations so `new Function()` doesn't barf.

## Style: prose voice, English everywhere

- All UI strings, labels, formula descriptions, and prose in **English**, even though the parent course is taught in German. The slides on the website are bilingual; the visualizations are English-only. (Lecturer preference, repeatedly stated.)
- Hand-drawn captions feel chatty: *"That's Fibonacci."*, *"Same recipe drives Fibonacci memoisation, coin change, and many physics/control problems."*, *"Try a city whose settled neighbours already contain the winning route."* Avoid stiff textbook tone.
- City / object names follow the slide deck. For Switzerland: German names (Genf, Zürich, Sankt Gallen). For algorithm vocabulary: English (subproblem, recurrence, settled, memoisation).

## Common widgets, by reference implementation

| Widget                                    | Reference file                              |
|-------------------------------------------|---------------------------------------------|
| Multi-scene carousel + dot pager          | `switzerland-shortest-path/index.html`      |
| Step-by-step code highlighter             | `fibonacci-callstack/`, `fibonacci-memoization/` |
| Progressive table fill with click-to-pick | `switzerland-shortest-path/` scene 5        |
| GSAP staggered card reveal                | `switzerland-shortest-path/` scenes 6–7     |
| Hand-drawn SVG with `feTurbulence` jitter | `fibonacci-tiling/` (the tile filter)       |
| Min-pitch column layout for a series      | `fibonacci-tiling/` `computeColumnAnchors`  |
| Inline arrow overlay layer                | `fibonacci-memoization/` `#arrow-layer`     |
| Cream-paper card with offset shadow       | any scene with `.card` in switzerland viz   |

When asked to add a feature similar to one of these, **read the reference first** before writing your own. Match its CSS classes and DOM shape. Don't reinvent — the user has already iterated these to the look they want.

## Things to never do

- ❌ Add a "Show me / give up" button that auto-completes the puzzle. The user removes these every time.
- ❌ Auto-run animations on `onEnter` for interactive scenes (defeats the "click to think" loop).
- ❌ Display the optimal value or solution as a HUD pill before the student attempts it.
- ❌ Use emoji in code or UI unless the user explicitly asks.
- ❌ Add legends explaining colour conventions inside the viz — the colour conventions speak for themselves once the student plays.
- ❌ Re-implement existing widgets from scratch. Copy from the reference implementations and adapt.
- ❌ Skip the mirror-to-website step. Every change must land in both copies.
- ❌ Skip the browser visual check. The `node` parse check finds syntax errors but not visual regressions.
- ❌ Fabricate examples, numbers, labels, or narrative anchors. Every stated value (a coefficient, a correlation, a city name, a timing, a "the model picked X") must come from the source material — the lecture slides, the dataset, the reference notebook. If the source doesn't have it, ask. Convincing-but-invented numbers are the single most expensive failure mode and the hardest to spot after the fact.

## Recipe for a new viz: minimal checklist

1. Pick the closest existing viz as a template; copy its `index.html` to `2026/visualizations/<new-name>/index.html`.
2. Strip the body of scene-specific content; keep the shell, topbar, controls, scene engine.
3. Inline the new data.
4. Build scenes one at a time. After each, `open` and click through.
5. For any scene with > 3 visual elements, write a one-paragraph "reveal order" plan first (or dispatch a small planner agent for very dense slides).
6. Run the parse-check snippet.
7. Mirror to `website/visualizations/<new-name>/index.html`.
8. If this is a new lecture's set of viz, add a link in `website/index.html` under the matching lecture row (use tabs for indentation — the file mixes tabs and spaces; a Python insert beats hand-editing).
9. Don't commit. Hand back to the user for review.
