# Task 2 report — continue visible play after human death

## RED

- `npm test -- --run tests/game.test.ts`
  - 3 new spectator-selection tests failed as expected because `selectViewActor` did not exist (`TypeError: selectViewActor is not a function`).
- `npm run test:e2e -- --grep "surviving attackers recover"`
  - The real WeaponSystem killed the human carrier and the attack bot moved 3.90m and recovered the dropped bomb, but the scenario failed with `Expected: "planted", Received: "carried"`.
  - This exposed a real objective deadlock: the bot reached the site in X/Z, but the site nav node's Y differed enough from the settled body Y that the controller neither moved nor interacted.

## GREEN

- Added pure `selectViewActor`: alive human first; otherwise nearest living attacker relative to the human's death position; otherwise nearest living defender; deterministic actor-id tie break.
- `renderFrame` now renders from the selected living actor while first-person weapon state remains keyed to the dead human and therefore hidden.
- Added query-gated QA-only `viewActorId`; it is not part of normal diagnostics.
- Corrected the final plant target height to the carrier's actual height when it reaches the site nav node, allowing the existing BombSystem interaction to complete.
- Browser QA uses actual defender rifle shots through WeaponSystem, observes human death and dropped bomb, switches back to live bot commands, measures attacker-bot displacement, observes recovery, and reaches `planted`.

Verification:

- `npm test -- --run tests/game.test.ts tests/ai/bot-squad.test.ts` — 21/21 passed.
- `npm run test:e2e -- --grep "surviving attackers recover"` — 1/1 passed.
- `npm run typecheck` — passed.
- `npm test -- --run` — 17 files, 111/111 passed.
- `npm run build` — passed; only the existing bundle-size advisory remains.
- `git diff --check` — passed.

## Self-review

- QA mutation remains explicitly gated by `?qa=1`; the only new QA surface is a read-only view-actor observation.
- No human-death check was added to simulation stepping or bot command sampling.
- Camera fallback is deterministic and returns `null` only when no actor is alive.
- No WorldRuntime/site-marker work was touched (reserved for Task 3).
- Remaining concern: spectator switching is intentionally dynamic because “nearest living attacker” is recalculated from the corpse each render; this matches the brief but is not a free-camera spectator system.
