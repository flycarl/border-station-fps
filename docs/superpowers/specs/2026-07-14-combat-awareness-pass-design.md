# Combat Awareness Pass Design

## Goal

Make combat information immediately readable by adding visible bullet tracers, a top-right tactical minimap, and live attacker/defender survivor counts around the round timer.

## Decisions

- Keep weapons hitscan and authoritative. Each shot emits a short-lived cosmetic bullet head and luminous tail from the shooter's eye/muzzle direction to the resolved hit point.
- Use team-colored tracers: warm orange for attackers and cyan for defenders. Effects expire quickly and never participate in collision.
- Render a north-up minimap from the known floor bounds. Show the bomb site, every living combatant, and a directional player marker. Dead combatants disappear.
- Put attacker and defender survivor counts on opposite sides of the existing central clock, using the same team colors and fixed-width number treatment.
- Derive all HUD data from the authoritative game snapshot so QA, accessibility, and rendering share one source of truth.

## Verification

- Unit-test tracer lifecycle and cleanup.
- Unit-test survivor counts and minimap projection/rendering.
- Exercise firing and elimination through the deterministic browser QA driver.
- Run the full unit, production build, and Playwright suites, then visually inspect a 1440×900 capture.
