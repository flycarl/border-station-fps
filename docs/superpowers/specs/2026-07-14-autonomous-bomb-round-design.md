# Autonomous Bomb Round Design

## Goal

Turn the current scripted objective into a self-running bomb round: either team can pressure opponents, the round remains visibly active after the human dies, one attacker receives the bomb deterministically at random each round, attack bots recover dropped bombs and plant them, and the bomb site is clearly outlined in red on the floor.

## Current-state findings

- The fixed simulation continues after the human dies, but `renderFrame()` keeps the camera on `attack-human`, creating the appearance that every bot stopped.
- Defense bots use three static `hold` anchors until a bomb is planted; they never counter-push toward living attackers.
- `Game` constructs every round's `BombSystem` with the hard-coded carrier `attack-human`.
- `BombSystem` already supports carrier death, dropped state, pickup, planting, defusing, and explosion, but dropped pickup requires `interact` and `BotSquad` has no retrieve objective.

## Design

### Round carrier assignment

Add a pure seeded selection function that chooses exactly one living-capable attacker roster entry from the human plus two attack bots. The round number is the seed, so assignments vary across rounds while tests and QA remain reproducible. Restart and round reset both use this function instead of hard-coding the human.

### Bot objective coordination

Extend bot objectives with `retrieve`.

- If the bomb is dropped, the closest living attack bot becomes the retriever, moves to the bomb, and holds `interact` inside pickup distance.
- If an attack bot carries the bomb, it follows the navigation graph to the site. A visible enemy still takes priority, allowing the carrier to fight; with no visible threat it resumes the plant route and interacts inside the site.
- Other attackers advance toward the site and engage enemies normally.
- Before the bomb is planted, defenders counter-push toward the nearest living attacker rather than stopping permanently at site anchors. Their existing vision and engagement rules still determine when they fire.
- After planting, one closest living defender defuses while the others pressure living attackers around the objective.

Selection is deterministic with distance and actor-id tie breaks so only one bot retrieves or defuses.

### Death and spectating

Simulation remains governed only by pause/match phases, never by human life state. Rendering selects the human while alive; after death it follows the nearest living attacker, then a living defender if no attackers remain. The first-person weapon stays hidden for a dead human. This exposes continued bot movement, combat, pickup, planting, and defusing instead of leaving the camera on the corpse.

### Bomb-site marker

`WorldRuntime` creates a procedural marker from the authoritative `bombSite` bounds: a translucent red floor rectangle with a bright red rectangular outline and corner accents. It has no collider and introduces no new external asset or dependency. The marker is disposed with other world resources.

### Diagnostics and QA

Snapshots continue exposing `bombState`; actor snapshots add no unnecessary state. The QA bridge exposes the current carrier through its existing `bomb` getter. Automated coverage verifies carrier distribution, single retriever selection, pickup-to-plant flow after human death, defender counter-push, spectator camera selection, and marker geometry. Browser QA captures an active red-site/bot-objective screenshot and checks console errors.

## Constraints

- Preserve the 3v3 roster, fixed 60 Hz update order, Rapier character movement, current weapon behavior, and existing match timers.
- Do not add external art, audio, physics packages, or multiplayer networking.
- Keep objective decisions deterministic under the existing QA driver.
- A carrier may interrupt navigation to fight, but resumes the objective after losing sight of enemies.

## Success criteria

- Every round has exactly one attacker carrier and the carrier is not permanently fixed to the human.
- A dropped human bomb can be recovered and planted by a surviving attack bot without player input.
- Bots continue moving and fighting after human death, and the camera visibly follows surviving play.
- Defense bots actively counter-push during the live phase.
- The plant zone is clearly visible as a red floor outline.
- Full unit, type/build, and Playwright suites pass with no uncaught page errors.
