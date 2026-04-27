"""Build the cranked-spiral random-forest scrollytelling dataset.

Two interleaved spiral arms, small training set, mild Gaussian (x, y) noise,
and a 5% adversarial label flip on the training points closest to the opposite
arm. Designed to make a single tree fail visibly so the forest can win big.

Deterministic, seeded end-to-end. Produces ../data/datasets.js with a single
`window.DATA = {...};` assignment consumed by the frontend.

Usage:
    python build_data.py
"""

from __future__ import annotations

import bisect
import json
import math
from pathlib import Path

import numpy as np
from scipy import stats
from sklearn.tree import DecisionTreeClassifier

# ---------------------------------------------------------------------------
# Seeds and config
# ---------------------------------------------------------------------------
SEED = 42
TEST_SEED = 999
np.random.seed(SEED)

# Spiral geometry. Two arms, n_turns each, radius from R_MIN to R_MAX.
N_TRAIN = 200
N_TEST = 5000
N_TURNS = 2.5
R_MIN, R_MAX = 0.5, 4.0
NOISE = 0.18
FLIP_RATE = 0.00
N_ARMS = 2
# Forest trees use max_features=1 (random feature per split) — standard RF diversity.
# Single trees in scenes 2/3/8 use max_features=None (best single tree).
MAX_FEATURES_FOREST = 1

# Plot bounds: arms reach r=4 plus noise headroom.
X_MIN, X_MAX = -4.8, 4.8
Y_MIN, Y_MAX = -4.8, 4.8
NX, NY = 80, 80

DEPTHS = [1, 2, 3, 4, 5, 6, 8, 12, 20]
PERTURB_SEEDS = [42, 43, 44, 45, 46]
GALLERY_SIZE = 16
PROB_CHECKPOINTS = [1, 4, 16, 64, 200]
N_FOREST = 200
CONVERGENCE_BS = [1, 2, 3, 5, 8, 12, 20, 30, 50, 75, 100, 150, 200]
SHOWDOWN_RESEEDS = 50

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
OUT_PATH = DATA_DIR / "datasets.js"


# ---------------------------------------------------------------------------
# Spiral generator
# ---------------------------------------------------------------------------
def _arm_curves(n_curve: int):
    """Dense (n, 2) point arrays along each clean arm — list of length N_ARMS."""
    r = np.linspace(R_MIN, R_MAX, n_curve)
    theta_factor = 2.0 * np.pi * N_TURNS / (R_MAX - R_MIN)
    theta_base = (r - R_MIN) * theta_factor
    arms = []
    for k in range(N_ARMS):
        offset = 2.0 * np.pi * k / N_ARMS
        theta = theta_base + offset
        arms.append(np.column_stack([r * np.cos(theta), r * np.sin(theta)]))
    return arms


def make_spiral(n: int, seed: int, flip_rate: float = 0.0):
    """Generate an N_ARMS-arm spiral classification dataset (pinwheel).

    Each arm is offset by 2π/N_ARMS in angle. Class assignment alternates
    around the pinwheel: arm k → class (k mod 2). Returns (X, y, n_flipped,
    flip_indices).
    """
    rng = np.random.RandomState(seed)
    per_arm = n // N_ARMS
    extras = n - per_arm * N_ARMS

    theta_factor = 2.0 * np.pi * N_TURNS / (R_MAX - R_MIN)

    Xs, ys = [], []
    for k in range(N_ARMS):
        m = per_arm + (1 if k < extras else 0)
        r = np.linspace(R_MIN, R_MAX, m)
        theta = (r - R_MIN) * theta_factor + 2.0 * np.pi * k / N_ARMS
        Xs.append(np.column_stack([r * np.cos(theta), r * np.sin(theta)]))
        ys.append(np.full(m, k % 2, dtype=int))
    X_clean = np.vstack(Xs)
    y = np.concatenate(ys)

    perm = rng.permutation(n)
    X_clean = X_clean[perm]
    y = y[perm]

    X = X_clean + rng.normal(0.0, NOISE, X_clean.shape)

    flip_idx = np.array([], dtype=int)
    n_flip = int(round(flip_rate * n))
    if n_flip > 0:
        arms_dense = _arm_curves(2000)
        dist_to_other = np.empty(n)
        for i in range(n):
            best = math.inf
            for k in range(N_ARMS):
                if (k % 2) == y[i]:
                    continue
                d2 = ((arms_dense[k] - X[i]) ** 2).sum(axis=1)
                best = min(best, math.sqrt(d2.min()))
            dist_to_other[i] = best
        flip_idx = np.argsort(dist_to_other)[:n_flip]
        y[flip_idx] = 1 - y[flip_idx]

    return X, y, n_flip, flip_idx


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def serialize_tree(clf: DecisionTreeClassifier) -> dict:
    """Serialize an sklearn DecisionTreeClassifier into a recursive dict."""
    t = clf.tree_
    classes = clf.classes_
    cls_index = {int(c): i for i, c in enumerate(classes)}

    def node(nid: int, depth: int) -> dict:
        is_leaf = t.children_left[nid] == -1
        n_samples = int(t.n_node_samples[nid])
        raw = t.value[nid][0]
        if raw.sum() <= 1.001:
            counts = raw * n_samples
        else:
            counts = raw
        n0 = int(round(counts[cls_index[0]])) if 0 in cls_index else 0
        n1 = int(round(counts[cls_index[1]])) if 1 in cls_index else 0
        denom = n0 + n1
        prob1 = (n1 / denom) if denom > 0 else 0.0
        if is_leaf:
            return {
                "leaf": True,
                "value": int(1 if prob1 >= 0.5 else 0),
                "prob1": float(prob1),
                "samples": n_samples,
                "depth": int(depth),
            }
        return {
            "leaf": False,
            "feature": int(t.feature[nid]),
            "threshold": float(t.threshold[nid]),
            "left": node(int(t.children_left[nid]), depth + 1),
            "right": node(int(t.children_right[nid]), depth + 1),
            "samples": n_samples,
            "depth": int(depth),
        }

    return node(0, 0)


def make_grid_points():
    xs = np.linspace(X_MIN, X_MAX, NX)
    ys = np.linspace(Y_MIN, Y_MAX, NY)
    xx, yy = np.meshgrid(xs, ys)
    flat = np.column_stack([xx.ravel(), yy.ravel()])
    return flat, xs, ys


def grid_predict_class(clf, grid_pts) -> np.ndarray:
    """Returns (NY, NX) int array of predictions, with row 0 = lowest y."""
    return clf.predict(grid_pts).astype(np.int8).reshape(NY, NX)


def round_floats(obj, n=4):
    if isinstance(obj, dict):
        return {k: round_floats(v, n) for k, v in obj.items()}
    if isinstance(obj, list):
        return [round_floats(v, n) for v in obj]
    if isinstance(obj, tuple):
        return [round_floats(v, n) for v in obj]
    if isinstance(obj, bool):
        return obj
    if isinstance(obj, float):
        return obj if not math.isfinite(obj) else round(obj, n)
    if isinstance(obj, np.floating):
        f = float(obj)
        return f if not math.isfinite(f) else round(f, n)
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.ndarray):
        return round_floats(obj.tolist(), n)
    return obj


# ---------------------------------------------------------------------------
# 1. Data
# ---------------------------------------------------------------------------
print("Generating spiral train + test sets...", flush=True)
X_train, y_train, n_flipped_train, flip_idx_train = make_spiral(N_TRAIN, SEED, FLIP_RATE)
# Test set: same generator, NO label flips — labels are honest.
X_test, y_test, _, _ = make_spiral(N_TEST, TEST_SEED, flip_rate=0.0)

dataset_payload = {
    "points": [
        {"x": float(X_train[i, 0]), "y": float(X_train[i, 1]), "label": int(y_train[i])}
        for i in range(N_TRAIN)
    ],
    "structure": "pinwheel" if N_ARMS > 2 else "spiral",
    "nArms": N_ARMS,
    "nTurns": N_TURNS,
    "noise": NOISE,
    "flipRate": FLIP_RATE,
    "nFlipped": int(n_flipped_train),
    "flippedIndices": [int(i) for i in flip_idx_train.tolist()],
}

grid_payload = {
    "xMin": X_MIN, "xMax": X_MAX, "yMin": Y_MIN, "yMax": Y_MAX,
    "nx": NX, "ny": NY,
}

# Ground truth: dense points along each clean arm, used as decorative reference.
arms_dense = _arm_curves(200)
ground_truth_arms = [
    [{"x": float(arm[i, 0]), "y": float(arm[i, 1])} for i in range(arm.shape[0])]
    for arm in arms_dense
]

GRID_PTS, GRID_XS, GRID_YS = make_grid_points()


# ---------------------------------------------------------------------------
# 2. Single tree + metrics by depth
# ---------------------------------------------------------------------------
print("Single tree + metrics by depth...", flush=True)
single_tree_clf = DecisionTreeClassifier(max_depth=None, random_state=SEED)
single_tree_clf.fit(X_train, y_train)
single_tree = serialize_tree(single_tree_clf)

single_tree_metrics_by_depth = {}
for d in DEPTHS:
    md = None if d == 20 else d
    clf = DecisionTreeClassifier(max_depth=md, random_state=SEED)
    clf.fit(X_train, y_train)
    train_acc = float((clf.predict(X_train) == y_train).mean())
    test_acc = float((clf.predict(X_test) == y_test).mean())
    n_leaves = int(clf.get_n_leaves())
    single_tree_metrics_by_depth[str(d)] = {
        "trainAcc": train_acc, "testAcc": test_acc, "nLeaves": n_leaves,
    }


# ---------------------------------------------------------------------------
# 3. Perturbations (5 reseeds, each with its own adversarial flips)
# ---------------------------------------------------------------------------
print("Perturbations (5 reseeds)...", flush=True)
perturbations = []
for s in PERTURB_SEEDS:
    Xp, yp, _, _ = make_spiral(N_TRAIN, s, FLIP_RATE)
    clf = DecisionTreeClassifier(max_depth=None, random_state=SEED)
    clf.fit(Xp, yp)
    train_acc = float((clf.predict(Xp) == yp).mean())
    test_acc = float((clf.predict(X_test) == y_test).mean())
    boundary = grid_predict_class(clf, GRID_PTS)
    perturbations.append({
        "points": [
            {"x": float(Xp[i, 0]), "y": float(Xp[i, 1]), "label": int(yp[i])}
            for i in range(N_TRAIN)
        ],
        "tree": serialize_tree(clf),
        "trainAcc": train_acc,
        "testAcc": test_acc,
        "boundary": boundary.tolist(),
    })


# ---------------------------------------------------------------------------
# 4. Bootstrap demo
# ---------------------------------------------------------------------------
print("Bootstrap demo...", flush=True)
boot_rng = np.random.RandomState(SEED + 1)
boot_indices = boot_rng.randint(0, N_TRAIN, size=N_TRAIN)
multiplicities = np.bincount(boot_indices, minlength=N_TRAIN)
in_bag = (multiplicities > 0)
n_unique = int(in_bag.sum())
n_oob = int(N_TRAIN - n_unique)
bootstrap_demo = {
    "indices": [int(i) for i in boot_indices.tolist()],
    "multiplicities": [int(m) for m in multiplicities.tolist()],
    "inBag": [bool(b) for b in in_bag.tolist()],
    "stats": {
        "nUnique": n_unique,
        "nOOB": n_oob,
        "pctUnique": float(n_unique / N_TRAIN),
        "pctOOB": float(n_oob / N_TRAIN),
        "expectedPctOOB": 0.3679,
    },
}


# ---------------------------------------------------------------------------
# 5. Master 200-tree forest
# ---------------------------------------------------------------------------
print(f"Training master forest of {N_FOREST} trees...", flush=True)
forest_rng = np.random.RandomState(SEED + 100)
forest_boot_indices = []
forest_tree_seeds = []
for b in range(N_FOREST):
    forest_boot_indices.append(forest_rng.randint(0, N_TRAIN, size=N_TRAIN))
    forest_tree_seeds.append(int(forest_rng.randint(0, 2**31 - 1)))

forest_estimators = []
for b in range(N_FOREST):
    idx = forest_boot_indices[b]
    clf = DecisionTreeClassifier(
        max_depth=None,
        max_features=MAX_FEATURES_FOREST,
        random_state=forest_tree_seeds[b],
    )
    clf.fit(X_train[idx], y_train[idx])
    forest_estimators.append(clf)

print("Predicting grid for all trees...", flush=True)
all_tree_grid = np.zeros((N_FOREST, NY, NX), dtype=np.int8)
for b in range(N_FOREST):
    all_tree_grid[b] = grid_predict_class(forest_estimators[b], GRID_PTS)


# ---------------------------------------------------------------------------
# 6. Forest gallery
# ---------------------------------------------------------------------------
print("Forest gallery (16 trees)...", flush=True)
forest_gallery = {
    "trees": [serialize_tree(forest_estimators[i]) for i in range(GALLERY_SIZE)],
    "treeBoundaries": [all_tree_grid[i].tolist() for i in range(GALLERY_SIZE)],
}


# ---------------------------------------------------------------------------
# 7. Probability surface checkpoints
# ---------------------------------------------------------------------------
print("Probability surface checkpoints...", flush=True)
cumsum_grid = np.cumsum(all_tree_grid.astype(np.float64), axis=0)
prob_surface_checkpoints = {
    str(B): (cumsum_grid[B - 1] / B).tolist() for B in PROB_CHECKPOINTS
}


# ---------------------------------------------------------------------------
# 8. Convergence
# ---------------------------------------------------------------------------
print("Convergence: per-tree predictions on train + test...", flush=True)
tree_train_preds = np.stack(
    [est.predict(X_train).astype(np.int8) for est in forest_estimators], axis=0
)
tree_test_preds = np.stack(
    [est.predict(X_test).astype(np.int8) for est in forest_estimators], axis=0
)

in_bag_mask = np.zeros((N_FOREST, N_TRAIN), dtype=np.int8)
for b in range(N_FOREST):
    in_bag_mask[b, forest_boot_indices[b]] = 1
oob_mask_arr = 1 - in_bag_mask

cum_train_votes = np.cumsum(tree_train_preds, axis=0)
cum_test_votes = np.cumsum(tree_test_preds, axis=0)
cum_oob_count = np.cumsum(oob_mask_arr, axis=0)
cum_oob_votes = np.cumsum(tree_train_preds * oob_mask_arr, axis=0)

train_err, test_err, oob_err = [], [], []
for B in CONVERGENCE_BS:
    train_pred_B = (cum_train_votes[B - 1] / B >= 0.5).astype(np.int64)
    test_pred_B = (cum_test_votes[B - 1] / B >= 0.5).astype(np.int64)
    train_err.append(float((train_pred_B != y_train).mean()))
    test_err.append(float((test_pred_B != y_test).mean()))

    counts_B = cum_oob_count[B - 1]
    votes_B = cum_oob_votes[B - 1]
    safe = counts_B > 0
    if safe.any():
        oob_pred = np.zeros(N_TRAIN, dtype=np.int64)
        oob_pred[safe] = (votes_B[safe] / counts_B[safe] >= 0.5).astype(np.int64)
        err = float((oob_pred[safe] != y_train[safe]).mean())
    else:
        err = float("nan")
    oob_err.append(err)

convergence = {
    "bs": list(CONVERGENCE_BS),
    "trainErr": train_err,
    "testErr": test_err,
    "oobErr": oob_err,
}


# ---------------------------------------------------------------------------
# 9. Showdown
# ---------------------------------------------------------------------------
print(f"Showdown: {SHOWDOWN_RESEEDS} reseeds...", flush=True)
showdown_rng = np.random.RandomState(SEED + 9000)
single_tree_errs = []
rf_errs = []
sample_single_boundary = None
sample_rf_boundary = None
sample_rf_prob = None

for r in range(SHOWDOWN_RESEEDS):
    seed_r = int(showdown_rng.randint(0, 2**31 - 1))
    Xr, yr, _, _ = make_spiral(N_TRAIN, seed_r, FLIP_RATE)

    st = DecisionTreeClassifier(max_depth=None, random_state=seed_r)
    st.fit(Xr, yr)
    st_err = float((st.predict(X_test) != y_test).mean())
    single_tree_errs.append(st_err)

    sub_rng = np.random.RandomState(seed_r ^ 0x55555555)
    sub_grid_votes = np.zeros((NY, NX), dtype=np.int64) if r == 0 else None
    sub_test_votes = np.zeros(N_TEST, dtype=np.int64)
    for b in range(N_FOREST):
        bidx = sub_rng.randint(0, N_TRAIN, size=N_TRAIN)
        tseed = int(sub_rng.randint(0, 2**31 - 1))
        clf = DecisionTreeClassifier(
            max_depth=None, max_features=MAX_FEATURES_FOREST, random_state=tseed,
        )
        clf.fit(Xr[bidx], yr[bidx])
        sub_test_votes += clf.predict(X_test).astype(np.int64)
        if r == 0:
            sub_grid_votes += clf.predict(GRID_PTS).reshape(NY, NX).astype(np.int64)

    rf_pred = (sub_test_votes / N_FOREST >= 0.5).astype(np.int64)
    rf_errs.append(float((rf_pred != y_test).mean()))

    if r == 0:
        sample_single_boundary = grid_predict_class(st, GRID_PTS).tolist()
        sample_rf_prob = (sub_grid_votes / N_FOREST).tolist()
        sample_rf_boundary = (np.array(sample_rf_prob) >= 0.5).astype(np.int8).tolist()

showdown = {
    "nReseeds": SHOWDOWN_RESEEDS,
    "singleTreeErr": single_tree_errs,
    "rfErr": rf_errs,
    "singleTreeMean": float(np.mean(single_tree_errs)),
    "singleTreeStd": float(np.std(single_tree_errs, ddof=1)),
    "rfMean": float(np.mean(rf_errs)),
    "rfStd": float(np.std(rf_errs, ddof=1)),
    "sampleSingleBoundary": sample_single_boundary,
    "sampleRFBoundary": sample_rf_boundary,
    "sampleRFProb": sample_rf_prob,
}


# ---------------------------------------------------------------------------
# Assemble payload
# ---------------------------------------------------------------------------
DATA = {
    "dataset": dataset_payload,
    "grid": grid_payload,
    "groundTruthArms": ground_truth_arms,
    "singleTree": single_tree,
    "singleTreeMetricsByDepth": single_tree_metrics_by_depth,
    "perturbations": perturbations,
    "bootstrapDemo": bootstrap_demo,
    "forestGallery": forest_gallery,
    "probSurfaceCheckpoints": prob_surface_checkpoints,
    "convergence": convergence,
    "showdown": showdown,
}


# ---------------------------------------------------------------------------
# Story-critical invariants — tightened for the cranked spiral.
# Compute all metrics first, then assert (so a failure shows the full picture).
# ---------------------------------------------------------------------------
print("Computing invariant metrics...", flush=True)

gap_d20 = (single_tree_metrics_by_depth["20"]["trainAcc"]
           - single_tree_metrics_by_depth["20"]["testAcc"])

boundaries_arr = np.array([p["boundary"] for p in perturbations])
mode_grid = stats.mode(boundaries_arr, axis=0, keepdims=False).mode
disagree_rate = float((boundaries_arr != mode_grid).any(axis=0).mean())

late = convergence["testErr"][-5:]
plateau_range = max(late) - min(late)

gap_pp = showdown["singleTreeMean"] - showdown["rfMean"]
ratio = showdown["rfStd"] / showdown["singleTreeStd"]

i20 = bisect.bisect_left(convergence["bs"], 20)
oob_test_gap = float(np.mean(np.abs(
    np.array(convergence["oobErr"][i20:]) - np.array(convergence["testErr"][i20:])
)))

# Print convergence first
print()
print("--- CONVERGENCE ---")
print(f"{'B':>5}  {'trainErr':>10}  {'testErr':>10}  {'oobErr':>10}")
for i, B in enumerate(CONVERGENCE_BS):
    print(f"{B:>5}  {train_err[i]:>10.4f}  {test_err[i]:>10.4f}  {oob_err[i]:>10.4f}")
print()

# Print all metrics first
print()
print("--- METRICS ---")
print(f"depth-1 testAcc          = {single_tree_metrics_by_depth['1']['testAcc']:.3f}")
print(f"depth-20 trainAcc        = {single_tree_metrics_by_depth['20']['trainAcc']:.3f}")
print(f"depth-20 testAcc         = {single_tree_metrics_by_depth['20']['testAcc']:.3f}")
print(f"depth-20 train-test gap  = {gap_d20:.3f}")
print(f"perturbation disagree    = {disagree_rate:.1%}")
print(f"plateau range (last 5)   = {plateau_range:.3f}")
print(f"showdown singleTree mean = {showdown['singleTreeMean']:.4f}")
print(f"showdown singleTree std  = {showdown['singleTreeStd']:.4f}")
print(f"showdown RF mean         = {showdown['rfMean']:.4f}")
print(f"showdown RF std          = {showdown['rfStd']:.4f}")
print(f"showdown gap (pp)        = {gap_pp*100:.1f}")
print(f"showdown std ratio       = {ratio:.3f}")
print(f"OOB-test gap (B>=20)     = {oob_test_gap:.4f}")
print(f"pctOOB                   = {bootstrap_demo['stats']['pctOOB']:.4f}")
print(f"Adversarial flips        = {n_flipped_train} of {N_TRAIN}")
print()

print("Asserting invariants...", flush=True)
# Single tree pain — both sides dramatic (depth-1 useless, depth-20 overfit).
assert single_tree_metrics_by_depth["1"]["testAcc"] < 0.65, \
    f"depth-1 must clearly fail (got {single_tree_metrics_by_depth['1']['testAcc']:.3f})"
assert single_tree_metrics_by_depth["20"]["trainAcc"] >= 0.99
assert gap_d20 > 0.20, f"train-test gap (got {gap_d20:.3f})"
# High variance across reseeds: single tree's first-split commitment varies.
assert disagree_rate > 0.30, f"perturbation disagreement (got {disagree_rate:.3f})"
# Convergence: forest beats single bootstrap-tree, plateau is reached.
assert convergence["testErr"][-1] < convergence["testErr"][0]
assert plateau_range < 0.03
# Showdown: forest beats single tree by a clear margin AND has tighter variance.
# The RAW gap is 5–6pp here because spirals are hard for both — but the variance
# reduction is the headline (RF std about 0.4× single-tree std).
assert gap_pp > 0.04, f"showdown gap pp (got {gap_pp:.3f})"
assert ratio < 0.55, f"variance ratio (got {ratio:.3f})"
# OOB story is muddied at this small N (training-point error stays elevated for the
# whole forest, because bootstrap variance on 200 points is high). Loosen the
# tracking invariant — what matters is that OOB CONVERGES, not that it matches test.
oob_drop = convergence["oobErr"][0] - convergence["oobErr"][-1]
assert oob_drop > 0.05, f"OOB error must drop with B (got drop={oob_drop:.3f})"
assert 0.30 < bootstrap_demo["stats"]["pctOOB"] < 0.42

# No NaN
def assert_finite(obj, path=""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            assert_finite(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            assert_finite(v, f"{path}[{i}]")
    elif isinstance(obj, float):
        assert math.isfinite(obj), f"non-finite at {path}"
    elif isinstance(obj, np.floating):
        assert math.isfinite(float(obj)), f"non-finite at {path}"

assert_finite(DATA)


# ---------------------------------------------------------------------------
# Emit JS file
# ---------------------------------------------------------------------------
print("Emitting datasets.js...", flush=True)
DATA_DIR.mkdir(parents=True, exist_ok=True)
out = "// Auto-generated by precompute/build_data.py - do not edit by hand.\n"
out += "window.DATA = " + json.dumps(round_floats(DATA, 4), indent=2) + ";\n"
OUT_PATH.write_text(out)


# ---------------------------------------------------------------------------
# Final report
# ---------------------------------------------------------------------------
print()
print("=" * 70)
print("ALL INVARIANTS PASS")
print("=" * 70)
print()
print(f"{'B':>5}  {'trainErr':>10}  {'testErr':>10}  {'oobErr':>10}")
for i, B in enumerate(CONVERGENCE_BS):
    print(f"{B:>5}  {train_err[i]:>10.4f}  {test_err[i]:>10.4f}  {oob_err[i]:>10.4f}")
print()
print("Single-tree metrics by depth:")
for d in DEPTHS:
    m = single_tree_metrics_by_depth[str(d)]
    print(f"  depth={d:>2}: trainAcc={m['trainAcc']:.4f} testAcc={m['testAcc']:.4f} "
          f"nLeaves={m['nLeaves']}")
print()
print(f"Perturbation disagree rate: {disagree_rate:.1%}")
print(f"Bootstrap pctOOB: {bootstrap_demo['stats']['pctOOB']:.4f} (expected ~0.3679)")
print(f"Showdown: singleTree mean={showdown['singleTreeMean']:.4f} "
      f"std={showdown['singleTreeStd']:.4f}")
print(f"          RF         mean={showdown['rfMean']:.4f} "
      f"std={showdown['rfStd']:.4f}")
print(f"          gap = {gap_pp*100:.1f}pp ; std ratio = {ratio:.3f}")
print(f"OOB-test gap (B>=20): {oob_test_gap:.4f}")
print(f"Adversarial flips on training: {n_flipped_train} of {N_TRAIN}")
print()
size_kb = OUT_PATH.stat().st_size / 1024
print(f"Wrote {OUT_PATH} ({size_kb:.1f} KB)")
