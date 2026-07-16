# Bot Opening Lanes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent teammates and enemies from converging onto one navigation point, colliding, and jittering at the start of each round.

**Architecture:** Keep Rapier character collisions enabled. Assign each bot a deterministic lateral lane offset and apply that offset perpendicular to every active navigation segment, including corridor re-entry, so squad members retain separation while still following the same graph and objectives.

**Tech Stack:** TypeScript, Three.js, Rapier, Vitest, Playwright

## Global Constraints

- Preserve the three-second freeze phase and all bomb, combat, pursuit, and stuck-recovery behavior.
- Do not disable bot-to-bot collisions.
- Keep navigation deterministic for a given round and roster.

---

### Task 1: Reproduce opening convergence

**Files:**
- Modify: `tests/ai/bot-squad.test.ts`
- Modify: `e2e/vertical-slice.spec.ts`

**Interfaces:**
- Consumes: `BotSquad.sample(context)` and `window.__THREE_GAME_QA__`
- Produces: Regression assertions for parallel opening headings and safe same-team spacing

- [x] **Step 1: Write a failing unit test**

Place bots on distinct lateral lanes at a shared graph node, sample live commands with visibility disabled, and assert all teammates face parallel toward the next waypoint instead of steering inward.

- [x] **Step 2: Run the focused unit test and verify failure**

Run: `npm test -- --run tests/ai/bot-squad.test.ts`

Expected: FAIL because outer bots currently aim at the shared center waypoint.

- [x] **Step 3: Write a failing browser regression**

Advance from freeze through the first three live seconds, sampling every ten ticks, and assert the minimum same-team planar separation stays above `1.2` metres while every bot moves.

- [x] **Step 4: Run the focused browser test and verify failure**

Run: `npx playwright test e2e/vertical-slice.spec.ts -g "opening lanes"`

Expected: FAIL because measured same-team spacing currently falls to about `0.66` metres.

### Task 2: Add deterministic route lanes

**Files:**
- Modify: `src/ai/bot-squad.ts`
- Test: `tests/ai/bot-squad.test.ts`

**Interfaces:**
- Consumes: `NavGraph.nearest`, `NavGraph.findPath`, bot team ordering
- Produces: `routeToward(nav, from, target, laneOffset)` behavior with segment-perpendicular offsets

- [x] **Step 1: Add stable per-team lane offsets**

Use attack offsets `[0, 1.5]` and defense offsets `[1.5, 0, -1.5]`, matching the authored roster order.

- [x] **Step 2: Offset both graph re-entry and next-waypoint targets**

Compute the normalized planar perpendicular of the active graph segment and add `laneOffset` to the current and next node targets. Return the exact objective after the bot reaches the goal node.

- [x] **Step 3: Route every moving objective through the lane-aware helper**

Apply lanes to attack advance/plant, defense counter-push/defuse, and dropped-bomb retrieval. Keep distinct site holding anchors unchanged.

- [x] **Step 4: Run focused unit tests**

Run: `npm test -- --run tests/ai/bot-squad.test.ts`

Expected: PASS.

### Task 3: Verify and release

**Files:**
- Modify only if a regression reveals a scoped issue.

**Interfaces:**
- Consumes: production build and QA driver
- Produces: verified source branch and deployed GitHub Pages build

- [x] **Step 1: Run the browser regression**

Run: `npx playwright test e2e/vertical-slice.spec.ts -g "opening lanes"`

Expected: PASS with minimum same-team separation above `1.2` metres.

- [x] **Step 2: Run the complete verification suite**

Run: `npm test -- --run && npm run build && npx playwright test`

Expected: all unit tests, production build, and browser tests pass.

- [ ] **Step 3: Commit and integrate**

Commit the plan, tests, and implementation on `codex/fix-bot-opening-congestion`, merge into `master`, and push `master`.

- [ ] **Step 4: Rebuild and deploy GitHub Pages**

Build with `--base=/border-station-fps/`, publish `dist` to `gh-pages`, and verify the live URL returns HTTP 200.
