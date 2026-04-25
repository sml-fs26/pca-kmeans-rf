"""
Pull Voteview Senate data, run PCA / k-means / RF per Congress,
emit compact JSONs for the website.

Run from the congress-story/ directory:
    .venv/bin/python precompute/build_data.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd
import requests
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import adjusted_rand_score
from tqdm import tqdm

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data"
OUT_SENATE = OUT / "senate"
RAW.mkdir(parents=True, exist_ok=True)
OUT_SENATE.mkdir(parents=True, exist_ok=True)

# Congresses for which we ALSO emit the raw vote matrix (used by scenes 2/3/4 in the web viz).
EXPORT_MATRIX_FOR = {119}

VOTEVIEW = "https://voteview.com/static/data/out"

# Congresses to process: modern era + 1850s easter egg.
# 56th = 1899-1901, 119th = 2025-2027. 31st-36th = 1849-1861.
MODERN = list(range(56, 120))
EASTER_EGG = list(range(31, 37))
CONGRESSES = sorted(EASTER_EGG + MODERN)

# Voteview cast codes -> {+1 yea, -1 nay, 0 missing}.
YEA = {1, 2, 3}
NAY = {4, 5, 6}

# Party codes we care about. Voteview uses many historical party codes;
# we map to a coarse label for coloring.
PARTY_LABEL = {
    100: "D",   # Democratic
    200: "R",   # Republican
    328: "I",   # Independent
    329: "I",   # Independent Democrat
    537: "I",   # Farmer-Labor
    1275: "I",  # Anti-administration (early)
    1346: "W",  # Whig
    1116: "W",  # Conservative (Southern)
    1275: "F",  # Federalist (early)
    13: "F",    # Federalist
    22: "AntiAdmin",
    26: "Anti-Jacksonian",
    29: "Whig",
    37: "Constitutional Unionist",
}


def cache_get(url: str, dest: Path) -> Path:
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    print(f"  downloading {url} -> {dest.name}", file=sys.stderr)
    with requests.get(url, timeout=600, stream=True) as r:
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 20):
                f.write(chunk)
    return dest


def load_hsall() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Download (once) and load the full HSall files. Filter to Senate up front."""
    votes_url = f"{VOTEVIEW}/votes/HSall_votes.csv"
    members_url = f"{VOTEVIEW}/members/HSall_members.csv"
    rollcalls_url = f"{VOTEVIEW}/rollcalls/HSall_rollcalls.csv"
    votes_path = cache_get(votes_url, RAW / "HSall_votes.csv")
    members_path = cache_get(members_url, RAW / "HSall_members.csv")
    rollcalls_path = cache_get(rollcalls_url, RAW / "HSall_rollcalls.csv")

    print("  loading HSall votes (this is the big one)...", file=sys.stderr)
    votes = pd.read_csv(
        votes_path,
        usecols=["congress", "chamber", "rollnumber", "icpsr", "cast_code"],
        dtype={"congress": "int16", "chamber": "category", "rollnumber": "int32",
               "icpsr": "int32", "cast_code": "int8"},
    )
    votes = votes[votes["chamber"] == "Senate"].copy()
    print(f"  Senate votes loaded: {len(votes):,} rows", file=sys.stderr)

    members = pd.read_csv(members_path)
    members = members[members["chamber"] == "Senate"].copy()

    rollcalls = pd.read_csv(rollcalls_path)
    rollcalls = rollcalls[rollcalls["chamber"] == "Senate"].copy()

    return votes, members, rollcalls


def slice_congress(n: int, votes: pd.DataFrame, members: pd.DataFrame,
                   rollcalls: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame] | None:
    v = votes[votes["congress"] == n]
    m = members[members["congress"] == n]
    r = rollcalls[rollcalls["congress"] == n]
    if len(v) == 0 or len(m) == 0:
        return None
    return v, m, r


def build_vote_matrix(votes: pd.DataFrame, members: pd.DataFrame) -> tuple[np.ndarray, list[int], list[int]]:
    """Return (X, member_icpsrs, rollnumbers) where X[i,j] in {-1, 0, +1}."""
    # Filter members to actual senators (drop VPs and presidential icpsr ranges if present).
    senators = members[members["chamber"] == "Senate"].copy()
    senators = senators[senators["state_icpsr"] < 99]  # drop VP entries

    member_ids = sorted(senators["icpsr"].unique().tolist())
    rollnumbers = sorted(votes["rollnumber"].unique().tolist())

    member_idx = {m: i for i, m in enumerate(member_ids)}
    roll_idx = {r: j for j, r in enumerate(rollnumbers)}

    X = np.zeros((len(member_ids), len(rollnumbers)), dtype=np.int8)
    cast = votes["cast_code"].to_numpy()
    icpsr = votes["icpsr"].to_numpy()
    rolls = votes["rollnumber"].to_numpy()

    for k in range(len(votes)):
        m = member_idx.get(int(icpsr[k]))
        if m is None:
            continue
        j = roll_idx[int(rolls[k])]
        c = int(cast[k])
        if c in YEA:
            X[m, j] = 1
        elif c in NAY:
            X[m, j] = -1

    # Drop members who voted on < 5% of bills (died mid-term, sworn in late, etc.)
    participation = (X != 0).sum(axis=1) / max(1, X.shape[1])
    keep = participation >= 0.05
    X = X[keep]
    member_ids = [m for m, k in zip(member_ids, keep) if k]

    # Drop unanimous bills (zero variance).
    bill_var = X.var(axis=0)
    keep_bills = bill_var > 1e-6
    X = X[:, keep_bills]
    rollnumbers = [r for r, k in zip(rollnumbers, keep_bills) if k]

    return X, member_ids, rollnumbers


def align_signs(pcs: np.ndarray, parties: list[str], prev_pcs: dict[int, np.ndarray] | None,
                member_ids: list[int]) -> np.ndarray:
    """Align PC signs for visual continuity across Congresses.

    Convention for PC1: Republicans on the right (positive), Democrats on the left.
    For Congresses without R/D split (pre-1856), align via overlap with previous Congress.
    """
    out = pcs.copy()

    # PC1: align by party.
    party_arr = np.array(parties)
    is_r = party_arr == "R"
    is_d = party_arr == "D"
    if is_r.sum() >= 3 and is_d.sum() >= 3:
        if out[is_r, 0].mean() < out[is_d, 0].mean():
            out[:, 0] = -out[:, 0]
    elif prev_pcs is not None:
        # Align by overlap with previous Congress.
        shared = [(i, prev_pcs[m]) for i, m in enumerate(member_ids) if m in prev_pcs]
        if len(shared) >= 5:
            cur = np.array([out[i, 0] for i, _ in shared])
            prev = np.array([p[0] for _, p in shared])
            if np.dot(cur, prev) < 0:
                out[:, 0] = -out[:, 0]

    # PC2: align by overlap with previous Congress for continuity.
    if prev_pcs is not None:
        shared = [(i, prev_pcs[m]) for i, m in enumerate(member_ids) if m in prev_pcs]
        if len(shared) >= 5:
            cur = np.array([out[i, 1] for i, _ in shared])
            prev = np.array([p[1] for _, p in shared])
            if np.dot(cur, prev) < 0:
                out[:, 1] = -out[:, 1]

    return out


def coarse_party(code: int) -> str:
    return PARTY_LABEL.get(int(code), "Other")


def export_matrix(n: int, X: np.ndarray, member_ids: list[int], rollnumbers: list[int],
                  members: pd.DataFrame, rollcalls: pd.DataFrame) -> None:
    """Dump the raw vote matrix for a single Congress as a separate JSON file.

    Encoding: each senator is a string of 'y'/'n'/'-' (yea/nay/missing), one char per bill.
    Also picks deterministic 'demo bills' for the single-bill (scene 3) and two-bills
    (scene 4) visualizations: bills with at least 80% participation and a non-trivial split.
    """
    member_meta = members.set_index("icpsr").to_dict(orient="index")
    rc_meta = rollcalls.set_index("rollnumber").to_dict(orient="index")

    senators = []
    for m in member_ids:
        meta = member_meta[m]
        senators.append({
            "icpsr": int(m),
            "bioguide": str(meta.get("bioguide_id") or ""),
            "name": str(meta.get("bioname", "")),
            "state": str(meta.get("state_abbrev", "")),
            "party": coarse_party(meta.get("party_code", 0)),
        })

    bills = []
    for r in rollnumbers:
        meta = rc_meta.get(r, {})
        bills.append({
            "rollnumber": int(r),
            "date": str(meta.get("date", "")),
            "vote_question": str(meta.get("vote_question", ""))[:200],
            "vote_desc": str(meta.get("vote_desc", ""))[:120],
            "bill_number": str(meta.get("bill_number", "")),
        })

    # Encode matrix: one string per senator, length = n_bills.
    rows = []
    for i in range(X.shape[0]):
        chars = []
        for j in range(X.shape[1]):
            v = X[i, j]
            chars.append("y" if v > 0 else ("n" if v < 0 else "-"))
        rows.append("".join(chars))

    # Pick demo bills.
    yea = (X == 1).sum(axis=0)
    nay = (X == -1).sum(axis=0)
    total = yea + nay
    participation_ok = total >= int(X.shape[0] * 0.8)
    yea_ratio = np.where(total > 0, yea / np.maximum(total, 1), -1.0)

    # Prefer substantive votes over procedural ones for the demo bills, so we don't
    # spoil scene 12's "the top features are procedural" punchline.
    PROCEDURAL = ("Cloture", "Motion to Proceed", "Motion to Table",
                  "Motion to Discharge", "Motion to Recommit")
    is_procedural = np.array([
        any(p.lower() in (b["vote_question"] + " " + b["vote_desc"]).lower() for p in PROCEDURAL)
        for b in bills
    ])

    def first_with_split(target: float, used: set[int], allow_procedural: bool) -> int:
        # Score: distance from target ratio, with a penalty for procedural votes.
        proc_pen = np.where(is_procedural, 0.0 if allow_procedural else 0.5, 0.0)
        scores = np.where(participation_ok, np.abs(yea_ratio - target) + proc_pen, np.inf)
        for idx in np.argsort(scores):
            if idx not in used and scores[idx] < 1.0:
                return int(idx)
        return int(np.argmin(scores))

    used: set[int] = set()
    scene3 = first_with_split(0.55, used, allow_procedural=False); used.add(scene3)
    scene4_a = first_with_split(0.65, used, allow_procedural=False); used.add(scene4_a)
    scene4_b = first_with_split(0.40, used, allow_procedural=False); used.add(scene4_b)

    out = {
        "congress": n,
        "n_senators": len(senators),
        "n_bills": len(bills),
        "senators": senators,
        "bills": bills,
        "matrix": rows,
        "scene_3_bill": scene3,
        "scene_4_bills": [scene4_a, scene4_b],
    }
    (OUT_SENATE / f"{n}_matrix.json").write_text(json.dumps(out, separators=(",", ":")))


def process_congress(n: int, all_votes: pd.DataFrame, all_members: pd.DataFrame,
                     all_rollcalls: pd.DataFrame,
                     prev_pcs: dict[int, np.ndarray]) -> tuple[dict | None, dict[int, np.ndarray]]:
    sliced = slice_congress(n, all_votes, all_members, all_rollcalls)
    if sliced is None:
        return None, prev_pcs
    votes, members, rollcalls = sliced

    X, member_ids, rollnumbers = build_vote_matrix(votes, members)
    if X.shape[0] < 30 or X.shape[1] < 20:
        return None, prev_pcs

    # PCA on the (members x bills) matrix. Center but don't scale (votes already in [-1, 1]).
    pca = PCA(n_components=min(10, X.shape[0] - 1, X.shape[1]))
    pcs = pca.fit_transform(X.astype(float))

    # Build party labels.
    member_meta = members.set_index("icpsr").to_dict(orient="index")
    parties = [coarse_party(member_meta[m]["party_code"]) for m in member_ids]

    pcs_aligned = align_signs(pcs[:, :2], parties, prev_pcs if prev_pcs else None, member_ids)

    # k-means on (PC1, PC2). Two clusters.
    km = KMeans(n_clusters=2, n_init=10, random_state=0).fit(pcs_aligned)
    clusters = km.labels_.tolist()

    # ARI vs. binary D/R label (only for Congresses with both parties present).
    binary = np.array([1 if p == "R" else 0 if p == "D" else -1 for p in parties])
    has_party = binary >= 0
    ari = float(adjusted_rand_score(binary[has_party], np.array(clusters)[has_party])) \
        if has_party.sum() >= 5 else None

    # RF feature importance: predict R vs D from raw votes.
    rf_importances = []
    if has_party.sum() >= 20 and len(np.unique(binary[has_party])) == 2:
        rf = RandomForestClassifier(n_estimators=200, random_state=0, n_jobs=-1)
        rf.fit(X[has_party].astype(float), binary[has_party])
        importances = rf.feature_importances_
        order = np.argsort(importances)[::-1][:20]
        rc_meta = rollcalls.set_index("rollnumber").to_dict(orient="index")
        for idx in order:
            rn = rollnumbers[idx]
            meta = rc_meta.get(rn, {})
            rf_importances.append({
                "rollnumber": int(rn),
                "importance": float(importances[idx]),
                "date": str(meta.get("date", "")),
                "vote_desc": str(meta.get("vote_desc", ""))[:120],
                "vote_question": str(meta.get("vote_question", ""))[:200],
                "bill_number": str(meta.get("bill_number", "")),
            })

    # Senator records.
    senators_out = []
    for i, m in enumerate(member_ids):
        meta = member_meta[m]
        senators_out.append({
            "icpsr": int(m),
            "bioguide": str(meta.get("bioguide_id") or ""),
            "name": str(meta.get("bioname", "")),
            "state": str(meta.get("state_abbrev", "")),
            "party": parties[i],
            "party_code": int(meta.get("party_code", 0)),
            "pc1": round(float(pcs_aligned[i, 0]), 4),
            "pc2": round(float(pcs_aligned[i, 1]), 4),
            "nominate_dim1": _safe_float(meta.get("nominate_dim1")),
            "nominate_dim2": _safe_float(meta.get("nominate_dim2")),
            "kmeans_cluster": int(clusters[i]),
        })

    # Pull the date range for this Congress from rollcalls.
    dates = pd.to_datetime(rollcalls["date"], errors="coerce").dropna()
    year_start = int(dates.min().year) if len(dates) else None
    year_end = int(dates.max().year) if len(dates) else None

    out = {
        "congress": n,
        "year_start": year_start,
        "year_end": year_end,
        "n_senators": len(senators_out),
        "n_rollcalls": int(X.shape[1]),
        "eigenvalues": [round(float(v), 6) for v in pca.explained_variance_],
        "explained_variance_ratio": [round(float(v), 6) for v in pca.explained_variance_ratio_],
        "kmeans_ari": round(ari, 4) if ari is not None else None,
        "rf_importances": rf_importances,
        "senators": senators_out,
    }

    if n in EXPORT_MATRIX_FOR:
        export_matrix(n, X, member_ids, rollnumbers, members, rollcalls)

    new_pcs = {m: pcs_aligned[i] for i, m in enumerate(member_ids)}
    return out, new_pcs


def _safe_float(v) -> float | None:
    try:
        f = float(v)
        if np.isnan(f):
            return None
        return round(f, 4)
    except (TypeError, ValueError):
        return None


def main(congresses: Iterable[int] = CONGRESSES) -> None:
    all_votes, all_members, all_rollcalls = load_hsall()
    congresses_list = list(congresses)
    is_full_run = set(congresses_list) >= set(CONGRESSES)
    prev_pcs: dict[int, np.ndarray] = {}
    for n in tqdm(congresses_list, desc="congresses"):
        result, prev_pcs = process_congress(n, all_votes, all_members, all_rollcalls, prev_pcs)
        if result is None:
            continue
        path = OUT_SENATE / f"{n}.json"
        path.write_text(json.dumps(result, separators=(",", ":")))

    # Always rebuild the index from EVERY per-Congress file on disk, not just from
    # this run's results. That way a partial run (e.g. main([119]) to refresh one
    # matrix) can't quietly overwrite the index with a single entry.
    index = []
    for path in sorted(OUT_SENATE.glob("[0-9]*.json")):
        if "_matrix" in path.name:
            continue
        d = json.loads(path.read_text())
        index.append({
            "congress": d["congress"],
            "year_start": d["year_start"],
            "year_end": d["year_end"],
            "n_senators": d["n_senators"],
            "n_rollcalls": d["n_rollcalls"],
            "kmeans_ari": d["kmeans_ari"],
            "var_pc1": d["explained_variance_ratio"][0],
            "var_pc2": d["explained_variance_ratio"][1] if len(d["explained_variance_ratio"]) > 1 else None,
            "var_pc3": d["explained_variance_ratio"][2] if len(d["explained_variance_ratio"]) > 2 else None,
        })
    index.sort(key=lambda e: e["congress"])
    (OUT / "congresses.json").write_text(json.dumps(index, indent=2))
    label = "full" if is_full_run else "partial"
    print(f"\nProcessed {len(congresses_list)} Congress(es) [{label} run]")
    print(f"Index rebuilt from disk: {len(index)} entries → {OUT / 'congresses.json'}")


if __name__ == "__main__":
    main()
