# Task 8 report

Status: complete.

## Outcome

Implemented `Game.create(canvas, uiRoot)`, guarded single-RAF startup, fixed 60 Hz composition, six-player roster, command-driven human/AI control, real Rapier actor raycasts, snapshot-only HUD, deliberate start/pause modal, pointer-lock-safe pause, clean restart/disposal, and gated `?debug=1` renderer/physics/state diagnostics.

## RED / GREEN

- RED UI: missing `src/ui/hud.ts` and `src/ui/start-screen.ts` produced expected module-resolution failures.
- GREEN UI: 4 focused HUD/start-screen tests passed.
- RED composition: missing `src/game.ts`, number-key slots returning 1 instead of 2, and missing `WorldRuntime.diagnostics/removePlayer` all failed for their expected reasons.
- GREEN composition: 11 focused game/input/world/UI tests passed.
- RED browser: after `npx playwright install chromium`, the start button was absent from the old bootstrap.
- GREEN browser: active canvas, 0–0 HUD, Escape pause, and restart passed.
- RED restart regression: browser evidence found renderer geometries rising 10 → 14 after restart.
- GREEN restart regression: browser test confirms before/after equality; final diagnostics are 9 geometries, 6 bodies, and 12 colliders.
- RED combat regression: an origin actor raycast returned `shooter`; GREEN actor exclusion returned the real `target` ID and is now used by weapons/AI visibility.

## Files

Created:

- `src/game.ts`
- `src/ui/hud.ts`
- `src/ui/start-screen.ts`
- `tests/game.test.ts`
- `tests/ui/hud.test.ts`
- `tests/ui/start-screen.test.ts`
- `e2e/vertical-slice.spec.ts`
- `docs/verification/vertical-slice.md`
- `docs/verification/vertical-slice-active-1440x900.png`

Modified:

- `src/main.ts`
- `src/styles.css`
- `src/input/keyboard-mouse.ts`
- `src/world/world-runtime.ts`
- `tests/input/keyboard-mouse.test.ts`
- `tests/world/world-runtime.test.ts`

## Browser artifacts and diagnostics

- Active screenshot: `docs/verification/vertical-slice-active-1440x900.png` (1440×900).
- Canvas: CSS 1440×900; drawing buffer 1440×900.
- Pixels: 25/25 nonblank, 7 unique RGBA samples.
- Renderer: 9 calls, 504 triangles, 0 points, 0 lines, 9 geometries, 1 texture.
- Physics: Rapier, 1/60 timestep, 6 bodies, 12 colliders, 0 sensors, 0 CCD bodies.
- Errors: 0 console, 0 page, 0 failed requests.
- Core action: `W` moved the human z position from 25 to 15.68 after freeze; Escape paused; restart reset 0–0/freeze/six actors without resource growth.

## Checklists and references

Loaded and applied UI patterns plus UI quality/HUD readability/responsive fit, debug/profile checklist plus scene/performance checks, and QA/release plus visual/playtest/release checks. Full checklist mapping and residual risks are in `docs/verification/vertical-slice.md`.

## Concerns

- Browser evidence does not include a complete human plant/defuse round; deterministic BombSystem/MatchController tests cover those transitions.
- `preserveDrawingBuffer` supports exact packaged pixel evidence but can cost GPU performance.
- Vite warns about the 2.788 MB minified single JS chunk (984 kB gzip).
- No mobile controls or mobile QA were added because this task is explicitly desktop-only.

## Commands/results

Commands run during development:

```text
npm test -- --run tests/ui/hud.test.ts tests/ui/start-screen.test.ts
RED: module resolution failures, then GREEN: 2 files / 4 tests passed

npm test -- --run tests/game.test.ts tests/input/keyboard-mouse.test.ts tests/world/world-runtime.test.ts
RED: missing composition/slot/diagnostics behavior

npx playwright install chromium
PASS: Chromium 149 and headless shell installed

npm run test:e2e
RED old bootstrap, GREEN initial browser flow, RED geometry leak regression, GREEN clean restart
```

Final fresh verification:

```text
npm test -- --run && npm run typecheck && npm run build && npm run test:e2e
PASS: 15 test files / 67 tests
PASS: TypeScript no-emit typecheck
PASS: Vite production build (2,788.47 kB JS / 984.30 kB gzip; size warning only)
PASS: 1 Playwright Chromium test
```

Commit: `72f56ee` (`feat: complete playable border station slice`).

## Review-fix addendum (2026-07-13)

Fixed every Task 8 P1/P2 finding:

- Replaced the vertical-velocity heuristic with a Rapier downward normal ray query that excludes the player's rigid body, accepts only floor/ramp collider handles, and requires a walkable upward normal. Regressions cover airborne apex, floor, ramp, and held-Space behavior.
- Pointer lock is now authoritative: click leaves simulation paused/modal visible; confirmed `pointerlockchange` resumes; rejection or synchronous exception restores pause and reports `无法锁定鼠标，请重试。` in an accessible status region; lock loss pauses.
- Removed `aria-live` from the high-frequency HUD. A visually hidden, concise status announcer changes only on phase/objective keys; MutationObserver coverage proves timer/ammo updates cause zero mutations and planted announces once.
- Added an exact `qa=1`-gated, non-visual production driver. It only places existing bodies, supplies normal `PlayerCommand`s, advances the real 1/60 fixed order, reads snapshots, and calls normal restart. It cannot set bomb terminal state, phase, score, winner, health, or HUD text. A regression proves it is absent without the query.
- Chromium production-preview scenarios now cover actual plant, kit defuse, rifle elimination, timeout, result/score/next-round transitions, pointer-lock confirm/reject, restart cleanup, nonblank pixels, refreshed screenshot, and zero console/network failures. This is deterministic automated QA, not a claim of full manual human play.

Observed RED:

- Missing support-query API (3 failures), repeated held-Space impulse inside the support skin (`5.2` vs expected `4.8`), optimistically hidden start modal/missing lock error (2), and whole-HUD live region (1).
- Browser retry found ambiguous status selection and a real physics setup issue: overlapping planter/defender bodies separated the defender from the bomb. Moving the planter clear made the normal defuse path deterministic.

Final fresh command/result:

```text
npm test -- --run && npm run typecheck && npm run build && npm run test:e2e
PASS: 15 Vitest files / 74 tests
PASS: TypeScript no-emit
PASS: Vite production build, 2,790.87 kB JS / 984.97 kB gzip (size warning only)
PASS: 6 Playwright Chromium tests / 8.3 s
```

Browser evidence: 0 console errors, 0 failed requests, nonblank center pixel, 1440×900 screenshot refreshed. Restart remains equal before/after at 9 geometries, 6 bodies, and 12 colliders.
