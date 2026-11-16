/*
 * Bead Pattern Maker — core logic (pure functions, no DOM).
 * Shared by the browser app (window.BeadCore) and the Node self-test.
 *
 * SUBSCRIPTION TIERS: every plan difference lives in TIERS below and is
 * enforced here + in app.js — width caps are clamped, the export watermark
 * follows the tier, the palette grows on paid plans, and CSV / PDF /
 * batch are hard-gated by tier flags (the UI asks for an upgrade instead
 * of failing silently). The active tier comes from a license key
 * (validateLicenseKey); no key = Free.
 */
(function (global) {
  'use strict';

  var CONFIG = {
    DEFAULT_WIDTH: 29,                            // one standard pegboard
    WATERMARK_TEXT: 'Made with Bead Pattern Maker',
    PEGBOARD_SIZE: 29                             // 29 x 29 pegs per board
  };

  var TIERS = {
    free: {
      id: 'free', name: 'Free', priceMonthly: 0,
      maxWidth: 48, watermark: true, paletteSize: 'basic',
      csvExport: false, pdfExport: false, batch: false
    },
    pro: {
      id: 'pro', name: 'Pro', priceMonthly: 4.99,
      maxWidth: 120, watermark: false, paletteSize: 'full',
      csvExport: true, pdfExport: false, batch: false
    },
    studio: {
      id: 'studio', name: 'Studio', priceMonthly: 9.99,
      maxWidth: 200, watermark: false, paletteSize: 'full',
      csvExport: true, pdfExport: true, batch: true
    }
  };
  var TIER_ORDER = ['free', 'pro', 'studio'];

  function getTier(id) {
    return TIERS[id] || TIERS.free;
  }

  function maxWidth(tierId) {
    return getTier(tierId).maxWidth;
  }

  function clampWidth(w, tierId) {
    w = Math.round(Number(w) || CONFIG.DEFAULT_WIDTH);
    if (w < 1) w = 1;
    var cap = maxWidth(tierId);
    return w > cap ? cap : w;
  }

  /* Lowest tier that unlocks a boolean feature flag ('csvExport',
   * 'pdfExport', 'batch'), or null if no tier has it. */
  function requiredTierFor(feature) {
    for (var i = 0; i < TIER_ORDER.length; i++) {
      if (TIERS[TIER_ORDER[i]][feature] === true) return TIER_ORDER[i];
    }
    return null;
  }

  /* ---------- license keys (LOCAL PLACEHOLDER rule) ----------
   * Format: BPM-PRO-XXXX-XXXC / BPM-STU-XXXX-XXXC, where C is a checksum
   * character over everything before it. This only keeps casual typing
   * honest — when Gumroad subscriptions launch, keys will be issued and
   * verified for real (see README); the format stays the same. */
  var KEY_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function keyChecksum(str) {
    var s = 0;
    for (var i = 0; i < str.length; i++) s += str.charCodeAt(i);
    return KEY_CHARS[s % 36];
  }
  function makeLicenseKey(tierId, part1, part2) {
    var tag = tierId === 'studio' ? 'STU' : 'PRO';
    var payload = ('BPM-' + tag + '-' + part1 + '-' + part2).toUpperCase();
    return payload + keyChecksum(payload);
  }
  function validateLicenseKey(key) {
    if (!key) return null;
    var k = String(key).trim().toUpperCase();
    var m = /^BPM-(PRO|STU)-([A-Z0-9]{4})-([A-Z0-9]{3})([A-Z0-9])$/.exec(k);
    if (!m) return null;
    if (keyChecksum(k.slice(0, -1)) !== m[4]) return null;
    return m[1] === 'PRO' ? 'pro' : 'studio';
  }

  /* Palette for a tier: Free = basic palette only; paid = basic + extra. */
  function paletteForTier(tierId, basePalette, extraColors) {
    if (getTier(tierId).paletteSize === 'full' && extraColors && extraColors.length) {
      return basePalette.concat(extraColors);
    }
    return basePalette.slice();
  }

  /* Shopping list as CSV (Pro+). stats comes from buildStats(). */
  function buildCsv(stats) {
    var lines = ['Code,Color,Hex,Beads,Percent'];
    stats.rows.forEach(function (r) {
      var pct = stats.totalBeads ? (r.count / stats.totalBeads * 100).toFixed(1) : '0.0';
      lines.push([r.code, r.name, r.hex, r.count, pct].join(','));
    });
    lines.push(['TOTAL', '', '', stats.totalBeads, '100.0'].join(','));
    return lines.join('\n') + '\n';
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
    TIERS: TIERS,
    TIER_ORDER: TIER_ORDER,
    getTier: getTier,
    maxWidth: maxWidth,
    clampWidth: clampWidth,
    requiredTierFor: requiredTierFor,
    makeLicenseKey: makeLicenseKey,
    validateLicenseKey: validateLicenseKey,
    paletteForTier: paletteForTier,
    buildCsv: buildCsv,
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
