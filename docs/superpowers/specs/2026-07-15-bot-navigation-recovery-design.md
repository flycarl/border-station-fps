# Bot Navigation Recovery Design

## Goal

Prevent attack and defense bots from continuously pushing into walls or cover while preserving deterministic navigation, combat, bomb retrieval, planting, and defusing.

## Root cause

Browser QA reproduced living bots issuing forward movement for several seconds with almost no displacement at the site cover and flank cover. `routeToward()` chooses the nearest navigation node as the path start but immediately returns the following node. When combat or collision has displaced a bot away from that start node, the line from its arbitrary position to the following node is not guaranteed to be clear and can cross a solid.

## Design

### Route re-entry

`routeToward()` first returns the nearest navigation node itself whenever the bot is outside a small planar arrival radius. Only after the bot reaches that node does it advance to the following path node. This restores the authored safe corridor before following an edge.

Use planar X/Z distance because navigation waypoints span ramps and floor heights while character movement is horizontal. The final plant target continues aligning Y with the actor, and interaction rules remain unchanged.

### Deterministic stuck recovery

`BotController` tracks planar displacement while it is commanding movement. If displacement stays below a small threshold for a sustained interval, it temporarily adds a deterministic lateral movement command. The direction is seeded and alternates on repeated recoveries. Once meaningful displacement resumes, recovery state clears.

Recovery never runs for dead bots, stationary hold/interact commands, or inactive match phases. It changes movement only; aim, fire, objective ownership, and bomb interactions remain authoritative.

### Verification

- Unit tests prove route re-entry before advancing and deterministic recovery after sustained zero displacement.
- Browser QA places attack and defense bots at the two reproduced cover traps and proves they move away while continuing to command their objectives.
- Existing corner traversal, bomb retrieval/plant/defuse, combat, full Vitest, build, and Playwright suites remain green.

## Constraints

- Keep the existing 3v3 roster, 60 Hz fixed simulation, Rapier bodies, map solids, and deterministic seeded bot behavior.
- Do not teleport bots, disable collisions, or add per-frame ray allocations.
- Do not change player movement or weapon behavior.
