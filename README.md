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
a subpath like `dreamforge-studio.github.io/bead-pattern-maker/` too.

## How it works

1. User picks an image → it is downscaled on a canvas to the chosen bead width.
2. Each pixel is matched to the nearest of 64 Perler/Hama palette colors
   (`palette.js`) using CIE Lab perceptual distance (`core.js`).
3. The page renders the bead grid (toggleable grid lines / color codes),
   a per-color bead shopping list, and exports a PNG pattern.

## Plans (Free / Pro / Studio)

All plan differences live in `TIERS` in `core.js` and are enforced by the
app — not just described on the Pricing page:

| | Free | Pro — $4.99/mo | Studio — $9.99/mo |
|---|---|---|---|
| Max pattern width | 48 beads | 120 beads | 200 beads |
| Palette | 64 basic colors | full 100 colors (Perler+Hama+Artkal) | full 100 colors |
| PNG export | watermarked | watermark-free, high-res | watermark-free, high-res |
| Bead list CSV | — (in-page chart only) | ✓ download / print | ✓ |
| PDF board sheets (per-pegboard pages, row/col coordinates) | — | — | ✓ (print dialog → Save as PDF) |
| Batch generation | — | — | ✓ |
| Commercial license | — | — | ✓ |

Locked features never fail silently: clicking one opens an upgrade prompt
naming the plan that includes it. The active plan is decided by a license
key stored in `localStorage` (`bpm.license`); no key = Free.

## License keys (placeholder rule — replace when Gumroad opens)

Format: `BPM-PRO-XXXX-XXXC` / `BPM-STU-XXXX-XXXC`, where `C` is a checksum
character over the rest of the key (`Core.makeLicenseKey` /
`Core.validateLicenseKey` in `core.js`). This is a *local placeholder*:
it stops casual typos and sharing-by-accident, it is not real DRM.

When the Gumroad shop opens:

1. Create two subscription products (Pro $4.99/mo, Studio $9.99/mo).
2. Point the Pricing section's Upgrade buttons at the Gumroad product
   links (they currently link to `#` and are labelled “Coming soon”).
3. Issue each subscriber a key in the same format and swap
   `validateLicenseKey` for Gumroad license verification — the rest of
   the tier system (caps, gates, palettes) does not change.

## Self-test

```bash
node test/selftest.js   # palette, matching, quantize, stats, tiers, license keys, CSV, PWA files
```
