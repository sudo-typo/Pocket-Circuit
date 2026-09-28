# Pocket Circuit — Guidelines for Agents

## What This Is
Pocket Circuit is a kart racing game for an 8-year-old on iPad Safari. The player steers with touch, races three laps against five AI opponents across a kitchen counter that changes each lap, collects items and picks characters, earns trophies, and saves progress in browser storage. See **docs/PLAN.md** for the full plan — especially the **Locked Design Decisions** section, which is non-negotiable.

## Architecture Contracts
All of these are set and must be respected by every slice:

- **Single file (game):** The game is one `index.html` — one `<style>` block, HTML, and one `<script type="module">`. Dev-only files (docs/, tests/, CLAUDE.md, README.md) live in the repo but the game must never depend on them.
- **three.js via import map:** Pinned to `https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js` (never "latest", never vendor it). An `<script type="importmap">` in the head lets code write `import * as THREE from 'three'`.
- **Section order (fixed, labeled banners):** 1 CONFIG & TUNING, 2 TRACK DATA, 3 INPUT, 4 PHYSICS, 5 AI, 6 ITEMS, 7 RACE STATE, 8 RENDERING, 9 HUD & MENUS, 10 AUDIO, 11 STORAGE, 12 MAIN LOOP. New code goes in its section. Sections expose a small API and talk only through it.
- **Game loop:** Fixed 60 Hz physics, rendering tied to `requestAnimationFrame`. No physics engine — custom arcade physics only.
- **Track as data:** Kitchen is one data object; later tracks (backyard, etc.) are added data objects. No hard-coded kitchen logic.
- **Track progress:** Every kart position is "distance along centerline + lateral offset." Used for lap counting, ranking, AI steering, collisions, and item targeting.
- **Kart stats:** One stats object per character with speed, acceleration, grip, weight, slippery-resistance. Only these numbers change per character or difficulty.
- **Input:** Touch (left half = steering slider, right half = Drift/Item buttons) and keyboard fallback both produce `{steer: -1..1, drift: bool, item: bool}` each frame.

## Debug & Test Conventions
- **`?debug=1`:** Unhides the fps counter.
- **`?test=1`:** Exposes `window.__pc` test hook (defined in index.html, to be kept working and extended). Inert without the flag.
- Tests live in `tests/` and run with node + Playwright (Chromium preinstalled, do not run `playwright install`). The CDN may be blocked in dev containers, so tests intercept the three.js URL to serve a local copy — see tests/README or the test files themselves.
- Headless fps numbers are meaningless. Real-iPad checks: after Slice 1 (frame rate + steering feel), then Integration Checkpoints A–D (after Slices 3, 6, 9, and 11).

## Working Rules
- Stay within your slice's scope. Don't pull features from later slices.
- No image files, model files, audio files, or other assets in the repo. Everything is code-generated.
- No new local files required by the game itself.
- Keep iPad constraints in mind: `touch-action: none` to avoid scrolling/zoom; landscape only; no select/long-press menus on controls.
- Performance budget: low-poly shapes, modest shadow range. The target iPad model is unknown.
- Player is an 8-year-old: use icon-first UI with minimal reading.
- Do not git commit or push; the orchestrator reviews and commits each slice.

## Keep PLAN.md as Source of Truth
Refer to docs/PLAN.md for acceptance criteria, dependencies, and design decisions. When in doubt, ask: "Does PLAN.md say to do this?" If yes, do it. If no, scope creep — don't add it.
