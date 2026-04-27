/* ImageCanvas — paints a length-D vector as a 32×32 grayscale (or diverging) bitmap.
 *
 * The signature mirrors what scenes need:
 *
 *   ImageCanvas.render(canvas, vec, opts?)
 *     canvas: HTMLCanvasElement
 *     vec:    Array | Float32Array of length W*H (default 32*32)
 *     opts:   { w, h, scale, min, max, signed, background }
 *
 *   ImageCanvas.create(parent, opts?) -> HTMLCanvasElement
 *     Convenience: appends a sized <canvas class="shape-image"> to parent.
 *
 * The renderer auto-detects two value ranges:
 *   - Float vector with all values in [0,1] → grayscale: white = 0, black = 1.
 *     (We render 0 as the page background and 1 as ink, so the image looks
 *      like a hand-drawn shape on the cream/dark canvas.)
 *   - Float vector with negative values (eigenvectors that have +/-) → diverging
 *     blue↔red ramp around 0, scaled by max(|v|).
 *
 * Pass opts.signed=true to force the diverging ramp. */

window.ImageCanvas = (function () {
  const DEFAULT_W = 32;
  const DEFAULT_H = 32;
  const DEFAULT_SCALE = 8;  // each pixel rendered as 8 × 8 CSS px → 256 × 256 box

  // CSS-variable lookup with fallback (so headless screenshots before theme.init
  // don't crash, and so we can sample fresh values when the theme changes).
  function readVar(name, fallback) {
    if (typeof getComputedStyle === 'undefined') return fallback;
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function parseHex(hex, fallback) {
    if (!hex || hex[0] !== '#') return fallback;
    const h = hex.length === 4
      ? hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3]
      : hex.slice(1);
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }

  function paletteForGrayscale() {
    // Map 0 → background colour, 1 → ink. Lecturer expects shapes to look "drawn".
    const bg = parseHex(readVar('--image-bg', '#ffffff'), [255, 255, 255]);
    const ink = parseHex(readVar('--ink', '#1a1a1a'), [26, 26, 26]);
    return { bg, ink };
  }

  function paletteForDiverging() {
    const neg = parseHex(readVar('--diverging-neg', '#2f6cb1'), [47, 108, 177]);
    const mid = parseHex(readVar('--diverging-mid', '#f0eee8'), [240, 238, 232]);
    const pos = parseHex(readVar('--diverging-pos', '#b8323a'), [184, 50, 58]);
    return { neg, mid, pos };
  }

  function create(parent, opts) {
    const { w = DEFAULT_W, h = DEFAULT_H, scale = DEFAULT_SCALE, className = 'shape-image' } = opts || {};
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.style.width = `${w * scale}px`;
    c.style.height = `${h * scale}px`;
    c.className = className;
    if (parent) parent.appendChild(c);
    return c;
  }

  function detectSigned(vec, opts) {
    if (opts && opts.signed === true) return true;
    if (opts && opts.signed === false) return false;
    for (let i = 0; i < vec.length; i++) if (vec[i] < -1e-9) return true;
    return false;
  }

  function paintGrayscale(imgData, vec, lo, hi) {
    const data = imgData.data;
    const { bg, ink } = paletteForGrayscale();
    let mn = lo, mx = hi;
    if (mn == null || mx == null) {
      mn = Infinity; mx = -Infinity;
      for (let i = 0; i < vec.length; i++) {
        const v = vec[i];
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      if (mn === mx) { mn = 0; mx = 1; }
    }
    const range = mx - mn || 1;
    for (let i = 0; i < vec.length; i++) {
      let t = (vec[i] - mn) / range;       // 0..1, 0 = light, 1 = dark
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const r = Math.round(bg[0] + (ink[0] - bg[0]) * t);
      const g = Math.round(bg[1] + (ink[1] - bg[1]) * t);
      const b = Math.round(bg[2] + (ink[2] - bg[2]) * t);
      const o = i * 4;
      data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
    }
  }

  function paintDiverging(imgData, vec, max) {
    const data = imgData.data;
    const { neg, mid, pos } = paletteForDiverging();
    let m = max;
    if (m == null) {
      m = 0;
      for (let i = 0; i < vec.length; i++) {
        const a = Math.abs(vec[i]);
        if (a > m) m = a;
      }
      if (m === 0) m = 1;
    }
    for (let i = 0; i < vec.length; i++) {
      let t = vec[i] / m;
      if (t < -1) t = -1; else if (t > 1) t = 1;
      let r, g, b;
      if (t >= 0) {
        r = mid[0] + (pos[0] - mid[0]) * t;
        g = mid[1] + (pos[1] - mid[1]) * t;
        b = mid[2] + (pos[2] - mid[2]) * t;
      } else {
        const u = -t;
        r = mid[0] + (neg[0] - mid[0]) * u;
        g = mid[1] + (neg[1] - mid[1]) * u;
        b = mid[2] + (neg[2] - mid[2]) * u;
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
    if (detectSigned(vec, opts)) {
      paintDiverging(imgData, vec, opts && opts.max);
    } else {
      paintGrayscale(imgData, vec, opts && opts.min, opts && opts.max);
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  // Re-render any canvases that participate in theme-aware palettes when the user
  // toggles. Scenes that want this should attach a redraw handler themselves —
  // we don't auto-track to keep the API minimal. But the theme-change event is
  // standardised on window so any module can listen.

  return { create, render };
})();
