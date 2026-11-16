/*
 * Bead Pattern Maker — browser glue.
 * All image processing happens locally in the user's browser:
 * sample -> quantize (core.js) -> render -> stats -> PNG export.
 */
(function () {
  'use strict';

  var Core = window.BeadCore;
  var CFG = Core.CONFIG;
  var palette = Core.preparePalette(window.BEAD_PALETTE);
  var UNLOCKED = CFG.UNLOCKED;
  var MAXW = Core.maxWidth(UNLOCKED);

  var els = {
    dropzone: document.getElementById('dropzone'),
    fileInput: document.getElementById('fileInput'),
    sampleBtn: document.getElementById('sampleBtn'),
    settings: document.getElementById('step-settings'),
    result: document.getElementById('step-result'),
    widthRange: document.getElementById('widthRange'),
    widthNumber: document.getElementById('widthNumber'),
    widthLabel: document.getElementById('widthLabel'),
    toggleGrid: document.getElementById('toggleGrid'),
    toggleCodes: document.getElementById('toggleCodes'),
    sizeInfo: document.getElementById('sizeInfo'),
    freeNote: document.getElementById('freeNote'),
    preview: document.getElementById('preview'),
    exportBtn: document.getElementById('exportBtn'),
    statsSummary: document.getElementById('statsSummary'),
    statsBody: document.querySelector('#statsTable tbody')
  };

  var state = { img: null, grid: null, W: 0, H: 0, stats: null };

  /* ---------- setup ---------- */
  els.widthRange.max = MAXW;
  els.widthNumber.max = MAXW;
  els.freeNote.textContent = UNLOCKED
    ? 'Unlocked: patterns up to ' + MAXW + ' beads wide, watermark-free exports.'
    : 'Free version: up to ' + CFG.FREE_MAX_WIDTH + ' beads wide. Exports carry a small "'
      + CFG.WATERMARK_TEXT + '" watermark.';

  els.dropzone.addEventListener('click', function () { els.fileInput.click(); });
  els.dropzone.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); els.fileInput.click(); }
  });
  els.fileInput.addEventListener('change', function () {
    if (els.fileInput.files[0]) loadFile(els.fileInput.files[0]);
  });
  ['dragover', 'dragenter'].forEach(function (ev) {
    els.dropzone.addEventListener(ev, function (e) {
      e.preventDefault(); els.dropzone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    els.dropzone.addEventListener(ev, function (e) {
      e.preventDefault(); els.dropzone.classList.remove('dragover');
    });
  });
  els.dropzone.addEventListener('drop', function (e) {
    var f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadFile(f);
  });
  els.sampleBtn.addEventListener('click', loadSample);
  [els.widthRange, els.widthNumber].forEach(function (el) {
    el.addEventListener('input', function () { setWidth(el.value); regenerate(); });
  });
  els.toggleGrid.addEventListener('change', drawPreview);
  els.toggleCodes.addEventListener('change', drawPreview);
  els.exportBtn.addEventListener('click', exportPng);

  /* ---------- image loading ---------- */
  function loadFile(file) {
    if (!/^image\//.test(file.type)) { alert('Please choose an image file.'); return; }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () { setImage(img); };
    img.onerror = function () { alert('Sorry, that image could not be read. Try a PNG or JPG.'); };
    img.src = url;
  }

  function loadSample() {
    // A cheerful rainbow heart drawn on a canvas — no file needed to try the tool.
    var c = document.createElement('canvas');
    c.width = 240; c.height = 240;
    var x = c.getContext('2d');
    x.clearRect(0, 0, 240, 240);
    var bands = ['#BE1E2D', '#EE6A24', '#F6C90E', '#1E9E4A', '#2456A6', '#6E4B9E'];
    x.save();
    x.beginPath();
    x.moveTo(120, 215);
    x.bezierCurveTo(20, 140, 28, 40, 78, 40);
    x.bezierCurveTo(105, 40, 118, 58, 120, 72);
    x.bezierCurveTo(122, 58, 135, 40, 162, 40);
    x.bezierCurveTo(212, 40, 220, 140, 120, 215);
    x.closePath();
    x.clip();
    bands.forEach(function (color, i) {
      x.fillStyle = color;
      x.fillRect(0, i * 40, 240, 40);
    });
    x.restore();
    var img = new Image();
    img.onload = function () { setImage(img); };
    img.src = c.toDataURL('image/png');
  }

  function setImage(img) {
    state.img = img;
    els.settings.classList.remove('hidden');
    els.result.classList.remove('hidden');
    regenerate();
    els.settings.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function setWidth(v) {
    var w = Core.clampWidth(v, UNLOCKED);
    els.widthRange.value = w;
    els.widthNumber.value = w;
    els.widthLabel.textContent = w;
    return w;
  }

  /* ---------- pattern generation ---------- */
  function regenerate() {
    if (!state.img) return;
    var W = setWidth(els.widthNumber.value);
    var img = state.img;
    var H = Math.max(1, Math.round(W * img.naturalHeight / img.naturalWidth));

    var sample = document.createElement('canvas');
    sample.width = W; sample.height = H;
    var sx = sample.getContext('2d');
    sx.imageSmoothingEnabled = true;
    sx.imageSmoothingQuality = 'high';
    sx.drawImage(img, 0, 0, W, H);
    var data = sx.getImageData(0, 0, W, H).data;

    state.grid = Core.quantizePixels(data, W, H, palette);
    state.W = W; state.H = H;
    state.stats = Core.buildStats(state.grid, palette);

    els.sizeInfo.textContent =
      'Pattern size: ' + W + ' × ' + H + ' beads · ' +
      Core.pegboardsNeeded(W, H) + ' standard pegboard(s) (29×29) · ' +
      state.stats.totalBeads.toLocaleString() + ' beads in ' +
      state.stats.colorCount + ' colors.';
    drawPreview();
    drawStats();
  }

  function textColorFor(hex) {
    var rgb = Core.hexToRgb(hex);
    var lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    return lum > 0.62 ? '#22252a' : '#ffffff';
  }

  function paintPattern(ctx, W, H, grid, cell, showGrid, showCodes) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W * cell, H * cell);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var idx = grid[y * W + x];
        if (idx < 0) continue;
        var c = palette[idx];
        ctx.fillStyle = c.hex;
        ctx.fillRect(x * cell, y * cell, cell, cell);
        if (showCodes && cell >= 13) {
          ctx.fillStyle = textColorFor(c.hex);
          ctx.font = '600 ' + Math.max(7, Math.floor(cell * 0.34)) + 'px Arial, sans-serif';
          ctx.fillText(c.code, x * cell + cell / 2, y * cell + cell / 2 + 0.5);
        }
      }
    }
    if (showGrid) {
      ctx.strokeStyle = 'rgba(30,30,30,0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var gx = 0; gx <= W; gx++) {
        var px = gx * cell + 0.5;
        // bold line every 5 cells, like real pegboard counting guides
        ctx.moveTo(px, 0); ctx.lineTo(px, H * cell);
      }
      for (var gy = 0; gy <= H; gy++) {
        var py = gy * cell + 0.5;
        ctx.moveTo(0, py); ctx.lineTo(W * cell, py);
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(30,30,30,0.55)';
      ctx.beginPath();
      for (var bx = 0; bx <= W; bx += 5) {
        var bpx = bx * cell + 0.5;
        ctx.moveTo(bpx, 0); ctx.lineTo(bpx, H * cell);
      }
      for (var by = 0; by <= H; by += 5) {
        var bpy = by * cell + 0.5;
        ctx.moveTo(0, bpy); ctx.lineTo(W * cell, bpy);
      }
      ctx.stroke();
    }
  }

  function drawPreview() {
    if (!state.grid) return;
    var maxDim = 780;
    var cell = Math.max(6, Math.floor(maxDim / Math.max(state.W, state.H)));
    var cv = els.preview;
    cv.width = state.W * cell;
    cv.height = state.H * cell;
    paintPattern(cv.getContext('2d'), state.W, state.H, state.grid, cell,
      els.toggleGrid.checked, els.toggleCodes.checked);
  }

  function drawStats() {
    var s = state.stats;
    els.statsSummary.textContent =
      'Total: ' + s.totalBeads.toLocaleString() + ' beads · ' + s.colorCount + ' colors. ' +
      'Tip: buy about 10% extra of your top colors for mistakes and sorting losses.';
    els.statsBody.innerHTML = '';
    s.rows.forEach(function (row) {
      var tr = document.createElement('tr');
      var pct = s.totalBeads ? (row.count / s.totalBeads * 100).toFixed(1) + '%' : '—';
      tr.innerHTML =
        '<td><span class="swatch" style="background:' + row.hex + '"></span></td>' +
        '<td>' + row.code + '</td><td>' + row.name + '</td>' +
        '<td class="num">' + row.count.toLocaleString() + '</td>' +
        '<td class="num">' + pct + '</td>';
      els.statsBody.appendChild(tr);
    });
  }

  /* ---------- export ---------- */
  function exportPng() {
    if (!state.grid) return;
    var W = state.W, H = state.H;
    var cell = Math.max(16, Math.floor(2400 / Math.max(W, H)));
    var footer = UNLOCKED ? 0 : 44;
    var cv = document.createElement('canvas');
    cv.width = W * cell;
    cv.height = H * cell + footer;
    var ctx = cv.getContext('2d');
    paintPattern(ctx, W, H, state.grid, cell, true, true);
    if (!UNLOCKED) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, H * cell, cv.width, footer);
      ctx.fillStyle = '#6b7280';
      ctx.font = '500 20px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(CFG.WATERMARK_TEXT, cv.width / 2, H * cell + footer / 2);
    }
    cv.toBlob(function (blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'bead-pattern-' + W + 'x' + H + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    }, 'image/png');
  }

  /* ---------- PWA ---------- */
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline support is a bonus */ });
    });
  }
})();
