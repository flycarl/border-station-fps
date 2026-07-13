# Border Station Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a desktop-browser 3v3 FPS vertical slice with one playable Border Station route, pointer-lock movement, a pistol and rifle, basic bots, bomb plant/defuse rules, round flow, and a minimal HUD.

**Architecture:** TypeScript modules own deterministic game rules and consume a shared `PlayerCommand` format for both human and AI actors. Rapier owns collision and character motion, Three.js renders an interpolated view of rule state, and DOM UI observes snapshots without mutating simulation state. The slice uses a 60 Hz fixed update and preserves the spec's future server-authoritative boundary.

**Tech Stack:** Node.js 26+, npm 11+, TypeScript 7.0.2, Vite 8.1.4, Three.js 0.185.1, Three.js type definitions 0.185.1, Rapier compat 0.19.3, Vitest 4.1.10, Playwright 1.61.1, jsdom 29.1.1, Node.js type definitions 26.1.1.

## Global Constraints

- Target desktop browsers with keyboard, mouse, WebGL2, and Pointer Lock support.
- Use original names, geometry, UI, and audio placeholders; do not copy commercial game assets, maps, trademarks, or sounds.
- Run simulation and physics at a fixed 60 Hz; presentation interpolation cannot mutate rule state.
- Both human and bot actors must enter gameplay through `PlayerCommand`.
- The vertical slice is one route and one bomb site; it must not add networking, accounts, skins, a second map, or a map editor.
- Round timing defaults: 12 s freeze, 105 s live round, 3.2 s plant, 35 s bomb timer, 7 s defuse, 3.5 s defuse with kit, and 5 s result.
- First playable uses fixed loadouts; full economy and the remaining ten firearms belong to later milestone plans.
- Every task ends with passing focused tests and a commit.

## File Map

- `package.json`: scripts, exact dependency versions, and Node engine.
- `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`: strict build and test configuration.
- `index.html`, `src/main.ts`, `src/styles.css`: browser entry, root composition, and base responsive layout.
- `src/core/types.ts`: shared IDs, vectors, teams, commands, and snapshots.
- `src/core/fixed-step.ts`: accumulator-based 60 Hz clock.
- `src/match/match-controller.ts`: round state machine and win conditions.
- `src/match/bomb-system.ts`: pickup, planting, ticking, and defusing.
- `src/player/player-state.ts`: health, armor, alive state, pose, and inventory.
- `src/player/player-controller.ts`: command-to-Rapier character movement.
- `src/input/keyboard-mouse.ts`: keyboard/mouse events converted into `PlayerCommand`.
- `src/weapons/weapon-data.ts`: pistol and rifle configurations.
- `src/weapons/weapon-system.ts`: cooldown, ammo, spread, hitscan, and damage events.
- `src/world/border-station-graybox.ts`: one-route desert graybox, spawn points, A site, collision metadata, and navigation nodes.
- `src/world/world-runtime.ts`: Three.js and Rapier world construction and synchronization.
- `src/ai/nav-graph.ts`: typed graph and A* path query.
- `src/ai/bot-controller.ts`: perception and state-to-command conversion.
- `src/ui/hud.ts`, `src/ui/start-screen.ts`: DOM-only presentation and pointer-lock start flow.
- `src/game.ts`: dependency composition, fixed update order, snapshots, restart, and disposal.
- `tests/**/*.test.ts`: rule, movement, weapon, bomb, navigation, and UI tests.
- `e2e/vertical-slice.spec.ts`: browser start, movement, fire, objective, result, and restart smoke path.

---

### Task 1: Strict project shell and nonblank Three.js canvas

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `index.html`
- Create: `src/main.ts`
- Create: `src/styles.css`
- Create: `tests/smoke/app-shell.test.ts`

**Interfaces:**
- Consumes: none.
- Produces: `#app`, `#game-canvas`, `#ui-root`, npm scripts `dev`, `build`, `typecheck`, `test`, `test:e2e`, and `preview`.

- [ ] **Step 1: Write the failing shell test**

```ts
// tests/smoke/app-shell.test.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('app shell', () => {
  it('provides a canvas and UI mount point', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain('id="game-canvas"');
    expect(html).toContain('id="ui-root"');
  });
});
```

- [ ] **Step 2: Run the test and confirm the missing-project failure**

Run: `npm test -- --run tests/smoke/app-shell.test.ts`

Expected: command fails because `package.json` and the test runner do not exist.

- [ ] **Step 3: Create exact package and tool configuration**

```json
{
  "name": "border-station-fps",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=26" },
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest",
    "test:e2e": "playwright test",
    "preview": "vite preview --host 127.0.0.1 --port 4173"
  },
  "dependencies": {
    "@dimforge/rapier3d-compat": "0.19.3",
    "three": "0.185.1"
  },
  "devDependencies": {
    "@playwright/test": "1.61.1",
    "@types/node": "26.1.1",
    "@types/three": "0.185.1",
    "jsdom": "29.1.1",
    "typescript": "7.0.2",
    "vite": "8.1.4",
    "vitest": "4.1.10"
  }
}
```

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client", "vitest/globals"]
  },
  "include": ["src", "tests", "e2e", "*.config.ts"]
}
```

```ts
// vite.config.ts
import { defineConfig } from 'vite';
export default defineConfig({ build: { target: 'es2022', sourcemap: true } });

// vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] } });

// playwright.config.ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1440, height: 900 } },
  webServer: { command: 'npm run build && npm run preview', port: 4173, reuseExistingServer: true }
});
```

- [ ] **Step 4: Create the initial nonblank canvas**

```html
<!-- index.html -->
<div id="app">
  <canvas id="game-canvas" aria-label="Border Station game view"></canvas>
  <div id="ui-root"></div>
</div>
<script type="module" src="/src/main.ts"></script>
```

```ts
// src/main.ts
import * as THREE from 'three';
import './styles.css';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
if (!canvas) throw new Error('Missing #game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.setClearColor(0x172733);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 300);
camera.position.set(0, 2, 5);
scene.add(new THREE.HemisphereLight(0xbfd9e8, 0x8b6b42, 2.2));
const ground = new THREE.Mesh(new THREE.BoxGeometry(12, 0.4, 12), new THREE.MeshStandardMaterial({ color: 0xb08b59 }));
scene.add(ground);
renderer.render(scene, camera);
```

```css
/* src/styles.css */
html, body, #app { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #172733; }
#game-canvas { width: 100%; height: 100%; display: block; }
#ui-root { position: absolute; inset: 0; pointer-events: none; font-family: Inter, system-ui, sans-serif; color: #edf5f7; }
button { pointer-events: auto; font: inherit; }
```

- [ ] **Step 5: Install and verify shell**

Run: `npm install && npm test -- --run tests/smoke/app-shell.test.ts && npm run build`

Expected: one test passes; TypeScript and Vite build complete; `dist/index.html` exists.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts vitest.config.ts playwright.config.ts index.html src/main.ts src/styles.css tests/smoke/app-shell.test.ts
git commit -m "build: scaffold border station runtime"
```

### Task 2: Shared commands, fixed-step clock, and round state machine

**Files:**
- Create: `src/core/types.ts`
- Create: `src/core/fixed-step.ts`
- Create: `src/match/match-controller.ts`
- Create: `tests/core/fixed-step.test.ts`
- Create: `tests/match/match-controller.test.ts`

**Interfaces:**
- Produces: `PlayerCommand`, `Team`, `RoundPhase`, `FixedStepClock.advance(frameSeconds, update)`, and `MatchController.update(dt, facts)`.
- Produces: `MatchSnapshot { phase, round, attackScore, defenseScore, phaseRemaining, winner }`.

- [ ] **Step 1: Write failing clock and match tests**

```ts
// tests/core/fixed-step.test.ts
import { expect, it } from 'vitest';
import { FixedStepClock } from '../../src/core/fixed-step';

it('runs deterministic 60 Hz updates', () => {
  const clock = new FixedStepClock(1 / 60, 0.25);
  let ticks = 0;
  clock.advance(1 / 30, () => ticks++);
  expect(ticks).toBe(2);
  expect(clock.alpha).toBeCloseTo(0);
});
```

```ts
// tests/match/match-controller.test.ts
import { expect, it } from 'vitest';
import { MatchController } from '../../src/match/match-controller';

it('moves freeze to live and awards defense on timeout', () => {
  const match = new MatchController({ freeze: 12, live: 105, result: 5, roundsToWin: 7, halftimeAfter: 6 });
  match.update(12, { attackersAlive: 3, defendersAlive: 3, bombPlanted: false, bombExploded: false, bombDefused: false });
  expect(match.snapshot().phase).toBe('live');
  match.update(105, { attackersAlive: 3, defendersAlive: 3, bombPlanted: false, bombExploded: false, bombDefused: false });
  expect(match.snapshot()).toMatchObject({ phase: 'result', defenseScore: 1 });
});
```

- [ ] **Step 2: Run tests to verify missing modules**

Run: `npm test -- --run tests/core/fixed-step.test.ts tests/match/match-controller.test.ts`

Expected: FAIL with module-not-found errors.

- [ ] **Step 3: Implement shared types and fixed-step clock**

```ts
// src/core/types.ts
export type EntityId = string;
export type Team = 'attack' | 'defense';
export type RoundPhase = 'freeze' | 'live' | 'planted' | 'result' | 'match-over';
export interface Vec3 { x: number; y: number; z: number }
export interface PlayerCommand {
  moveX: number; moveZ: number; yaw: number; pitch: number;
  jump: boolean; crouch: boolean; walk: boolean; fire: boolean;
  reload: boolean; interact: boolean; slot: 1 | 2 | 3 | 4;
}
export const idleCommand = (): PlayerCommand => ({
  moveX: 0, moveZ: 0, yaw: 0, pitch: 0, jump: false, crouch: false,
  walk: false, fire: false, reload: false, interact: false, slot: 1
});
```

```ts
// src/core/fixed-step.ts
export class FixedStepClock {
  private accumulator = 0;
  public alpha = 0;
  constructor(private readonly step: number, private readonly maxFrame: number) {}
  advance(frameSeconds: number, update: (dt: number) => void): void {
    this.accumulator += Math.min(frameSeconds, this.maxFrame);
    while (this.accumulator + Number.EPSILON >= this.step) {
      update(this.step);
      this.accumulator -= this.step;
    }
    this.alpha = this.accumulator / this.step;
  }
}
```

- [ ] **Step 4: Implement round transitions and score snapshot**

```ts
// src/match/match-controller.ts
import type { RoundPhase, Team } from '../core/types';
export interface MatchConfig { freeze: number; live: number; result: number; roundsToWin: number; halftimeAfter: number }
export interface RoundFacts { attackersAlive: number; defendersAlive: number; bombPlanted: boolean; bombExploded: boolean; bombDefused: boolean }
export interface MatchSnapshot { phase: RoundPhase; round: number; attackScore: number; defenseScore: number; phaseRemaining: number; winner: Team | null }

export class MatchController {
  private phase: RoundPhase = 'freeze'; private remaining: number;
  private round = 1; private attackScore = 0; private defenseScore = 0; private winner: Team | null = null;
  constructor(private readonly config: MatchConfig) { this.remaining = config.freeze; }
  update(dt: number, facts: RoundFacts): void {
    if (this.phase === 'match-over') return;
    this.remaining = Math.max(0, this.remaining - dt);
    if (this.phase === 'freeze' && this.remaining === 0) this.enter('live', this.config.live);
    else if (this.phase === 'live') {
      if (facts.bombPlanted) this.enter('planted', Number.POSITIVE_INFINITY);
      else if (facts.defendersAlive === 0) this.endRound('attack');
      else if (facts.attackersAlive === 0 || this.remaining === 0) this.endRound('defense');
    } else if (this.phase === 'planted') {
      if (facts.bombExploded) this.endRound('attack');
      else if (facts.bombDefused) this.endRound('defense');
    } else if (this.phase === 'result' && this.remaining === 0) this.startNextRound();
  }
  private enter(phase: RoundPhase, duration: number): void { this.phase = phase; this.remaining = duration; }
  private endRound(team: Team): void {
    if (team === 'attack') this.attackScore++; else this.defenseScore++;
    this.winner = team;
    this.enter(this.attackScore >= this.config.roundsToWin || this.defenseScore >= this.config.roundsToWin ? 'match-over' : 'result', this.config.result);
  }
  private startNextRound(): void { this.round++; this.winner = null; this.enter('freeze', this.config.freeze); }
  snapshot(): MatchSnapshot { return { phase: this.phase, round: this.round, attackScore: this.attackScore, defenseScore: this.defenseScore, phaseRemaining: this.remaining, winner: this.winner }; }
}
```

- [ ] **Step 5: Run focused tests and full suite**

Run: `npm test -- --run tests/core/fixed-step.test.ts tests/match/match-controller.test.ts && npm test -- --run`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/core src/match/match-controller.ts tests/core tests/match/match-controller.test.ts
git commit -m "feat: add fixed-step round simulation"
```

### Task 3: Rapier player controller and keyboard/mouse command adapter

**Files:**
- Create: `src/player/player-state.ts`
- Create: `src/player/player-controller.ts`
- Create: `src/input/keyboard-mouse.ts`
- Create: `tests/player/player-controller.test.ts`
- Create: `tests/input/keyboard-mouse.test.ts`

**Interfaces:**
- Consumes: `PlayerCommand`, Rapier `World`, and an actor rigid body handle.
- Produces: `PlayerState`, `PlayerController.update(command, dt)`, and `KeyboardMouseInput.sample(): PlayerCommand`.

- [ ] **Step 1: Write failing movement and input tests**

```ts
// tests/player/player-controller.test.ts
import { expect, it } from 'vitest';
import { computeWishVelocity } from '../../src/player/player-controller';
it('normalizes diagonal movement', () => {
  expect(computeWishVelocity(1, 1, 0, 6)).toEqual({ x: Math.SQRT1_2 * 6, z: Math.SQRT1_2 * 6 });
});

// tests/input/keyboard-mouse.test.ts
import { expect, it } from 'vitest';
import { KeyboardMouseInput } from '../../src/input/keyboard-mouse';
it('maps W and D to a normalized command axis', () => {
  const input = new KeyboardMouseInput(document);
  document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
  expect(input.sample()).toMatchObject({ moveX: 1, moveZ: -1 });
  input.dispose();
});
```

- [ ] **Step 2: Confirm tests fail**

Run: `npm test -- --run tests/player/player-controller.test.ts tests/input/keyboard-mouse.test.ts`

Expected: FAIL with module-not-found errors.

- [ ] **Step 3: Implement focused state and motion math**

```ts
// src/player/player-state.ts
import type { EntityId, Team, Vec3 } from '../core/types';
export interface PlayerState { id: EntityId; team: Team; position: Vec3; yaw: number; pitch: number; health: number; armor: number; alive: boolean; grounded: boolean }
export const createPlayerState = (id: EntityId, team: Team, position: Vec3): PlayerState => ({ id, team, position, yaw: 0, pitch: 0, health: 100, armor: 0, alive: true, grounded: false });
```

```ts
// src/player/player-controller.ts
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PlayerCommand } from '../core/types';
export function computeWishVelocity(moveX: number, moveZ: number, yaw: number, speed: number): { x: number; z: number } {
  const length = Math.hypot(moveX, moveZ) || 1; const x = moveX / length; const z = moveZ / length;
  return { x: (x * Math.cos(yaw) + z * Math.sin(yaw)) * speed, z: (-x * Math.sin(yaw) + z * Math.cos(yaw)) * speed };
}
export class PlayerController {
  constructor(private readonly body: RAPIER.RigidBody) {}
  update(command: PlayerCommand, dt: number, grounded: boolean): void {
    const speed = command.walk ? 2.5 : command.crouch ? 3.2 : 6;
    const wish = computeWishVelocity(command.moveX, command.moveZ, command.yaw, speed);
    const current = this.body.linvel();
    this.body.setLinvel({ x: wish.x, y: grounded && command.jump ? 5.2 : current.y, z: wish.z }, true);
    void dt;
  }
}
```

- [ ] **Step 4: Implement event-to-command mapping with disposal**

```ts
// src/input/keyboard-mouse.ts
import { idleCommand, type PlayerCommand } from '../core/types';
export class KeyboardMouseInput {
  private keys = new Set<string>(); private buttons = new Set<number>(); private yaw = 0; private pitch = 0;
  private down = (e: KeyboardEvent) => this.keys.add(e.code); private up = (e: KeyboardEvent) => this.keys.delete(e.code);
  private mouseDown = (e: MouseEvent) => this.buttons.add(e.button); private mouseUp = (e: MouseEvent) => this.buttons.delete(e.button);
  private move = (e: MouseEvent) => { if (this.doc.pointerLockElement) { this.yaw -= e.movementX * 0.002; this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - e.movementY * 0.002)); } };
  constructor(private readonly doc: Document) { doc.addEventListener('keydown', this.down); doc.addEventListener('keyup', this.up); doc.addEventListener('mousedown', this.mouseDown); doc.addEventListener('mouseup', this.mouseUp); doc.addEventListener('mousemove', this.move); }
  sample(): PlayerCommand { const c = idleCommand(); c.moveX = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA')); c.moveZ = Number(this.keys.has('KeyS')) - Number(this.keys.has('KeyW')); c.yaw = this.yaw; c.pitch = this.pitch; c.jump = this.keys.has('Space'); c.crouch = this.keys.has('ControlLeft'); c.walk = this.keys.has('ShiftLeft'); c.fire = this.buttons.has(0); c.reload = this.keys.has('KeyR'); c.interact = this.keys.has('KeyE'); return c; }
  dispose(): void { this.doc.removeEventListener('keydown', this.down); this.doc.removeEventListener('keyup', this.up); this.doc.removeEventListener('mousedown', this.mouseDown); this.doc.removeEventListener('mouseup', this.mouseUp); this.doc.removeEventListener('mousemove', this.move); }
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -- --run tests/player/player-controller.test.ts tests/input/keyboard-mouse.test.ts && npm run typecheck`

Expected: both tests pass and TypeScript reports no errors.

- [ ] **Step 6: Commit**

```bash
git add src/player src/input tests/player tests/input
git commit -m "feat: add shared fps movement commands"
```

### Task 4: Border Station one-route graybox and world runtime

**Files:**
- Create: `src/world/border-station-graybox.ts`
- Create: `src/world/world-runtime.ts`
- Create: `tests/world/border-station-graybox.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Produces: `GrayboxDefinition { solids, spawns, bombSite, navNodes }` and `createBorderStationGraybox()`.
- Produces: `WorldRuntime.create(canvas)`, `spawnPlayer(position)`, `raycast(origin, direction, maxDistance)`, `render(cameraPose)`, and `dispose()`.

- [ ] **Step 1: Write the failing map invariant test**

```ts
// tests/world/border-station-graybox.test.ts
import { expect, it } from 'vitest';
import { createBorderStationGraybox } from '../../src/world/border-station-graybox';
it('has separated spawns, a reachable site, ramp, and cover', () => {
  const map = createBorderStationGraybox();
  expect(map.spawns.filter(s => s.team === 'attack')).toHaveLength(3);
  expect(map.spawns.filter(s => s.team === 'defense')).toHaveLength(3);
  expect(map.solids.some(s => s.kind === 'ramp')).toBe(true);
  expect(map.solids.some(s => s.kind === 'cover')).toBe(true);
  expect(map.navNodes.some(n => n.tags.includes('site'))).toBe(true);
});
```

- [ ] **Step 2: Confirm the test fails**

Run: `npm test -- --run tests/world/border-station-graybox.test.ts`

Expected: FAIL with module-not-found error.

- [ ] **Step 3: Define the complete one-route map data**

```ts
// src/world/border-station-graybox.ts
import type { Team, Vec3 } from '../core/types';
export interface SolidDef { id: string; center: Vec3; size: Vec3; yaw: number; kind: 'floor' | 'wall' | 'ramp' | 'cover' }
export interface SpawnDef { id: string; team: Team; position: Vec3; yaw: number }
export interface NavNode { id: string; position: Vec3; neighbors: string[]; tags: string[] }
export interface GrayboxDefinition { solids: SolidDef[]; spawns: SpawnDef[]; bombSite: { center: Vec3; halfExtents: Vec3 }; navNodes: NavNode[] }
export function createBorderStationGraybox(): GrayboxDefinition {
  return {
    solids: [
      { id: 'floor', center: { x: 0, y: -0.25, z: 0 }, size: { x: 22, y: 0.5, z: 64 }, yaw: 0, kind: 'floor' },
      { id: 'ramp-main', center: { x: 0, y: 1.3, z: -4 }, size: { x: 7, y: 0.5, z: 13 }, yaw: 0, kind: 'ramp' },
      { id: 'cover-mid-left', center: { x: -3.7, y: 1, z: 4 }, size: { x: 2, y: 2, z: 2 }, yaw: 0, kind: 'cover' },
      { id: 'cover-site', center: { x: 3, y: 2.2, z: -17 }, size: { x: 3, y: 2.4, z: 2 }, yaw: 0, kind: 'cover' },
      { id: 'wall-left', center: { x: -11, y: 2, z: 0 }, size: { x: 1, y: 4, z: 64 }, yaw: 0, kind: 'wall' },
      { id: 'wall-right', center: { x: 11, y: 2, z: 0 }, size: { x: 1, y: 4, z: 64 }, yaw: 0, kind: 'wall' }
    ],
    spawns: [
      { id: 'a1', team: 'attack', position: { x: -2, y: 1, z: 25 }, yaw: Math.PI }, { id: 'a2', team: 'attack', position: { x: 0, y: 1, z: 25 }, yaw: Math.PI }, { id: 'a3', team: 'attack', position: { x: 2, y: 1, z: 25 }, yaw: Math.PI },
      { id: 'd1', team: 'defense', position: { x: -2, y: 3, z: -24 }, yaw: 0 }, { id: 'd2', team: 'defense', position: { x: 0, y: 3, z: -24 }, yaw: 0 }, { id: 'd3', team: 'defense', position: { x: 2, y: 3, z: -24 }, yaw: 0 }
    ],
    bombSite: { center: { x: 0, y: 2, z: -18 }, halfExtents: { x: 6, y: 2, z: 5 } },
    navNodes: [
      { id: 'attack', position: { x: 0, y: 1, z: 23 }, neighbors: ['mid'], tags: ['spawn-attack'] },
      { id: 'mid', position: { x: 0, y: 1, z: 5 }, neighbors: ['attack', 'ramp'], tags: ['cover'] },
      { id: 'ramp', position: { x: 0, y: 2, z: -6 }, neighbors: ['mid', 'site'], tags: ['ramp'] },
      { id: 'site', position: { x: 0, y: 3, z: -18 }, neighbors: ['ramp', 'defense'], tags: ['site'] },
      { id: 'defense', position: { x: 0, y: 3, z: -24 }, neighbors: ['site'], tags: ['spawn-defense'] }
    ]
  };
}
```

- [ ] **Step 4: Implement world construction**

Create `WorldRuntime` so `create()` awaits `RAPIER.init()`, creates a gravity world, a Three.js renderer/scene/camera, and one fixed cuboid collider plus matching mesh per `SolidDef`. For `kind === 'ramp'`, rotate both collider and mesh by `-0.18` radians around X. Use sand `0xb08b59`, blue-gray structure `0x425a68`, and dark cover `0x263b48`. Add hemisphere and directional lights, resize handling, and resource disposal. `spawnPlayer()` creates a locked-rotation dynamic capsule body with linear damping and returns its body.

```ts
export interface CameraPose { position: { x: number; y: number; z: number }; yaw: number; pitch: number }
export interface RayHit { entityId: string | null; distance: number; point: { x: number; y: number; z: number } }
```

- [ ] **Step 5: Replace the temporary scene with `WorldRuntime` startup**

```ts
// src/main.ts
import './styles.css';
import { WorldRuntime } from './world/world-runtime';
const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
if (!canvas) throw new Error('Missing #game-canvas');
void WorldRuntime.create(canvas).then(world => world.render({ position: { x: 0, y: 2, z: 24 }, yaw: Math.PI, pitch: 0 }));
```

- [ ] **Step 6: Test, build, and visually smoke test**

Run: `npm test -- --run tests/world/border-station-graybox.test.ts && npm run build && npm run dev`

Expected: test and build pass; opening the printed local URL shows a nonblank sand-and-blue-gray corridor with a ramp and cover.

- [ ] **Step 7: Commit**

```bash
git add src/world src/main.ts tests/world
git commit -m "feat: add border station graybox route"
```

### Task 5: Two-weapon hitscan combat and damage

**Files:**
- Create: `src/weapons/weapon-data.ts`
- Create: `src/weapons/weapon-system.ts`
- Create: `tests/weapons/weapon-system.test.ts`
- Modify: `src/player/player-state.ts`

**Interfaces:**
- Consumes: actor command, camera ray, `WorldRuntime.raycast`, player states, and fixed `dt`.
- Produces: `WeaponId = 'sidearm-9' | 'vanguard-rifle'`, `WeaponState`, `WeaponEvent`, and `WeaponSystem.update(...)`.

- [ ] **Step 1: Write failing weapon tests**

```ts
// tests/weapons/weapon-system.test.ts
import { expect, it } from 'vitest';
import { applyDamage, createWeaponState, tryFire } from '../../src/weapons/weapon-system';
it('blocks firing during cooldown and consumes one round', () => {
  const state = createWeaponState('vanguard-rifle');
  expect(tryFire(state, 10).fired).toBe(true);
  expect(tryFire(state, 10.01).fired).toBe(false);
  expect(state.magazine).toBe(29);
});
it('applies armor before health and kills at zero health', () => {
  expect(applyDamage({ health: 100, armor: 50, alive: true }, 80, 0.6)).toEqual({ health: 52, armor: 18, alive: true });
});
```

- [ ] **Step 2: Confirm tests fail**

Run: `npm test -- --run tests/weapons/weapon-system.test.ts`

Expected: FAIL with module-not-found error.

- [ ] **Step 3: Add exact pistol and rifle data**

```ts
// src/weapons/weapon-data.ts
export type WeaponId = 'sidearm-9' | 'vanguard-rifle';
export interface WeaponConfig { id: WeaponId; name: string; magazine: number; reserve: number; roundsPerMinute: number; damage: number; range: number; armorPenetration: number; spreadRadians: number; reloadSeconds: number }
export const WEAPONS: Record<WeaponId, WeaponConfig> = {
  'sidearm-9': { id: 'sidearm-9', name: 'Sidearm 9', magazine: 15, reserve: 45, roundsPerMinute: 360, damage: 31, range: 55, armorPenetration: 0.45, spreadRadians: 0.006, reloadSeconds: 1.7 },
  'vanguard-rifle': { id: 'vanguard-rifle', name: 'Vanguard Rifle', magazine: 30, reserve: 90, roundsPerMinute: 640, damage: 35, range: 95, armorPenetration: 0.72, spreadRadians: 0.004, reloadSeconds: 2.35 }
};
```

- [ ] **Step 4: Implement deterministic cooldown, reload, and armor damage**

```ts
// src/weapons/weapon-system.ts
import { WEAPONS, type WeaponId } from './weapon-data';
export interface WeaponState { id: WeaponId; magazine: number; reserve: number; nextFireAt: number; reloadEndsAt: number | null }
export interface Damageable { health: number; armor: number; alive: boolean }
export const createWeaponState = (id: WeaponId): WeaponState => ({ id, magazine: WEAPONS[id].magazine, reserve: WEAPONS[id].reserve, nextFireAt: 0, reloadEndsAt: null });
export function tryFire(state: WeaponState, now: number): { fired: boolean } {
  const config = WEAPONS[state.id];
  if (state.reloadEndsAt !== null || state.magazine === 0 || now < state.nextFireAt) return { fired: false };
  state.magazine--; state.nextFireAt = now + 60 / config.roundsPerMinute; return { fired: true };
}
export function applyDamage(target: Damageable, rawDamage: number, penetration: number): Damageable {
  const absorbed = Math.min(target.armor, rawDamage * (1 - penetration));
  const health = Math.max(0, target.health - (rawDamage - absorbed));
  return { health, armor: Math.max(0, target.armor - absorbed), alive: health > 0 };
}
```

- [ ] **Step 5: Integrate hitscan events**

Extend `WeaponSystem.update` to call `tryFire`, derive a seeded spread ray from `command.yaw/pitch`, call `WorldRuntime.raycast`, reject friendly fire for the slice, and emit `{ type: 'shot' | 'hit' | 'kill', actorId, targetId, point }`. Add `primary` and `sidearm` states to `PlayerState`; reload transfers `min(config.magazine - magazine, reserve)` rounds when its timer completes.

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test -- --run tests/weapons/weapon-system.test.ts && npm run typecheck`

Expected: all weapon tests pass and TypeScript reports no errors.

- [ ] **Step 7: Commit**

```bash
git add src/weapons src/player/player-state.ts tests/weapons
git commit -m "feat: add vertical slice hitscan combat"
```

### Task 6: Bomb plant, countdown, defuse, and match integration

**Files:**
- Create: `src/match/bomb-system.ts`
- Create: `tests/match/bomb-system.test.ts`
- Modify: `src/match/match-controller.ts`
- Modify: `tests/match/match-controller.test.ts`

**Interfaces:**
- Consumes: carrier ID, actor team, actor position, `interact`, site bounds, fixed `dt`, and kit flag.
- Produces: `BombSnapshot { state, carrierId, position, progress, remaining }` and one-shot events `planted`, `defused`, `exploded`.

- [ ] **Step 1: Write failing plant and defuse tests**

```ts
// tests/match/bomb-system.test.ts
import { expect, it } from 'vitest';
import { BombSystem } from '../../src/match/bomb-system';
const site = { center: { x: 0, y: 0, z: 0 }, halfExtents: { x: 5, y: 2, z: 5 } };
it('plants after 3.2 uninterrupted seconds inside site', () => {
  const bomb = new BombSystem({ plantSeconds: 3.2, fuseSeconds: 35, defuseSeconds: 7, kitDefuseSeconds: 3.5 }, 'attacker-1');
  bomb.update(3.2, { actorId: 'attacker-1', team: 'attack', position: { x: 0, y: 0, z: 0 }, interact: true, alive: true, hasKit: false }, site);
  expect(bomb.snapshot().state).toBe('planted');
});
it('uses the kit defuse duration', () => {
  const bomb = BombSystem.plantedForTest({ plantSeconds: 3.2, fuseSeconds: 35, defuseSeconds: 7, kitDefuseSeconds: 3.5 });
  bomb.update(3.5, { actorId: 'defender-1', team: 'defense', position: { x: 0, y: 0, z: 0 }, interact: true, alive: true, hasKit: true }, site);
  expect(bomb.snapshot().state).toBe('defused');
});
```

- [ ] **Step 2: Confirm tests fail**

Run: `npm test -- --run tests/match/bomb-system.test.ts`

Expected: FAIL with module-not-found error.

- [ ] **Step 3: Implement explicit bomb states**

```ts
// src/match/bomb-system.ts
import type { EntityId, Team, Vec3 } from '../core/types';
type BombState = 'carried' | 'dropped' | 'planting' | 'planted' | 'defusing' | 'defused' | 'exploded';
interface BombConfig { plantSeconds: number; fuseSeconds: number; defuseSeconds: number; kitDefuseSeconds: number }
interface ActorAction { actorId: EntityId; team: Team; position: Vec3; interact: boolean; alive: boolean; hasKit: boolean }
interface SiteBounds { center: Vec3; halfExtents: Vec3 }
const inside = (p: Vec3, s: SiteBounds) => Math.abs(p.x - s.center.x) <= s.halfExtents.x && Math.abs(p.y - s.center.y) <= s.halfExtents.y && Math.abs(p.z - s.center.z) <= s.halfExtents.z;
export class BombSystem {
  private state: BombState = 'carried'; private progress = 0; private remaining: number; private position: Vec3 = { x: 0, y: 0, z: 0 };
  constructor(private readonly config: BombConfig, private carrierId: EntityId | null) { this.remaining = config.fuseSeconds; }
  static plantedForTest(config: BombConfig): BombSystem { const bomb = new BombSystem(config, null); bomb.state = 'planted'; return bomb; }
  update(dt: number, actor: ActorAction, site: SiteBounds): void {
    if ((this.state === 'carried' || this.state === 'planting') && actor.actorId === this.carrierId && actor.team === 'attack') {
      if (actor.interact && actor.alive && inside(actor.position, site)) { this.state = 'planting'; this.progress += dt; if (this.progress >= this.config.plantSeconds) { this.state = 'planted'; this.position = actor.position; this.progress = 0; this.carrierId = null; } }
      else { this.state = 'carried'; this.progress = 0; }
    } else if (this.state === 'planted' || this.state === 'defusing') {
      this.remaining = Math.max(0, this.remaining - dt);
      if (this.remaining === 0) { this.state = 'exploded'; return; }
      if (actor.team === 'defense' && actor.interact && actor.alive && inside(actor.position, { center: this.position, halfExtents: { x: 1.5, y: 1.5, z: 1.5 } })) { this.state = 'defusing'; this.progress += dt; if (this.progress >= (actor.hasKit ? this.config.kitDefuseSeconds : this.config.defuseSeconds)) this.state = 'defused'; }
      else if (this.state === 'defusing') { this.state = 'planted'; this.progress = 0; }
    }
  }
  snapshot() { return { state: this.state, carrierId: this.carrierId, position: this.position, progress: this.progress, remaining: this.remaining }; }
}
```

- [ ] **Step 4: Feed bomb facts into match rules**

Update the fixed-step composition so `BombSystem.update` runs before `MatchController.update`, and derive `bombPlanted`, `bombExploded`, and `bombDefused` from the bomb snapshot. Add a regression test that all defenders dying after plant does not award attackers until explosion.

- [ ] **Step 5: Run match tests**

Run: `npm test -- --run tests/match/bomb-system.test.ts tests/match/match-controller.test.ts`

Expected: plant, defuse, explosion, and planted-elimination tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/match tests/match
git commit -m "feat: add bomb objective lifecycle"
```

### Task 7: Navigation graph and five command-producing bots

**Files:**
- Create: `src/ai/nav-graph.ts`
- Create: `src/ai/bot-controller.ts`
- Create: `src/ai/bot-squad.ts`
- Create: `tests/ai/nav-graph.test.ts`
- Create: `tests/ai/bot-controller.test.ts`
- Create: `tests/ai/bot-squad.test.ts`

**Interfaces:**
- Consumes: graybox `NavNode[]`, bot/player snapshots, line-of-sight callback, bomb snapshot, and match phase.
- Produces: `NavGraph.findPath(from, to): string[]` and `BotController.update(context): PlayerCommand`.

- [ ] **Step 1: Write failing navigation and no-wallhack tests**

```ts
// tests/ai/nav-graph.test.ts
import { expect, it } from 'vitest';
import { NavGraph } from '../../src/ai/nav-graph';
it('finds the route from attack spawn to site', () => {
  const graph = new NavGraph([{ id: 'a', position: { x: 0, y: 0, z: 0 }, neighbors: ['m'], tags: [] }, { id: 'm', position: { x: 0, y: 0, z: 5 }, neighbors: ['a', 's'], tags: [] }, { id: 's', position: { x: 0, y: 0, z: 10 }, neighbors: ['m'], tags: ['site'] }]);
  expect(graph.findPath('a', 's')).toEqual(['a', 'm', 's']);
});

// tests/ai/bot-controller.test.ts
import { expect, it } from 'vitest';
import { BotController } from '../../src/ai/bot-controller';
it('does not fire at an occluded enemy', () => {
  const bot = new BotController('bot-1', 'defense', 7);
  const command = bot.update({ self: { position: { x: 0, y: 0, z: 0 }, yaw: 0, alive: true }, enemies: [{ id: 'p', position: { x: 0, y: 0, z: 10 }, alive: true }], canSee: () => false, objective: 'hold', targetNode: { x: 0, y: 0, z: 2 }, dt: 1 / 60 });
  expect(command.fire).toBe(false);
});
```

- [ ] **Step 2: Confirm tests fail**

Run: `npm test -- --run tests/ai/nav-graph.test.ts tests/ai/bot-controller.test.ts`

Expected: FAIL with module-not-found errors.

- [ ] **Step 3: Implement A* over the small semantic graph**

`NavGraph` stores nodes by ID, uses Euclidean distance for edge cost and heuristic, rejects unknown IDs with `Error('Unknown nav node: <id>')`, and reconstructs the inclusive start-to-goal list. With five nodes this remains deterministic by sorting equal-cost candidates by node ID.

```ts
export class NavGraph {
  constructor(readonly nodes: NavNode[]) {}
  findPath(from: string, to: string): string[];
  nearest(position: Vec3, requiredTag?: string): NavNode;
}
```

- [ ] **Step 4: Implement a deterministic bot state machine**

`BotController` has states `advance`, `engage`, `plant`, `hold`, and `defuse`. It only enters `engage` for enemies passing distance, 100-degree view cone, and `canSee`. Aim error uses its seeded generator; reaction delay is 0.25–0.55 s. Movement aims at the current nav target and returns normalized `moveX/moveZ`; attack carrier holds interact inside site; nearest living defender holds interact near a planted bomb. All output is a complete `PlayerCommand` created from `idleCommand()`.

```ts
export type BotObjective = 'advance' | 'hold' | 'plant' | 'defuse';
export interface BotContext { self: BotView; enemies: EnemyView[]; canSee(from: Vec3, to: Vec3): boolean; objective: BotObjective; targetNode: Vec3; dt: number }
export class BotController { constructor(id: EntityId, team: Team, seed: number); update(context: BotContext): PlayerCommand; reset(seed: number): void }
```

- [ ] **Step 5: Build the five-bot command sampler**

Implement `BotSquad` with five controllers: two attack allies and three defenders. Its `sample(context)` assigns attack objectives as `advance` or `plant`, defense objectives as `hold` or `defuse`, and returns a `Map<EntityId, PlayerCommand>`. Seed controllers from `round * 100 + actorIndex` so repeated test runs return the same first command. Add a test whose planted-bomb context assigns exactly one living defender to `defuse` and the others to `hold`.

```ts
export interface BotSquadContext { round: number; actors: BotActorView[]; bomb: BombView; nav: NavGraph; canSee(from: Vec3, to: Vec3): boolean; dt: number }
export class BotSquad { constructor(botIds: EntityId[]); sample(context: BotSquadContext): Map<EntityId, PlayerCommand>; reset(round: number): void }
```

- [ ] **Step 6: Run AI tests and full unit suite**

Run: `npm test -- --run tests/ai/nav-graph.test.ts tests/ai/bot-controller.test.ts && npm test -- --run`

Expected: AI tests and all earlier tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/ai tests/ai
git commit -m "feat: add command-driven tactical bots"
```

### Task 8: Game composition, minimal HUD, restart flow, and browser evidence

**Files:**
- Create: `src/game.ts`
- Create: `src/ui/hud.ts`
- Create: `src/ui/start-screen.ts`
- Create: `tests/ui/hud.test.ts`
- Create: `e2e/vertical-slice.spec.ts`
- Modify: `src/main.ts`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: all prior controllers and snapshots.
- Produces: `Game.create(canvas, uiRoot)`, `start()`, `restart()`, `snapshot()`, and `dispose()`.

- [ ] **Step 1: Write failing HUD and browser tests**

```ts
// tests/ui/hud.test.ts
import { expect, it } from 'vitest';
import { Hud } from '../../src/ui/hud';
it('renders score, timer, health, and ammo', () => {
  const root = document.createElement('div'); const hud = new Hud(root);
  hud.render({ attackScore: 2, defenseScore: 3, phase: 'live', phaseRemaining: 72.4, health: 86, armor: 40, weaponName: 'Vanguard Rifle', magazine: 21, reserve: 73, bombState: 'carried' });
  expect(root.textContent).toContain('2  —  3'); expect(root.textContent).toContain('1:12'); expect(root.textContent).toContain('86'); expect(root.textContent).toContain('21 / 73');
});
```

```ts
// e2e/vertical-slice.spec.ts
import { expect, test } from '@playwright/test';
test('starts a nonblank match and exposes restart', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '开始任务' })).toBeVisible();
  await page.getByRole('button', { name: '开始任务' }).click();
  await expect(page.locator('[data-testid="score"]')).toContainText('0  —  0');
  await expect(page.locator('canvas')).toBeVisible();
  const pixels = await page.locator('canvas').evaluate(canvas => {
    const c = canvas as HTMLCanvasElement; const gl = c.getContext('webgl2');
    if (!gl) return 0; const px = new Uint8Array(4); gl.readPixels(c.width / 2, c.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return px[0] + px[1] + px[2];
  });
  expect(pixels).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '重新开始' })).toBeVisible();
});
```

- [ ] **Step 2: Confirm focused tests fail**

Run: `npm test -- --run tests/ui/hud.test.ts`

Expected: FAIL with module-not-found error.

- [ ] **Step 3: Implement accessible HUD and start/pause overlays**

`Hud` owns four DOM regions: score/time at top center, health/armor at bottom left, weapon/ammo at bottom right, and contextual bomb action at center. `StartScreen` renders `开始任务`, explains `WASD / 鼠标 / E / R`, requests pointer lock from the user click, and shows `继续` plus `重新开始` after Escape. UI buttons keep pointer events; HUD does not.

```ts
export interface HudSnapshot { attackScore: number; defenseScore: number; phase: string; phaseRemaining: number; health: number; armor: number; weaponName: string; magazine: number; reserve: number; bombState: string }
export class Hud { constructor(root: HTMLElement); render(snapshot: HudSnapshot): void; dispose(): void }
export class StartScreen { constructor(root: HTMLElement, onStart: () => void, onRestart: () => void); setPaused(paused: boolean): void; dispose(): void }
```

- [ ] **Step 4: Compose the complete fixed update in `Game`**

`Game.create` initializes Rapier/world, map, actors, match, bomb, inputs, bots, weapon system, HUD, and start overlay. `start` installs one `requestAnimationFrame` loop using `FixedStepClock`; `restart` disposes actor bodies and resets match, bomb, weapons, bot seeds, spawn poses, and HUD without adding duplicate listeners. `dispose` cancels the RAF, disposes input/UI/world, and removes resize/pointer-lock handlers.

```ts
const STEP_ORDER = ['perception', 'commands', 'movement', 'weapons', 'bomb', 'match', 'snapshot'] as const;
```

- [ ] **Step 5: Replace bootstrap with guarded game startup**

```ts
// src/main.ts
import './styles.css';
import { Game } from './game';
const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
const uiRoot = document.querySelector<HTMLElement>('#ui-root');
if (!canvas || !uiRoot) throw new Error('Required app mount points are missing');
void Game.create(canvas, uiRoot).then(game => game.start()).catch(error => {
  uiRoot.innerHTML = `<section role="alert"><h1>无法启动游戏</h1><p>${error instanceof Error ? error.message : '未知错误'}</p></section>`;
});
```

- [ ] **Step 6: Run all automated verification**

Run: `npm test -- --run && npm run typecheck && npm run build && npx playwright install chromium && npm run test:e2e`

Expected: unit/integration tests pass, build succeeds, and Playwright reports the vertical-slice test passed.

- [ ] **Step 7: Run manual desktop verification and capture evidence**

Run: `npm run dev -- --port 5173`

Verify at `http://127.0.0.1:5173`: start via user click; mouse look and WASD work; pistol/rifle fire and reload; bots navigate and only fire with line of sight; attacker can plant; defender can defuse; elimination and timeout settle the round; Escape opens pause; restart creates a clean 0–0 match. Capture one 1440×900 active-game screenshot and record `renderer.info.render.calls`, `triangles`, and `textures` in `docs/verification/vertical-slice.md`.

- [ ] **Step 8: Commit the playable slice**

```bash
git add src/main.ts src/game.ts src/styles.css src/ui tests/ui e2e docs/verification/vertical-slice.md
git commit -m "feat: complete playable border station slice"
```

## Follow-on Milestone Plans

After this vertical slice passes review, create and execute these separate plans in order:

1. **Map and tactical AI expansion:** add the high bridge, lower tunnel, three-level navigation, cover semantics, smoke/flash decisions, stuck recovery, and attack/retake strategies.
2. **Arsenal, equipment, and economy:** expand to all 12 firearms, armor/helmet/kit, four grenades, penetration, drops/pickups, buy zones, rewards, loss bonus, and buy UI.
3. **Presentation and complete match UX:** radar, scoreboard, spectator switching, halftime presentation, settings persistence, weapon models, animation, VFX, generated/original audio, and final menus.
4. **Performance and release QA:** desktop performance pass, renderer budget, nonblank pixel evidence, console audit, accessibility checks, full-match soak test, screenshots, and production release report.

Each follow-on plan must keep the same `PlayerCommand`, fixed-step, snapshot, and data-driven boundaries established by this slice.
