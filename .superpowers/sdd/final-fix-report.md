# Final branch review fix report

Date: 2026-07-13 (Asia/Shanghai)
Base: `7b00df7`

## Scope

This wave closes all final review findings:

1. Dead actors no longer remain dynamic, colliding, raycast-visible, or rendered after weapon damage changes `alive` to false. Their authoritative game-state position remains available, and restart recreates a complete active roster without leaked resources.
2. Held keyboard/mouse state is explicitly reset whenever `Game.pause()` runs, covering Escape, pointer-lock loss, and pointer-lock rejection.
3. The HUD live announcer assigns the computed status on every status-key transition, including the empty string, so stale announcements are cleared.

## Root-cause analysis

### Actor death participation

`WeaponSystem.update()` mutates `PlayerState.alive`, but `Game.updateWeapons()` previously ended without reconciling that state change into `WorldRuntime`. Consequently, the actor's Rapier capsule remained dynamic and registered for ray queries, and its Three.js capsule stayed visible. Because `WeaponSystem` accepts the first world ray hit and then rejects an already-dead target, the corpse absorbed every later ray instead of allowing a hit behind it.

An initial enabled-state experiment was insufficient: the composed regression showed traversal could still contact and push the corpse. The final representation is explicit and deterministic: the dead body changes from dynamic to fixed, every attached collider changes to collision groups `0`, collider-to-entity ray registration is removed, the mesh becomes hidden, and post-death velocity writes stop. Bodies/colliders remain owned by the runtime for stable references and are removed exactly once by normal round/restart cleanup.

### Held input

The input source already cleared held sets on window blur/hidden visibility, but pause and pointer-lock loss are independent event boundaries. If key/mouse release events were missed while unlocked, the private held state survived and was sampled after resume.

### HUD announcer

`statusAnnouncement()` correctly returned `''`, but `if (announcement)` prevented assigning it. The stale prior text therefore persisted across status transitions with no announcement.

## TDD evidence

RED run:

`npm test -- --run tests/input/keyboard-mouse.test.ts tests/ui/hud.test.ts tests/world/world-runtime.test.ts`

- Input: `TypeError: input.resetHeldState is not a function`.
- HUD: expected `''`, received `炸弹已安装`.
- World: `TypeError: runtime.setPlayerActive is not a function`.

The first composed Playwright retry showed the corpse position moving from `z = 7` to `z = 4.708`, exposing remaining post-death physics participation after the initial enabled-state approach.

GREEN focused runs:

- 3 focused Vitest files: 14/14 tests passed.
- Focused Playwright death reconciliation: 1/1 passed.

## Production changes

- `Game.updateWeapons()` now performs alive/participation reconciliation immediately after all weapon updates, preserving the declared 60 Hz step order.
- `WorldRuntime.setPlayerActive()` owns the Rapier body type, collider collision groups, collider ray registration, and mesh visibility transition as one operation.
- `WorldRuntime.raycast()` accepts only currently registered colliders, so an inactive actor cannot produce an anonymous first hit.
- `WorldRuntime.isPlayerSupported()` rejects inactive actors.
- Dead actors receive no later controller/velocity mutations; their state and body translation remain stable.
- Round and match restart still use the existing remove/clear/spawn flow, restoring six dynamic actors, twelve colliders, registrations, meshes, weapons, and state from fresh instances.
- `KeyboardMouseInput.resetHeldState()` is public and remains shared by blur/visibility handling; `Game.pause()` invokes it for all pause causes.
- `Hud.render()` assigns `announcement` even when empty.
- Query-gated QA inspection gained read-only actor participation, support, and LOS methods solely to compose the production-preview regression.

## Regression coverage

- World unit coverage proves inactive status, ray pass-through, false support, nonblocking traversal, stable death transform, unchanged owned body/collider counts, and explicit reactivation.
- Input DOM coverage proves the exposed reset clears movement, reload, and fire held state.
- HUD DOM coverage proves a prior live announcement is cleared exactly once when the next computed announcement is empty.
- Composed production-preview coverage kills a front defender with real rifle shots, damages the living defender behind it with the next shot, proves LOS/support/traversal/render state, retains the death position, and verifies restart restores active actor/resource state without renderer resource growth.

## Final verification

Fresh command:

`npm test -- --run && npm run typecheck && npm run build && npm run test:e2e && git diff --check`

Results:

- Vitest: 15 files, 76 tests passed.
- TypeScript: `tsc --noEmit` passed.
- Production build: passed; JS 2,792.18 kB minified / 985.32 kB gzip.
- Playwright Chromium: 8 tests passed in 8.5 seconds.
- Diff whitespace check: passed.
- Known non-blocking diagnostic: Vite retains the pre-existing bundle-size warning for the single Three.js/Rapier chunk.

## Self-review

- The fixed-step phase labels and execution order are unchanged; reconciliation is contained inside the existing weapons phase.
- No body/collider ownership was duplicated. Inactive actors remain in the same runtime maps and normal `removePlayer()` cleanup removes their body, collider identity, geometry, and material once.
- Static map colliders remain ray-queryable because they retain collider registrations; only inactive actor registrations are removed.
- The human mesh's intentional first-person invisibility is preserved on reactivation.
- QA additions are still gated behind exact `?qa=1`, expose read-only world facts, and cannot write health, alive state, match outcomes, or HUD text.
- No unrelated files or dependencies changed.

## Residual concern

The existing production bundle-size warning remains unchanged in nature and is deferred to the planned performance/release milestone. No functional review finding remains open.
