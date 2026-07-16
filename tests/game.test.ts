import { expect, it } from 'vitest';
import {
  calculateTracerOrigin,
  cloneGameSnapshot,
  createGameRoster,
  selectCameraPose,
  selectRoundBombCarrier,
  selectViewActor,
  shouldAdvanceSimulation,
  STEP_ORDER,
  type GameSnapshot,
} from '../src/game';

const actor = (
  id: string,
  team: 'attack' | 'defense',
  position: { x: number; y: number; z: number },
  alive = true,
) => ({ id, team, position, health: alive ? 100 : 0, alive });

it('composes one fixed step in the required deterministic order', () => {
  expect(STEP_ORDER).toEqual([
    'perception',
    'commands',
    'movement',
    'physics',
    'weapons',
    'bomb',
    'match',
    'snapshot',
  ]);
});

it('creates one human attacker, two attack bots, and three defense bots', () => {
  const roster = createGameRoster();

  expect(roster).toHaveLength(6);
  expect(roster.filter(({ human }) => human)).toEqual([
    expect.objectContaining({ id: 'attack-human', team: 'attack' }),
  ]);
  expect(roster.filter(({ team, human }) => team === 'attack' && !human)).toHaveLength(2);
  expect(roster.filter(({ team, human }) => team === 'defense' && !human)).toHaveLength(3);
});

it('selects one deterministic attacker bomb carrier with round-seeded variety', () => {
  const roster = createGameRoster();
  const firstPass = Array.from({ length: 12 }, (_, index) => (
    selectRoundBombCarrier(roster, index + 1)
  ));
  const replay = Array.from({ length: 12 }, (_, index) => (
    selectRoundBombCarrier(roster, index + 1)
  ));
  const attackerIds = new Set(
    roster.filter(({ team }) => team === 'attack').map(({ id }) => id),
  );

  expect(replay).toEqual(firstPass);
  expect(firstPass.every((id) => attackerIds.has(id))).toBe(true);
  expect(new Set(firstPass)).toEqual(attackerIds);
});

it('keeps the view on the human attacker while the human is alive', () => {
  const actors = [
    actor('attack-human', 'attack', { x: 0, y: 1, z: 10 }),
    actor('attack-bot-1', 'attack', { x: 1, y: 1, z: 10 }),
  ];

  expect(selectViewActor(actors, 'attack-human')).toBe('attack-human');
});

it('selects no actor view after the human dies', () => {
  const actors = [
    actor('attack-human', 'attack', { x: 0, y: 1, z: 10 }, false),
    actor('attack-bot-1', 'attack', { x: 8, y: 1, z: 10 }),
    actor('attack-bot-2', 'attack', { x: 2, y: 1, z: 10 }),
    actor('defense-bot-1', 'defense', { x: 1, y: 1, z: 10 }),
  ];

  expect(selectViewActor(actors, 'attack-human')).toBeNull();
});

it('switches from the human eye pose to a whole-map overhead pose on death', () => {
  const living = selectCameraPose({
    position: { x: 4, y: 1, z: 39 },
    yaw: 0.4,
    pitch: -0.2,
    alive: true,
  });
  const dead = selectCameraPose({
    position: { x: 4, y: 1, z: 39 },
    yaw: 0.4,
    pitch: -0.2,
    alive: false,
  });

  expect(living).toEqual({
    position: { x: 4, y: 1.65, z: 39 },
    yaw: 0.4,
    pitch: -0.2,
  });
  expect(dead).toEqual({
    position: { x: 0, y: 72, z: 0 },
    yaw: 0,
    pitch: -Math.PI / 2,
  });
});

it('keeps the bot simulation running when a dead player loses pointer lock', () => {
  expect(shouldAdvanceSimulation({ paused: true, hasEntered: true, humanAlive: false }))
    .toBe(true);
  expect(shouldAdvanceSimulation({ paused: true, hasEntered: true, humanAlive: true }))
    .toBe(false);
  expect(shouldAdvanceSimulation({ paused: false, hasEntered: true, humanAlive: true }))
    .toBe(true);
  expect(shouldAdvanceSimulation({ paused: true, hasEntered: false, humanAlive: false }))
    .toBe(false);
  expect(shouldAdvanceSimulation({ paused: true, hasEntered: true, humanAlive: undefined }))
    .toBe(false);
});

it('starts visual tracers in front of and beside the camera at the muzzle', () => {
  const origin = calculateTracerOrigin({ x: 0, y: 1.65, z: 0 }, 0, 0);
  expect(origin.x).toBeCloseTo(0.18);
  expect(origin.y).toBeCloseTo(1.53);
  expect(origin.z).toBeCloseTo(-0.42);
});

it('deep-clones radar state so diagnostics cannot mutate the authoritative snapshot', () => {
  const source: GameSnapshot = {
    attackScore: 0, defenseScore: 0, attackersAlive: 3, defendersAlive: 3,
    phase: 'live', phaseRemaining: 90, health: 100, armor: 25,
    weaponName: 'Vanguard Rifle', magazine: 30, reserve: 90,
    bombState: 'carried', round: 1, paused: false,
    radar: {
      bounds: { minX: -17, maxX: 17, minZ: -47, maxZ: 47 },
      bombSite: { x: -1, z: -29 },
      contacts: [{
        id: 'attack-human', team: 'attack', x: 0, z: 39,
        yaw: 0, human: true, alive: true,
      }],
    },
    actors: [{
      id: 'attack-human', team: 'attack', position: { x: 0, y: 1, z: 39 },
      health: 100, alive: true,
    }],
  };

  const copy = cloneGameSnapshot(source);
  copy.radar.bounds.minX = 99;
  copy.radar.bombSite.x = 99;
  copy.radar.contacts[0]!.x = 99;
  copy.actors[0]!.position.x = 99;

  expect(source.radar.bounds.minX).toBe(-17);
  expect(source.radar.bombSite.x).toBe(-1);
  expect(source.radar.contacts[0]!.x).toBe(0);
  expect(source.actors[0]!.position.x).toBe(0);
});
