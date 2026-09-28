// Dev-only Playwright checks for Slice 1 of Pocket Circuit.
// Never required by the game itself. Run with:
//   bash tests/fetch-three.sh && node tests/slice1.mjs
//
// Uses the globally-installed Playwright package and the preinstalled
// Chromium browser (no `playwright install`).

import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const globalNodeModules = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(globalNodeModules, 'playwright'));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const VENDOR_THREE = path.join(__dirname, '.vendor', 'three.module.min.js');
const OUT_DIR = path.join(__dirname, '.out');
const CHROME_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

fs.mkdirSync(OUT_DIR, { recursive: true });

if (!fs.existsSync(VENDOR_THREE)) {
  console.error(`Missing ${VENDOR_THREE}. Run: bash tests/fetch-three.sh`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Tiny static file server for index.html (so it isn't loaded via file://,
// which some browsers restrict for modules/fetches).
// ---------------------------------------------------------------------------
function startServer() {
  const server = http.createServer((req, res) => {
    let filePath = path.join(REPO_ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (req.url === '/' || req.url.startsWith('/?')) filePath = path.join(REPO_ROOT, 'index.html');
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      const ext = path.extname(filePath);
      const type = ext === '.html' ? 'text/html' : ext === '.js' ? 'application/javascript' : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type });
      res.end(data);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const results = [];
function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ' - ' + detail : ''}`);
}

async function withPage(browser, opts, fn) {
  const context = await browser.newContext({
    viewport: opts.viewport || { width: 1180, height: 820 },
    hasTouch: true,
    isMobile: false,
  });
  const page = await context.newPage();

  // Serve three.js from the local vendor copy instead of the (blocked) CDN.
  await context.route('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js', (route) => {
    if (opts.blockThree) {
      route.abort();
    } else {
      route.fulfill({
        path: VENDOR_THREE,
        contentType: 'application/javascript',
      });
    }
  });

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  try {
    await fn(page, { consoleErrors, pageErrors });
  } finally {
    await context.close();
  }
}

async function main() {
  const server = await startServer();
  const port = server.address().port;
  const url = (qs) => `http://127.0.0.1:${port}/index.html${qs || ''}`;

  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: [
      '--use-gl=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--disable-gpu-sandbox',
    ],
  });

  let lapTimeSeconds = null;

  try {
    // ---- a. Load, no errors, ready, canvas renders ----
    await withPage(browser, {}, async (page, { consoleErrors, pageErrors }) => {
      await page.goto(url('?test=1&debug=1'));
      await page.waitForFunction(() => window.__pc && window.__pc.ready, null, { timeout: 15000 });
      await page.waitForTimeout(500); // let a few frames render
      record('a. no console/page errors on load', consoleErrors.length === 0 && pageErrors.length === 0,
        consoleErrors.concat(pageErrors).join(' | '));
      record('a. __pc.ready becomes true', true);

      const screenshot = await page.screenshot();
      const nonBlank = isNonBlankPng(screenshot);
      record('a. canvas renders (non-blank screenshot)', nonBlank);
      fs.writeFileSync(path.join(OUT_DIR, 'driving.png'), screenshot);
    });

    // ---- b. Auto-accelerate ----
    await withPage(browser, {}, async (page) => {
      await page.goto(url('?test=1'));
      await page.waitForFunction(() => window.__pc && window.__pc.ready);
      await page.evaluate(() => window.__pc.setInput({ steer: 0 }));
      const speeds = await page.evaluate(() => {
        const out = [];
        for (let i = 0; i < 5; i++) {
          window.__pc.step(30);
          out.push(window.__pc.getState().kart.speed);
        }
        return out;
      });
      const rising = speeds[0] < speeds[speeds.length - 1] && speeds[speeds.length - 1] > 0;
      record('b. auto-accelerate: speed rises toward top speed', rising, `speeds=${speeds.map(s => s.toFixed(2)).join(',')}`);
    });

    // ---- c. Soft walls: full steer for 20s each direction ----
    await withPage(browser, {}, async (page) => {
      await page.goto(url('?test=1'));
      await page.waitForFunction(() => window.__pc && window.__pc.ready);

      const runDirection = async (steer) => {
        await page.evaluate(() => window.__pc.resetKart());
        await page.evaluate((s) => window.__pc.setInput({ steer: s }), steer);
        return page.evaluate(() => {
          const ticksPerCheck = 10;
          const totalTicks = 20 * 60; // 20 simulated seconds at 60Hz
          let maxOverage = 0;
          let stuckTime = 0;
          let worstStuckRun = 0;
          for (let t = 0; t < totalTicks; t += ticksPerCheck) {
            window.__pc.step(ticksPerCheck);
            const st = window.__pc.getState();
            const hw = st.track.halfWidthAt(st.kart.s);
            const overage = Math.abs(st.kart.lateral) - hw;
            if (overage > maxOverage) maxOverage = overage;
            if (st.kart.speed < 1.0) {
              stuckTime += ticksPerCheck / 60;
              worstStuckRun = Math.max(worstStuckRun, stuckTime);
            } else {
              stuckTime = 0;
            }
          }
          return { maxOverage, worstStuckRun };
        });
      };

      const right = await runDirection(1);
      const left = await runDirection(-1);

      const tolerance = 0.75; // meters of tolerance for the soft-wall check
      record('c. right-lock: never exceeds half-width beyond tolerance', right.maxOverage <= tolerance,
        `maxOverage=${right.maxOverage.toFixed(3)}m`);
      record('c. right-lock: never stuck (>1s near-zero speed)', right.worstStuckRun <= 1.0,
        `worstStuckRun=${right.worstStuckRun.toFixed(2)}s`);
      record('c. left-lock: never exceeds half-width beyond tolerance', left.maxOverage <= tolerance,
        `maxOverage=${left.maxOverage.toFixed(3)}m`);
      record('c. left-lock: never stuck (>1s near-zero speed)', left.worstStuckRun <= 1.0,
        `worstStuckRun=${left.worstStuckRun.toFixed(2)}s`);
    });

    // ---- d & e. Centerline-seeking driver completes a lap, ramp hop, lap time ----
    await withPage(browser, {}, async (page) => {
      await page.goto(url('?test=1'));
      await page.waitForFunction(() => window.__pc && window.__pc.ready);
      await page.evaluate(() => window.__pc.resetKart());

      const result = await page.evaluate(() => {
        const dt = 1 / 60;
        let sawAirborne = false;
        let landedAfterAirborne = false;
        let leftTrack = false;
        let prevS = 0;
        let totalDist = 0;
        let ticks = 0;
        let sumAbsLateral = 0;
        let maxAbsLateral = 0;
        const maxTicks = 90 * 60; // 90s safety cap

        while (ticks < maxTicks) {
          const st = window.__pc.getState();
          // Simple proportional steer-to-centerline driver. Gain of 0.5
          // (steer saturates to +-1 at just 0.5m of lateral error) — tuned
          // so this driver actually tracks the centerline tightly on the
          // 2.2m-half-width track, rather than drifting into the soft-wall
          // margin and relying on the wall to hold it there.
          const steer = Math.max(-1, Math.min(1, -st.kart.lateral / 0.5));
          window.__pc.setInput({ steer });
          window.__pc.step(1);
          ticks++;

          const st2 = window.__pc.getState();
          const hw = st2.track.halfWidthAt(st2.kart.s);
          if (Math.abs(st2.kart.lateral) > hw + 0.75) leftTrack = true;
          sumAbsLateral += Math.abs(st2.kart.lateral);
          maxAbsLateral = Math.max(maxAbsLateral, Math.abs(st2.kart.lateral));

          if (st2.kart.airborne) sawAirborne = true;
          if (sawAirborne && !st2.kart.airborne && st2.kart.y === 0) landedAfterAirborne = true;

          // track distance traveled along s, handling wrap-around
          let ds = st2.kart.s - prevS;
          if (ds < -st2.track.length / 2) ds += st2.track.length; // wrapped forward
          if (ds > st2.track.length / 2) ds -= st2.track.length;  // (shouldn't happen going fwd)
          totalDist += ds;
          prevS = st2.kart.s;

          if (totalDist >= st2.track.length) break;
        }

        return {
          completedLap: totalDist >= (0), // filled below via track length compare
          totalDist,
          trackLength: window.__pc.getState().track.length,
          ticks,
          sawAirborne,
          landedAfterAirborne,
          leftTrack,
          meanAbsLateral: sumAbsLateral / ticks,
          maxAbsLateral,
          lapTimeSeconds: ticks * dt,
        };
      });

      const completed = result.totalDist >= result.trackLength - 0.01;
      record('d. centerline driver completes a full lap distance', completed,
        `dist=${result.totalDist.toFixed(1)}/${result.trackLength.toFixed(1)}m`);
      record('d. never leaves track beyond tolerance', !result.leftTrack);
      record('d. ramp hop: airborne then lands cleanly', result.sawAirborne && result.landedAfterAirborne);

      // Guard: the driver must actually track the centerline (proof the
      // sign convention is correct — negative feedback, not positive),
      // not just survive by riding the soft-wall margin. wallMargin=0.85,
      // halfWidth=2.2, so the margin zone starts at |lateral| > 1.35.
      const wallMarginStart = 2.2 - 0.85;
      record('centerline driver: mean |lateral| < 0.3m over the full lap', result.meanAbsLateral < 0.3,
        `mean=${result.meanAbsLateral.toFixed(3)}m`);
      record('centerline driver: max |lateral| never reaches the soft-wall margin', result.maxAbsLateral < wallMarginStart,
        `max=${result.maxAbsLateral.toFixed(3)}m, wall margin starts at ${wallMarginStart.toFixed(2)}m`);

      lapTimeSeconds = result.lapTimeSeconds;
      const lapOk = lapTimeSeconds >= 25 && lapTimeSeconds <= 50; // generous band, reported exactly
      record('e. lap time roughly 30-45s', lapOk, `lapTime=${lapTimeSeconds.toFixed(2)}s`);

      // Screenshot on the approach to the sink ramp: drive to a few meters
      // before the ramp's s-position (using the exact rampS the physics
      // trigger uses), so the ramp, gap and basin are all in view ahead.
      await page.evaluate(() => {
        window.__pc.resetKart();
        window.__pc.clearInput();
      });
      await page.evaluate(() => {
        const st = window.__pc.getState();
        const approachDistance = 3; // meters before the ramp center, in chase mode
        let targetS = st.track.rampS - approachDistance;
        if (targetS < 0) targetS += st.track.length;
        let guard = 0;
        while (guard < 20000) {
          const s = window.__pc.getState();
          if (s.kart.s >= targetS) break;
          const steer = Math.max(-1, Math.min(1, -s.kart.lateral / 0.5));
          window.__pc.setInput({ steer });
          window.__pc.step(1);
          guard++;
        }
      });
      // Let a couple of RAF frames render with the camera settled here.
      await page.waitForTimeout(150);
      const rampShot = await page.screenshot();
      fs.writeFileSync(path.join(OUT_DIR, 'ramp.png'), rampShot);

      // Guard B: the kart must actually be on screen and unoccluded here —
      // a ray from the camera through the kart's own screen position
      // should hit the kart first, not clip through ramp/basin geometry.
      const vis = await page.evaluate(() => window.__pc.raycastKart());
      record('ramp approach: kart is on screen', vis.onScreen,
        `screen=(${vis.screenX.toFixed(0)},${vis.screenY.toFixed(0)})`);
      record('ramp approach: kart is the first raycast hit (not occluded)', vis.firstHitIsKart);
    });

    // ---- Guard: Track.project()'s lateral sign convention. From dead
    // center on a straight (fresh reset: lateral=0, heading=local tangent),
    // a brief steer=+1 (confirmed elsewhere to turn the kart right on
    // screen) must make `lateral` go POSITIVE — i.e. lateral > 0 means
    // "right of centerline", the same side steer > 0 turns toward. This is
    // the single source-of-truth convention every consumer (soft walls,
    // hard clamp, ramp/curb placement, and later AI/lap code) depends on. ----
    await withPage(browser, {}, async (page) => {
      await page.goto(url('?test=1'));
      await page.waitForFunction(() => window.__pc && window.__pc.ready);
      const lateralResult = await page.evaluate(() => {
        window.__pc.resetKart();
        const startLateral = window.__pc.getState().kart.lateral;
        window.__pc.setInput({ steer: 1 });
        window.__pc.step(15); // 0.25s — short enough that track curvature doesn't confound it
        const endLateral = window.__pc.getState().kart.lateral;
        return { startLateral, endLateral };
      });
      record('a. steer=+1 from center makes lateral go positive (lateral>0 = right)',
        lateralResult.startLateral === 0 && lateralResult.endLateral > 0.01,
        `start=${lateralResult.startLateral.toFixed(4)}, end=${lateralResult.endLateral.toFixed(4)}`);
    });

    // ---- f. Touch steering (asserts on __pc.getInput().steer directly) ----
    await withPage(browser, {}, async (page) => {
      await page.goto(url('?test=1'));
      await page.waitForFunction(() => window.__pc && window.__pc.ready);

      const client = await page.context().newCDPSession(page);

      async function touchAt(x, y, phase) {
        await client.send('Input.dispatchTouchEvent', {
          type: phase, // touchStart | touchMove | touchEnd
          touchPoints: phase === 'touchEnd' ? [] : [{ x, y }],
        });
      }
      // Advance a few real physics ticks (via the RAF loop already running)
      // so Input's internal smoothing catches up to the raw touch delta,
      // then read the live input object.
      const settleAndReadSteer = () => page.evaluate(() => {
        window.__pc.step(20);
        return window.__pc.getInput().steer;
      });

      // Touch down on left half, move right 60px -> steer > 0.3.
      const leftX = 200, leftY = 400;
      await touchAt(leftX, leftY, 'touchStart');
      await touchAt(leftX + 60, leftY, 'touchMove');
      await page.waitForTimeout(150);
      const steerAfterMoveRight = await settleAndReadSteer();
      record('f. touch move right on left-half: steer > 0.3', steerAfterMoveRight > 0.3,
        `steer=${steerAfterMoveRight.toFixed(3)}`);

      // Move up/down only from a fresh center -> steer stays ~0.
      await touchAt(leftX, leftY, 'touchStart');
      await touchAt(leftX, leftY - 80, 'touchMove');
      await touchAt(leftX, leftY + 80, 'touchMove');
      await page.waitForTimeout(100);
      const vertOnlySteer = await settleAndReadSteer();
      record('f. vertical-only movement: |steer| < 0.05', Math.abs(vertOnlySteer) < 0.05,
        `steer=${vertOnlySteer.toFixed(3)}`);

      // Release -> steer returns to 0 within 0.5s.
      await touchAt(leftX + 60, leftY, 'touchMove'); // deflect right again first
      await page.waitForTimeout(100);
      await touchAt(leftX + 60, leftY, 'touchEnd');
      await page.waitForTimeout(500);
      const steerAfterRelease = await page.evaluate(() => {
        window.__pc.step(30); // let smoothing settle within the simulated 0.5s window
        return window.__pc.getInput().steer;
      });
      record('f. release: steer returns to 0 within 0.5s', Math.abs(steerAfterRelease) < 0.05,
        `steer=${steerAfterRelease.toFixed(3)}`);

      // Touch on right half should not steer at all.
      const rightHalfX = 900, rightHalfY = 400;
      await touchAt(rightHalfX, rightHalfY, 'touchStart');
      await touchAt(rightHalfX + 60, rightHalfY, 'touchMove');
      await page.waitForTimeout(100);
      const rightHalfSteer = await settleAndReadSteer();
      await touchAt(rightHalfX, rightHalfY, 'touchEnd');
      record('f. touch on right half: steer stays 0', Math.abs(rightHalfSteer) < 0.01,
        `steer=${rightHalfSteer.toFixed(3)}`);
    });

    // ---- Guard: steer sign matches the ON-SCREEN turn direction, not
    // just the numeric sign of input.steer. This is the regression guard
    // for the real-iPad bug where sliding right visibly turned the kart
    // left (input.steer was correctly positive, but the physics applied
    // it backwards). "Turns right" is defined the same way a player looking
    // at the screen would judge it: the kart's forward direction sweeps
    // toward the chase camera's own world-space right vector — computed
    // fresh from the live camera via __pc.getCameraRight(), never assumed
    // as a fixed world axis, so this can't be fooled by a camera change
    // that happens to compensate for a physics-sign regression (or vice
    // versa). Runs on the ramp's flat lead-in, a straight stretch. ----
    async function turnSign(page) {
      // heading -> forward unit vector, matching Physics.step's own
      // dx=sin(heading), dz=cos(heading) convention.
      return page.evaluate(() => {
        const before = window.__pc.getState().kart.heading;
        const right = window.__pc.getCameraRight();
        return { before, right };
      });
    }
    function forwardVec(heading) { return { x: Math.sin(heading), z: Math.cos(heading) }; }
    function dot2(a, b) { return a.x * b.x + a.z * b.z; }

    await withPage(browser, {}, async (page) => {
      await page.goto(url('?test=1'));
      await page.waitForFunction(() => window.__pc && window.__pc.ready);

      // Drive onto the ramp's straight lead-in and let the chase camera
      // settle behind the kart before measuring, on both a real (0/0)
      // heading start and mid-track — reuse the ramp approach point since
      // it's a known straight stretch.
      async function driveToStraightSection() {
        await page.evaluate(() => {
          window.__pc.resetKart();
          window.__pc.clearInput();
        });
        await page.evaluate(() => {
          const st = window.__pc.getState();
          const targetS = st.track.rampS - 3;
          let guard = 0;
          while (guard < 20000) {
            const s = window.__pc.getState();
            if (s.kart.s >= (targetS < 0 ? targetS + st.track.length : targetS)) break;
            const steer = Math.max(-1, Math.min(1, -s.kart.lateral / 0.5));
            window.__pc.setInput({ steer });
            window.__pc.step(1);
            guard++;
          }
          window.__pc.setInput({ steer: 0 });
        });
        await page.waitForTimeout(250); // let the RAF-driven chase camera settle behind the kart
      }

      for (const [label, steerVal] of [['positive (right slide)', 1], ['negative (left slide)', -1]]) {
        await driveToStraightSection();
        const { before, right } = await turnSign(page);
        await page.evaluate((s) => window.__pc.setInput({ steer: s }), steerVal);
        await page.evaluate(() => window.__pc.step(30)); // 0.5s of physics, synchronous — no RAF/camera update in between
        const after = await page.evaluate(() => window.__pc.getState().kart.heading);

        const fBefore = forwardVec(before);
        const fAfter = forwardVec(after);
        const sweep = { x: fAfter.x - fBefore.x, z: fAfter.z - fBefore.z };
        const rightComponent = dot2(sweep, right); // >0 means the forward vector swept toward camera-right

        const expectRight = steerVal > 0;
        const pass = expectRight ? rightComponent > 0.01 : rightComponent < -0.01;
        record(`steer=${steerVal} (${label}) turns the kart toward the correct screen side`, pass,
          `rightComponent=${rightComponent.toFixed(4)} (camera-right dot heading-sweep)`);
      }

      // ---- Same check via a real touch gesture, not setInput() ----
      await driveToStraightSection();
      // driveToStraightSection() leaves a setInput({steer:0}) override
      // active (used to hold the kart straight while it settles); clear it
      // so the upcoming real touch gesture actually reaches the physics.
      await page.evaluate(() => window.__pc.clearInput());
      const { before: touchBefore, right: touchRight } = await turnSign(page);
      const client = await page.context().newCDPSession(page);
      async function touchAt(x, y, phase) {
        await client.send('Input.dispatchTouchEvent', {
          type: phase, touchPoints: phase === 'touchEnd' ? [] : [{ x, y }],
        });
      }
      const leftX = 200, leftY = 400;
      await touchAt(leftX, leftY, 'touchStart');
      await touchAt(leftX + 60, leftY, 'touchMove'); // slide right
      await page.waitForTimeout(500); // hold ~0.5s of real time, driven by the actual RAF loop
      await touchAt(leftX + 60, leftY, 'touchEnd');
      const touchAfter = await page.evaluate(() => window.__pc.getState().kart.heading);

      const touchSweep = {
        x: forwardVec(touchAfter).x - forwardVec(touchBefore).x,
        z: forwardVec(touchAfter).z - forwardVec(touchBefore).z,
      };
      const touchRightComponent = dot2(touchSweep, touchRight);
      record('real touch: slide right turns the kart right on screen', touchRightComponent > 0.005,
        `rightComponent=${touchRightComponent.toFixed(4)}`);

      // ---- Same check via the real keyboard fallback (Right arrow) ----
      await driveToStraightSection();
      await page.evaluate(() => window.__pc.clearInput());
      const { before: keyBefore, right: keyRight } = await turnSign(page);
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(500); // hold ~0.5s of real time, driven by the actual RAF loop
      await page.keyboard.up('ArrowRight');
      const keyAfter = await page.evaluate(() => window.__pc.getState().kart.heading);
      const keySweep = {
        x: forwardVec(keyAfter).x - forwardVec(keyBefore).x,
        z: forwardVec(keyAfter).z - forwardVec(keyBefore).z,
      };
      const keyRightComponent = dot2(keySweep, keyRight);
      record('keyboard: Right arrow turns the kart right on screen', keyRightComponent > 0.005,
        `rightComponent=${keyRightComponent.toFixed(4)}`);
    });

    // ---- Overhead screenshot + Guard A: the road ribbon must actually
    // cover the whole loop (not just half of it — see the buildTrackMesh
    // indexing bug this guard is meant to catch for good). Sample ~40
    // evenly spaced centerline points, project each to screen under the
    // top-down camera, and read back the on-screen pixel color: every one
    // should match the road color, except the few points that fall inside
    // the sink gap (checked separately and expected to differ). ----
    await withPage(browser, {}, async (page) => {
      await page.goto(url('?test=1'));
      await page.waitForFunction(() => window.__pc && window.__pc.ready);
      await page.evaluate(() => window.__pc.debugCamera('top'));
      await page.waitForTimeout(300); // let a few RAF frames render the new camera
      const topShot = await page.screenshot();
      fs.writeFileSync(path.join(OUT_DIR, 'topdown.png'), topShot);
      record('overhead screenshot captured', topShot.length > 15000, `bytes=${topShot.length}`);

      // Lit color of the road material as it actually renders under the
      // scene's hemisphere+directional lighting (measured empirically —
      // shading scales the raw 0xD8A650 material color down non-uniformly,
      // so comparing against the raw hex is the wrong reference point).
      const ROAD_RGB = [182, 131, 54];
      const N = 40;
      const sampleResult = await page.evaluate(({ roadRgb, n }) => {
        const st = window.__pc.getState();
        const length = st.track.length;
        const rampS = st.track.rampS;
        // Excludes the gap itself plus the ramp/landing-pad geometry on
        // both sides (differently colored, not a bug if sampled there).
        const gapHalf = 3.0;
        const results = [];
        for (let k = 0; k < n; k++) {
          // Midpoints, not segment boundaries — s=0 sits exactly on a
          // start/finish-checker seam, an unrelated 1px anti-aliasing edge
          // case this guard isn't meant to catch.
          const s = ((k + 0.5) / n) * length;
          let d = Math.abs(s - rampS);
          d = Math.min(d, length - d);
          if (d < gapHalf) continue; // skip points inside/near the sink gap
          const p = st.track.centerlinePoint(s);
          const screen = window.__pc.worldToScreen(p.x, 0.02, p.z);
          if (screen.behindCamera) { results.push({ s, ok: false, reason: 'behindCamera' }); continue; }
          const px = window.__pc.readPixel(screen.x, screen.y);
          const dist = Math.sqrt(
            (px[0] - roadRgb[0]) ** 2 + (px[1] - roadRgb[1]) ** 2 + (px[2] - roadRgb[2]) ** 2
          );
          // Generous tolerance: curbs cast soft shadows onto nearby road
          // pixels (legitimately darker, still road), while the counter
          // color sits much further away (~100+) from the lit road color,
          // so this still clearly fails if a sample lands off the ribbon.
          results.push({ s, ok: dist < 65, px, dist });
        }
        return results;
      }, { roadRgb: ROAD_RGB, n: N });

      const failures = sampleResult.filter(r => !r.ok);
      record('A. road ribbon covers the whole loop (road-colored at all sampled points)',
        failures.length === 0,
        failures.length === 0
          ? `${sampleResult.length}/${sampleResult.length} points matched the road color`
          : `${failures.length}/${sampleResult.length} points did NOT match; e.g. s=${failures[0].s.toFixed(1)} px=${JSON.stringify(failures[0].px || failures[0].reason)}`);
    });

    // ---- Guard D: draw-call count for a normal driving frame (the main
    // iPad perf risk — curbs are InstancedMesh so this should stay low). ----
    await withPage(browser, {}, async (page) => {
      await page.goto(url('?test=1'));
      await page.waitForFunction(() => window.__pc && window.__pc.ready);
      await page.waitForTimeout(200);
      const info = await page.evaluate(() => window.__pc.getRenderInfo());
      record('D. draw calls in a normal frame < 60', info.calls < 60,
        `calls=${info.calls}, triangles=${info.triangles}`);
    });

    // ---- g. Portrait shows rotate overlay ----
    await withPage(browser, { viewport: { width: 820, height: 1180 } }, async (page) => {
      await page.goto(url('?test=1'));
      await page.waitForTimeout(300);
      const visible = await page.evaluate(() => {
        const el = document.getElementById('rotate-overlay');
        return el.classList.contains('visible');
      });
      record('g. portrait viewport shows rotate overlay', visible);
    });

    // ---- h. Load failure shows friendly message ----
    await withPage(browser, { blockThree: true }, async (page) => {
      await page.goto(url());
      await page.waitForFunction(() => {
        const el = document.getElementById('load-error-overlay');
        return el && el.classList.contains('visible');
      }, null, { timeout: 10000 });
      const visible = await page.evaluate(() => document.getElementById('load-error-overlay').classList.contains('visible'));
      record('h. CDN failure shows friendly load-error message', visible);
    });

    // ---- i. Without ?test=1, __pc is undefined ----
    await withPage(browser, {}, async (page) => {
      await page.goto(url());
      await page.waitForTimeout(1000);
      const undef = await page.evaluate(() => typeof window.__pc === 'undefined');
      record('i. window.__pc is undefined without ?test=1', undef);
    });

  } finally {
    await browser.close();
    server.close();
  }

  console.log('\n--- Summary ---');
  const failed = results.filter(r => !r.pass);
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}: ${r.name}`);
  }
  if (lapTimeSeconds != null) {
    console.log(`\nMeasured lap time: ${lapTimeSeconds.toFixed(2)}s`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  process.exit(failed.length > 0 ? 1 : 0);
}

// Quick non-blank check: decode PNG dimensions aren't checked pixel-by-pixel
// (would need a PNG decoder); instead we check the byte length is
// substantial and not suspiciously small/uniform, which a fully blank
// canvas screenshot would produce due to PNG compression.
function isNonBlankPng(buffer) {
  return buffer.length > 15000; // a flat-color 1180x820 PNG compresses far smaller
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
