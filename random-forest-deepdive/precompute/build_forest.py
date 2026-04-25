"""Build the random-forest scrollytelling dataset.

Deterministic, seeded end-to-end. Produces ../data/datasets.js with a
single `window.DATA = {...};` assignment consumed by the frontend.

Usage:
    .venv/bin/python build_forest.py
"""

from __future__ import annotations

import hashlib
import json
import os
import random
import sys
import warnings
from itertools import combinations
from pathlib import Path

warnings.filterwarnings("ignore", category=FutureWarning, module="sklearn.manifold._mds")

import numpy as np
import pandas as pd
import seaborn as sns
from sklearn.cluster import KMeans
from sklearn.ensemble import RandomForestClassifier
from sklearn.inspection import permutation_importance
from sklearn.manifold import MDS
from sklearn.metrics import silhouette_score
from sklearn.model_selection import train_test_split
from sklearn.tree import DecisionTreeClassifier

# ---------------------------------------------------------------------------
# Seed & config
# ---------------------------------------------------------------------------
SEED = 42
random.seed(SEED)
np.random.seed(SEED)
RNG = np.random.RandomState(SEED)

N_TREES = 100
MAX_DEPTH = None
MAX_FEATURES = "sqrt"
GRID_LOW = 60
GRID_HIGH = 200
TEST_SIZE = 0.30
BOOTSTRAP_DEMO_N = 30

FEATURES = [
    "bill_length_mm",
    "bill_depth_mm",
    "flipper_length_mm",
    "body_mass_g",
]
FEATURE_LABELS = [
    "Bill length (mm)",
    "Bill depth (mm)",
    "Flipper length (mm)",
    "Body mass (g)",
]
TWOD_FEATURES = ["bill_length_mm", "flipper_length_mm"]
TWOD_FEATURE_IDX = [FEATURES.index(f) for f in TWOD_FEATURES]
CLASS_NAMES = ["Adelie", "Chinstrap", "Gentoo"]

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
OUT_PATH = DATA_DIR / "datasets.js"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def r4(x: float) -> float:
    """Round a float to 4 decimals; preserve nan/inf safely."""
    return float(np.round(float(x), 4))


def round_list(xs, decimals=4):
    return [float(np.round(float(x), decimals)) for x in xs]


def serialize_tree(clf: DecisionTreeClassifier, n_classes: int) -> list:
    """DFS-walk an sklearn tree and produce node dicts in DFS-emit order."""
    t = clf.tree_
    nodes = []
    # Map original node id -> index in DFS-emitted list.
    order = []  # list of original node ids in emit order

    def visit(orig_id: int, depth: int) -> None:
        order.append(orig_id)
        is_leaf = t.children_left[orig_id] == -1
        if not is_leaf:
            visit(int(t.children_left[orig_id]), depth + 1)
            visit(int(t.children_right[orig_id]), depth + 1)

    visit(0, 0)

    id_remap = {orig: new for new, orig in enumerate(order)}

    # Compute depths in DFS order via a second walk.
    depths = {0: 0}

    def depth_walk(orig_id: int, d: int) -> None:
        depths[orig_id] = d
        if t.children_left[orig_id] != -1:
            depth_walk(int(t.children_left[orig_id]), d + 1)
            depth_walk(int(t.children_right[orig_id]), d + 1)

    depth_walk(0, 0)

    # `clf.classes_` may have fewer than n_classes entries if some classes
    # didn't appear in the training subset. Map back to a length-n_classes
    # distribution.
    cls_index = {int(c): i for i, c in enumerate(clf.classes_)}

    for orig_id in order:
        is_leaf = t.children_left[orig_id] == -1
        # value shape: (1, n_clf_classes); pad to n_classes
        raw = t.value[orig_id][0]
        dist = [0] * n_classes
        for c, i in cls_index.items():
            dist[c] = int(round(raw[i]))
        majority = int(np.argmax(dist))
        node = {
            "id": id_remap[orig_id],
            "feature": int(t.feature[orig_id]) if not is_leaf else None,
            "threshold": r4(t.threshold[orig_id]) if not is_leaf else None,
            "left": id_remap[int(t.children_left[orig_id])] if not is_leaf else None,
            "right": id_remap[int(t.children_right[orig_id])] if not is_leaf else None,
            "isLeaf": bool(is_leaf),
            "samples": int(t.n_node_samples[orig_id]),
            "classDistribution": dist,
            "majorityClass": majority,
            "depth": int(depths[orig_id]),
        }
        nodes.append(node)
    return nodes


def oob_mask(forest: RandomForestClassifier, n_train: int) -> list:
    """Return list-of-int 0|1 OOB masks per tree from a fitted RF.

    Reproduces sklearn's bootstrap sampling using the same per-tree seeds.
    """
    masks = []
    for est in forest.estimators_:
        # sklearn's _generate_sample_indices uses the estimator's random_state.
        from sklearn.ensemble._forest import _generate_sample_indices

        sample_idx = _generate_sample_indices(est.random_state, n_train, n_train)
        in_bag = np.zeros(n_train, dtype=np.int8)
        in_bag[sample_idx] = 1
        masks.append((1 - in_bag).astype(np.int8).tolist())
    return masks


def make_grid(x_min, x_max, y_min, y_max, res):
    xs = np.linspace(x_min, x_max, res)
    ys = np.linspace(y_min, y_max, res)
    xx, yy = np.meshgrid(xs, ys)
    flat = np.column_stack([xx.ravel(), yy.ravel()])
    return flat, xs, ys


# ---------------------------------------------------------------------------
# 1. Load data
# ---------------------------------------------------------------------------
print("Loading penguins dataset...", flush=True)
df_raw = sns.load_dataset("penguins")
df = df_raw.dropna().reset_index(drop=True)
df["classIdx"] = df["species"].map({c: i for i, c in enumerate(CLASS_NAMES)}).astype(int)

X_full = df[FEATURES].to_numpy(dtype=np.float64)
y_full = df["classIdx"].to_numpy(dtype=np.int64)
n_total = len(df)
print(f"  n_total = {n_total}")

# Train/test split, stratified.
X_train, X_test, y_train, y_test, idx_train, idx_test = train_test_split(
    X_full,
    y_full,
    np.arange(n_total),
    test_size=TEST_SIZE,
    stratify=y_full,
    random_state=SEED,
)
n_train = len(X_train)
n_test = len(X_test)
print(f"  n_train = {n_train}, n_test = {n_test}")

split_arr = np.array(["train"] * n_total, dtype=object)
split_arr[idx_test] = "test"

# 2D subset
X_full_2d = X_full[:, TWOD_FEATURE_IDX]
X_train_2d = X_train[:, TWOD_FEATURE_IDX]
X_test_2d = X_test[:, TWOD_FEATURE_IDX]

# ---------------------------------------------------------------------------
# 2. Train forests
# ---------------------------------------------------------------------------
print("Training forest4D...", flush=True)
forest4d = RandomForestClassifier(
    n_estimators=N_TREES,
    max_depth=MAX_DEPTH,
    max_features=MAX_FEATURES,
    bootstrap=True,
    oob_score=True,
    random_state=SEED,
    n_jobs=1,
)
forest4d.fit(X_train, y_train)

print("Training forest2D...", flush=True)
forest2d = RandomForestClassifier(
    n_estimators=N_TREES,
    max_depth=MAX_DEPTH,
    max_features=MAX_FEATURES,
    bootstrap=True,
    oob_score=True,
    random_state=SEED,
    n_jobs=1,
)
forest2d.fit(X_train_2d, y_train)

# ---------------------------------------------------------------------------
# 3. Points + scatter extents
# ---------------------------------------------------------------------------
x_col = X_full_2d[:, 0]
y_col = X_full_2d[:, 1]
x_min, x_max = float(x_col.min()), float(x_col.max())
y_min, y_max = float(y_col.min()), float(y_col.max())
x_pad = (x_max - x_min) * 0.05
y_pad = (y_max - y_min) * 0.05
sx_min, sx_max = x_min - x_pad, x_max + x_pad
sy_min, sy_max = y_min - y_pad, y_max + y_pad

scatter = {
    "xMin": r4(sx_min),
    "xMax": r4(sx_max),
    "yMin": r4(sy_min),
    "yMax": r4(sy_max),
    "xLabel": "Bill length (mm)",
    "yLabel": "Flipper length (mm)",
}

points = []
for i in range(n_total):
    points.append(
        {
            "id": int(i),
            "x": r4(x_col[i]),
            "y": r4(y_col[i]),
            "features": round_list(X_full[i].tolist()),
            "classIdx": int(y_full[i]),
            "split": str(split_arr[i]),
        }
    )

# ---------------------------------------------------------------------------
# 4. Forest 2D serialization (trees + low-res boundary grids)
# ---------------------------------------------------------------------------
print("Serializing forest2D trees + low-res boundaries...", flush=True)
trees_2d = []
oob_2d = oob_mask(forest2d, n_train)
boundaries_low = []

# Pre-build the low-res grid once (covers padded scatter extents).
grid_low_pts, _, _ = make_grid(sx_min, sx_max, sy_min, sy_max, GRID_LOW)

for i, est in enumerate(forest2d.estimators_):
    nodes = serialize_tree(est, n_classes=len(CLASS_NAMES))
    trees_2d.append(
        {
            "treeIdx": i,
            "oobMask": oob_2d[i],
            "nodes": nodes,
        }
    )
    # Per-tree decision grid (majority class predicted by THIS tree).
    grid_pred = est.predict(grid_low_pts).astype(np.int8)
    boundaries_low.append(grid_pred.tolist())

# Full-forest high-res grid: class + winning probability.
print("Computing forest2D high-res boundary...", flush=True)
grid_high_pts, _, _ = make_grid(sx_min, sx_max, sy_min, sy_max, GRID_HIGH)
proba_high = forest2d.predict_proba(grid_high_pts)
class_high = np.argmax(proba_high, axis=1).astype(np.int8)
prob_high = proba_high.max(axis=1)

forest_2d_payload = {
    "trees": trees_2d,
    "boundariesLow": boundaries_low,
    "boundaryHigh": {
        "classGrid": class_high.tolist(),
        "probGrid": round_list(prob_high.tolist()),
    },
}

# ---------------------------------------------------------------------------
# 5. Forest 4D meta + accuracy / variance curves
# ---------------------------------------------------------------------------
print("Building forest4D meta + accuracy / variance curves...", flush=True)
oob_4d = oob_mask(forest4d, n_train)
trees4d_meta = []
for i, est in enumerate(forest4d.estimators_):
    t = est.tree_
    trees4d_meta.append(
        {
            "treeIdx": i,
            "depth": int(est.get_depth()),
            "nLeaves": int(est.get_n_leaves()),
            "nNodes": int(t.node_count),
            "oobMask": oob_4d[i],
        }
    )

# Per-tree predict_proba on test set: shape (B, n_test, n_classes).
all_test_proba = np.stack(
    [est.predict_proba(X_test) for est in forest4d.estimators_], axis=0
)
# Pad if some tree's classes_ is shorter than n_classes (rare with stratified
# bootstrap on this dataset, but be safe).
if all_test_proba.shape[2] != len(CLASS_NAMES):
    fixed = np.zeros((N_TREES, n_test, len(CLASS_NAMES)))
    for i, est in enumerate(forest4d.estimators_):
        for j, c in enumerate(est.classes_):
            fixed[i, :, int(c)] = all_test_proba[i, :, j]
    all_test_proba = fixed

# Cumulative mean of probabilities up to each B; predicted class = argmax.
cum_proba = np.cumsum(all_test_proba, axis=0)
denom = np.arange(1, N_TREES + 1).reshape(-1, 1, 1)
mean_proba = cum_proba / denom

accuracy_curve = []
for B in range(1, N_TREES + 1):
    preds = np.argmax(mean_proba[B - 1], axis=1)
    test_acc = float((preds == y_test).mean())
    # OOB error using only the first B trees.
    oob_arr = np.array(oob_4d[:B])  # (B, n_train)
    train_proba_first_B = np.stack(
        [est.predict_proba(X_train) for est in forest4d.estimators_[:B]], axis=0
    )
    if train_proba_first_B.shape[2] != len(CLASS_NAMES):
        fixed = np.zeros((B, n_train, len(CLASS_NAMES)))
        for i, est in enumerate(forest4d.estimators_[:B]):
            for j, c in enumerate(est.classes_):
                fixed[i, :, int(c)] = train_proba_first_B[i, :, j]
        train_proba_first_B = fixed
    # For each train row, average proba over trees where it's OOB.
    weights = oob_arr.T  # (n_train, B)
    # Avoid divide-by-zero.
    w_sum = weights.sum(axis=1)
    safe = w_sum > 0
    oob_mean = np.zeros((n_train, len(CLASS_NAMES)))
    if safe.any():
        weighted = np.einsum("ij,jik->ik", weights, train_proba_first_B)
        oob_mean[safe] = weighted[safe] / w_sum[safe, None]
    oob_pred = np.argmax(oob_mean, axis=1)
    if safe.any():
        oob_err = float((oob_pred[safe] != y_train[safe]).mean())
    else:
        oob_err = float("nan")
    accuracy_curve.append({"B": B, "testAccuracy": r4(test_acc), "oobError": r4(oob_err)})

# Variance trace: mean variance of the predicted-class probability across trees,
# averaged over test points. We compute the variance over trees of the
# probability assigned to the *winning forest class* for each test point.
final_pred = np.argmax(mean_proba[-1], axis=1)
winning_probs = np.take_along_axis(
    all_test_proba, final_pred[None, :, None], axis=2
).squeeze(2)  # (B, n_test)

variance_trace = []
for B in range(1, N_TREES + 1):
    if B < 2:
        var_emp = 0.0
    else:
        # Per-test-point variance across the first B trees, then mean over points.
        var_emp = float(winning_probs[:B].var(axis=0, ddof=1).mean())
    variance_trace.append({"B": B, "varEmpirical": r4(var_emp)})


def mean_pairwise_correlation(proba_stack: np.ndarray) -> float:
    """Mean pairwise correlation of trees' probabilistic predictions on test set.

    Each tree contributes a flattened (n_test * n_classes) vector.
    """
    B = proba_stack.shape[0]
    flat = proba_stack.reshape(B, -1)
    # Center.
    flat_c = flat - flat.mean(axis=1, keepdims=True)
    norms = np.linalg.norm(flat_c, axis=1)
    # Avoid div-by-zero (constant tree).
    norms[norms == 0] = 1.0
    normed = flat_c / norms[:, None]
    corr = normed @ normed.T
    iu = np.triu_indices(B, k=1)
    return float(corr[iu].mean())


print("Computing tree correlations rho2D / rho4D...", flush=True)
proba_2d_test = np.stack(
    [est.predict_proba(X_test_2d) for est in forest2d.estimators_], axis=0
)
if proba_2d_test.shape[2] != len(CLASS_NAMES):
    fixed = np.zeros((N_TREES, n_test, len(CLASS_NAMES)))
    for i, est in enumerate(forest2d.estimators_):
        for j, c in enumerate(est.classes_):
            fixed[i, :, int(c)] = proba_2d_test[i, :, j]
    proba_2d_test = fixed

rho_2d = mean_pairwise_correlation(proba_2d_test)
rho_4d = mean_pairwise_correlation(all_test_proba)

# ---------------------------------------------------------------------------
# 6. Bootstrap demo (scene 3a)
# ---------------------------------------------------------------------------
print("Bootstrap demo...", flush=True)
boot_rng = np.random.RandomState(SEED + 1)
n_boot = BOOTSTRAP_DEMO_N
draw_sequence = boot_rng.randint(0, n_boot, size=n_boot).tolist()
unique_curve = []
seen = set()
for k, idx in enumerate(draw_sequence, start=1):
    seen.add(int(idx))
    unique_curve.append({"drawCount": k, "uniqueFraction": r4(len(seen) / n_boot)})
final_counts = [0] * n_boot
for idx in draw_sequence:
    final_counts[int(idx)] += 1

bootstrap_demo = {
    "n": n_boot,
    "drawSequence": [int(i) for i in draw_sequence],
    "uniqueFractionCurve": unique_curve,
    "finalCounts": final_counts,
}

# ---------------------------------------------------------------------------
# 7. mtry demo (scene 3b)
# ---------------------------------------------------------------------------
print("mtry demo...", flush=True)
mtry_trees = {}
for m in range(1, len(FEATURES) + 1):
    clf = DecisionTreeClassifier(
        max_depth=4,
        max_features=m,
        random_state=SEED + 100 + m,
    )
    clf.fit(X_train, y_train)
    mtry_trees[str(m)] = {
        "treeIdx": -1,
        "mtry": m,
        "nodes": serialize_tree(clf, n_classes=len(CLASS_NAMES)),
    }
mtry_demo = {"treesByMtry": mtry_trees}

# ---------------------------------------------------------------------------
# 8. Tree similarity (scene 7)
# ---------------------------------------------------------------------------
print("Tree similarity (leaf-co-occurrence distance)...", flush=True)


def tree_leaf_assignment(est: DecisionTreeClassifier, X: np.ndarray) -> np.ndarray:
    return est.apply(X)  # leaf id per row


# Use 2D forest trees because the visual storyline (scenes 1, 5, 7) leans on it.
leaf_assigns = np.stack(
    [tree_leaf_assignment(est, X_train_2d) for est in forest2d.estimators_], axis=0
)  # (B, n_train)


def pair_distance(a: np.ndarray, b: np.ndarray) -> float:
    """1 - fraction of training rows that two trees route to the same partition.

    "Same partition" means: for every other row r', tree A puts the pair (i, r')
    into the same leaf iff tree B does. We use the simpler proxy: for each pair
    of rows (i, j), check whether they land in the same leaf in A and whether
    the same is true in B; agreement = (sameA == sameB). The full pairwise
    formulation is O(n^2) per tree-pair which is too slow; we sub-sample
    n_train pairs uniformly.
    """
    # Faster proxy: directly compare leaf ids' agreement with a co-cluster ARI.
    # Use Rand index on leaf labels via sklearn? That's also O(n^2) but cheap
    # for n=233.
    from sklearn.metrics import adjusted_rand_score

    return 1.0 - max(0.0, adjusted_rand_score(a, b))


B = N_TREES
dist_lower = []
for i in range(B):
    for j in range(i):
        dist_lower.append(r4(pair_distance(leaf_assigns[i], leaf_assigns[j])))

# Build dense matrix for MDS / clustering.
dist_mat = np.zeros((B, B))
k = 0
for i in range(B):
    for j in range(i):
        dist_mat[i, j] = dist_lower[k]
        dist_mat[j, i] = dist_lower[k]
        k += 1

print("MDS embedding of tree distances...", flush=True)
mds = MDS(
    n_components=2,
    dissimilarity="precomputed",
    random_state=SEED,
    n_init=4,
    normalized_stress="auto",
)
mds_coords_arr = mds.fit_transform(dist_mat)
mds_coords = [{"x": r4(p[0]), "y": r4(p[1])} for p in mds_coords_arr]

print("Selecting k for tree clustering via silhouette...", flush=True)
best_k = 5
best_score = -np.inf
best_labels = None
for k_try in range(5, 11):
    km = KMeans(n_clusters=k_try, random_state=SEED, n_init=10)
    labels = km.fit_predict(mds_coords_arr)
    if len(set(labels)) < 2:
        continue
    s = silhouette_score(mds_coords_arr, labels)
    if s > best_score:
        best_score = s
        best_k = k_try
        best_labels = labels
cluster_idx = [int(c) for c in best_labels.tolist()]

similarity = {
    "distLowerTri": dist_lower,
    "mdsCoords": mds_coords,
    "nClusters": int(best_k),
    "clusterIdx": cluster_idx,
}

# ---------------------------------------------------------------------------
# 9. Importance (scene 8a)
# ---------------------------------------------------------------------------
print("Gini importance growth + permutation importance...", flush=True)
gini_by_B = []
# sklearn computes feature_importances_ as a normalized average over trees.
# We replicate per-tree importances and accumulate.
per_tree_importances = np.stack(
    [est.feature_importances_ for est in forest4d.estimators_], axis=0
)  # (B, p)
for B_i in range(1, N_TREES + 1):
    avg = per_tree_importances[:B_i].mean(axis=0)
    s = avg.sum()
    if s > 0:
        avg = avg / s
    gini_by_B.append(round_list(avg.tolist()))

print("Permutation importance (final forest)...", flush=True)
perm = permutation_importance(
    forest4d, X_test, y_test, n_repeats=10, random_state=SEED, n_jobs=1
)
perm_final = round_list(perm.importances_mean.tolist())

importance_payload = {"giniByB": gini_by_B, "permutationFinal": perm_final}

# ---------------------------------------------------------------------------
# 10. Waterfall (scene 8b) — path-based contribution averaged over trees.
# ---------------------------------------------------------------------------
print("Selecting waterfall query point + computing contributions...", flush=True)


def entropy(p: np.ndarray) -> float:
    pp = np.clip(p, 1e-12, 1.0)
    return float(-(pp * np.log(pp)).sum())


# Find highest-entropy test prediction.
final_proba_test = mean_proba[-1]  # (n_test, n_classes)
entropies = np.array([entropy(p) for p in final_proba_test])
best_test_idx = int(np.argmax(entropies))
query_global_id = int(idx_test[best_test_idx])
query_features = X_full[query_global_id]
query_class = int(y_full[query_global_id])

# Baseline = mean root distribution across trees, normalized.
class_counts_train = np.bincount(y_train, minlength=len(CLASS_NAMES))
baseline_prob = class_counts_train / class_counts_train.sum()

# For each tree, walk the root-to-leaf path for the query point. At each
# internal node, attribute the change in normalized class distribution
# (child - parent) to the splitting feature. Average across trees.
contribution_sums = np.zeros((len(FEATURES), len(CLASS_NAMES)))

for est in forest4d.estimators_:
    t = est.tree_
    # Walk path
    node_id = 0
    # Pad parent dist to length n_classes.
    cls_index = {int(c): i for i, c in enumerate(est.classes_)}

    def node_dist(nid: int) -> np.ndarray:
        raw = t.value[nid][0]
        d = np.zeros(len(CLASS_NAMES))
        for c, i in cls_index.items():
            d[c] = raw[i]
        s = d.sum()
        return d / s if s > 0 else d

    while t.children_left[node_id] != -1:
        feat = int(t.feature[node_id])
        thr = t.threshold[node_id]
        parent_p = node_dist(node_id)
        if query_features[feat] <= thr:
            child = int(t.children_left[node_id])
        else:
            child = int(t.children_right[node_id])
        child_p = node_dist(child)
        contribution_sums[feat] += child_p - parent_p
        node_id = child

contributions = contribution_sums / N_TREES
final_prob = baseline_prob + contributions.sum(axis=0)
# Renormalize defensively.
final_prob = np.clip(final_prob, 0, None)
if final_prob.sum() > 0:
    final_prob = final_prob / final_prob.sum()

waterfall = {
    "pointIdx": query_global_id,
    "baselineProb": round_list(baseline_prob.tolist()),
    "contributions": [
        {"feature": FEATURES[f], "delta": round_list(contributions[f].tolist())}
        for f in range(len(FEATURES))
    ],
    "finalProb": round_list(final_prob.tolist()),
    "predictedClass": int(np.argmax(final_proba_test[best_test_idx])),
}

# ---------------------------------------------------------------------------
# 11. Feature x depth heatmap (scene 8c)
# ---------------------------------------------------------------------------
print("Feature x depth usage matrix...", flush=True)
max_depth_seen = 0
for est in forest4d.estimators_:
    max_depth_seen = max(max_depth_seen, est.get_depth())

raw_counts = np.zeros((len(FEATURES), max_depth_seen + 1), dtype=np.float64)
for est in forest4d.estimators_:
    t = est.tree_
    # depth per node
    depths = {0: 0}

    def fill_depths(nid: int, d: int) -> None:
        depths[nid] = d
        if t.children_left[nid] != -1:
            fill_depths(int(t.children_left[nid]), d + 1)
            fill_depths(int(t.children_right[nid]), d + 1)

    fill_depths(0, 0)
    for nid in range(t.node_count):
        if t.children_left[nid] == -1:
            continue
        feat = int(t.feature[nid])
        d = depths[nid]
        raw_counts[feat, d] += 1

# Normalize each feature row to sum to 1 (so the heatmap shows where each
# feature gets used along depth, not raw frequency dominated by depth-0).
counts_norm = []
for f in range(len(FEATURES)):
    row = raw_counts[f]
    s = row.sum()
    if s > 0:
        counts_norm.append(round_list((row / s).tolist()))
    else:
        counts_norm.append(round_list(row.tolist()))

feature_by_depth = {"counts": counts_norm, "maxDepth": int(max_depth_seen)}

# ---------------------------------------------------------------------------
# 12. Assemble payload
# ---------------------------------------------------------------------------
payload = {
    "meta": {
        "seed": SEED,
        "nTotal": int(n_total),
        "nTrain": int(n_train),
        "nTest": int(n_test),
        "nFeatures": len(FEATURES),
        "nClasses": len(CLASS_NAMES),
        "nTrees": N_TREES,
        "classNames": CLASS_NAMES,
        "featureNames": FEATURES,
        "featureLabels": FEATURE_LABELS,
        "twoDFeatures": TWOD_FEATURES,
        "boundaryGridResLow": GRID_LOW,
        "boundaryGridResHigh": GRID_HIGH,
    },
    "points": points,
    "scatter": scatter,
    "forest2D": forest_2d_payload,
    "forest4D": {"treesMeta": trees4d_meta},
    "accuracyCurve": accuracy_curve,
    "varianceTrace": variance_trace,
    "rho2D": r4(rho_2d),
    "rho4D": r4(rho_4d),
    "bootstrapDemo": bootstrap_demo,
    "mtryDemo": mtry_demo,
    "similarity": similarity,
    "importance": importance_payload,
    "waterfall": waterfall,
    "featureByDepth": feature_by_depth,
}

# ---------------------------------------------------------------------------
# 13. Verification asserts
# ---------------------------------------------------------------------------
print("Running verification asserts...", flush=True)

assert len(payload["points"]) == n_total
assert n_train + n_test == n_total
assert len(payload["forest2D"]["trees"]) == 100
assert all(len(t["oobMask"]) == n_train for t in payload["forest2D"]["trees"])
assert len(payload["forest2D"]["boundariesLow"]) == 100
assert all(len(b) == 60 * 60 for b in payload["forest2D"]["boundariesLow"])
assert len(payload["forest2D"]["boundaryHigh"]["classGrid"]) == 200 * 200

oob_means = [sum(t["oobMask"]) / n_train for t in payload["forest2D"]["trees"]]
oob_mean_avg = sum(oob_means) / len(oob_means)
assert 0.32 <= oob_mean_avg <= 0.42, f"OOB mean should be ~0.368, got {oob_mean_avg}"

acc_final = payload["accuracyCurve"][-1]["testAccuracy"]
assert acc_final > 0.90, f"Penguins should be easy; got accuracy {acc_final}"

acc_first_10 = [a["testAccuracy"] for a in payload["accuracyCurve"][:10]]
acc_last_10 = [a["testAccuracy"] for a in payload["accuracyCurve"][-10:]]
assert sum(acc_last_10) / 10 >= sum(acc_first_10) / 10, "Accuracy should improve with B"

for row in payload["importance"]["giniByB"]:
    assert abs(sum(row) - 1.0) < 1e-3

assert len(payload["importance"]["permutationFinal"]) == 4

assert len(payload["similarity"]["distLowerTri"]) == 100 * 99 // 2
assert len(payload["similarity"]["mdsCoords"]) == 100
assert 5 <= payload["similarity"]["nClusters"] <= 10

final_unique = payload["bootstrapDemo"]["uniqueFractionCurve"][-1]["uniqueFraction"]
assert 0.50 <= final_unique <= 0.75, f"Unique fraction {final_unique} not in expected range"

# Determinism hash
_canonical = json.dumps(payload, sort_keys=True, allow_nan=False)
sha = hashlib.sha256(_canonical.encode()).hexdigest()
print(f"Payload SHA256: {sha[:16]}")

# ---------------------------------------------------------------------------
# 14. Write datasets.js
# ---------------------------------------------------------------------------
DATA_DIR.mkdir(parents=True, exist_ok=True)
serialized = json.dumps(payload, separators=(",", ":"), allow_nan=False)
content = (
    "// Auto-generated by precompute/build_forest.py - do not edit by hand.\n"
    f"// Seed: {SEED} - output is deterministic.\n"
    f"// Payload SHA256 (first 16): {sha[:16]}\n"
    f"window.DATA = {serialized};\n"
)
OUT_PATH.write_text(content)
size_mb = OUT_PATH.stat().st_size / 1024 / 1024
print(f"Wrote {OUT_PATH} ({size_mb:.2f} MB)")
print(f"Final test accuracy (forest4D): {acc_final}")
print(f"Mean OOB fraction (forest2D): {oob_mean_avg:.4f}")
print(f"Similarity clusters: {best_k}")
