# Fast Round Transitions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every round a three-second preparation phase and start the next non-final round immediately after resolution.

**Architecture:** Keep timing authority in `MatchController`. Production `Game` supplies `freeze: 3` and `result: 0`; the controller immediately calls its existing next-round transition when a zero-delay non-final result is produced.

**Tech Stack:** TypeScript, Vitest, Playwright, Vite.

## Global Constraints

- Preparation lasts exactly 3 seconds every round.
- A non-final round advances in the same authoritative update that resolves it.
- `match-over` remains stable when either team reaches 7 wins.
- Bomb progress remains frozen during preparation.

---

### Task 1: Three-second preparation and immediate next round

**Files:**
- Modify: `src/game.ts`
- Modify: `src/match/match-controller.ts`
- Modify: `tests/match/match-controller.test.ts`
- Modify: `e2e/vertical-slice.spec.ts`

**Interfaces:**
- Consumes: `MatchConfig.freeze`, `MatchConfig.result`, `MatchController.update()`
- Produces: immediate `MatchSnapshot` `{ phase: 'freeze', round: previous + 1, phaseRemaining: 3 }` after a non-final resolution

- [ ] Add a failing controller test using `{ freeze: 3, result: 0 }` that resolves a timeout and immediately expects round 2 freeze, retained score, and three seconds remaining.
- [ ] Add a failing controller test that reaches seven wins and remains in `match-over` rather than starting round 8.
- [ ] Update the existing objective-freeze test from 12 seconds to 3 seconds and verify bomb progress stays zero.
- [ ] Run `npm test -- --run tests/match/match-controller.test.ts` and confirm the immediate transition test fails before production changes.
- [ ] In `MatchController.endRound`, enter `match-over` for a match win; otherwise start the next round immediately when `config.result === 0`, retaining the existing positive-delay result path.
- [ ] Set production `MATCH_CONFIG.freeze` to `3` and `MATCH_CONFIG.result` to `0`.
- [ ] Update the composed Playwright round-resolution test to expect round 2 freeze immediately with approximately three seconds remaining.
- [ ] Run focused tests, then `npm test -- --run`, `npm run build`, and `npx playwright test`.
- [ ] Commit the verified change.
