# Expanded Combat Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the tactical map, strengthen deterministic bots, and add an animated first-person rifle/pistol view model.

**Architecture:** Keep map and AI changes in their current focused modules. Add one visual-only weapon rig module and expose a compact update bridge through `WorldRuntime`, with `Game` translating simulation state into view-model state.

**Tech Stack:** TypeScript, Three.js, Rapier, Vite, Vitest, Playwright.

## Global Constraints

- Preserve the existing 3v3 bomb-round loop and 60 Hz fixed-step simulation.
- Keep all AI behavior deterministic for a fixed seed.
- Keep the first-person weapon visual-only and excluded from physics/raycasting.
- Do not add external runtime assets or API calls.

---

### Task 1: Expanded Border Station Layout

**Files:**
- Modify: `src/world/border-station-graybox.ts`
- Modify: `tests/world/border-station-graybox.test.ts`

**Interfaces:**
- Produces: `createBorderStationGraybox(): GrayboxDefinition` with at least 34 m width, 90 m length, two ramps, two navigation lanes, and separated spawns.

- [ ] Add failing assertions for floor dimensions, ramp count, cover count, spawn separation, and branched navigation connectivity.
- [ ] Run `npm test -- --run tests/world/border-station-graybox.test.ts` and confirm the new assertions fail.
- [ ] Expand solids, spawns, site bounds, and navigation nodes while preserving the existing ramp pitch contract.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Stronger Deterministic Bots

**Files:**
- Modify: `src/ai/bot-controller.ts`
- Modify: `tests/ai/bot-controller.test.ts`

**Interfaces:**
- Produces: `BotController.update(context): PlayerCommand` with a 42 m/120-degree perception envelope, 0.16-0.38 s reaction window, tighter aim error, and deterministic engage movement.

- [ ] Add failing tests for the new view/range threshold, reaction bound, and pressure movement.
- [ ] Run `npm test -- --run tests/ai/bot-controller.test.ts` and confirm the expected failures.
- [ ] Implement the minimal constant and engagement-command changes.
- [ ] Re-run the focused test and confirm it passes.

### Task 3: First-Person Weapon Rig

**Files:**
- Create: `src/weapons/first-person-weapon.ts`
- Create: `tests/weapons/first-person-weapon.test.ts`
- Modify: `src/world/world-runtime.ts`
- Modify: `src/game.ts`

**Interfaces:**
- Produces: `FirstPersonWeaponRig`, `FirstPersonWeaponState`, and `WorldRuntime.updateFirstPersonWeapon(state, dt)`.
- Consumes: selected weapon id, movement magnitude, shot event, reload state, alive state, and pause state.

- [ ] Add failing tests importing the missing rig and checking named rifle/pistol parts, switching, recoil, and reload transforms.
- [ ] Run `npm test -- --run tests/weapons/first-person-weapon.test.ts` and confirm it fails because the module is absent.
- [ ] Build the procedural rifle/pistol factories and animation state.
- [ ] Attach the rig to the perspective camera and dispose owned resources.
- [ ] Capture human shot events and pass selected weapon/movement/reload state from `Game`.
- [ ] Re-run focused tests and confirm they pass.

### Task 4: Full Verification and Integration

**Files:**
- Modify: `docs/verification/vertical-slice.md`
- Create: `docs/verification/expanded-combat-pass-1440x900.png`

**Interfaces:**
- Verifies the prior tasks through unit, type, production, and browser evidence.

- [ ] Run `npm test -- --run`, `npm run typecheck`, and `npm run build`.
- [ ] Start the local server and run the Playwright suite.
- [ ] Open active play, verify the weapon is visible and animated, inspect console/page errors, and capture a screenshot.
- [ ] Check renderer diagnostics and confirm the expanded level remains performant.
- [ ] Commit the verified change, merge it into `master`, and restart the user-facing server.
