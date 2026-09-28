# Implementation Plan: Pocket Circuit (v1, single player)

## Overview
Pocket Circuit is a kart racing game for an 8-year-old, played on an iPad in Safari. Tiny karts race across a giant kitchen counter. Version 1 has one kitchen track that changes each lap, four characters with small stat differences, five AI racers, three items, a difficulty picker, and a saved trophy shelf. It is delivered as a single `index.html` file containing all the HTML, CSS, and JavaScript, with three.js loaded from a public CDN at a pinned version. It needs no server features: copying that one file to any web server is the entire deployment.

At the end of this plan, he can open the game, pick a difficulty and character, race a full three-lap Grand Prix-style race against five AI karts using touch controls, and see his best time and trophies saved the next time he plays.

User stories were not written as a separate document. They are inferred from the design decisions below and are restated as acceptance criteria in each slice.

## Locked Design Decisions (source of truth)
- **Player:** 8-year-old, two thumbs, landscape iPad. The 5-year-old's easy mode is deferred.
- **Controls:** Auto-accelerate. A floating steering slider on the left half of the screen (wherever the thumb lands becomes center, horizontal only, analog, lightly smoothed). The right side has a Drift button and an Item button.
- **Drift:** Hold Drift while steering. Blue spark, then orange spark. Release for a small or larger boost. Holding too long never spins you out. Boost pads are also placed on the track.
- **Race:** One kitchen track, 3 laps of about 35–40 seconds each, 6 karts total (player plus 5 AI).
- **Lap-change twist:** Lap 1 is normal. On lap 2 the sink floods and the route crosses floating sponges. On lap 3 cereal is spilled, creating slippery patches.
- **Difficulty:** Easy, Normal, or Hard, picked before each race. Normal is tuned so he wins about 1 race in 3. The AI never gets secret speed; only item distribution favors racers at the back.
- **Items (3):** Paperclip (boost), Sticky Note (dropped trap that causes a short cartoon spin), Soap Bubble (shield against one hit).
- **Characters (4):** Pip the mouse (light and fast, low grip), Bolt the robot (heavy and hard to push, slow acceleration), Clove the ladybug (balanced), Mossy the snail (low top speed, ignores slippery surfaces). AI racers reuse these characters in different colors.
- **Rewards:** Best race time per difficulty, plus a trophy shelf of 12 slots (4 characters × 3 difficulties) showing gold, silver, or bronze. Saved in browser storage on the iPad.
- **Tech:** One `index.html` file with inline CSS and one inline JavaScript module. three.js comes from a public CDN at a pinned version. Low-poly shapes are built in code (no image or model files), and sound is generated in code with Web Audio. The iPad needs an internet connection to load the game.

## Sequencing Rationale
Slice 1 is both the foundation and the highest risk. If steering on the iPad's touchscreen doesn't feel good, or the scene doesn't run smoothly on his actual iPad, nothing else matters. So the track, the kart, the touch controls, and a performance check come first. Lap timing and drift follow, because they turn "driving around" into a time trial he can already enjoy, which is the first demo.

AI racers come before items and characters, because items and characters both depend on there being other karts. Items come after the full race loop works, so item balance can be tuned against real races. The lap-change twist comes late, because it modifies a track that must already be stable. Saving and polish come last, because they wrap a finished game.

Demo milestones: after Slice 3 (a time trial), after Slice 6 (a full race against AI), after Slice 9 (feature complete), and after Slice 11 (release).

## Architecture Contracts (set in Slice 1, respected by all later slices)
- **Single-file layout:** Everything lives in `index.html`: one `<style>` block, the HTML for the canvas, HUD, and menus, and one `<script type="module">` block. No other local files exist.
- **Loading three.js:** An import map points `three` at a pinned CDN build (for example, `https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js`), so the game code simply writes `import * as THREE from 'three'`. The version is pinned and never uses "latest," so a library update can't break the game.
- **Code organization inside the file:** The script is divided into clearly labeled sections in a fixed order: config and tuning numbers, track data, input, physics, AI, items, race state, rendering, HUD and menus, audio, storage, and the main loop. Each section exposes a small set of functions or one object, and sections only talk through those. This keeps a large single file navigable for a person or a coding agent, and new code goes into its matching section.
- **Game loop:** A fixed 60 Hz physics step with rendering tied to the display's refresh. Simple custom arcade physics, with no physics engine.
- **Track as data:** Each track is one data object in the track data section, holding a centerline curve, a width profile, boost pad positions, item box positions, a surface map (normal, slippery, water), and per-lap change events. Code never hard-codes the kitchen, so later tracks (like the backyard garden) are new data objects added to that section.
- **Track progress:** Every kart's position is expressed as "distance along the centerline plus sideways offset." Lap counting, race ranking, AI steering, soft walls, and item targeting all use this one system.
- **Kart stats:** Every kart reads its speed, acceleration, grip, weight, and slippery-surface resistance from one stats object. Characters and difficulty only change those numbers.
- **Input:** Touch input and a keyboard fallback (for testing on a computer) both produce the same `{steer: -1..1, drift: bool, item: bool}` object each frame.

## Slice Index
| # | Slice | Size | Depends On | Parallelizable |
|---|-------|------|------------|----------------|
| 1 | Drive one kart around the kitchen track with touch steering | L | — | No |
| 2 | Complete a timed 3-lap run with countdown and finish screen | M | 1 | No |
| 3 | Drift for boosts and hit boost pads | M | 1 | No |
| 4 | Race against five AI karts with live positions | L | 2 | No |
| 5 | Pick a difficulty from a menu and get a tuned race | M | 4 | No |
| 6 | Pick one of four characters that drive differently | M | 4 | No |
| 7 | Collect and use the three items | M | 4 | No |
| 8 | AI racers use items, with catch-up item odds | M | 7 | No |
| 9 | Track changes on laps 2 and 3 (flood, then cereal) | L | 2, 6 | No |
| 10 | Best times and trophy shelf saved between sessions | M | 5, 6 | No |
| 11 | Sound, iPad polish, and release readiness | M | All | No |

## Slices

### Slice 1: Drive one kart around the kitchen track with touch steering
**Size:** L
**Depends on:** None (foundational)
**User stories covered:** He can steer a kart around the kitchen counter with his thumb, and the game runs smoothly on his iPad.

**Layers touched:**
- Rendering: three.js scene, lighting, low-poly kitchen props built in code (counter surface, salt and pepper shakers, a fruit bowl, the sink gap with a jump ramp), and a chase camera that follows smoothly behind the kart.
- Track data: kitchen centerline, width profile, jump ramp over the sink gap.
- Physics: auto-acceleration, steering, grip, a small hop off ramps, and soft bumpers that bounce the kart back from the track edge (it can never fall off).
- Input: a floating steering slider on the left half of the screen, and a keyboard fallback (arrow keys) for desktop testing.
- Page: the single-file skeleton with all labeled sections in place (even if empty), the import map loading three.js from the CDN, a fixed landscape layout, no page scrolling or pinch-zoom, and a frame-rate counter hidden behind a debug flag.

**Acceptance:**
- Wherever his left thumb touches down becomes center. Sliding left or right steers proportionally, lifting the thumb straightens the kart, and vertical wobble is ignored.
- The kart speeds up on its own and follows steering smoothly, without twitching.
- Hitting a track edge bounces the kart back toward the center. It cannot leave the track or get stuck.
- Taking the ramp over the sink gap makes the kart hop and land cleanly.
- It runs at an average of at least 50 fps on the actual iPad he will use, with the frame-rate counter turned on.
- Holding the iPad in portrait mode shows a "turn your iPad sideways" message.
- If three.js can't load (for example, the internet is down), the page shows a friendly "Can't load the game, check the internet" message instead of a blank screen.

**Notes:** Test on the real iPad at the end of this slice, before starting Slice 2. If performance falls short, reduce props and shadows now, while the scene is small.

---

### Slice 2: Complete a timed 3-lap run with countdown and finish screen
**Size:** M
**Depends on:** 1
**User stories covered:** He can do a full timed run and see how fast he was.

**Layers touched:**
- Race state: countdown (3, 2, 1, Go), running, and finished.
- Track progress: lap counting from distance along the centerline, plus hidden checkpoints so shortcuts or driving backwards don't count as a lap.
- HUD: a lap counter ("Lap 2/3"), a race timer, and a "Final lap!" banner.
- Results screen: total time, each lap's time, and a Race Again button.

**Acceptance:**
- The kart doesn't move until "Go."
- A lap only counts after passing every checkpoint in order.
- The race ends after lap 3 and shows the total time plus all three lap times.
- Race Again resets everything cleanly, with no leftover state.

**Notes:** None.

---

### Slice 3: Drift for boosts and hit boost pads
**Size:** M
**Depends on:** 1
**User stories covered:** He can learn to drift through turns for extra speed, and gets easy speed from glowing pads.

**Layers touched:**
- Input: a large Drift button on the right side.
- Physics: while drifting, the kart slides with a wider arc and a charge timer builds. A blue spark appears first, then an orange one. Releasing gives a short or longer boost. Holding too long just stays orange and never spins him out.
- Track data: boost pad positions, with 3–4 pads on the kitchen track.
- Visuals: spark particles at the rear wheels, a speed-lines effect during boosts, and glowing pads.

**Acceptance:**
- Holding Drift while steering makes the kart slide, and sparks change from blue to orange as it's held.
- Releasing after orange gives a noticeably longer boost than releasing after blue. Releasing before blue gives nothing.
- Driving over a boost pad always gives a short boost.
- A clean run using drifts is at least a few seconds faster than a run without them.

**Notes:** Drift and boost timing numbers should live in one config object, for easy tuning during playtesting.

---

### Integration Checkpoint A (after Slice 3)
A complete time trial runs on the iPad: countdown, three laps with drifting and boost pads, and a results screen. **Hand the iPad to him.** Watch whether he figures out the steering slider and drift button without help, and adjust sizes and sensitivity before adding opponents.

---

### Slice 4: Race against five AI karts with live positions
**Size:** L
**Depends on:** 2
**User stories covered:** He races against five computer opponents and can see what place he's in.

**Layers touched:**
- AI: each AI kart follows a racing line (centerline plus a curvature-based offset), aims ahead along the track, and adds small random mistakes (a late turn, a wide line). AI karts drift and use boost pads too.
- Physics: kart-to-kart bumping, where heavier karts push lighter ones and nobody gets stuck.
- Race state: a staggered starting grid with the player starting mid-pack, live ranking from lap plus distance, and a finish order.
- HUD: a big position number ("3rd") and a small side list of all six racers.
- Results: finishing places for all six racers.

**Acceptance:**
- All five AI karts complete three laps without getting stuck or driving backwards.
- The AI never goes faster than its kart's stats allow.
- Bumping into karts pushes them believably and never glitches through them.
- The position display updates live and matches the actual order at the finish line.

**Notes:** AI skill is expressed as a small set of numbers (line accuracy, mistake rate, top-speed percentage) so Slice 5 only has to change values.

---

### Slice 5: Pick a difficulty from a menu and get a tuned race
**Size:** M
**Depends on:** 4
**User stories covered:** He chooses how hard the race is before starting.

**Layers touched:**
- Menu flow: title screen, then difficulty screen (Easy, Normal, Hard as large icon buttons, with no reading needed), then race, then results, then back to the menu or race again.
- AI tuning: three sets of AI skill numbers.
- Title screen: a big Start button, which also becomes the tap that unlocks sound in Slice 11.

**Acceptance:**
- All three difficulties can be selected, and each one noticeably changes how the AI drives.
- On Easy, a reasonably careful run wins most of the time. On Hard, winning takes clean drifting.
- On Normal, an average run from him wins roughly one race in three. This is confirmed by playtesting with him, not assumed.
- Every screen can be navigated by tapping icons, with no reading required.

**Notes:** The 1-in-3 target can't be verified by the developer alone. Plan a short playtest session.

---

### Slice 6: Pick one of four characters that drive differently
**Size:** M
**Depends on:** 4
**User stories covered:** He picks a favorite character, and each one feels different to drive.

**Layers touched:**
- Visuals: four low-poly characters and karts built in code (Pip the mouse in a thimble kart, Bolt the wind-up robot, Clove the ladybug in a bottle-cap car, Mossy the snail), each with alternate color schemes for the AI versions.
- Stats: one stats object per character (speed, acceleration, grip, weight, slippery-surface resistance).
- Menu: a character select screen after difficulty, with a spinning preview and simple icon bars for the stats.
- AI: each AI racer is assigned a character in a distinct color.

**Acceptance:**
- Each character has one strength and one weakness that are noticeable in a race.
- No character is best at everything. On Normal, any of the four can win with a clean run.
- The player's kart is always visually distinct from the AI karts.

**Notes:** Mossy's slippery-surface resistance only matters once Slice 9 adds cereal patches. Build the stat now and verify it in Slice 9.

---

### Integration Checkpoint B (after Slice 6)
The full race loop works end-to-end: title, difficulty, character, race against five AI, results. Playtest with him on all three difficulties and confirm the 1-in-3 target on Normal before adding items, since items will shift the balance.

---

### Slice 7: Collect and use the three items
**Size:** M
**Depends on:** 4
**User stories covered:** He drives through item boxes and uses what he gets.

**Layers touched:**
- Track data: two rows of item boxes on the kitchen track. Boxes respawn a few seconds after being taken.
- Item system: a short roulette animation on pickup, one item held at a time, and an Item button on the right side that glows when an item is ready.
- Paperclip: an instant short boost.
- Sticky Note: dropped behind the kart, where it stays on the track. Any kart that hits it does a short cartoon spin (about one second) and keeps moving.
- Soap Bubble: a visible bubble around the kart that absorbs one hit from a Sticky Note or a bump, then pops.
- Item distribution: odds depend on race position. Leaders mostly get Sticky Notes and Bubbles, and racers at the back mostly get Paperclips.

**Acceptance:**
- Driving through a box always gives an item if he isn't already holding one.
- Each item behaves exactly as described, and a Sticky Note spin never fully stops the kart.
- The Item button is big enough to hit mid-drift without looking.
- Sticky Notes left on the track disappear when the race ends.

**Notes:** None.

---

### Slice 8: AI racers use items, with catch-up item odds
**Size:** M
**Depends on:** 7
**User stories covered:** The computer racers play by the same rules he does.

**Layers touched:**
- AI: picks up items from boxes. Uses a Paperclip on straights, drops a Sticky Note when a kart is close behind, and triggers a Bubble right away.
- Distribution: the AI gets the same position-based odds as the player.
- Tuning: a quick re-check of the 1-in-3 target on Normal with items in play.

**Acceptance:**
- AI karts use all three items at sensible moments, never all at once.
- The AI never gets items outside the normal odds.
- Normal still lands at roughly one win in three with items active.

**Notes:** None.

---

### Slice 9: Track changes on laps 2 and 3 (flood, then cereal)
**Size:** L
**Depends on:** 2, 6
**User stories covered:** The kitchen changes while he races, so each lap feels different.

**Layers touched:**
- Track data: per-lap change events, triggered when the race leader starts lap 2 or lap 3.
- Lap 2 (flood): the faucet turns on with an animation, water fills the sink, and floating sponges form a new path across it that replaces the lap 1 jump. The sponges bob gently, and the water edge acts as a soft bumper.
- Lap 3 (cereal spill): the cereal box tips over, and cereal-covered slippery patches appear on part of the track, reducing grip for every kart except Mossy.
- Surface system: the surface map now covers normal, slippery, and water sections.
- AI: the AI racing line updates for the lap 2 path.
- HUD: a short visual cue as each change happens (for example, a splash icon).

**Acceptance:**
- Every lap 2 has the flood, and every lap 3 has the cereal spill, for all karts.
- The sponge path can be driven cleanly and never traps a kart.
- The cereal patches clearly reduce grip for Pip, Bolt, and Clove, but not for Mossy.
- The AI handles both changes without getting stuck.
- Lap-change events reset properly when the race restarts.

**Notes:** Split into 9a (flood) and 9b (cereal spill) if the flood alone runs long. They share the surface and event system, which should be built in 9a. Orchestrator addition: when the flood triggers, any kart currently airborne over (or on the ramp into) the sink lands safely on the sponge path.

---

### Integration Checkpoint C (after Slice 9)
Feature complete: every locked design decision except saving and polish is playable. Do a full playtest on the iPad, covering all difficulties and all characters, and check frame rate during the busiest moments (lap 2 flood with six karts nearby).

---

### Slice 10: Best times and trophy shelf saved between sessions
**Size:** M
**Depends on:** 5, 6
**User stories covered:** He can see his records and trophies next time he plays.

**Layers touched:**
- Storage: browser storage with a single versioned save key, and every read and write wrapped in error handling. If storage is empty or unreadable, the game starts fresh without crashing.
- Results screen: a "New best time!" celebration when he beats a record.
- Trophy shelf screen: reachable from the title screen. It shows 12 slots (4 characters × 3 difficulties), with gold for 1st, silver for 2nd, bronze for 3rd, and an empty outline if not yet earned. It also shows the best time per difficulty. A slot only upgrades, never downgrades.

**Acceptance:**
- Best times and trophies survive closing Safari and reopening the game.
- Finishing 4th through 6th never removes an earned trophy.
- A hidden reset (for example, a long press on the shelf title) clears all progress, for testing.
- The game works normally if storage is unavailable, just without saving.

**Notes:** Saved data is tied to the exact web address the game is opened from. Always opening it from the same address (ideally a Home Screen icon) keeps progress intact.

---

### Slice 11: Sound, iPad polish, and release readiness
**Size:** M
**Depends on:** All previous slices
**User stories covered:** The game feels finished and is easy to launch on the iPad.

**Layers touched:**
- Audio: all sound generated in code with Web Audio (engine hum that rises with speed, drift sizzle, boost whoosh, item pickup, bump, splash, countdown beeps, a finish fanfare). Sound unlocks on the first tap of Start. Includes a mute toggle.
- iPad page setup: Home Screen icon and name tags, full-screen settings where Safari allows them, safe-area padding so buttons avoid rounded screen corners, and no text selection or long-press menus on the game controls.
- Polish: confetti on a win, simple kart and character select animations, and pause and resume when the app goes to the background.

**Acceptance:**
- Sound works after the first tap and can be muted.
- Switching away from Safari pauses the race, and coming back resumes it cleanly.
- No accidental zoom, scroll, text selection, or popup menu happens during play.
- The single `index.html` file can be copied to any web server and runs without changes, with no other local files required.

**Notes:** The iPad's side switch or Control Center silent mode can mute web audio. If he says "there's no sound," check that first.

---

### Integration Checkpoint D (after Slice 11)
Release: a full session from launching the game to earning a trophy works on the iPad from the Home Screen, with sound, saved progress, and no dead ends in the menus.

## Open Risks
- His iPad's age and model are unknown. An older model could miss the frame-rate target, affecting Slice 1 and Slice 9.
- The steering slider's feel can only be judged by him, so plan adjustments after Checkpoint A (Slice 1).
- The 1-in-3 win rate on Normal depends on playtesting with him and will need re-tuning after items and track changes (Slices 5, 8, and 9).
- Saved progress is tied to the game's web address. If the address changes, his trophies reset (Slice 10).
- The iPad's silent mode may mute game sound (Slice 11).
- Opening the game full-screen from the Home Screen may not work on a plain http address, depending on iOS version (Slice 11).
- The game needs an internet connection to load three.js from the CDN. If the internet or the CDN is down, the game won't start (Slice 1 handles this with a clear message).
- The single file will grow to several thousand lines. Keeping the labeled sections disciplined matters more with every slice (all slices).

## Out of Scope for This Plan
- Easy mode for the 5-year-old (auto-steer help). Deferred until she is ready.
- Additional tracks (backyard garden, bedroom). Track data is designed so they can be added later.
- The other three items: Rubber Band, Whoopee Cushion, Magnet.
- Two-player split-screen.
- Math Gates mode.
- Offline play (service worker), a local or inlined copy of three.js, and anything about hosting or the server.
- Tilt steering.
- Online play, accounts, or leaderboards.

## Orchestration Decisions (agreed with owner)
- Work stops at Integration Checkpoints A–D for a real-iPad playtest by the owner before continuing.
- Deployment target: GitHub Pages from this repo (stable https address; protects saved progress and Home Screen full-screen).
- One commit per slice on the working branch, pushed after orchestrator review. No PR unless asked.
- Dev-only test files live in `tests/` and are never needed by the game. The game itself remains the single `index.html`.
- A debug-only test hook (off by default, like the fps counter) lets headless scripts drive and fast-forward races.
