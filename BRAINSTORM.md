# Random Forest Visualization — Brainstorm

A design brief for an interactive, beautiful, scrollytelling-style explainer of
random forests. Goal: make a reader *feel* why the algorithm works, not just
read about it.

---

## 1. Why random forests are powerful

Three intertwined reasons, each of which deserves its own scene in the
visualization:

1. **Variance reduction by averaging.** A single fully-grown decision tree is a
   low-bias / high-variance learner: it can fit any training set perfectly but
   wobbles wildly when the data is perturbed. Averaging `B` tree predictions
   shrinks the variance roughly like
   `Var = ρ·σ² + (1−ρ)·σ²/B`,
   where `ρ` is the correlation between trees. As `B → ∞` the second term
   vanishes; only the correlation floor remains. This is the single most
   important formula to dramatize.
2. **Decorrelation through double randomness.** Bagging (bootstrap sampling of
   rows) and feature subsampling at each split (`mtry`) together reduce `ρ`,
   pushing the variance floor down further. Without feature subsampling, every
   tree would always pick the same dominant feature at the top — and you'd
   gain almost nothing from averaging.
3. **Wisdom of the (decorrelated) crowd.** Each tree is a weak, biased voter,
   but their errors are *different* errors, so they cancel out under majority
   vote. The forest is an ensemble parliament where no single representative
   knows the truth.

Secondary reasons worth highlighting visually:
- Robust to outliers, missing values, and mixed feature types (no scaling
  needed).
- Built-in **out-of-bag** validation: ~36.8% of rows are unused per tree, so
  every row gets free held-out predictions.
- Built-in feature importance (Gini decrease, permutation importance).
- Embarrassingly parallel — each tree trains independently.
- Still a top performer on tabular data, where deep nets often lose.

## 2. How they work, in five beats

1. **Bootstrap.** Draw `N` samples *with replacement* from the training set.
   On average ~63.2% of unique rows appear; the rest are out-of-bag.
2. **Feature randomness.** At each split, expose only a random subset of
   `mtry` features to the splitter (typically `√p` for classification).
3. **Grow deep.** No pruning; trees overfit on purpose.
4. **Repeat** for `B` independent trees.
5. **Aggregate.** Majority vote (classification) or mean (regression).
   Probabilities come from the proportion of voting trees.

## 3. Inspiration scan (what's already great out there)

| Source | What we steal |
|---|---|
| [R2D3 — A Visual Introduction to ML, Part 1](https://r2d3.us/visual-intro-to-machine-learning-part-1/) | Scrollytelling cadence; SF/NY dot scatter that splits into colored regions; making one variable at a time feel discovered. |
| [R2D3 — Part 2 (Bias / Variance)](https://r2d3.us/visual-intro-to-machine-learning-part-2/) | Five different bootstrap samples → five different overfit boundaries shown side by side. The single best visual for "why averaging helps." |
| [MLU-Explain — Random Forest](https://mlu-explain.github.io/random-forest/) | Sliders / scrollers that retrain the ensemble live (number of trees, per-tree accuracy). |
| [dtreeviz](https://github.com/parrt/dtreeviz) | Per-node split histograms — much more readable than the boring rectangle nodes from sklearn. |
| [Cluster-Based Random Forest Visualization (arXiv 2507.22665)](https://arxiv.org/html/2507.22665v1) | Project trees into 2D by similarity; show that 500 trees collapse into ~5–10 clusters of "voices." |
| [Ken Lau's UBC RF ensemble project](https://www.cs.ubc.ca/~tmm/courses/547-14/projects/ken/report.pdf) | "Heatmap tree": features on each node colored by how many forest trees use them there. |
| [Berkeley "Walk Through the Random Forest"](https://people.ischool.berkeley.edu/~hearst/papers/infoviz_poster_2017.pdf) | Animating a single test point's path through every tree simultaneously. |
| [SHAP / Christoph Molnar's IML book](https://christophm.github.io/interpretable-ml-book/shap.html) | Beeswarm and waterfall charts for per-prediction explanations, color-graded by feature value. |
| [Animated Decision Tree (Manim)](https://github.com/MrChriwo/Animated-Desicion-Tree-and-Random-Forest) | Polished growing-tree animations as a fallback for non-interactive embeds. |

## 4. Proposed visualization sequence

A scrollytelling page with eight scenes. Each scene has a fixed canvas on the
right and a text column on the left that drives state.

### Scene 1 — "One tree is a brittle expert"
- Open on a 2D classification scatter (canonical: SF vs. NY houses, or moons,
  or two-class blobs). Two warm-vs-cool colors.
- Grow a single tree live: each split lays down an axis-aligned line in the
  background, and the tree on the side gains a node. Decision regions fill
  with translucent class color.
- End the scene with the boundary visibly overfit — long thin slivers chasing
  individual points. Caption: "It's never wrong on training data. That's the
  problem."

### Scene 2 — "A second tree disagrees"
- Resample the data (bootstrap), regrow the tree. Boundary morphs to a
  different jagged shape.
- Repeat 5×. Show the five boundaries stacked transparently. The shared signal
  emerges; the disagreement is concentrated near the true class boundary.
  *(This is the R2D3 Part 2 idea, distilled.)*

### Scene 3 — "Where the diversity comes from"
- **Bootstrap visual.** A bag of marbles labeled with row indices; an animated
  hand draws `N` marbles with replacement. Duplicates pile up; ~37% of marble
  bins stay empty (those are the OOB rows). A live counter shows the unique
  fraction converging to 1 − 1/e.
- **Feature randomness.** At each split, all `p` features fan out as labeled
  chips; a random `mtry`-sized subset lights up; the splitter only sees those.
  The user can drag `mtry` from 1 → p and watch the tree shape change.

### Scene 4 — "The grove"
- Small-multiples grid of 25 mini trees. Each is a tiny radial dendrogram with
  leaves colored by majority class.
- Hovering a tree lifts it forward and overlays its decision boundary on a
  shared scatter. Hovering a region of the scatter highlights the trees that
  agree there.
- Slider: animate `B` from 1 → 500. Two synchronized live numbers — train
  accuracy (already 1.0, doesn't move) and test accuracy (climbs, then
  plateaus). The plateau is the point.

### Scene 5 — "How a single prediction is made"
- A query point drops onto the scatter. Each of the 25 trees lights its
  root-to-leaf path as a glowing trace.
- Below, a ballot-box metaphor: each tree drops a colored marble into one of
  two urns. A bar chart fills as the votes accumulate. Final class = majority.
- Probability = vote share. Drag the query point around; watch the ballots
  rebalance in real time. Near the boundary the urns are nearly equal —
  that's how you read uncertainty off a forest.

### Scene 6 — "Why the math works"
- Animate the variance formula `Var = ρσ² + (1−ρ)σ²/B`.
- Two sliders: `B` (trees) and `ρ` (tree correlation).
- A live plot of variance vs. `B` for different `ρ` shows the asymptote at
  `ρσ²`. Push `ρ → 0` and the curve crashes; push `ρ → 1` and adding trees
  does nothing.
- Tie `ρ` back to `mtry`: lower `mtry` ⇒ less correlated trees ⇒ lower
  asymptote, but each tree gets weaker. The bias-variance dial.

### Scene 7 — "Tree similarity map"
- Embed all `B` trees in 2D via MDS on a tree-similarity metric (e.g., the
  fraction of training rows that two trees route to the same leaf-equivalence
  class).
- The cloud is not uniform — it forms ~5–10 clusters. Click a cluster
  centroid to see its representative tree. Reveal that "500 trees" really
  means ~10 distinct voices, each replicated.
- This is the *honest* version of the wisdom-of-the-crowd story and the most
  novel visual on the page.

### Scene 8 — "Reading the forest"
- **Global feature importance.** Bar chart that grows as trees are added.
  Permutation importance: shuffle one feature column live, watch the test
  accuracy collapse by `Δ`. The bar height = `Δ`.
- **Local explanation (SHAP-style).** Pick any test point; a waterfall chart
  decomposes its prediction into per-feature contributions.
- **Feature-by-depth heatmap.** Rows = features, columns = tree depth, cell
  brightness = how often that feature splits at that depth across the forest.
  Top features at the root, weaker features deeper — the forest's "anatomy."

Optional bonus scene:
- **Why deep learning hasn't killed it.** A side-by-side benchmark on a
  noisy, mixed-type tabular dataset; RF nails it, MLP underperforms.
  Animated "missingness" sliders show RF degrading gracefully.

## 5. Visual language

- **Two-class palette:** crimson `#d7263d` vs. teal `#1b998b`, with
  desaturated greys for unclassified / OOB.
- **Background gradient** = predicted class probability (continuous, not
  binary fills). Reading the gradient steepness teaches the user about
  uncertainty for free.
- **Tree drawing.** Two registers:
  - *Schematic dendrograms* for accuracy and small multiples.
  - *Organic trees* — splits drawn as branches that bifurcate, leaves as
    colored disks — for hero shots only. (Cute, but hard to read at scale, so
    use sparingly.)
- **Motion grammar.** Trees grow root → leaves, never the reverse. Boundaries
  always fade in from the bagging step that produced them. Vote marbles
  arc into urns to make the aggregation step physical.

## 6. Tech stack proposal

- **Data prep:** Python + scikit-learn. Train the forest once, then serialize
  every tree to JSON (split feature, threshold, children, sample counts at
  each node, OOB membership).
- **Front end:** Svelte + D3 (or React + Visx). Scrollytelling driven by
  `scrollama.js`. Canvas for the dot-cloud / decision-region layers (cheap to
  redraw on slider changes); SVG for trees and UI.
- **Live retraining (stretch):** WebAssembly build of a tiny RF
  implementation so the user can draw their own dataset and watch the forest
  retrain. Without WASM, fall back to a precomputed grid of forests indexed
  by `(B, mtry, max_depth)` and interpolate.
- **Hosting:** Static site (GitHub Pages / Vercel). All compute either
  precomputed or in-browser.

## 7. Datasets to consider

- **Two-moons** — clean, lets the forest's curvy boundary look organic.
- **SF vs. NY houses** (R2D3's set) — the most-loved tabular toy.
- **Palmer penguins** — three classes, mixed feature types, charming.
- **Titanic** — categorical + missing values, perfect for the "robustness"
  scene.
- The repo's own focus (PCA / k-means / RF) suggests we should *also* show RF
  on a higher-dimensional dataset where PCA gives a 2D view to draw on top
  of — closing the loop with the rest of the project.

## 8. Open questions / next steps

- Pick one dataset as the spine (probably penguins — three classes are
  visually richer than two).
- Decide whether scenes 6 (variance math) and 7 (similarity map) are
  must-haves or appendix material; they're the most novel but also the most
  expensive to build.
- Prototype Scene 5 (the voting animation) first — it's the hook, and if it
  doesn't feel magical the whole page falls flat.
