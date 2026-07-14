import { expect, it } from 'vitest';
import {
  calculateTracerOrigin,
  cloneGameSnapshot,
  createGameRoster,
  STEP_ORDER,
  type GameSnapshot,
} from '../src/game';

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
