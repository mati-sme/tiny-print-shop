# Tiny Print Shop

A cozy isometric idle/management game about running a tiny 3D-printing shop.
Plain HTML5 Canvas + vanilla JS, classic `<script>` tags, no build step, no network, no image files:
every icon, printer and print is drawn in code, every sound and the music loop are synthesized with WebAudio.
Font: Fredoka (SIL OFL, subset in `fonts/`). (Formerly "Bonsai Lab"; renamed to avoid confusion with a printer brand. Old saves migrate automatically.)

**Play:** https://mati-sme.github.io/tiny-print-shop/ or double-click `index.html` (works from `file://`).
`?speed=10` in the URL gives a fast debug season.

## The loop
- New players land straight in their first season with a short, skippable in-game tutorial (a pointing hand + hints):
  first order -> delivery (goal + cash pop) -> a scripted clogged nozzle ("Hey, I have this issue!") -> second printer.
- A season is a 10-minute run: rent at 2:30 / 5:00 / 7:30, the maker expo at 10:00.
- Orders need a material (PLA / PETG / TPU / ABS), 1-4 colours, a quality bar, print time, deadline and payout.
  Tap an order card, then a printer; prints grow layer by layer; tap the printer to deliver.
- Printers: Sprout (open bed-slinger), Kestrel (fast enclosed CoreXY, ABS), Rainbow (4-spool colour changer).
- Printer issues pop up big and loud with the printer saying **"Hey, I have this issue!"**: clog, snapped belt,
  spaghetti, stringing, warping, power drop, runout. The clock stops while you decide. Each fix costs money, parts or time.
- A chain of 18 small goals (top-left) with cash / Reputation rewards.
- Late-season money goes into the **expo booth** (table, banner, fairy lights, showcase) for extra Reputation; savings also count.

## Progression
- Upgrade map (in season, $), Research map (persistent, Reputation, 12 nodes, 116 total),
  Labs map: Garage -> Workshop (needs 185 lab Reputation, 6.5x rent) -> Factory (coming soon).
- Balance target: full research + Workshop in ~5-8 good seasons (`node sim/campaign.js`: bots 5.0-5.3 seasons).

## Files
| | |
|---|---|
| `index.html`, `style.css` | shell + UI (scales with the viewport, portrait tray / wide side tray) |
| `js/data.js` | orders, printers, problems, maps, goals (all tuning) |
| `js/core.js` | pure simulation on plain JSON (also runs in Node) |
| `js/models.js`, `js/icons.js` | iso print models and ~120 code-drawn UI icons |
| `js/render.js` | isometric garage, printers, booth, particles, cat |
| `js/game.js` | loop, input, HUD, tutorial, goals, popups, pause menu, maps, save |
| `js/audio.js` | WebAudio SFX + cozy lo-fi music loop (separate toggles) |
| `js/platform.js`, `js/portal-boot.js` | portal SDK layer (CrazyGames SDK v3 only in portal builds) |
| `sim/sim.js`, `sim/campaign.js` | balance sims |
| `test/e2e.js`, `test/soak.js`, `test/playtest.js`, `test/sizes.js` | headless tests (Playwright + Chrome) |
| `tools/build-portals.sh` | `dist/crazygames/tiny-print-shop.zip` (Basic Launch, SDK v3) + `dist/itchio/` |
| `tools/portal-test.js` | SDK call-order test of the CrazyGames build on localhost |
| `tools/cover/` | code-drawn cover art, store videos, store screenshots |
| `tools/build-zip.sh` | plain zip of the playable files |

## Tests
```
cd test && npm i                    # playwright-core; uses /usr/bin/google-chrome
node e2e.js && node soak.js
node playtest.js 1920x1080 150      # new-player playtest via real clicks, screenshots in test/out/
node ../sim/sim.js && node ../sim/campaign.js
cd .. && tools/build-portals.sh && node tools/portal-test.js
```
The GitHub Pages build (this repo) never loads any SDK.
