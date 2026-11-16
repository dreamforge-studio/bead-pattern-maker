/*
 * Bead Pattern Maker — core logic (pure functions, no DOM).
 * Shared by the browser app (window.BeadCore) and the Node self-test.
 *
 * PAID UNLOCK SWITCH: everything about the free-tier limits lives in CONFIG.
 * When the Gumroad unlock ships, flipping CONFIG.UNLOCKED to true (after a
 * license check) raises the width cap and removes the export watermark.
 * Nothing else in the codebase needs to change.
 */
(function (global) {
  'use strict';

  var CONFIG = {
    UNLOCKED: false,                              // <-- paid unlock switch
    FREE_MAX_WIDTH: 48,                           // bead columns, free tier
    PRO_MAX_WIDTH: 200,                           // bead columns, unlocked
    DEFAULT_WIDTH: 29,                            // one standard pegboard
    WATERMARK_TEXT: 'Made with Bead Pattern Maker',
    PEGBOARD_SIZE: 29                             // 29 x 29 pegs per board
  };

  function maxWidth(unlocked) {
    return unlocked ? CONFIG.PRO_MAX_WIDTH : CONFIG.FREE_MAX_WIDTH;
  }

  function clampWidth(w, unlocked) {
    w = Math.round(Number(w) || CONFIG.DEFAULT_WIDTH);
    if (w < 1) w = 1;
    var cap = maxWidth(unlocked);
    return w > cap ? cap : w;
  }

  function hexToRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  /* sRGB -> CIE Lab (D65). Lab distance matches human color perception
   * far better than raw RGB distance, which matters for bead matching. */
  function rgbToLab(r, g, b) {
    function pivot(c) {
      c /= 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    var R = pivot(r), G = pivot(g), B = pivot(b);
    var x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
    var y = (R * 0.2126 + G * 0.7152 + B * 0.0722) / 1.0;
    var z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    function f(t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; }
    var fx = f(x), fy = f(y), fz = f(z);
    return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
  }

  function labDistance(l1, l2) {
    var dL = l1.L - l2.L, da = l1.a - l2.a, db = l1.b - l2.b;
    return dL * dL + da * da + db * db; // squared CIE76; sqrt not needed for argmin
  }

  /* Precompute Lab + RGB for every palette entry once. */
  function preparePalette(palette) {
    return palette.map(function (c) {
      var rgb = hexToRgb(c.hex);
      return {
        code: c.code, name: c.name, hex: c.hex,
        r: rgb.r, g: rgb.g, b: rgb.b,
        lab: rgbToLab(rgb.r, rgb.g, rgb.b)
      };
    });
  }

  function nearestColorIndex(r, g, b, preparedPalette) {
    var lab = rgbToLab(r, g, b);
    var best = -1, bestDist = Infinity;
    for (var i = 0; i < preparedPalette.length; i++) {
      var d = labDistance(lab, preparedPalette[i].lab);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  /*
   * Quantize sampled RGBA pixels to the palette.
   * data: Uint8ClampedArray-like, length = width*height*4 (row-major).
   * Pixels with alpha < 128 become -1 (empty cell / no bead).
   * Returns Int32Array of palette indices, length width*height.
   */
  function quantizePixels(data, width, height, preparedPalette) {
    var grid = new Int32Array(width * height);
    for (var i = 0; i < width * height; i++) {
      var o = i * 4;
      if (data[o + 3] < 128) { grid[i] = -1; continue; }
      grid[i] = nearestColorIndex(data[o], data[o + 1], data[o + 2], preparedPalette);
    }
    return grid;
  }

  /* Bead counts per color, sorted by count desc, then code asc. */
  function buildStats(grid, preparedPalette) {
    var counts = new Map();
    var total = 0;
    for (var i = 0; i < grid.length; i++) {
      var idx = grid[i];
      if (idx < 0) continue;
      counts.set(idx, (counts.get(idx) || 0) + 1);
      total++;
    }
    var rows = [];
    counts.forEach(function (count, idx) {
      var c = preparedPalette[idx];
      rows.push({ index: idx, code: c.code, name: c.name, hex: c.hex, count: count });
    });
    rows.sort(function (a, b) {
      return b.count - a.count || (a.code < b.code ? -1 : 1);
    });
    return { rows: rows, totalBeads: total, colorCount: rows.length };
  }

  function pegboardsNeeded(width, height) {
    var per = CONFIG.PEGBOARD_SIZE;
    return Math.ceil(width / per) * Math.ceil(height / per);
  }

  var api = {
    CONFIG: CONFIG,
    maxWidth: maxWidth,
    clampWidth: clampWidth,
    hexToRgb: hexToRgb,
    rgbToLab: rgbToLab,
    preparePalette: preparePalette,
    nearestColorIndex: nearestColorIndex,
    quantizePixels: quantizePixels,
    buildStats: buildStats,
    pegboardsNeeded: pegboardsNeeded
  };

  global.BeadCore = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
