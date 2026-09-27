# Pocket Circuit

A kart racing game for iPad, built for an 8-year-old. Steer a tiny kart across a kitchen counter, race against five computer opponents, collect power-ups, and save your best times and trophies.

## How to Play

**Controls:**
- **Left thumb:** Place anywhere on the left half of the screen. Slide left or right to steer. The kart accelerates on its own.
- **Drift button:** On the right side. Hold while steering to slide and build boost power (the sparks turn from blue to orange). (Arrives in later builds.)
- **Item button:** On the right side. Use collected power-ups. (Arrives in later builds.)

**Race:**
- 3 laps around the kitchen.
- Race against 5 computer-controlled karts.
- On lap 2, the sink floods with floating sponges to cross. On lap 3, cereal spills create slippery patches. (These come in later builds.)

## Putting It on Your iPad

1. **Deploy to GitHub Pages:**
   - Go to this repository's **Settings** → **Pages**.
   - Under "Build and deployment," select "Deploy from a branch."
   - Pick your branch and select `/` (root).
   - Copy the HTTPS address (e.g., `https://yourname.github.io/Pocket-Circuit`).

2. **Open in Safari:**
   - On the iPad, open Safari and go to that address.
   - After the game loads, tap **Share** → **Add to Home Screen**.
   - This creates an app icon that launches full-screen.
   - **Always open from that same address** so your saved trophies stay with the game.

## It Needs Internet

The game loads three.js from a CDN. You need a working internet connection each time you play.

## Troubleshooting

**No sound:**
- Check the iPad's silent mode switch (side of the device).
- Check Control Center for silent mode.

**Blank page or "can't load" message:**
- Check your internet connection.
- Wait a few seconds and reload.

**Portrait shows "turn sideways" message:**
- The game only works in landscape. Rotate the iPad.

## Build Progress

The game is built in 11 slices. Real-iPad check after Slice 1, then Integration Checkpoints A–D after Slices 3, 6, 9, and 11.

- [ ] Slice 1: Drive one kart around the kitchen track with touch steering
- [ ] Slice 2: Complete a timed 3-lap run with countdown and finish screen
- [ ] Slice 3: Drift for boosts and hit boost pads
- [ ] Slice 4: Race against five AI karts with live positions
- [ ] Slice 5: Pick a difficulty from a menu and get a tuned race
- [ ] Slice 6: Pick one of four characters that drive differently
- [ ] Slice 7: Collect and use the three items
- [ ] Slice 8: AI racers use items, with catch-up item odds
- [ ] Slice 9: Track changes on laps 2 and 3 (flood, then cereal)
- [ ] Slice 10: Best times and trophy shelf saved between sessions
- [ ] Slice 11: Sound, iPad polish, and release readiness

For the full implementation plan, see **[docs/PLAN.md](docs/PLAN.md)**.
