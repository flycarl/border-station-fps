# Spectator, Solid Map, and Bot Accuracy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a whole-map death camera, grounded closed map geometry, an outline-only bomb site, and less accurate deterministic bot aim.

**Architecture:** Keep camera-mode selection pure in `game.ts`; keep render and Rapier geometry factories in `world-runtime.ts`; keep combat tuning in `bot-controller.ts`. Preserve the fixed update loop, map routes, bomb rules, and collision ownership.

**Tech Stack:** TypeScript, Three.js, Rapier 3D, Vitest, Playwright

## Global Constraints

- The living human camera remains first-person.
- The dead-human camera shows the complete map and follows no actor.
- Ramps and walls must have no visible or collidable gap beneath them.
- The bomb site has red lines and zero fill.
- Bot aim remains deterministic and bounded.

---

### Task 1: Death overview camera

**Files:**
- Modify: `src/game.ts`
- Modify: `src/world/world-runtime.ts`
- Test: `tests/game.test.ts`
- Test: `e2e/vertical-slice.spec.ts`

**Interfaces:**
- Produces: `selectCameraPose(actors, humanId): CameraPose`
- Produces: `GameQaDriver.cameraPose`

- [x] **Step 1: Write failing tests** asserting an alive human returns eye-level first-person pose and a dead human returns `{ position: { x: 0, y: 72, z: 0 }, yaw: 0, pitch: -Math.PI / 2 }` with `viewActorId === null`.
- [x] **Step 2: Run** `npm test -- --run tests/game.test.ts` and the focused death-camera Playwright test; expect the existing teammate-follow behavior to fail.
- [x] **Step 3: Implement** a pure selector and render with its pose; expose the last pose through QA diagnostics.
- [x] **Step 4: Re-run focused tests** and expect pass.

### Task 2: Closed ramps and grounded solids

**Files:**
- Modify: `src/world/world-runtime.ts`
- Test: `tests/world/world-runtime.test.ts`
- Test: `tests/world/border-station-graybox.test.ts`

**Interfaces:**
- Produces: `createSolidRampGeometry(solid): THREE.BufferGeometry`
- Produces: `groundSolid(solid): SolidDef`

- [x] **Step 1: Write failing tests** for a six-vertex triangular-prism footprint, closed indexed faces, a low edge at ground, a high edge matching `tan(BORDER_STATION_RAMP_PITCH) * size.z`, and every wall/cover bottom at zero.
- [x] **Step 2: Run** `npm test -- --run tests/world` and confirm the box-ramp and floating-cover implementation fails.
- [x] **Step 3: Implement** shared wedge vertices for Three.js geometry and `RAPIER.ColliderDesc.convexHull`, and extend box solids downward while preserving their authored top.
- [x] **Step 4: Re-run world tests** including traversal/support tests and expect pass.

### Task 3: Outline-only bomb site and bot aim error

**Files:**
- Modify: `src/world/world-runtime.ts`
- Modify: `src/ai/bot-controller.ts`
- Test: `tests/world/world-runtime.test.ts`
- Test: `tests/ai/bot-controller.test.ts`
- Test: `e2e/vertical-slice.spec.ts`

**Interfaces:**
- Changes: `createBombSiteMarkerGeometry(site): { outline }`
- Changes: aim bounds to yaw `0.060`, pitch `0.040`, interval `0.35`

- [x] **Step 1: Write failing marker tests** requiring only outline geometry and diagnostic `fillOpacity: 0`.
- [x] **Step 2: Write failing aim tests** requiring deterministic samples within the new bounds and at least one sample beyond the old bounds.
- [x] **Step 3: Run focused tests** and confirm failures match the old filled marker and old aim limits.
- [x] **Step 4: Remove the fill mesh/material**, retain the red perimeter/corner strokes, and update aim constants.
- [x] **Step 5: Re-run focused tests** and expect pass.

### Task 4: Verification and publication

**Files:**
- Modify only for scoped regressions found by verification.

**Interfaces:**
- Consumes: QA driver, production build, GitHub Pages base path
- Produces: reviewed `master` and updated `gh-pages`

- [x] **Step 1: Run** `git diff --check && npm test -- --run && npm run build && npx playwright test` and require zero failures.
- [x] **Step 2: Inspect desktop screenshots, canvas pixels, camera pose, renderer diagnostics, and console/page/network errors.**
- [ ] **Step 3: Request independent code review** and resolve every Critical or Important issue.
- [ ] **Step 4: Merge to `master`, re-run unit tests, push source, build with `--base=/border-station-fps/`, deploy `gh-pages`, and verify HTTP 200 with the new asset hash.
