# Bot Navigation Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop attack and defense bots from continuously walking into walls after navigation or combat displacement.

**Architecture:** `BotSquad` restores bots to the nearest authored navigation node before advancing along graph edges. `BotController` provides a deterministic, time-bounded lateral recovery only when a commanded bot has made no meaningful planar progress.

**Tech Stack:** TypeScript, Three.js, Rapier, Vitest, Playwright, Vite.

## Global Constraints

- Keep the existing 3v3 roster and 60 Hz fixed simulation.
- Preserve deterministic seeded bot behavior.
- Do not teleport bots, disable collisions, or allocate physics rays per frame.
- Do not change human movement or weapon behavior.

---

### Task 1: Re-enter authored navigation corridors

**Files:**
- Modify: `src/ai/bot-squad.ts`
- Test: `tests/ai/bot-squad.test.ts`

**Interfaces:**
- Consumes: `NavGraph.nearest()` and `NavGraph.findPath()`
- Produces: `routeToward(nav, from, target)` that returns the nearest start node while planar distance to it exceeds `2.0`, then returns the next path node

- [ ] Add a failing test with a bot displaced far from its nearest start node where the direct line to the next node would cross cover; expect the command to steer back to the start node first.
- [ ] Run `npm test -- --run tests/ai/bot-squad.test.ts` and confirm the new expectation fails against the existing next-node behavior.
- [ ] Add planar distance and the `2.0` node-arrival threshold to `routeToward()` without changing final bomb interaction targets.
- [ ] Run the focused squad tests and commit the green result.

### Task 2: Deterministic stuck recovery and browser regression

**Files:**
- Modify: `src/ai/bot-controller.ts`
- Test: `tests/ai/bot-controller.test.ts`
- Modify: `e2e/vertical-slice.spec.ts`

**Interfaces:**
- Produces: controller-local stall tracking with `0.01` minimum planar progress, `0.5` second stall trigger, and `0.6` second lateral recovery
- Consumes: current `BotContext.self.position`, `dt`, and the command already produced by objective/engagement logic

- [ ] Add a failing controller test that repeatedly supplies the same position with a movement objective for at least `0.5` seconds and expects a deterministic nonzero lateral recovery command.
- [ ] Add tests proving meaningful displacement resets the stall timer and stationary interaction commands never trigger recovery.
- [ ] Run `npm test -- --run tests/ai/bot-controller.test.ts` and witness the missing recovery failure.
- [ ] Implement allocation-free previous-position, stall-time, recovery-time, and alternating direction state; apply it to moving commands after objective or engagement selection.
- [ ] Add a Playwright regression that places a defense bot at the reproduced site-cover trap and an attack bot at the reproduced flank-cover trap, enables live bot commands, advances physics, and requires both to move more than `1.0` world unit from their trap positions.
- [ ] Run focused tests, then `npm test -- --run`, `npm run build`, and `npx playwright test`.
- [ ] Run `git diff --check`, commit, and obtain final read-only review.
