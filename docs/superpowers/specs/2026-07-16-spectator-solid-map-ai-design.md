# Spectator, Solid Map, Site Outline, and Bot Accuracy Design

## Goal

Improve post-death readability and map presentation while making bot gunfire less mechanically accurate.

## Player experience

- While the human attacker is alive, the camera remains first-person and the held weapon remains visible.
- As soon as the human dies, the camera switches to a fixed top-down overview centered over the complete 34 by 94 metre map. It does not follow an individual actor. Every living attack and defense bot remains visible and continues simulating.
- The next round restores the normal first-person camera automatically when the human respawns.
- The bomb site is drawn only with bright red perimeter and corner lines. No translucent red floor fill remains.

## World geometry

- Each ramp becomes a closed triangular-prism wedge: flat ground bottom, two closed side faces, a closed high end, and an inclined walkable top.
- The Rapier ramp collider uses the same closed wedge vertices as the visible geometry, so the ramp cannot be entered from underneath.
- Non-floor, non-ramp solids preserve their authored top height but extend their bottom to ground level. This removes floating wall and cover gaps without changing their top silhouette.
- The existing map footprint, routes, ramp pitch, spawn positions, and navigation nodes remain unchanged.

## Bot accuracy

- Bot reaction timing and deterministic seeded behavior remain unchanged.
- Aim error is resampled every 0.35 seconds as before, but horizontal error expands from 0.035 to 0.060 radians and vertical error expands from 0.020 to 0.040 radians.
- Bots still aim at the target body center. The larger bounded error causes a mix of hits and misses at medium and long range instead of repeated near-perfect shots.

## Architecture

- `src/game.ts` owns the alive/dead camera mode decision and exposes a pure camera-pose selector for unit tests.
- `src/world/world-runtime.ts` owns closed ramp geometry/colliders, grounded solid normalization, and outline-only bomb-site rendering.
- `src/ai/bot-controller.ts` owns aim error constants and deterministic resampling.
- Existing QA diagnostics expose the active camera pose and bomb marker fill opacity so Playwright can verify player-visible behavior.

## Verification

- Unit tests cover first-person versus overview camera poses, grounded solids, closed ramp geometry, outline-only site geometry, and enlarged deterministic bot error bounds.
- Physics tests verify the ramp remains a support surface and collider count remains stable.
- Browser tests kill the human and assert a top-down overview while both teams continue moving, verify the weapon is hidden, and capture the outline-only site marker.
- The complete unit suite, production build, and full Playwright suite must pass before publication.
