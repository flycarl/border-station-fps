# Combat Feel and Corner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver comfortable weapon motion, visible recoil, less accurate and more active bots, and a traversable L-shaped map corner.

**Architecture:** Keep visual weapon state inside `FirstPersonWeaponRig`, deterministic combat decisions inside `BotController`/`BotSquad`, and authored geometry plus navigation inside the graybox definition. Game orchestration remains unchanged except for consuming the tuned outputs.

**Tech Stack:** TypeScript, Three.js, Rapier, Vitest, Playwright.

## Global Constraints

- Preserve fixed-step gameplay and seeded deterministic AI.
- Do not change authoritative hitscan damage rules.
- Keep bots motionless outside `live` and `planted` phases.
- Keep both ramp routes and the bomb site reachable.

---

### Task 1: Weapon sway and recoil

**Files:**
- Modify: `src/weapons/first-person-weapon.ts`
- Test: `tests/weapons/first-person-weapon.test.ts`

**Interfaces:**
- Consumes: `FirstPersonWeaponState` movement, fired, reload, pause, and weapon id.
- Produces: stable `FirstPersonWeaponDiagnostics` offsets and rotations.

- [ ] Add failing tests that cap one-second walking displacement, prevent pistol transform drift, and require recoil accumulation plus recovery.
- [ ] Run `npm test -- --run tests/weapons/first-person-weapon.test.ts` and confirm the new assertions fail.
- [ ] Implement smoothed low-frequency sway, authored local pose resets, and damped recoil.
- [ ] Re-run the focused test and commit the passing change.

### Task 2: Bot aim error and defender patrol

**Files:**
- Modify: `src/ai/bot-controller.ts`
- Modify: `src/ai/bot-squad.ts`
- Test: `tests/ai/bot-controller.test.ts`
- Test: `tests/ai/bot-squad.test.ts`

**Interfaces:**
- Consumes: seeded bot state, match phase, actor positions, and navigation nodes.
- Produces: deterministic commands with changing bounded aim error and live hold-position movement.

- [ ] Add failing tests for changing sustained-fire aim, defender movement toward distinct anchors, and unchanged freeze behavior.
- [ ] Run both focused AI test files and confirm the failures describe the missing behaviors.
- [ ] Add timed aim-error resampling and make `hold` move until within its anchor radius.
- [ ] Assign the three defenders to left, center, and right site anchors during live play.
- [ ] Re-run both focused AI test files and commit the passing change.

### Task 3: L-shaped corner and route graph

**Files:**
- Modify: `src/world/border-station-graybox.ts`
- Test: `tests/world/border-station-graybox.test.ts`
- Test: `e2e/vertical-slice.spec.ts`

**Interfaces:**
- Produces: `corner-cross`/`corner-return` solids plus `corner-entry`/`corner-turn` navigation nodes.
- Consumed by: Rapier graybox construction, radar bounds, BotSquad navigation, and browser traversal QA.

- [ ] Add failing geometry and graph assertions for a perpendicular wall pair and connected attack route.
- [ ] Run the graybox tests and confirm the new assertions fail.
- [ ] Add the two walls and connect the attack route through the corner nodes.
- [ ] Add deterministic browser traversal and defender-opening movement scenarios.
- [ ] Re-run focused tests and commit the passing change.

### Task 4: Release verification

**Files:**
- Modify: `docs/verification/combat-feel-corner-1440x900.png`

- [ ] Run `npm test -- --run` and require all Vitest files to pass.
- [ ] Run `npm run build` and require TypeScript plus Vite production build success.
- [ ] Run `CAPTURE_VERIFICATION=1 npm run test:e2e` and require all scenarios to pass.
- [ ] Inspect the 1440×900 capture for weapon stability, recoil visibility, corner readability, and HUD overlap.
- [ ] Request read-only code review, fix all Important findings, merge locally, re-run verification, and restart port 5173.
