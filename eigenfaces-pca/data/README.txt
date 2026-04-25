This directory is filled by precompute/build-data.py.

Expected files after running it:

  mean.bin            float32 [4096]
  eigenfaces.bin      float32 [50, 4096]
  eigenvalues.bin     float32 [50]
  variance-ratio.bin  float32 [50]
  faces.bin           uint8   [400, 4096]
  projections.bin     float32 [400, 50]
  labels.json         { meta:{N,K,W,H}, subjects:[...] }

To build:

  cd eigenfaces-pca/precompute
  python3 build-data.py

(needs:  pip install numpy scikit-learn)
