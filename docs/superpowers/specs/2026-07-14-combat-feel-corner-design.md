# Combat Feel and Corner Design

## Goal

Improve first-person weapon comfort, make bots less mechanically accurate and more active at round start, add readable recoil, and create a real L-shaped combat corner in the middle of the map.

## Weapon Feel

- Replace the current over-amplified walk phase with a 7.5-radian-per-second gait cycle.
- Reduce positional walk sway to roughly 40% of its current horizontal amplitude and smooth the movement blend instead of snapping between still and moving.
- Reset pistol and rifle local transforms from authored base poses every update so no frame-to-frame drift can accumulate.
- Model recoil as a kick value that accumulates per shot, pushes the weapon rearward, pitches the muzzle upward, then returns with a fast damped recovery. Rifle kick is stronger than pistol kick but both remain readable.

## Bot Behavior

- Keep all bots frozen during the freeze phase.
- During live play, assign the three defenders separate `site-left`, `site`, and `site-right` patrol anchors. A holding bot walks to its anchor and only stops inside a small hold radius.
- Increase initial aim error and resample bounded aim error during sustained engagements so bots cannot lock onto one perfectly stable offset.
- Preserve deterministic seeded behavior for repeatable tests and QA.

## L-shaped Corner

- Add a horizontal mid wall and a returning perpendicular wall between attacker spawn and the old mid area.
- Leave a wide right-side entry and a lower exit so the player must turn through the corner without creating a dead end.
- Add `corner-entry` and `corner-turn` navigation nodes and connect both attack routes through them.
- Keep ramps, bomb site, spawns, and the overall floor footprint unchanged.

## Verification

- Unit-test bounded low-frequency weapon sway, stable authored transforms, recoil accumulation/recovery, changing bot aim error, live defender movement, freeze inactivity, corner geometry, and navigation connectivity.
- Browser-test defender movement after live begins and traversal around the new corner.
- Run the full unit suite, production build, Playwright suite, and inspect a new 1440×900 gameplay capture.
