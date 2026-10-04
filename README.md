# GROW OR GET EATEN — web vertical slice

A tiny 3D browser prototype that tests one loop: **eat → grow → risk → evolve → dominate**.

## Run it
Open `index.html` in a desktop browser (double-click works — no build or server needed).
Three.js r160 is vendored in `vendor/`, so it runs offline (only the title font loads from Google Fonts).

## Controls
| Key | Action |
| --- | --- |
| WASD | Move |
| Mouse | Camera (click to capture the mouse, Esc to pause) |
| Shift | Sprint |
| Space | Jump |
| Left click / E | Bite (auto-aims toward the camera direction; walk over a downed creature to eat it) |
| Mouse wheel | Zoom |

## What's in the slice
- One map with three zones: **Safe Grassland** (south, start), **Forest** (middle), **Rocky Den** (north, the Alpha's cave). No invisible walls.
- Food chain: Beetle 2 → Mouse 5 → Lizard 12 → Boar 25 → Wolf 45 → **THE ALPHA** 100.
- Every creature shows 🟢 PREY / 🟡 RISKY / 🔴 DANGER relative to your current mass; the Food Chain panel flips live and announces each reversal.
- Model scale follows `0.3 · mass^0.6` for everyone, so a wolf that dwarfs you at mass 5 looks small next to you at mass 70.
- A scripted wolf hunts you early (after ~4 meals or ~40 s) so you learn to run.
- One evolution at mass 30: Predator (jaws + teeth, +30% bite), Runner (long legs, +20% speed) or Tank (spiked shell, +40% HP).
- Defeat the Alpha to win; dying restarts instantly from scratch.

## Tuning
All balance numbers live at the top of `game.js` in `TYPES` (mass, gain, speeds, sense range, counts, zones), plus `sizeFor`, `dmgCalc` and `statusOf`.
For quick testing, the browser console exposes `GOE.grow(n)` and `GOE.tp(x, z)`.
