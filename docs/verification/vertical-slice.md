# Border Station vertical-slice verification

Date: 2026-07-14 (Asia/Shanghai)

## Result

PASS for the scoped desktop vertical slice. The production preview starts behind a deliberate modal, resumes only after confirmed pointer lock, runs one 60 Hz RAF composition, uses Rapier support queries for jumping, renders six command-driven actors, exposes snapshot-only HUD state, pauses on Escape/pointer-lock loss, and restarts without adding physics bodies, colliders, renderer geometries, listeners, or RAF loops.

## Expanded combat pass

The July 14 pass expands the arena from 22×64 m to 34×94 m, separates attack and defense spawns by 75 m, adds a second ramp, six cover solids, and branched left/right navigation lanes. Bot perception now reaches 42 m across a 120-degree cone; deterministic reaction time is 0.16–0.38 seconds, aim error is reduced, and bots advance/strafe while engaging beyond 15 m.

The player now has a camera-mounted procedural rifle and pistol with named receiver/slide, handguard, barrel, muzzle, magazine, stock/grip, sight, and hand meshes. The rig switches with weapon slot, hides on death, and responds to movement, firing, reloading, and pause state. It is visual-only and does not add physics colliders or raycast targets.

Fresh verification passed with 16 Vitest files / 80 tests, TypeScript no-emit, Vite production build, and all 11 Playwright Chromium scenarios. The updated browser suite crosses both ramps with real Rapier movement, observes a live bot produce pressure-movement and fire commands at 40 m, verifies pistol/rifle switching plus recoil/reload transforms through the `Game → WorldRuntime → FirstPersonWeaponRig` bridge, uses the expanded bomb site and unobstructed combat lanes, reports zero page/console/network errors, and verifies restart resource counts by equality rather than an obsolete fixed collider count. Built JS is 2,799.84 kB minified / 987.75 kB gzip (size warning only).

Known release note: Vite reports a 2,799.84 kB minified / 987.75 kB gzip JavaScript chunk, primarily Three.js + Rapier. Code splitting is deferred beyond this vertical slice.

## Reference ledger

| Reference | Loaded | Applied |
| --- | --- | --- |
| `threejs-game-ui-designer/references/ui-patterns.md` | yes | deliberate modal, authored HUD zones, fixed-width counters, gated debug state |
| UI quality / HUD readability / responsive fit checklists | yes | start/pause/restart states, contrast, stable metrics, desktop fit, reduced motion |
| `threejs-debug-profiler/references/debug-profile-checklists.md` | yes | context/loop/canvas/physics/restart triage and renderer diagnostics |
| Scene debugging / performance profile checklists | yes | production canvas sizes, pixel probe, render stats, body/collider cleanup |
| `threejs-qa-release/references/qa-release-checklists.md` | yes | production preview, interaction, console, pixel variance, restart evidence |
| Visual verification / playtest QA / release checklists | yes | active screenshot, movement, pause/restart, build and preview evidence |

## Automated verification

Superseded initial implementation RED evidence (retained as history):

- `npm test -- --run tests/ui/hud.test.ts tests/ui/start-screen.test.ts`: failed because both UI modules were absent.
- `npm test -- --run tests/game.test.ts tests/input/keyboard-mouse.test.ts tests/world/world-runtime.test.ts`: failed for missing game composition, unimplemented number-key slots, and missing world diagnostics/removal.
- `npm run test:e2e`: after Chromium installation, failed because `开始任务` was absent.
- Restart regression: the extended browser test failed with renderer geometries increasing from 10 to 14 while bodies/colliders stayed 6/12. Actor meshes now dispose geometry/material resources in `WorldRuntime.removePlayer`.

Historical July 13 verification: `npm test -- --run && npm run typecheck && npm run build && npm run test:e2e && git diff --check` passed with 15 Vitest files / 76 tests, TypeScript no-emit, Vite production build, and 8 Playwright Chromium tests. Those totals are superseded by the July 14 expanded-combat record above.

Review RED evidence:

- Ground-support tests failed with `runtime.isPlayerSupported is not a function`; the old code marked an airborne apex grounded solely because `abs(velocity.y) < 0.12`.
- Held-Space skin regression failed `expected 5.2 to be 4.8`, proving that support could remain true for the first ascending tick and reapply the impulse before support loss/reacquisition.
- Start-screen tests showed the modal hidden before lock confirmation and no `setLockError`; HUD test showed the continuously rewritten `.hud` carried `aria-live`.
- First Chromium retry: rejected pointer lock kept the game paused correctly, but the status locator was ambiguous; this was narrowed to the modal status.
- First composed defuse retry stayed `planted`: placing the defender inside the live planter collider let Rapier separate it from the objective. The deterministic setup now moves the planter away, then places the defender at the real bomb snapshot position.
- Browser-audit regression initially stopped the preview build because `installBrowserAudit` did not exist; after the shared listener was added, an injected `audit sentinel` page error was collected and the production-preview clean audit asserted an empty page-error list.
- Death-participation unit regression failed because `setPlayerActive`/`playerStatus` did not exist. The production fix changes a dead actor to a fixed body with zero collision groups, unregisters its collider from ray queries, and hides its mesh.
- The first composed death retry retained the corpse collider strongly enough for traversal to push its body from `z = 7` to `z = 4.708`; the fixed collision-group transition and removal of post-death velocity writes now preserve the authoritative death position.
- Input reset regression failed with `resetHeldState is not a function`; the public reset now clears keyboard and mouse-held state and is invoked by the central pause path used by Escape, pointer-lock loss, and lock rejection.
- HUD clearing regression retained `炸弹已安装` after the computed announcement became empty; every status-key transition now assigns the computed string, including `''`.

## Production browser evidence

- URL: `http://127.0.0.1:4173/?debug=1` and explicitly gated `?qa=1` scenarios using Playwright's `npm run build && npm run preview` web server.
- Browser: Playwright Chromium 149, headless, 1440×900, DPR 1.
- Canvas CSS and drawing buffer: 1440×900 / 1440×900.
- Active core loop: held `W` through freeze into live play; the human moved from `(-2, 1, 25)` to approximately `(-2, 0.849, 15.680)`. Phase advanced from `freeze` to `live`, and `phaseRemaining` reached 103.42 seconds.
- Pixel variance: 25/25 sampled canvas pixels were nonblank with 7 unique RGBA values.
- Primary production-preview browser audit: 0 console errors, 0 uncaught page errors, 0 failed network requests. The shared `pageerror` collector is proven by a focused injected-error regression.
- Pause/restart: Escape exposed `重新开始`; restart returned score to 0–0, phase to `freeze`, six actors, and one active RAF diagnostic.
- Active-play screenshot: [expanded-combat-pass-1440x900.png](./expanded-combat-pass-1440x900.png)

### Active renderer diagnostics

```json
{
  "calls": 9,
  "triangles": 504,
  "points": 0,
  "lines": 0,
  "geometries": 9,
  "textures": 1
}
```

### Physics and loop diagnostics

```json
{
  "engine": "rapier",
  "timestep": 0.01666666753590107,
  "bodies": 6,
  "colliders": 12,
  "sensors": 0,
  "ccdBodies": 0,
  "fixedHz": 60,
  "stepOrder": ["perception", "commands", "movement", "physics", "weapons", "bomb", "match", "snapshot"]
}
```

Before and after restart, diagnostics stayed at 9 geometries, 1 texture, 6 bodies, and 12 colliders.

### Query-gated QA driver

`window.__THREE_GAME_QA__` exists only with the exact `qa=1` query; a production-preview regression proves it is absent otherwise. It is non-visual. It can place an existing actor body, clear/provide ordinary `PlayerCommand` values, advance bounded 1/60 fixed ticks through the normal `perception → commands → movement → physics → weapons → bomb → match → snapshot` order, read normal game/bomb snapshots, and invoke the normal restart method. It cannot assign bomb terminal state, score, round winner, phase, actor health, or HUD text.

Focused browser scenarios proved:

- plant: human placed in the real site and held `interact` until `BombSystem` produced `planted`;
- defuse: planter moved clear, kit defender placed at the bomb snapshot and held `interact` until defense scored;
- elimination: human rifle commands fired through `WeaponSystem` and real Rapier raycasts until all defenders were eliminated and attack scored;
- death reconciliation: four real rifle shots killed the front defender; its body became fixed/non-interacting, its ray registration and mesh visibility turned off, a fifth shot damaged the living defender behind it, bot traversal crossed its death position, LOS stayed clear, support returned false, and restart restored active body/collider/raycast/mesh state without resource growth;
- timeout: idle fixed ticks exhausted the real live timer and defense scored;
- transition/retry: result advanced to round 2 freeze, then normal restart restored round 1 and 0–0;
- pointer lock: a confirmed `pointerlockchange` resumed play; rejected `requestPointerLock` kept the overlay visible/paused and announced an accessible error.

This is automated, deterministic production-preview QA, not a claim of full manual human play.

## Checklist results

- Deliberate start modal, not a landing page: pass.
- Start, pause/resume, restart states: pass.
- Pointer lock requested only inside start/resume/restart button gestures; pause remains until confirmation and rejection is accessible: pass in Chromium.
- Pointer-lock loss / Escape pauses fixed updates: pass.
- One active RAF and 60 Hz fixed update: pass via guarded `start()` and gated loop diagnostic.
- Six actors (human attack + 2 attack bots + 3 defense bots): pass in state and physics diagnostics.
- Both human and bots produce `PlayerCommand`: pass by composition and unit coverage.
- Real Rapier actor IDs drive weapon hits: pass via `tests/world/world-runtime.test.ts` and `WeaponSystem` integration boundary.
- HUD reads one composed game snapshot and owns no match rules: pass by code inspection/unit test.
- HUD text contrast, stable numeric containers, 1440×900 overlap/clip review: pass by screenshot inspection.
- Desktop-only scope: pass; no mobile/touch controls were added. Mobile-specific checks are not applicable.
- Rifle/pistol number-key selection, fire, and reload: pass in command/weapon unit coverage; rifle state is visible in production HUD.
- Bot reaction, line of sight, objective commands: pass in AI tests and composed actor motion.
- Plant/defuse, elimination, timeout, score/result/next-round transitions: pass through the composed production-preview game. Explosion remains covered at the BombSystem/MatchController production boundary.
- Ground support: floor/ramp pass; apex with near-zero vertical velocity fails support; the actor's collider is explicitly excluded and wall/cover colliders are filtered out.
- Live regions: normal timer/ammo rewrites produce zero announcer mutations; an objective transition announces exactly once.
- Restart cleanup: pass in unit and browser regression checks.
- Death cleanup: pass; dead actors retain snapshot position/state but cannot collide, support, intercept LOS/rays, absorb later shots, or render, and round/match restart recreates all six active actors.
- Production build/base path/assets: pass at root-host preview; no external assets or licenses were added.

## Residual risks

- Objective/combat browser scenarios are deterministic QA-driver automation rather than a full manual two-minute human play session.
- `preserveDrawingBuffer` is enabled so packaged QA can read pixels after compositing; it has a potential GPU performance cost, currently small at 9 calls / 504 triangles.
- No FPS/frame-time trace was recorded; renderer and physics counts are low, but this is not a full performance profile.
- The single JavaScript bundle is large and should be code-split in the performance/release milestone.
