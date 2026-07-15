# Final Review Fix Report

## Scope

- Restored the documented planar navigation-graph re-entry rule for ordinary attacker `advance` and bomb-carrier `plant` routing.
- Preserved final plant-target Y alignment.
- Added controller lifecycle coverage for the exact recovery end boundary, alternating recovery direction, and dead/stationary resets.
- Added squad lifecycle coverage proving an inactive match phase clears recovery before live movement resumes.

## Root cause and minimal production change

`routeToward()` already returned the nearest navigation node when the actor was more than 2.0 planar units away. Defuse, retrieve, and defender pressure used that helper. The ordinary attacker branch separately selected `path[1]`, so a collision-displaced attacker could skip graph re-entry and aim through a solid.

The production fix adds the same `planarDistance(actor.position, from.position) > 2.0` guard immediately before the ordinary attacker path lookup. The existing `plant` branch still aligns the final site target's Y coordinate to `actor.position.y`; no controller behavior or interaction threshold changed.

## RED evidence

After adding the parameterized normal-attacker/bomb-carrier regression, before changing production code:

```text
$ npm test -- --run tests/ai/bot-squad.test.ts
Test Files  1 failed (1)
Tests       2 failed | 16 passed (18)

steers a displaced normal attacker back to the authored corridor before advancing
steers a displaced bomb carrier back to the authored corridor before advancing

expected 0.3805063771123649 to be close to 1.5707963267948966
exit=1
```

The observed `0.3805` heading points diagonally from the displaced actor to the following `site` node. The expected `π/2` heading points back to the nearest authored `attack` node.

## GREEN evidence

After adding only the missing planar re-entry guard:

```text
$ npm test -- --run tests/ai/bot-squad.test.ts
Test Files  1 passed (1)
Tests       18 passed (18)
exit=0
```

The controller lifecycle tests were coverage additions for existing intended behavior and passed on their first focused run without production changes:

```text
$ npm test -- --run tests/ai/bot-controller.test.ts
Test Files  1 passed (1)
Tests       25 passed (25)
exit=0
```

Combined focused verification and typecheck after adding inactive-phase coverage:

```text
$ npm test -- --run tests/ai/bot-controller.test.ts tests/ai/bot-squad.test.ts
Test Files  2 passed (2)
Tests       44 passed (44)

$ npm run typecheck
tsc --noEmit
exit=0
```

The plant-arrival regression was then strengthened to put the carrier at Y=3 while the site node remains at Y=0. It continued to interact, directly proving final plant target Y alignment remains intact:

```text
$ npm test -- --run tests/ai/bot-squad.test.ts
Test Files  1 passed (1)
Tests       19 passed (19)
exit=0
```

## Full verification

```text
$ npm test -- --run
Test Files  17 passed (17)
Tests       133 passed (133)
exit=0

$ npm run build
tsc --noEmit && vite build
28 modules transformed
built in 240ms
exit=0

$ npm run test:e2e
17 passed (29.2s)
exit=0

$ git diff --check
exit=0
```

Playwright included `live bots recover from the site and flank cover traps`, bomb recovery/planting, objective composition, traversal, combat, and death reconciliation.

## Self-review

- The threshold and planar metric exactly match `routeToward()` and the design.
- The production diff is one guard; no unrelated refactor was introduced.
- Both attack objectives that share this branch are regression-tested.
- Plant Y alignment is exercised with a nonzero actor/site height difference.
- Recovery lasts for the trigger command plus five subsequent 0.1-second commands and returns to forward movement on the immediately following command.
- A second stall selects the opposite lateral direction.
- Dead, stationary, and inactive lifecycles reset active recovery before resumed movement can inherit it.
- `git diff --check` reports no whitespace errors.

## Concerns

- Vite emits its existing advisory that the main JavaScript chunk exceeds 500 kB after minification. Build and all tests pass; this change does not affect bundle composition.
