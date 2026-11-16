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
      csvExport: false, svgExport: false, xlsxExport: false,
      pdfExport: false, batch: false, cellEdit: true
    },
    pro: {
      id: 'pro', name: 'Pro', priceMonthly: 4.99,
      maxWidth: 120, watermark: false, paletteSize: 'full',
      csvExport: true, svgExport: true, xlsxExport: true,
      pdfExport: false, batch: false, cellEdit: true
    },
    studio: {
      id: 'studio', name: 'Studio', priceMonthly: 9.99,
      maxWidth: 200, watermark: false, paletteSize: 'full',
      csvExport: true, svgExport: true, xlsxExport: true,
      pdfExport: true, batch: true, cellEdit: true
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

  /* Pattern as a standalone SVG chart (Pro+). Mirrors the PNG export:
   * one rect per bead, the color code printed in cells big enough to
   * hold it, light grid lines with a bolder line every 5 beads.
   * Empty cells (index < 0) stay transparent. */
  function buildSvg(grid, W, H, preparedPalette, opts) {
    opts = opts || {};
    var cell = opts.cell || 20;
    var showCodes = opts.showCodes !== false;
    var showGrid = opts.showGrid !== false;
    function textColorFor(hex) {
      var rgb = hexToRgb(hex);
      var lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
      return lum > 0.62 ? '#22252a' : '#ffffff';
    }
    var out = [];
    out.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W * cell +
      '" height="' + H * cell + '" viewBox="0 0 ' + W * cell + ' ' + H * cell + '">');
    out.push('<rect width="100%" height="100%" fill="#ffffff"/>');
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var idx = grid[y * W + x];
        if (idx < 0) continue;
        var c = preparedPalette[idx];
        out.push('<rect x="' + x * cell + '" y="' + y * cell + '" width="' + cell +
          '" height="' + cell + '" fill="' + c.hex + '"/>');
        if (showCodes && cell >= 13) {
          out.push('<text x="' + (x * cell + cell / 2) + '" y="' + (y * cell + cell / 2) +
            '" font-family="Arial, sans-serif" font-size="' + Math.max(7, Math.floor(cell * 0.34)) +
            '" font-weight="600" fill="' + textColorFor(c.hex) +
            '" text-anchor="middle" dominant-baseline="central">' + c.code + '</text>');
        }
      }
    }
    if (showGrid) {
      var d = '', d5 = '', gx, gy;
      for (gx = 0; gx <= W; gx++) { d += 'M' + (gx * cell + 0.5) + ' 0V' + H * cell; }
      for (gy = 0; gy <= H; gy++) { d += 'M0 ' + (gy * cell + 0.5) + 'H' + W * cell; }
      for (gx = 0; gx <= W; gx += 5) { d5 += 'M' + (gx * cell + 0.5) + ' 0V' + H * cell; }
      for (gy = 0; gy <= H; gy += 5) { d5 += 'M0 ' + (gy * cell + 0.5) + 'H' + W * cell; }
      out.push('<path d="' + d + '" stroke="rgba(30,30,30,0.28)" stroke-width="1" fill="none"/>');
      out.push('<path d="' + d5 + '" stroke="rgba(30,30,30,0.55)" stroke-width="1" fill="none"/>');
    }
    out.push('</svg>');
    return out.join('');
  }

  /* ---------- minimal XLSX writer (Pro+) ----------
   * An .xlsx is a zip of XML parts. This writes the smallest valid
   * workbook (STORE method, no compression) with no dependencies, so
   * the bead list can be downloaded as a real spreadsheet file. */
  var CRC_TABLE = null;
  function crc32(bytes) {
    if (!CRC_TABLE) {
      CRC_TABLE = [];
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        CRC_TABLE[n] = c >>> 0;
      }
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function utf8Bytes(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i);
      if (code < 0x80) out.push(code);
      else if (code < 0x800) { out.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F)); }
      else { out.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F)); }
    }
    return new Uint8Array(out);
  }
  function zipStore(files) {
    // files: [{name, bytes}] -> Uint8Array zip archive (stored, fixed DOS date 2026-01-01)
    var chunks = [], centrals = [], offset = 0;
    var dosTime = 0, dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;
    function u16(v) { return [v & 0xFF, (v >> 8) & 0xFF]; }
    function u32(v) { return [v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF]; }
    files.forEach(function (f) {
      var name = utf8Bytes(f.name), crc = crc32(f.bytes), size = f.bytes.length;
      var local = [].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0),
        u16(dosTime), u16(dosDate), u32(crc), u32(size), u32(size),
        u16(name.length), u16(0));
      chunks.push(new Uint8Array(local), name, f.bytes);
      centrals.push({ name: name, crc: crc, size: size, offset: offset });
      offset += local.length + name.length + size;
    });
    var cdStart = offset;
    centrals.forEach(function (c) {
      var central = [].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0),
        u16(dosTime), u16(dosDate), u32(c.crc), u32(c.size), u32(c.size),
        u16(c.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.offset));
      chunks.push(new Uint8Array(central), c.name);
      offset += central.length + c.name.length;
    });
    var end = [].concat(u32(0x06054b50), u16(0), u16(0), u16(centrals.length),
      u16(centrals.length), u32(offset - cdStart), u32(cdStart), u16(0));
    chunks.push(new Uint8Array(end));
    var total = chunks.reduce(function (s, c) { return s + c.length; }, 0);
    var out = new Uint8Array(total), pos = 0;
    chunks.forEach(function (c) { out.set(c, pos); pos += c.length; });
    return out;
  }
  function xmlEscape(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function buildXlsx(stats, title) {
    function cellStr(ref, v) {
      return '<c r="' + ref + '" t="inlineStr"><is><t>' + xmlEscape(v) + '</t></is></c>';
    }
    function cellNum(ref, v) { return '<c r="' + ref + '"><v>' + v + '</v></c>'; }
    function colName(i) { return String.fromCharCode(65 + i); } // A..E only
    var rowsXml = [];
    var header = ['Code', 'Color', 'Hex', 'Beads', 'Percent'];
    rowsXml.push('<row r="1">' + header.map(function (h, i) {
      return cellStr(colName(i) + '1', h);
    }).join('') + '</row>');
    stats.rows.forEach(function (r, i) {
      var rn = i + 2;
      var pct = stats.totalBeads ? Number((r.count / stats.totalBeads * 100).toFixed(1)) : 0;
      rowsXml.push('<row r="' + rn + '">' +
        cellStr('A' + rn, r.code) + cellStr('B' + rn, r.name) + cellStr('C' + rn, r.hex) +
        cellNum('D' + rn, r.count) + cellNum('E' + rn, pct) + '</row>');
    });
    var tn = stats.rows.length + 2;
    rowsXml.push('<row r="' + tn + '">' + cellStr('A' + tn, 'TOTAL') +
      cellStr('B' + tn, '') + cellStr('C' + tn, '') +
      cellNum('D' + tn, stats.totalBeads) + cellNum('E' + tn, 100) + '</row>');
    var sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<cols><col min="1" max="1" width="10"/><col min="2" max="2" width="22"/>' +
      '<col min="3" max="3" width="10"/><col min="4" max="4" width="10"/>' +
      '<col min="5" max="5" width="10"/></cols>' +
      '<sheetData>' + rowsXml.join('') + '</sheetData></worksheet>';
    var sheetName = xmlEscape(String(title || 'Bead list').slice(0, 31)) || 'Bead list';
    var files = [
      { name: '[Content_Types].xml', bytes: utf8Bytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>') },
      { name: '_rels/.rels', bytes: utf8Bytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
      { name: 'xl/workbook.xml', bytes: utf8Bytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + sheetName + '" sheetId="1" r:id="rId1"/></sheets></workbook>') },
      { name: 'xl/_rels/workbook.xml.rels', bytes: utf8Bytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>') },
      { name: 'xl/worksheets/sheet1.xml', bytes: utf8Bytes(sheet) }
    ];
    return zipStore(files);
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
    buildSvg: buildSvg,
    buildXlsx: buildXlsx,
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
