import { expect, it } from 'vitest';
import {
  applyDamage,
  createWeaponState,
  tryFire,
  WeaponSystem,
  type CombatActor,
  type WeaponEvent,
} from '../../src/weapons/weapon-system';
import { createPlayerState } from '../../src/player/player-state';
import type { PlayerCommand, Vec3 } from '../../src/core/types';

it('blocks firing during cooldown and consumes one round', () => {
  const state = createWeaponState('vanguard-rifle');
  expect(tryFire(state, 10).fired).toBe(true);
  expect(tryFire(state, 10.01).fired).toBe(false);
  expect(state.magazine).toBe(29);
});

it('applies armor before health and kills at zero health', () => {
  expect(
    applyDamage({ health: 100, armor: 50, alive: true }, 80, 0.6),
  ).toEqual({ health: 52, armor: 18, alive: true });
});

const command = (
  overrides: Partial<PlayerCommand> = {},
): PlayerCommand => ({
  moveX: 0,
  moveZ: 0,
  yaw: 0,
  pitch: 0,
  jump: false,
  crouch: false,
  walk: false,
  fire: false,
  reload: false,
  interact: false,
  slot: 1,
  ...overrides,
});

const camera = { origin: { x: 0, y: 1.6, z: 0 } };

function createHarness(targetOverrides: Partial<CombatActor> = {}) {
  const shooter: CombatActor = createPlayerState(
    'shooter',
    'attack',
    { x: 0, y: 0, z: 0 },
  );
  const target: CombatActor = {
    ...createPlayerState('target', 'defense', { x: 0, y: 0, z: -10 }),
    ...targetOverrides,
  };
  const actors = new Map([
    [shooter.id, shooter],
    [target.id, target],
  ]);
  const rays: Array<{ direction: Vec3; maxDistance: number }> = [];
  const world = {
    raycast(_origin: Vec3, direction: Vec3, maxDistance: number) {
      rays.push({ direction, maxDistance });
      return {
        entityId: target.id,
        distance: 10,
        point: { x: 0, y: 1.6, z: -10 },
      };
    },
  };
  const weapons = new WeaponSystem(world, (id) => actors.get(id), 1234);

  return { shooter, target, weapons, rays };
}

it('reloads the selected weapon when its timer completes', () => {
  const { shooter, weapons } = createHarness();
  shooter.primary.magazine = 20;

  expect(weapons.update('shooter', command({ reload: true }), camera, 0)).toEqual([]);
  expect(shooter.primary.reloadEndsAt).toBe(2.35);
  expect(weapons.update('shooter', command(), camera, 2.35)).toEqual([]);
  expect(shooter.primary).toMatchObject({ magazine: 30, reserve: 80, reloadEndsAt: null });
});

it('emits shot and hit events and applies enemy damage', () => {
  const { shooter, target, weapons, rays } = createHarness({ armor: 50 });

  const events = weapons.update('shooter', command({ fire: true }), camera, 0);

  expect(events.map((event: WeaponEvent) => event.type)).toEqual(['shot', 'hit']);
  expect(events.at(1)).toMatchObject({ actorId: 'shooter', targetId: 'target' });
  expect(target).toMatchObject({ health: 74.8, armor: 40.2, alive: true });
  expect(shooter.primary.magazine).toBe(29);
  expect(rays.at(0)?.maxDistance).toBe(95);
});

it('emits a kill event for lethal damage', () => {
  const { target, weapons } = createHarness({ health: 20, armor: 0 });

  const events = weapons.update('shooter', command({ fire: true }), camera, 0);

  expect(events.map((event: WeaponEvent) => event.type)).toEqual([
    'shot',
    'hit',
    'kill',
  ]);
  expect(target.alive).toBe(false);
});

it('does not damage teammates', () => {
  const { target, weapons } = createHarness({ team: 'attack' });

  const events = weapons.update('shooter', command({ fire: true }), camera, 0);

  expect(events.map((event: WeaponEvent) => event.type)).toEqual(['shot']);
  expect(target).toMatchObject({ health: 100, armor: 0, alive: true });
});

it('uses the sidearm for slot two', () => {
  const { shooter, target, weapons, rays } = createHarness();

  weapons.update('shooter', command({ fire: true, slot: 2 }), camera, 0);

  expect(shooter.sidearm.magazine).toBe(14);
  expect(shooter.primary.magazine).toBe(30);
  expect(target.health).toBe(69);
  expect(rays.at(0)?.maxDistance).toBe(55);
});

it('does not fire a weapon from utility or objective slots', () => {
  const { shooter, weapons } = createHarness();

  expect(
    weapons.update('shooter', command({ fire: true, slot: 3 }), camera, 0),
  ).toEqual([]);
  expect(shooter.primary.magazine).toBe(30);
  expect(shooter.sidearm.magazine).toBe(15);
});

it('generates repeatable spread rays from the same seed', () => {
  const first = createHarness();
  const second = createHarness();
  const aim = command({ fire: true, yaw: 0.4, pitch: -0.2 });

  first.weapons.update('shooter', aim, camera, 0);
  second.weapons.update('shooter', aim, camera, 0);

  const firstDirection = first.rays.at(0)?.direction;
  const secondDirection = second.rays.at(0)?.direction;
  expect(firstDirection).toBeDefined();
  expect(firstDirection).toEqual(secondDirection);
  expect(Math.hypot(
    firstDirection!.x,
    firstDirection!.y,
    firstDirection!.z,
  )).toBeCloseTo(1);
});

it('advances cooldown time independently for each actor', () => {
  const { shooter, weapons } = createHarness();

  weapons.update(shooter.id, command({ fire: true }), camera, 0);
  weapons.update('target', command(), camera, 1);
  weapons.update(shooter.id, command({ fire: true }), camera, 0.01);

  expect(shooter.primary.magazine).toBe(29);
});
