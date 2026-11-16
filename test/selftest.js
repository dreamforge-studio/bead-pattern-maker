/*
 * Bead Pattern Maker — self-test (Node, no browser needed).
 * Exercises the exact core modules the web app ships:
 *   palette.js (colors) + core.js (sampling math / quantize / stats / limits)
 * Run: node test/selftest.js   (exit code 0 = all pass)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PALETTE = require(path.join(ROOT, 'palette.js'));
const Core = require(path.join(ROOT, 'core.js'));

let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

/* ---------- 1. Palette integrity ---------- */
console.log('[palette]');
check('palette has >= 48 colors', PALETTE.length >= 48, 'got ' + PALETTE.length);
check('palette has exactly 64 colors', PALETTE.length === 64, 'got ' + PALETTE.length);
const codes = new Set(PALETTE.map(c => c.code));
check('all color codes unique', codes.size === PALETTE.length);
check('every entry has code + name + valid hex',
  PALETTE.every(c => c.code && c.name && /^#[0-9A-Fa-f]{6}$/.test(c.hex)));

/* ---------- 2. Nearest-color matching (Lab) ---------- */
console.log('[nearest color]');
const prepared = Core.preparePalette(PALETTE);
const nameOf = (r, g, b) => PALETTE[Core.nearestColorIndex(r, g, b, prepared)].name;
check('pure white -> White', nameOf(250, 250, 250) === 'White', nameOf(250, 250, 250));
check('pure black -> Black', nameOf(5, 5, 5) === 'Black', nameOf(5, 5, 5));
check('strong red -> Red', nameOf(196, 32, 40) === 'Red', nameOf(196, 32, 40));
check('grass green -> a green', /green/i.test(nameOf(40, 150, 60)), nameOf(40, 150, 60));
const skin = nameOf(240, 190, 145);
check('skin tone -> Flesh/Peach family', /flesh|peach/i.test(skin), skin);

/* ---------- 3. Quantize + stats on a known 4x2 image ---------- */
console.log('[quantize + stats]');
// row 1: white, black, red, transparent | row 2: red, red, white, black
const px = new Uint8ClampedArray([
  250, 250, 250, 255,   5, 5, 5, 255,       196, 32, 40, 255,   0, 0, 0, 0,
  196, 32, 40, 255,     196, 32, 40, 255,   250, 250, 250, 255, 5, 5, 5, 255
]);
const grid = Core.quantizePixels(px, 4, 2, prepared);
check('grid has 8 cells', grid.length === 8);
check('transparent pixel -> empty cell (-1)', grid[3] === -1, 'got ' + grid[3]);
check('all opaque cells hold valid palette indices',
  Array.from(grid).every((v, i) => i === 3 ? v === -1 : (v >= 0 && v < PALETTE.length)));
const stats = Core.buildStats(grid, prepared);
check('stats total beads = 7 (8 cells - 1 transparent)', stats.totalBeads === 7, 'got ' + stats.totalBeads);
check('stats color count = 3', stats.colorCount === 3, 'got ' + stats.colorCount);
const redRow = stats.rows.find(r => r.name === 'Red');
check('Red count = 3', !!redRow && redRow.count === 3, redRow && String(redRow.count));
check('stats rows sorted by count desc',
  stats.rows.every((r, i, a) => i === 0 || a[i - 1].count >= r.count));
check('stats counts sum to total', stats.rows.reduce((s, r) => s + r.count, 0) === stats.totalBeads);

/* ---------- 4. Full chain: synthetic photo -> downsample -> quantize ---------- */
console.log('[full chain: sample -> quantize -> stats]');
// Synthetic 96x96 "photo": left half sky blue, right half grass green, opaque.
const SW = 96, SH = 96;
const photo = new Uint8ClampedArray(SW * SH * 4);
for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
  const o = (y * SW + x) * 4;
  const c = x < SW / 2 ? [120, 180, 225] : [45, 150, 65];
  photo[o] = c[0]; photo[o + 1] = c[1]; photo[o + 2] = c[2]; photo[o + 3] = 255;
}
// Emulate canvas drawImage sampling: average 2x2 blocks down to 48x48.
const TW = 48, TH = 48, f = SW / TW;
const sampled = new Uint8ClampedArray(TW * TH * 4);
for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
  let r = 0, g = 0, b = 0, a = 0;
  for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) {
    const o = ((y * f + dy) * SW + (x * f + dx)) * 4;
    r += photo[o]; g += photo[o + 1]; b += photo[o + 2]; a += photo[o + 3];
  }
  const n = f * f, o2 = (y * TW + x) * 4;
  sampled[o2] = r / n; sampled[o2 + 1] = g / n; sampled[o2 + 2] = b / n; sampled[o2 + 3] = a / n;
}
const grid2 = Core.quantizePixels(sampled, TW, TH, prepared);
const stats2 = Core.buildStats(grid2, prepared);
check('48x48 grid produced', grid2.length === 48 * 48);
check('all 2304 cells filled (opaque photo)', stats2.totalBeads === 2304, 'got ' + stats2.totalBeads);
check('exactly 2 colors used (blue half + green half)', stats2.colorCount === 2, 'got ' + stats2.colorCount);
check('each color covers half the pattern (1152)',
  stats2.rows.every(r => r.count === 1152), JSON.stringify(stats2.rows.map(r => r.count)));
check('pegboardsNeeded(48,48) = 4', Core.pegboardsNeeded(48, 48) === 4);

/* ---------- 5. Subscription tiers (Free / Pro / Studio) ---------- */
console.log('[tiers]');
check('unknown tier falls back to Free',
  Core.getTier('nope').id === 'free' && Core.getTier().id === 'free');
check('tier width caps: free 48 / pro 120 / studio 200',
  Core.maxWidth('free') === 48 && Core.maxWidth('pro') === 120 && Core.maxWidth('studio') === 200);
check('clampWidth(100, free) = 48 (clamped)', Core.clampWidth(100, 'free') === 48);
check('clampWidth(100, pro) = 100 (within cap)', Core.clampWidth(100, 'pro') === 100);
check('clampWidth(150, pro) = 120 (clamped)', Core.clampWidth(150, 'pro') === 120);
check('clampWidth(999, studio) = 200 (clamped)', Core.clampWidth(999, 'studio') === 200);
check('watermark: Free only',
  Core.TIERS.free.watermark === true && Core.TIERS.pro.watermark === false && Core.TIERS.studio.watermark === false);
check('watermark text is exact',
  Core.CONFIG.WATERMARK_TEXT === 'Made with Bead Pattern Maker');
check('csv gate: Free locked, Pro+ unlocked',
  !Core.TIERS.free.csvExport && Core.TIERS.pro.csvExport && Core.TIERS.studio.csvExport);
check('pdf gate: Studio only',
  !Core.TIERS.free.pdfExport && !Core.TIERS.pro.pdfExport && Core.TIERS.studio.pdfExport);
check('batch gate: Studio only',
  !Core.TIERS.free.batch && !Core.TIERS.pro.batch && Core.TIERS.studio.batch);
check('requiredTierFor: csv->pro, pdf->studio, batch->studio',
  Core.requiredTierFor('csvExport') === 'pro' &&
  Core.requiredTierFor('pdfExport') === 'studio' &&
  Core.requiredTierFor('batch') === 'studio');
check('tier prices: pro 4.99 / studio 9.99',
  Core.TIERS.pro.priceMonthly === 4.99 && Core.TIERS.studio.priceMonthly === 9.99);

/* ---------- 5b. License keys (local placeholder rule) ---------- */
console.log('[license keys]');
const proKey = Core.makeLicenseKey('pro', 'DEMO', 'KEY');
const studioKey = Core.makeLicenseKey('studio', 'DEMO', 'KEY');
check('generated Pro key validates to pro', Core.validateLicenseKey(proKey) === 'pro', proKey);
check('generated Studio key validates to studio', Core.validateLicenseKey(studioKey) === 'studio', studioKey);
check('lowercase key still validates', Core.validateLicenseKey(proKey.toLowerCase()) === 'pro');
const tampered = proKey.slice(0, -1) + (proKey.endsWith('0') ? '1' : '0');
check('tampered checksum is rejected', Core.validateLicenseKey(tampered) === null, tampered);
check('garbage / empty keys rejected',
  Core.validateLicenseKey('hello') === null &&
  Core.validateLicenseKey('') === null &&
  Core.validateLicenseKey(null) === null);

/* ---------- 5c. Tier palettes + CSV export ---------- */
console.log('[tier palettes + csv]');
const EXTRA = PALETTE.FULL_EXTRA || [];
check('full-palette extension exists (>= 24 colors)', EXTRA.length >= 24, 'got ' + EXTRA.length);
check('free palette = 64 basic colors', Core.paletteForTier('free', PALETTE, EXTRA).length === 64);
const fullColors = Core.paletteForTier('pro', PALETTE, EXTRA);
check('pro palette = basic + extra', fullColors.length === 64 + EXTRA.length, 'got ' + fullColors.length);
check('full palette codes unique', new Set(fullColors.map(c => c.code)).size === fullColors.length);
const csv = Core.buildCsv(stats);
check('csv lines = header + colors + total', csv.trim().split('\n').length === stats.rows.length + 2);
check('csv header + known row present',
  csv.startsWith('Code,Color,Hex,Beads,Percent') && csv.includes('H05,Red,'));

/* ---------- 6. Shipped files / PWA pieces ---------- */
console.log('[files]');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
check('index.html loads palette.js, core.js, app.js in order',
  html.indexOf('palette.js') > -1 &&
  html.indexOf('palette.js') < html.indexOf('core.js') &&
  html.indexOf('core.js') < html.indexOf('app.js'));
check('index.html links the manifest', html.includes('manifest.webmanifest'));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
check('manifest parses, has name + 3 icons',
  !!manifest.name && Array.isArray(manifest.icons) && manifest.icons.length === 3);
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
check('sw.js caches the app shell', sw.includes('index.html') && sw.includes('core.js'));
function pngSize(p) {
  const buf = fs.readFileSync(p);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), png: buf.slice(1, 4).toString() === 'PNG' };
}
const i192 = pngSize(path.join(ROOT, 'icons/icon-192.png'));
const i512 = pngSize(path.join(ROOT, 'icons/icon-512.png'));
check('icon-192.png is a real 192x192 PNG', i192.png && i192.w === 192 && i192.h === 192);
check('icon-512.png is a real 512x512 PNG', i512.png && i512.w === 512 && i512.h === 512);
const appJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
check('app.js wires export + watermark + service worker',
  appJs.includes('exportPng') && appJs.includes('WATERMARK_TEXT') && appJs.includes('serviceWorker'));
check('app.js wires tiers: license, csv/pdf/batch gates, upgrade prompt',
  appJs.includes('validateLicenseKey') && appJs.includes('exportCsv') &&
  appJs.includes('exportPdf') && appJs.includes('runBatch') && appJs.includes('lockedPrompt'));
check('index.html has pricing tiers + license input',
  html.includes('id="pricing"') && html.includes('Most Popular') && html.includes('id="licenseInput"'));
check('index.html has hero compare slider + guide + size guide + faq',
  html.includes('id="heroCompare"') && html.includes('id="cmpRange"') &&
  html.includes('id="guide"') && html.includes('id="size-guide"') && html.includes('id="faq"'));
check('guide images referenced in html',
  ['guide-photo-good-vs-busy.png', 'guide-widths.png', 'guide-read-chart.png',
   'guide-shopping-list.png', 'guide-print.png'].every(f => html.includes('examples/' + f)));
['guide-photo-good-vs-busy.png', 'guide-widths.png', 'guide-read-chart.png',
 'guide-shopping-list.png', 'guide-print.png'].forEach(f => {
  const p = path.join(ROOT, 'examples', f);
  check('examples/' + f + ' exists and is a PNG',
    fs.existsSync(p) && fs.readFileSync(p).slice(1, 4).toString() === 'PNG');
});
check('section order: examples < size-guide < guide < features < pricing < faq',
  html.indexOf('id="examples"') > -1 &&
  html.indexOf('id="examples"') < html.indexOf('id="size-guide"') &&
  html.indexOf('id="size-guide"') < html.indexOf('id="guide"') &&
  html.indexOf('id="guide"') < html.indexOf('id="features"') &&
  html.indexOf('id="features"') < html.indexOf('id="pricing"') &&
  html.indexOf('id="pricing"') < html.indexOf('id="faq"'));

/* ---------- 7. Sharing meta / footer / polish (2026-11-16 self-audit) ---------- */
console.log('[sharing + polish]');
check('index.html has Open Graph tags with the live URL + real example image',
  html.includes('property="og:title"') &&
  html.includes('property="og:url" content="https://dreamforge-studio.github.io/bead-pattern-maker/"') &&
  html.includes('property="og:image" content="https://dreamforge-studio.github.io/bead-pattern-maker/examples/cat-pattern.png"'));
check('index.html has Twitter card + canonical',
  html.includes('name="twitter:card" content="summary_large_image"') &&
  html.includes('rel="canonical" href="https://dreamforge-studio.github.io/bead-pattern-maker/"'));
check('footer has year + product name + section nav',
  html.includes('© 2026 Bead Pattern Maker') && html.includes('class="footer-nav"') &&
  html.includes('href="#size-guide"') && html.includes('href="#faq"'));
['index.html', 'app.js', 'styles.css', 'README.md'].forEach(f => {
  const txt = fs.readFileSync(path.join(ROOT, f), 'utf8');
  check(f + ' has no old GitHub username remnant', !txt.includes('a13259605262'));
});
check('app.js gives license feedback styling + export download feedback',
  appJs.includes('status-error') && appJs.includes('status-ok') && appJs.includes('flashLabel'));
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
check('styles.css: 44px tap targets + scrollable size table + slider touch fix',
  css.includes('min-height: 44px') && css.includes('.size-table { min-width: 540px; }') &&
  css.includes('touch-action: none'));
fs.readdirSync(path.join(ROOT, 'examples')).filter(f => f.endsWith('.png')).forEach(f => {
  const size = fs.statSync(path.join(ROOT, 'examples', f)).size;
  check('examples/' + f + ' stays lean (<= 30000 B)', size <= 30000, size + ' B');
});

/* ---------- 8. Round 2: SVG / XLSX exports, cell edit, guide + platform files ---------- */
console.log('[round 2: svg / xlsx / edit / guide]');
check('svg gate: Free locked, Pro+ unlocked',
  !Core.TIERS.free.svgExport && Core.TIERS.pro.svgExport && Core.TIERS.studio.svgExport);
check('xlsx gate: Free locked, Pro+ unlocked',
  !Core.TIERS.free.xlsxExport && Core.TIERS.pro.xlsxExport && Core.TIERS.studio.xlsxExport);
check('cell edit: open on every tier',
  Core.TIERS.free.cellEdit && Core.TIERS.pro.cellEdit && Core.TIERS.studio.cellEdit);
check('requiredTierFor: svg->pro, xlsx->pro',
  Core.requiredTierFor('svgExport') === 'pro' && Core.requiredTierFor('xlsxExport') === 'pro');
const svg = Core.buildSvg(grid, 4, 2, prepared, { cell: 20 });
check('buildSvg: svg root + one rect per filled cell + codes',
  svg.startsWith('<svg') && svg.includes('</svg>') &&
  (svg.match(/<rect/g) || []).length === 8 && // background + 7 filled cells
  (svg.match(/<text/g) || []).length === 7);
check('buildSvg: empty cells skipped, palette hex used',
  svg.includes('fill="' + PALETTE[grid[0]].hex + '"'));
const xlsx = Core.buildXlsx(stats, 'Bead list 4x2');
check('buildXlsx: returns PK zip bytes',
  xlsx instanceof Uint8Array && xlsx[0] === 0x50 && xlsx[1] === 0x4B && xlsx.length > 1000);
const xlsxText = Buffer.from(xlsx).toString('latin1');
check('buildXlsx: contains workbook + sheet with TOTAL row',
  xlsxText.includes('xl/workbook.xml') && xlsxText.includes('xl/worksheets/sheet1.xml') &&
  xlsxText.includes('TOTAL'));
['app.js', 'app-zh.js', 'app-ja.js', 'app-ko.js', 'app-fr.js'].forEach(f => {
  const a = fs.readFileSync(path.join(ROOT, f), 'utf8');
  check(f + ' wires svg/xlsx exports + cell editing + undo',
    a.includes('exportSvg') && a.includes('exportXlsx') &&
    a.includes('selectEditColor') && a.includes('undoEdit') && a.includes('EDIT_I18N'));
});
['guide.html', 'guide-zh.html', 'guide-ja.html', 'guide-ko.html', 'guide-fr.html',
 'works.html', 'works-zh.html', 'works-ja.html', 'works-ko.html', 'works-fr.html',
 '404.html', 'sitemap.xml', 'robots.txt'].forEach(f => {
  check(f + ' exists', fs.existsSync(path.join(ROOT, f)));
});
const guideHtml = fs.readFileSync(path.join(ROOT, 'guide.html'), 'utf8');
check('guide.html: steps + formats table + faq + canonical on the real domain',
  guideHtml.includes('id="s6"') && guideHtml.includes('id="s7"') && guideHtml.includes('id="faq"') &&
  guideHtml.includes('rel="canonical" href="https://dreamforgestudio.xyz/guide.html"'));
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
check('sitemap lists all 22 pages',
  ['index.html', 'studio.html', 'guide.html', 'privacy.html', 'terms.html',
   'index-zh.html', 'studio-zh.html', 'guide-zh.html',
   'index-ja.html', 'studio-ja.html', 'guide-ja.html',
   'index-ko.html', 'studio-ko.html', 'guide-ko.html',
   'index-fr.html', 'studio-fr.html', 'guide-fr.html',
   'works.html', 'works-zh.html', 'works-ja.html', 'works-ko.html', 'works-fr.html']
    .every(f => sitemap.includes('https://dreamforgestudio.xyz/' + f)));


const worksHtml = fs.readFileSync(path.join(ROOT, 'works.html'), 'utf8');
check('works.html: filter chips + 20 cards + 14 videos + canonical on real domain',
  worksHtml.includes('id="worksFilter"') && worksHtml.includes('data-filter="corporate"') &&
  worksHtml.includes('data-filter="ads"') && worksHtml.includes('data-filter="design"') &&
  (worksHtml.match(/<article class="work"/g) || []).length === 20 &&
  (worksHtml.match(/<video /g) || []).length === 14 &&
  worksHtml.includes('rel="canonical" href="https://dreamforgestudio.xyz/works.html"'));
['works.html', 'works-zh.html', 'works-ja.html', 'works-ko.html', 'works-fr.html'].forEach(f => {
  const w = fs.readFileSync(path.join(ROOT, f), 'utf8');
  check(f + ': 20 cards + 14 videos + filter js',
    (w.match(/<article class="work"/g) || []).length === 20 &&
    (w.match(/<video /g) || []).length === 14 &&
    w.includes("querySelectorAll('#worksFilter .chip')"));
});
['works.html', 'works-zh.html', 'works-ja.html', 'works-ko.html', 'works-fr.html'].forEach(f => {
  check(f + ' video + poster files exist',
    ['xinglan-enterprise.mp4', 'the-last-train.mp4', 'coldopen-v13.mp4', 'pawjoy-pet.mp4',
     'mornclean-daily.mp4', 'soundclear-tvc.mp4', 'blood-orange-15s.mp4', 'blood-orange-30s.mp4',
     'thermos-cup-15s.mp4', 'thermos-cup-30s.mp4', 'qinling-map.mp4', 'commentary-1140.mp4',
     'mg-yiwangtongban.mp4', 'frame-cat-butterfly.mp4'].every(v => fs.existsSync(path.join(ROOT, 'works', v))) &&
    ['poster-xinglan.jpg', 'poster-lasttrain.jpg', 'poster-coldopen.jpg', 'poster-pet.jpg',
     'poster-daily.jpg', 'poster-tvc.jpg', 'poster-bloodorange-15s.jpg', 'poster-bloodorange-30s.jpg',
     'poster-thermos-15s.jpg', 'poster-thermos-30s.jpg', 'poster-map.jpg', 'poster-commentary.jpg',
     'poster-mg.jpg', 'poster-frame.jpg'].every(v => fs.existsSync(path.join(ROOT, 'works', v))));
});
const sitemap2 = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
check('sitemap lists all 5 works pages',
  ['works.html', 'works-zh.html', 'works-ja.html', 'works-ko.html', 'works-fr.html']
    .every(f => sitemap2.includes('https://dreamforgestudio.xyz/' + f)));

console.log('\nResult: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
