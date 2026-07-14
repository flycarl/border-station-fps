import { expect, it } from 'vitest';
import { BotSquad, type BotActorView, type BombView } from '../../src/ai/bot-squad';
import { NavGraph } from '../../src/ai/nav-graph';
import { idleCommand } from '../../src/core/types';

const ids = ['attack-1', 'attack-2', 'defense-1', 'defense-2', 'defense-3'];

const nav = new NavGraph([
  { id: 'attack', position: { x: 0, y: 0, z: 10 }, neighbors: ['site'], tags: ['spawn-attack'] },
  { id: 'site-left', position: { x: -5, y: 0, z: 0 }, neighbors: ['site'], tags: ['ramp'] },
  { id: 'site', position: { x: 0, y: 0, z: 0 }, neighbors: ['attack', 'defense', 'site-left', 'site-right'], tags: ['site'] },
  { id: 'site-right', position: { x: 5, y: 0, z: 0 }, neighbors: ['site'], tags: ['ramp'] },
  { id: 'defense', position: { x: 0, y: 0, z: -10 }, neighbors: ['site'], tags: ['spawn-defense'] },
]);

const actors = (): BotActorView[] => [
  { id: 'attack-1', team: 'attack', position: { x: 0, y: 0, z: 10 }, yaw: 0, alive: true },
  { id: 'attack-2', team: 'attack', position: { x: 1, y: 0, z: 10 }, yaw: 0, alive: true },
  { id: 'defense-1', team: 'defense', position: { x: 1.4, y: 0, z: 0 }, yaw: Math.PI, alive: true },
  { id: 'defense-2', team: 'defense', position: { x: 0.5, y: 0, z: 0 }, yaw: Math.PI, alive: true },
  { id: 'defense-3', team: 'defense', position: { x: 1, y: 0, z: 0 }, yaw: Math.PI, alive: true },
];

const bomb = (overrides: Partial<BombView> = {}): BombView => ({
  state: 'carried',
  carrierId: 'attack-1',
  position: { x: 0, y: 0, z: 0 },
  ...overrides,
});

it('requires exactly five unique bot ids', () => {
  expect(() => new BotSquad(ids.slice(0, 4))).toThrow('BotSquad requires exactly five bot ids');
  expect(() => new BotSquad([...ids.slice(0, 4), ids[0]!])).toThrow('BotSquad bot ids must be unique');
});

it('returns one complete command for each of its five actors', () => {
  const commands = new BotSquad(ids).sample({
    round: 2,
    actors: actors(),
    bomb: bomb(),
    nav,
    canSee: () => false,
    dt: 1 / 60,
  });

  expect([...commands.keys()]).toEqual(ids);
  for (const command of commands.values()) {
    expect(Object.keys(command).sort()).toEqual(Object.keys(idleCommand()).sort());
    expect(Math.hypot(command.moveX, command.moveZ)).toBeLessThanOrEqual(1);
  }
});

it('assigns exactly one closest living defender to defuse a planted bomb', () => {
  const commands = new BotSquad(ids).sample({
    round: 3,
    actors: actors(),
    bomb: bomb({ state: 'planted', carrierId: null }),
    nav,
    canSee: () => false,
    dt: 1 / 60,
  });

  expect(commands.get('defense-1')?.interact).toBe(false);
  expect(commands.get('defense-2')?.interact).toBe(true);
  expect(commands.get('defense-3')?.interact).toBe(false);
});

it('ignores dead defenders when selecting the closest defuser', () => {
  const views = actors();
  views.find(({ id }) => id === 'defense-2')!.alive = false;
  const commands = new BotSquad(ids).sample({
    round: 3,
    actors: views,
    bomb: bomb({ state: 'planted', carrierId: null }),
    nav,
    canSee: () => false,
    dt: 1 / 60,
  });

  expect(commands.get('defense-2')?.interact).toBe(false);
  expect(commands.get('defense-3')?.interact).toBe(true);
});

it('reproduces the first command sequence when reset to the same round', () => {
  const squad = new BotSquad(ids);
  const context = {
    round: 4,
    actors: actors(),
    bomb: bomb(),
    nav,
    canSee: () => true,
    dt: 0.1,
  };
  const first = [...squad.sample(context).entries()];

  squad.reset(4);

  expect([...squad.sample(context).entries()]).toEqual(first);
});

it('does not move, fire, or interact outside active match phases', () => {
  const commands = new BotSquad(ids).sample({
    round: 1,
    phase: 'freeze',
    actors: actors(),
    bomb: bomb(),
    nav,
    canSee: () => true,
    dt: 1,
  });

  for (const command of commands.values()) {
    expect(command).toMatchObject({
      moveX: 0,
      moveZ: 0,
      fire: false,
      interact: false,
    });
  }
});

it('moves live defenders toward distinct left, center, and right site anchors', () => {
  const views = actors();
  for (const actor of views.filter(({ team }) => team === 'defense')) {
    actor.position = { x: 0, y: 0, z: 5 };
    actor.yaw = 0;
  }
  const commands = new BotSquad(ids).sample({
    round: 1,
    phase: 'live',
    actors: views,
    bomb: bomb(),
    nav,
    canSee: () => false,
    dt: 1 / 60,
  });

  const left = commands.get('defense-1')!;
  const center = commands.get('defense-2')!;
  const right = commands.get('defense-3')!;
  expect(left.moveZ).toBe(-1);
  expect(center.moveZ).toBe(-1);
  expect(right.moveZ).toBe(-1);
  expect(left.yaw).toBeGreaterThan(center.yaw);
  expect(center.yaw).toBeCloseTo(0);
  expect(right.yaw).toBeLessThan(center.yaw);
});
