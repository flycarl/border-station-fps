# Autonomous Bomb Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make bomb rounds continue autonomously after the human dies, with randomized carriers, bot recovery/planting, active defenders, spectating, and a red floor site marker.

**Architecture:** Keep `BombSystem` authoritative for bomb state, add deterministic round-carrier selection at game composition, and make `BotSquad` the single coordinator for retrieve/plant/defuse/pressure assignments. `Game` owns spectator selection while `WorldRuntime` owns only the procedural site marker rendering.

**Tech Stack:** TypeScript, Three.js, Rapier, Vitest, Playwright, Vite.

## Global Constraints

- Preserve the 3v3 roster and fixed 60 Hz simulation order.
- No external assets, audio, dependencies, or multiplayer networking.
- All bot assignment ties use distance then actor id for deterministic QA.
- Production code follows a witnessed RED → GREEN test cycle.

---

### Task 1: Deterministic carrier assignment and bot bomb objectives

**Files:**
- Modify: `src/game.ts`
- Modify: `src/ai/bot-controller.ts`
- Modify: `src/ai/bot-squad.ts`
- Test: `tests/game.test.ts`
- Test: `tests/ai/bot-controller.test.ts`
- Test: `tests/ai/bot-squad.test.ts`

**Interfaces:**
- Produces: `selectRoundBombCarrier(roster: readonly RosterEntry[], round: number): EntityId`
- Produces: `BotObjective` including `retrieve`
- Consumes: `BombView.state`, `carrierId`, `position`, living actor positions, and `NavGraph`

- [ ] Write failing tests proving carrier selection is deterministic, covers more than the human across rounds, and always selects an attacker.
- [ ] Write failing bot tests proving one closest living bot retrieves a dropped bomb, the carrier plants, and defenders counter-push toward living attackers.
- [ ] Run focused tests and confirm failures describe the missing behavior.
- [ ] Implement seeded carrier selection and replace hard-coded bomb creation in constructor/restart/round reset.
- [ ] Implement `retrieve`, deterministic retriever selection, target selection, and active defender pressure.
- [ ] Run focused tests until green and commit.

### Task 2: Continue visible play after human death

**Files:**
- Modify: `src/game.ts`
- Test: `tests/game.test.ts`
- Modify: `e2e/vertical-slice.spec.ts`

**Interfaces:**
- Produces: `selectViewActor(actors: readonly ActorSnapshot[], humanId: EntityId): EntityId | null`
- Consumes: human alive state and surviving actor positions

- [ ] Write failing unit tests for alive-human view, living-attacker fallback, and defender fallback.
- [ ] Write a failing browser scenario that kills the human carrier, enables live bot commands, and observes bot movement plus dropped-bomb recovery/plant progression.
- [ ] Confirm the unit/browser tests fail for the corpse-locked camera and missing AI objective.
- [ ] Render from the selected living actor while retaining dead-human first-person weapon hiding.
- [ ] Add only the QA observations needed to prove autonomous progression.
- [ ] Run focused unit and browser tests until green and commit.

### Task 3: Red bomb-site floor marker

**Files:**
- Modify: `src/world/world-runtime.ts`
- Test: `tests/world/world-runtime.test.ts`
- Modify: `e2e/vertical-slice.spec.ts`
- Create: `docs/verification/autonomous-bomb-round-1440x900.png`

**Interfaces:**
- Produces: `createBombSiteMarkerGeometry(site: SiteBounds): { fill: BufferGeometry; outline: BufferGeometry }`
- Consumes: `createBorderStationGraybox().bombSite`

- [ ] Write a failing headless geometry/resource test for the authoritative site extents.
- [ ] Confirm RED before adding marker production code.
- [ ] Add translucent red floor fill, bright outline, corner accents, and disposal ownership.
- [ ] Add browser assertions and capture an active 1440×900 objective screenshot.
- [ ] Run focused world/browser tests, inspect the image, and commit.

### Task 4: Full verification and integration

**Files:**
- Modify only files required by findings from verification.

- [ ] Run `npm test -- --run` and require all tests to pass.
- [ ] Run `npm run build` and require successful typecheck/bundle.
- [ ] Run `CAPTURE_VERIFICATION=1 npx playwright test` and require all scenarios to pass.
- [ ] Inspect the new screenshot for the red site, active bots, readable HUD, and nonblank canvas.
- [ ] Run `git diff --check`, obtain a final read-only review, fix findings test-first, and rerun affected/full checks.
- [ ] Merge locally into `master`, verify the merged result, restart port 5173, and confirm HTTP 200.
