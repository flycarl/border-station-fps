# Fast Round Transitions Design

## Goal

Every round starts with exactly three seconds of preparation. A completed non-final round immediately advances to the next round's preparation phase without showing a result delay.

## Design

- Change the production match configuration from `freeze: 12` to `freeze: 3` and from `result: 5` to `result: 0`.
- Keep `result` as a supported configurable phase for tests or future modes with a positive delay.
- In `MatchController.endRound`, if the match has not reached `match-over` and `result === 0`, call `startNextRound()` immediately. This makes the round number, reset signal, and three-second preparation snapshot visible in the same authoritative update.
- Preserve the final `match-over` state when either team reaches seven wins.
- Preserve the rule that bomb objectives do not advance during preparation.

## Verification

- Unit tests prove a three-second freeze, immediate non-final round advance, score retention, and final-match stop.
- Browser QA proves a real composed round ends directly in round 2 freeze with approximately three seconds remaining.
- Full Vitest, build, and Playwright suites must pass.
