#!/usr/bin/env python3
"""
Pre-compute every blob the eigenfaces viz reads at runtime.

Inputs:    sklearn's Olivetti faces (downloaded once, cached in ~/scikit_learn_data)
Outputs:   ../data/{mean,eigenfaces,eigenvalues,variance-ratio,faces,projections}.bin
           ../data/labels.json

Run:
    cd eigenfaces-pca/precompute
    python3 build-data.py

Requires: numpy, scikit-learn  (pip install numpy scikit-learn)

Layout (everything little-endian, the JS Float32Array / Uint8Array default):

  mean.bin           float32  [H*W]               =  4096 floats   ~16 KB
  eigenfaces.bin     float32  [K, H*W]            = 50 × 4096      ~800 KB
  eigenvalues.bin    float32  [K]                 = 50 floats
  variance-ratio.bin float32  [K]                 = 50 floats
  faces.bin          uint8    [N, H*W]            = 400 × 4096     ~1.6 MB
  projections.bin    float32  [N, K]              = 400 × 50       ~80 KB
  labels.json        { meta:{N,K,W,H}, subjects:[...] }
"""

from __future__ import annotations
import json
import sys
from pathlib import Path

import numpy as np

try:
    from sklearn.datasets import fetch_olivetti_faces
    from sklearn.decomposition import PCA
except ImportError:
    sys.stderr.write("This script needs scikit-learn. Try:  pip install numpy scikit-learn\n")
    sys.exit(1)


DATA_DIR = Path(__file__).resolve().parent.parent / "data"
N_COMPONENTS = 50  # K — top components kept


def main() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    print(f"-> writing into {DATA_DIR}")

    print("-> fetching Olivetti faces (cached after first run)")
    bunch = fetch_olivetti_faces(shuffle=False)  # 400 × 64 × 64, values in [0,1]
    X = bunch.data.astype(np.float32)            # (400, 4096)
    y = bunch.target.astype(np.int32)            # (400,) subject ids 0..39
    N, D = X.shape
    H = W = 64
    assert D == H * W, f"unexpected pixel count {D}"

    # ---- PCA ----
    print(f"-> fitting PCA, k={N_COMPONENTS}")
    pca = PCA(n_components=N_COMPONENTS, svd_solver="randomized", random_state=0)
    Z = pca.fit_transform(X)                                    # (N, K)
    mean = pca.mean_.astype(np.float32)                         # (D,)
    components = pca.components_.astype(np.float32)             # (K, D), orthonormal rows
    eigenvalues = pca.explained_variance_.astype(np.float32)    # (K,)
    variance_ratio = pca.explained_variance_ratio_.astype(np.float32)

    cum = float(variance_ratio.sum())
    print(f"   first 5 variance ratios: {variance_ratio[:5].round(3).tolist()}")
    print(f"   top {N_COMPONENTS} explain {cum:.1%} of total variance")

    # ---- raw faces as uint8 (compact, paints directly via ImageData) ----
    faces_u8 = (X * 255.0).clip(0, 255).round().astype(np.uint8)  # (N, D)

    # ---- write blobs (little-endian; numpy's default on x86/arm64 macs) ----
    def dump(name: str, arr: np.ndarray) -> None:
        path = DATA_DIR / name
        arr.astype(arr.dtype, copy=False).tofile(path)
        print(f"   wrote {name:22s}  shape={arr.shape}  dtype={arr.dtype}  size={path.stat().st_size:>9d} B")

    dump("mean.bin",            mean)
    dump("eigenfaces.bin",      components)
    dump("eigenvalues.bin",     eigenvalues)
    dump("variance-ratio.bin",  variance_ratio)
    dump("faces.bin",           faces_u8)
    dump("projections.bin",     Z.astype(np.float32))

    labels = {
        "meta":     {"N": int(N), "K": int(N_COMPONENTS), "W": int(W), "H": int(H)},
        "subjects": y.tolist(),
        "names":    None,  # Olivetti is anonymized; subject ids are the labels
    }
    with open(DATA_DIR / "labels.json", "w") as f:
        json.dump(labels, f)
    print(f"   wrote labels.json")

    print("-> done.")


if __name__ == "__main__":
    main()
