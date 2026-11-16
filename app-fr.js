/*
 * Générateur de motifs en perles — logique d’interface du navigateur (version française).
 * All image processing happens locally in the user's browser:
 * sample -> quantize (core.js) -> render -> stats -> PNG / CSV / print.
 *
 * Subscription tiers (core.js TIERS) are enforced here: width is clamped
 * to the plan cap, the palette and the export watermark follow the plan,
 * and CSV / PDF / batch are locked behind their tiers — clicking them
 * without the plan opens an upgrade prompt instead of failing silently.
 * The plan comes from a license key in localStorage; no key = Free.
 */
(function () {
  'use strict';

  var Core = window.BeadCore;
  var CFG = Core.CONFIG;

  /* ---------- plan / license state ---------- */
  /* Downloadable editions (itch.io) set window.BPM_EDITION = 'pro' | 'studio'
   * before this script loads: the bought tier is simply on, no key needed. */
  var EDITION = window.BPM_EDITION || '';
  var licenseKey = '';
  try { licenseKey = localStorage.getItem('bpm.license') || ''; } catch (e) { /* private mode */ }
  var tier = EDITION ? Core.getTier(EDITION)
                     : Core.getTier(Core.validateLicenseKey(licenseKey) || 'free');
  var palette = null; // prepared palette for the active tier

  function rebuildPalette() {
    var colors = Core.paletteForTier(tier.id, window.BEAD_PALETTE, window.BEAD_PALETTE_FULL_EXTRA);
    palette = Core.preparePalette(colors);
  }
  rebuildPalette();

  var els = {
    dropzone: document.getElementById('dropzone'),
    fileInput: document.getElementById('fileInput'),
    sampleBtn: document.getElementById('sampleBtn'),
    batchBtn: document.getElementById('batchBtn'),
    batchInput: document.getElementById('batchInput'),
    batchSection: document.getElementById('batch'),
    batchList: document.getElementById('batchList'),
    settings: document.getElementById('step-settings'),
    result: document.getElementById('step-result'),
    widthRange: document.getElementById('widthRange'),
    widthNumber: document.getElementById('widthNumber'),
    widthLabel: document.getElementById('widthLabel'),
    toggleGrid: document.getElementById('toggleGrid'),
    toggleCodes: document.getElementById('toggleCodes'),
    sizeInfo: document.getElementById('sizeInfo'),
    planNote: document.getElementById('freeNote'),
    preview: document.getElementById('preview'),
    exportBtn: document.getElementById('exportBtn'),
    csvBtn: document.getElementById('csvBtn'),
    pdfBtn: document.getElementById('pdfBtn'),
    svgBtn: document.getElementById('svgBtn'),
    xlsxBtn: document.getElementById('xlsxBtn'),
    editPalette: document.getElementById('editPalette'),
    editErase: document.getElementById('editErase'),
    editUndo: document.getElementById('editUndo'),
    editHint: document.getElementById('editHint'),
    statsSummary: document.getElementById('statsSummary'),
    statsBody: document.querySelector('#statsTable tbody'),
    licenseInput: document.getElementById('licenseInput'),
    licenseApply: document.getElementById('licenseApply'),
    licenseReset: document.getElementById('licenseReset'),
    licenseStatus: document.getElementById('licenseStatus'),
    modal: document.getElementById('upgradeModal'),
    modalText: document.getElementById('upgradeText'),
    modalClose: document.getElementById('upgradeClose'),
    printArea: document.getElementById('printArea')
  };

  var state = { img: null, grid: null, W: 0, H: 0, stats: null };

  /* ---------- per-cell editing (round 2): strings + state ---------- */
  var EDIT_I18N = {
    svgUnlocked: ' Export SVG débloqué.',
    xlsxUnlocked: ' Liste de perles XLSX débloquée.',
    svgSaved: '✓ SVG enregistré — voir vos téléchargements',
    xlsxSaved: '✓ Feuille de calcul enregistrée — voir vos téléchargements',
    svgLabel: 'Export du modèle en SVG',
    xlsxLabel: 'Liste de perles en tableur (XLSX)',
    paintingFmt: 'Peinture avec {code} {name} — touchez les cellules pour appliquer. La gomme efface les cellules.',
    eraseOn: 'Gomme active — touchez les cellules pour les vider.',
    sizeInfoFmt: 'Taille du modèle : {W} × {H} perles · {boards} plaque(s) standard (29×29) · {beads} perles en {colors} couleurs.'
  };
  /* color: palette index to paint, -1 = eraser, -2 = nothing picked yet */
  var EDIT = { color: -2, undo: [], stroke: false, strokeChanged: false };

  /* ---------- tier UI sync ---------- */
  function planSummary(t) {
    var colors = t.paletteSize === 'full' ? 'palette complète de 100 couleurs' : 'palette de base de 64 couleurs';
    var s = 'Offre actuelle : ' + t.name + ' — motifs jusqu’à ' + t.maxWidth +
      ' perles de large · ' + colors + ' · ' +
      (t.watermark ? 'les exports portent un petit filigrane.' : 'exports sans filigrane.');
    if (t.csvExport) s += ' Export CSV débloqué.';
    if (t.svgExport) s += EDIT_I18N.svgUnlocked;
    if (t.xlsxExport) s += EDIT_I18N.xlsxUnlocked;
    if (t.pdfExport) s += ' Planches PDF + lot débloqués.';
    return s;
  }

  function syncTierUi() {
    renderEditPalette();
    els.widthRange.max = tier.maxWidth;
    els.widthNumber.max = tier.maxWidth;
    els.planNote.textContent = planSummary(tier);
    document.querySelectorAll('.price-card').forEach(function (card) {
      var isCurrent = card.getAttribute('data-tier') === tier.id;
      card.classList.toggle('current', isCurrent);
      var btn = card.querySelector('.plan-btn');
      if (btn) {
        btn.textContent = isCurrent ? 'Offre actuelle' : 'Passer à ' + Core.getTier(card.getAttribute('data-tier')).name;
        btn.classList.toggle('disabled', isCurrent);
      }
    });
    if (els.licenseInput && licenseKey) els.licenseInput.value = licenseKey;
    if (EDITION) {
      document.body.classList.add('edition');
      if (els.licenseStatus) els.licenseStatus.textContent =
        'Sous licence : édition ' + tier.name + ' — achat unique, à vous pour toujours. Merci !';
    }
  }

  function setTier(newTierId, key) {
    tier = Core.getTier(newTierId);
    licenseKey = key || '';
    try {
      if (licenseKey) localStorage.setItem('bpm.license', licenseKey);
      else localStorage.removeItem('bpm.license');
    } catch (e) { /* ignore */ }
    rebuildPalette();
    syncTierUi();
    if (state.img) regenerate();
  }

  /* ---------- upgrade prompt (locked features never fail silently) ---------- */
  function showUpgrade(title, text) {
    els.modalText.innerHTML = '<strong>' + title + '</strong><br>' + text;
    els.modal.classList.remove('hidden');
  }
  function lockedPrompt(featureKey, featureLabel) {
    var req = Core.getTier(Core.requiredTierFor(featureKey));
    var text;
    if (EDITION) {
      text = featureLabel + ' est inclus dans l’édition ' + req.name + ' (achat unique sur itch.io). ' +
        'Vous êtes sur l’édition ' + tier.name + '.';
    } else {
      text = featureLabel + ' est inclus dans l’offre ' + req.name + ' ($' + req.priceMonthly.toFixed(2) +
        '/mois). Vous êtes sur l’offre ' + tier.name + '. Abonnez-vous sur Gumroad pour recevoir une clé de licence, ' +
        'puis saisissez-la dans la section Tarifs ci-dessous pour l’activer.';
    }
    showUpgrade('🔒 ' + featureLabel + ' est une fonction ' + req.name, text);
  }
  els.modalClose.addEventListener('click', function () { els.modal.classList.add('hidden'); });
  document.getElementById('upgradeGo').addEventListener('click', function () { els.modal.classList.add('hidden'); });
  els.modal.addEventListener('click', function (e) { if (e.target === els.modal) els.modal.classList.add('hidden'); });

  /* ---------- setup ---------- */
  syncTierUi();
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
  els.csvBtn.addEventListener('click', exportCsv);
  els.pdfBtn.addEventListener('click', exportPdf);
  els.svgBtn.addEventListener('click', exportSvg);
  els.xlsxBtn.addEventListener('click', exportXlsx);
  els.editUndo.addEventListener('click', undoEdit);
  els.editErase.addEventListener('click', function () { selectEditColor(-1); });
  els.preview.addEventListener('pointerdown', onCanvasPointerDown);
  els.preview.addEventListener('pointermove', onCanvasPointerMove);
  window.addEventListener('pointerup', function () {
    if (EDIT.stroke) { EDIT.stroke = false; if (EDIT.strokeChanged) afterEdit(); }
  });
  document.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey) || (e.key !== 'z' && e.key !== 'Z')) return;
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || !state.grid) return;
    e.preventDefault();
    undoEdit();
  });
  els.batchBtn.addEventListener('click', function () {
    if (!tier.batch) { lockedPrompt('batch', 'La génération par lot'); return; }
    els.batchInput.click();
  });
  els.batchInput.addEventListener('change', function () {
    if (els.batchInput.files.length) runBatch(els.batchInput.files);
    els.batchInput.value = '';
  });
  els.licenseApply.addEventListener('click', applyLicense);
  els.licenseReset.addEventListener('click', function () {
    setTier('free', '');
    els.licenseInput.value = '';
    els.licenseStatus.textContent = 'De retour sur l’offre gratuite.';
    els.licenseStatus.className = 'hint';
  });
  document.querySelectorAll('.plan-btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      var target = Core.getTier(btn.closest('.price-card').getAttribute('data-tier'));
      if (target.id === tier.id) { e.preventDefault(); return; }
      /* otherwise the button is a live Gumroad checkout link — let it open */
    });
  });

  function applyLicense() {
    var key = els.licenseInput.value.trim();
    var tierId = Core.validateLicenseKey(key);
    if (tierId) {
      setTier(tierId, key.toUpperCase());
      els.licenseStatus.textContent = '✓ Offre ' + tier.name + ' activée sur cet appareil.';
      els.licenseStatus.className = 'hint status-ok';
    } else {
      els.licenseStatus.textContent = key
        ? 'Cette clé ne semble pas correcte — vérifiez les fautes de frappe et réessayez. Format : BPM-PRO-XXXX-XXXX ou BPM-STU-XXXX-XXXX.'
        : 'Saisissez d’abord une clé de licence — elle ressemble à BPM-PRO-XXXX-XXXX.';
      els.licenseStatus.className = 'hint status-error';
      els.licenseInput.focus();
    }
  }

  /* ---------- image loading ---------- */
  function loadFile(file) {
    if (!/^image\//.test(file.type)) { alert('Veuillez choisir un fichier image.'); return; }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () { setImage(img); };
    img.onerror = function () { alert('Désolé, cette image n’a pas pu être lue. Essayez un PNG ou un JPG.'); };
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
    var w = Core.clampWidth(v, tier.id);
    els.widthRange.value = w;
    els.widthNumber.value = w;
    els.widthLabel.textContent = w;
    return w;
  }

  /* ---------- pattern generation ---------- */
  function quantizeImage(img, W) {
    var H = Math.max(1, Math.round(W * img.naturalHeight / img.naturalWidth));
    var sample = document.createElement('canvas');
    sample.width = W; sample.height = H;
    var sx = sample.getContext('2d');
    sx.imageSmoothingEnabled = true;
    sx.imageSmoothingQuality = 'high';
    sx.drawImage(img, 0, 0, W, H);
    var data = sx.getImageData(0, 0, W, H).data;
    var grid = Core.quantizePixels(data, W, H, palette);
    return { grid: grid, W: W, H: H, stats: Core.buildStats(grid, palette) };
  }

  function regenerate() {
    if (!state.img) return;
    var W = setWidth(els.widthNumber.value);
    var out = quantizeImage(state.img, W);
    state.grid = out.grid; state.W = out.W; state.H = out.H; state.stats = out.stats;
    els.sizeInfo.textContent =
      'Taille du motif : ' + out.W + ' × ' + out.H + ' perles · ' +
      Core.pegboardsNeeded(out.W, out.H) + ' plaque(s) standard (29×29) · ' +
      out.stats.totalBeads.toLocaleString() + ' perles en ' +
      out.stats.colorCount + ' couleurs.';
    drawPreview();
    drawStats();
    resetEditState();
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
      'Total : ' + s.totalBeads.toLocaleString() + ' perles · ' + s.colorCount + ' couleurs. ' +
      'Astuce : achetez environ 10 % de plus de vos couleurs principales pour les erreurs et les pertes de tri.';
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

  /* ---------- per-cell editing + SVG / XLSX exports (round 2) ---------- */
  function renderEditPalette() {
    if (!els.editPalette) return;
    els.editPalette.innerHTML = '';
    palette.forEach(function (c, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'edit-swatch' + (EDIT.color === i ? ' active' : '');
      b.style.background = c.hex;
      b.title = c.code + ' ' + c.name;
      b.setAttribute('aria-label', c.code + ' ' + c.name);
      b.addEventListener('click', function () { selectEditColor(i); });
      els.editPalette.appendChild(b);
    });
  }

  function selectEditColor(i) {
    EDIT.color = i;
    renderEditPalette();
    els.editErase.classList.toggle('active', i === -1);
    if (!els.editHint) return;
    if (i === -1) {
      els.editHint.textContent = EDIT_I18N.eraseOn;
    } else if (i >= 0) {
      els.editHint.textContent = EDIT_I18N.paintingFmt
        .replace('{code}', palette[i].code).replace('{name}', palette[i].name);
    }
  }

  function resetEditState() {
    EDIT.undo = [];
    EDIT.stroke = false;
    EDIT.strokeChanged = false;
    if (els.editUndo) els.editUndo.disabled = true;
  }

  function pushUndo() {
    EDIT.undo.push(new Int32Array(state.grid));
    if (EDIT.undo.length > 60) EDIT.undo.shift();
    els.editUndo.disabled = false;
  }

  function undoEdit() {
    if (!EDIT.undo.length || !state.grid) return;
    state.grid = EDIT.undo.pop();
    els.editUndo.disabled = EDIT.undo.length === 0;
    afterEdit();
  }

  function afterEdit() {
    state.stats = Core.buildStats(state.grid, palette);
    els.sizeInfo.textContent = EDIT_I18N.sizeInfoFmt
      .replace('{W}', state.W).replace('{H}', state.H)
      .replace('{boards}', Core.pegboardsNeeded(state.W, state.H))
      .replace('{beads}', state.stats.totalBeads.toLocaleString())
      .replace('{colors}', state.stats.colorCount);
    drawPreview();
    drawStats();
  }

  function canvasCell(e) {
    var rect = els.preview.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    var x = Math.floor((e.clientX - rect.left) / rect.width * state.W);
    var y = Math.floor((e.clientY - rect.top) / rect.height * state.H);
    if (x < 0 || y < 0 || x >= state.W || y >= state.H) return null;
    return y * state.W + x;
  }

  /* Repaint one cell on the preview canvas (full redraw happens on
   * pointer-up via afterEdit, which also refreshes the bead list). */
  function paintCellVisual(i) {
    var cell = Math.max(6, Math.floor(780 / Math.max(state.W, state.H)));
    var ctx = els.preview.getContext('2d');
    var x = i % state.W, y = Math.floor(i / state.W);
    var idx = state.grid[i];
    ctx.fillStyle = idx < 0 ? '#ffffff' : palette[idx].hex;
    ctx.fillRect(x * cell, y * cell, cell, cell);
    if (idx >= 0 && els.toggleCodes.checked && cell >= 13) {
      var c = palette[idx];
      ctx.fillStyle = textColorFor(c.hex);
      ctx.font = '600 ' + Math.max(7, Math.floor(cell * 0.34)) + 'px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.code, x * cell + cell / 2, y * cell + cell / 2 + 0.5);
    }
    if (els.toggleGrid.checked) {
      ctx.strokeStyle = 'rgba(30,30,30,0.28)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x * cell + 0.5, y * cell + 0.5, cell, cell);
    }
  }

  function paintAt(e) {
    var i = canvasCell(e);
    if (i === null) return;
    if (state.grid[i] === EDIT.color) return;
    state.grid[i] = EDIT.color;
    EDIT.strokeChanged = true;
    paintCellVisual(i);
  }

  function onCanvasPointerDown(e) {
    if (!state.grid || EDIT.color === -2) return;
    if (canvasCell(e) === null) return;
    pushUndo();
    EDIT.stroke = true;
    EDIT.strokeChanged = false;
    paintAt(e);
  }

  function onCanvasPointerMove(e) {
    if (!EDIT.stroke) return;
    paintAt(e);
  }

  function exportSvg() {
    if (!tier.svgExport) { lockedPrompt('svgExport', EDIT_I18N.svgLabel); return; }
    if (!state.grid) return;
    var cell = Math.max(16, Math.floor(2400 / Math.max(state.W, state.H)));
    var svg = Core.buildSvg(state.grid, state.W, state.H, palette, { cell: cell });
    var blob = new Blob([svg], { type: 'image/svg+xml' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'bead-pattern-' + state.W + 'x' + state.H + '.svg';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    flashLabel(els.svgBtn, EDIT_I18N.svgSaved);
  }

  function exportXlsx() {
    if (!tier.xlsxExport) { lockedPrompt('xlsxExport', EDIT_I18N.xlsxLabel); return; }
    if (!state.stats) return;
    var bytes = Core.buildXlsx(state.stats, 'Bead list ' + state.W + 'x' + state.H);
    var blob = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'bead-list-' + state.W + 'x' + state.H + '.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    flashLabel(els.xlsxBtn, EDIT_I18N.xlsxSaved);
  }

  /* ---------- exports ---------- */
  function renderExportCanvas(W, H, grid) {
    var cell = Math.max(16, Math.floor(2400 / Math.max(W, H)));
    var footer = tier.watermark ? 44 : 0;
    var cv = document.createElement('canvas');
    cv.width = W * cell;
    cv.height = H * cell + footer;
    var ctx = cv.getContext('2d');
    paintPattern(ctx, W, H, grid, cell, true, true);
    if (tier.watermark) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, H * cell, cv.width, footer);
      ctx.fillStyle = '#6b7280';
      ctx.font = '500 20px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(CFG.WATERMARK_TEXT, cv.width / 2, H * cell + footer / 2);
    }
    return cv;
  }

  function downloadCanvas(cv, filename) {
    cv.toBlob(function (blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    }, 'image/png');
  }

  /* Brief "it worked" feedback on a button after a download starts. */
  function flashLabel(btn, text) {
    if (btn.dataset.busy) return;
    var orig = btn.textContent;
    btn.dataset.busy = '1';
    btn.textContent = text;
    setTimeout(function () { btn.textContent = orig; delete btn.dataset.busy; }, 2400);
  }

  function exportPng() {
    if (!state.grid) return;
    downloadCanvas(renderExportCanvas(state.W, state.H, state.grid),
      'bead-pattern-' + state.W + 'x' + state.H + '.png');
    flashLabel(els.exportBtn, '✓ Enregistré — vérifiez vos téléchargements');
  }

  function exportCsv() {
    if (!tier.csvExport) { lockedPrompt('csvExport', 'L’export de la liste de perles en CSV'); return; }
    if (!state.stats) return;
    var blob = new Blob([Core.buildCsv(state.stats)], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'bead-list-' + state.W + 'x' + state.H + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    flashLabel(els.csvBtn, '✓ CSV enregistré — vérifiez vos téléchargements');
  }

  /* Studio: printable board sheets — one page per 29×29 pegboard section,
   * with absolute row/column coordinates. Use the browser's
   * "Save as PDF" in the print dialog to get a paginated PDF. */
  function exportPdf() {
    if (!tier.pdfExport) { lockedPrompt('pdfExport', 'Les planches PDF'); return; }
    if (!state.grid) return;
    var per = CFG.PEGBOARD_SIZE, W = state.W, H = state.H, grid = state.grid;
    els.printArea.innerHTML = '';
    for (var by = 0; by < H; by += per) {
      for (var bx = 0; bx < W; bx += per) {
        var w = Math.min(per, W - bx), h = Math.min(per, H - by);
        var page = document.createElement('div');
        page.className = 'board-page';
        var head = document.createElement('h3');
        head.textContent = 'Plaque ' + (bx / per + 1) + ' × ' + (by / per + 1) +
          ' — colonnes ' + (bx + 1) + '–' + (bx + w) + ', rangées ' + (by + 1) + '–' + (by + h) +
          ' sur ' + W + ' × ' + H;
        page.appendChild(head);
        page.appendChild(boardCanvas(grid, W, bx, by, w, h));
        els.printArea.appendChild(page);
      }
    }
    window.print();
  }

  function boardCanvas(grid, W, x0, y0, w, h) {
    var cell = 18, left = 30, top = 18;
    var cv = document.createElement('canvas');
    cv.width = left + w * cell + 2;
    cv.height = top + h * cell + 2;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.font = '600 9px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var x = 0; x < w; x++) {
      ctx.fillStyle = '#333';
      ctx.fillText(String(x0 + x + 1), left + x * cell + cell / 2, top / 2 + 1);
    }
    for (var y = 0; y < h; y++) {
      ctx.fillStyle = '#333';
      ctx.fillText(String(y0 + y + 1), left / 2, top + y * cell + cell / 2);
      for (var xx = 0; xx < w; xx++) {
        var idx = grid[(y0 + y) * W + (x0 + xx)];
        if (idx < 0) continue;
        var c = palette[idx];
        ctx.fillStyle = c.hex;
        ctx.fillRect(left + xx * cell, top + y * cell, cell, cell);
        ctx.fillStyle = textColorFor(c.hex);
        ctx.font = '600 ' + Math.max(7, Math.floor(cell * 0.34)) + 'px Arial, sans-serif';
        ctx.fillText(c.code, left + xx * cell + cell / 2, top + y * cell + cell / 2 + 0.5);
        ctx.font = '600 9px Arial, sans-serif';
      }
    }
    ctx.strokeStyle = 'rgba(30,30,30,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(left + 0.5, top + 0.5, w * cell, h * cell);
    return cv;
  }

  /* ---------- batch (Studio) ---------- */
  function runBatch(files) {
    els.batchSection.classList.remove('hidden');
    els.batchList.innerHTML = '';
    var W = setWidth(els.widthNumber.value);
    Array.prototype.forEach.call(files, function (file) {
      if (!/^image\//.test(file.type)) return;
      var item = document.createElement('div');
      item.className = 'batch-item';
      item.innerHTML = '<p class="hint">Traitement de ' + file.name + '…</p>';
      els.batchList.appendChild(item);
      var img = new Image();
      img.onload = function () {
        var out = quantizeImage(img, W);
        var cell = Math.max(6, Math.floor(300 / Math.max(out.W, out.H)));
        var cv = document.createElement('canvas');
        cv.width = out.W * cell; cv.height = out.H * cell;
        paintPattern(cv.getContext('2d'), out.W, out.H, out.grid, cell, true, false);
        item.innerHTML = '';
        item.appendChild(cv);
        var info = document.createElement('p');
        info.className = 'hint';
        info.textContent = file.name + ' — ' + out.W + ' × ' + out.H + ' perles · ' +
          out.stats.colorCount + ' couleurs · ' + out.stats.totalBeads.toLocaleString() + ' perles';
        item.appendChild(info);
        var btn = document.createElement('button');
        btn.className = 'btn';
        btn.type = 'button';
        btn.textContent = '⬇ Télécharger le PNG';
        btn.addEventListener('click', function () {
          downloadCanvas(renderExportCanvas(out.W, out.H, out.grid),
            'bead-pattern-' + out.W + 'x' + out.H + '.png');
          flashLabel(btn, '✓ Enregistré — vérifiez vos téléchargements');
        });
        item.appendChild(btn);
      };
      img.onerror = function () { item.innerHTML = '<p class="hint">Impossible de lire ' + file.name + '.</p>'; };
      img.src = URL.createObjectURL(file);
    });
    els.batchSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- PWA ---------- */
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline support is a bonus */ });
    });
  }
})();
