# Bead Pattern Maker (PWA)

Free fuse-bead (Perler / Hama) pattern generator. Pure front-end: no server,
no API, user photos are processed locally in the browser and never uploaded.

## Run locally

Open `index.html` directly, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

(Service worker / install prompt only activate over http(s), not file://.)

## Deploy (GitHub Pages)

Push this folder as-is to a repo and enable Pages on the branch — it is a
fully static site, no build step. All paths are relative, so it works from
a subpath like `username.github.io/bead-pattern-maker/` too.

## How it works

1. User picks an image → it is downscaled on a canvas to the chosen bead width.
2. Each pixel is matched to the nearest of 64 Perler/Hama palette colors
   (`palette.js`) using CIE Lab perceptual distance (`core.js`).
3. The page renders the bead grid (toggleable grid lines / color codes),
   a per-color bead shopping list, and exports a PNG pattern.

## Free tier & paid unlock

All limits live in one place — `CONFIG` in `core.js`:

- `UNLOCKED: false` → width capped at `FREE_MAX_WIDTH` (48), exported PNGs
  carry the footer watermark `Made with Bead Pattern Maker`.
- When the Gumroad unlock ships, verify the buyer's license key and set
  `UNLOCKED: true` → cap rises to `PRO_MAX_WIDTH` (200) and the watermark
  disappears. No other code changes are needed.

## Self-test

```bash
node test/selftest.js   # 35 assertions: palette, matching, quantize, stats, limits, PWA files
```
