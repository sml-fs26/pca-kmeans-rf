/* Face canvas — paints a length-(W*H) vector as a grayscale bitmap.
 *
 * The signature mirrors what scenes need:
 *
 *   FaceCanvas.render(canvas, vec, opts?)
 *     canvas: HTMLCanvasElement (or any element with a 2d context)
 *     vec:    Float32Array | Uint8Array of length W*H
 *     opts:   { w, h, scale, min, max, signed }
 *
 *   FaceCanvas.create(parent, opts?) -> HTMLCanvasElement
 *     Convenience: appends a sized <canvas class="face"> to parent.
 *
 * The renderer auto-detects three common value ranges:
 *   - Uint8Array  → assumes 0..255, paints directly.
 *   - Float32Array with all values in [0,1] → paints as 0..255.
 *   - Float32Array with negative values (eigenfaces, residuals) → diverging
 *     blue↔red ramp around 0, scaled by max(|v|).
 *
 * Pass opts.signed=true to force the diverging ramp (useful for eigenfaces
 * where the empirical range happens to be [0,1] for the first PC, but you
 * want consistent visual treatment).
 */

window.FaceCanvas = (function () {
  const DEFAULT_W = 64;
  const DEFAULT_H = 64;
  const DEFAULT_SCALE = 4;  // each pixel rendered as scale × scale CSS px

  function create(parent, opts) {
    const { w = DEFAULT_W, h = DEFAULT_H, scale = DEFAULT_SCALE, className = 'face' } = opts || {};
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.style.width = `${w * scale}px`;
    c.style.height = `${h * scale}px`;
    c.className = className;
    if (parent) parent.appendChild(c);
    return c;
  }

  function detectMode(vec, opts) {
    if (opts && opts.signed) return 'signed';
    if (vec instanceof Uint8Array) return 'u8';
    // Float32: check for negatives
    let hasNeg = false;
    for (let i = 0; i < vec.length; i++) {
      if (vec[i] < 0) { hasNeg = true; break; }
    }
    return hasNeg ? 'signed' : 'unit';
  }

  function paintU8(imgData, vec) {
    const data = imgData.data;
    for (let i = 0; i < vec.length; i++) {
      const g = vec[i];
      const o = i * 4;
      data[o] = g; data[o + 1] = g; data[o + 2] = g; data[o + 3] = 255;
    }
  }

  function paintUnit(imgData, vec, min, max) {
    const data = imgData.data;
    let lo = min, hi = max;
    if (lo == null || hi == null) {
      lo = Infinity; hi = -Infinity;
      for (let i = 0; i < vec.length; i++) {
        const v = vec[i];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    const range = hi - lo || 1;
    for (let i = 0; i < vec.length; i++) {
      const g = Math.max(0, Math.min(255, Math.round(((vec[i] - lo) / range) * 255)));
      const o = i * 4;
      data[o] = g; data[o + 1] = g; data[o + 2] = g; data[o + 3] = 255;
    }
  }

  // Diverging ramp: negative → blue (--c1), 0 → background, positive → red (--c2).
  // We render in straight RGB so it works under both light and dark themes.
  function paintSigned(imgData, vec, max) {
    const data = imgData.data;
    let m = max;
    if (m == null) {
      m = 0;
      for (let i = 0; i < vec.length; i++) {
        const a = Math.abs(vec[i]);
        if (a > m) m = a;
      }
      if (m === 0) m = 1;
    }
    // Hard-coded ramp endpoints close to --c1/--c2; midpoint is neutral gray.
    // Negative: (47, 108, 177) blue ; Positive: (184, 50, 58) red ; mid: (240, 238, 232).
    const NEG = [47, 108, 177];
    const POS = [184, 50, 58];
    const MID = [240, 238, 232];
    for (let i = 0; i < vec.length; i++) {
      let t = vec[i] / m;            // -1..+1
      if (t < -1) t = -1; else if (t > 1) t = 1;
      let r, g, b;
      if (t >= 0) {
        r = MID[0] + (POS[0] - MID[0]) * t;
        g = MID[1] + (POS[1] - MID[1]) * t;
        b = MID[2] + (POS[2] - MID[2]) * t;
      } else {
        const u = -t;
        r = MID[0] + (NEG[0] - MID[0]) * u;
        g = MID[1] + (NEG[1] - MID[1]) * u;
        b = MID[2] + (NEG[2] - MID[2]) * u;
      }
      const o = i * 4;
      data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
    }
  }

  function render(canvas, vec, opts) {
    const w = (opts && opts.w) || canvas.width || DEFAULT_W;
    const h = (opts && opts.h) || canvas.height || DEFAULT_H;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(w, h);
    const mode = detectMode(vec, opts);
    if (mode === 'u8')          paintU8(imgData, vec);
    else if (mode === 'signed') paintSigned(imgData, vec, opts && opts.max);
    else                        paintUnit(imgData, vec, opts && opts.min, opts && opts.max);
    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  return { create, render };
})();
