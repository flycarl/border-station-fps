# Expanded Combat Pass Design

## Goal

Expand Border Station into a wider, longer tactical arena, make bots noticeably more capable without becoming instant-kill opponents, and render a readable first-person weapon in the player's hands.

## Player Experience

The playable loop remains a desktop 3v3 attack/defend round. The player crosses a longer approach with two usable lanes, more cover, and a second ramp before reaching the bomb site. Bots acquire targets over the new combat distances, react faster, aim more accurately, and keep pressure through controlled forward movement and strafing. The selected rifle or pistol is visible in the lower-right foreground and responds to movement, firing, reloading, pausing, death, and weapon switching.

## Architecture

- `border-station-graybox.ts` remains the source of truth for solids, spawns, bomb bounds, and navigation. The expanded layout adds a wider floor, longer perimeter, flank cover, a second ramp, and a branched navigation graph.
- `bot-controller.ts` owns deterministic combat difficulty constants and produces movement/aim/fire intents. Stronger behavior is implemented through longer perception range, a wider view cone, shorter reaction time, lower aim error, and bounded engage movement.
- A new `first-person-weapon.ts` owns the procedural view-model factory and animation state. `WorldRuntime` attaches it to the camera and updates it from a small render-state interface supplied by `Game`.
- The physics scene continues to use Rapier primitive colliders and a fixed 60 Hz update. The weapon view model is visual-only and never participates in raycasts or collisions.

## Visual Design

The rifle uses an authored silhouette built from shared Three.js geometry and materials: receiver, tapered handguard, barrel, muzzle, magazine, stock, optic, grip, support hand, and firing/reload motion. The pistol uses a compact slide, frame, barrel, grip, and hands. Materials stay consistent with the current industrial graybox palette while using metal/roughness contrast and small emissive sight accents.

## Difficulty Targets

- Engagement distance: 42 m.
- Horizontal view cone: 120 degrees.
- Reaction window: 0.16-0.38 seconds.
- Aim error: no more than 0.014 rad yaw and 0.009 rad pitch.
- Bots advance while farther than 15 m and strafe with deterministic direction while engaging.

## Verification

Unit tests cover map dimensions/branch connectivity, combat thresholds, deterministic engage movement, and weapon model structure/animation. Existing tests must remain green. Browser QA verifies the canvas is nonblank, the active weapon is visible, the expanded route is traversable, bots can engage at the new distance, console errors are absent, and pause/restart still work.

## Scope Boundaries

This pass does not add multiplayer networking, new game modes, imported external models, mobile controls, or a full animation system. The procedural weapon is chosen for deterministic loading, small bundle impact, and immediate cohesion with the current graybox art direction.
