# Combat Awareness Pass Implementation Plan

1. Add failing HUD tests for survivor counters, map markers, and bounded coordinate projection.
2. Add failing tracer lifecycle tests covering spawn, movement, expiration, and disposal.
3. Implement snapshot radar data and the top HUD/minimap DOM and responsive styling.
4. Implement a pooled lightweight Three.js bullet tracer effect and emit it for every shot event.
5. Expose tracer diagnostics and add deterministic browser scenarios for shots and eliminations.
6. Run unit tests, type/build checks, Playwright, screenshot inspection, and code review.
7. Merge the verified feature branch into the playable workspace and reload the local game.
