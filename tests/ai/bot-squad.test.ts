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

it('routes the unique defuser through multiple nav nodes before interacting at the bomb', () => {
  const views = actors();
  views.find(({ id }) => id === 'defense-1')!.position = { x: 0, y: 0, z: -10 };
  views.find(({ id }) => id === 'defense-2')!.position = { x: 4, y: 0, z: -10 };
  views.find(({ id }) => id === 'defense-3')!.position = { x: 6, y: 0, z: -10 };
  const squad = new BotSquad(ids);
  const context = {
    round: 3,
    phase: 'planted' as const,
    actors: views,
    bomb: bomb({
      state: 'planted',
      carrierId: null,
      position: { x: -5, y: 0, z: 0 },
    }),
    nav,
    canSee: () => false,
    dt: 1 / 60,
  };

  const enRoute = squad.sample(context);
  expect(enRoute.get('defense-1')?.moveZ).toBe(-1);
  expect(enRoute.get('defense-1')?.yaw).toBeCloseTo(Math.atan2(1.5, -10));
  expect(enRoute.get('defense-1')?.interact).toBe(false);
  expect(enRoute.get('defense-2')?.interact).toBe(false);
  expect(enRoute.get('defense-3')?.interact).toBe(false);

  views.find(({ id }) => id === 'defense-1')!.position = { x: -5, y: 0, z: 0 };
  const arrived = squad.sample(context);
  expect(arrived.get('defense-1')?.interact).toBe(true);
  expect(arrived.get('defense-2')?.interact).toBe(false);
  expect(arrived.get('defense-3')?.interact).toBe(false);
});

it('assigns only the closest living attack bot to retrieve a dropped bomb', () => {
  const views = actors();
  views.find(({ id }) => id === 'attack-1')!.position = { x: 0.4, y: 0, z: 0 };
  views.find(({ id }) => id === 'attack-2')!.position = { x: 1.2, y: 0, z: 0 };
  const commands = new BotSquad(ids).sample({
    round: 3,
    phase: 'live',
    actors: views,
    bomb: bomb({ state: 'dropped', carrierId: null, position: { x: 0, y: 0, z: 0 } }),
    nav,
    canSee: () => false,
    dt: 1 / 60,
  });

  expect(commands.get('attack-1')?.interact).toBe(true);
  expect(commands.get('attack-2')?.interact).toBe(false);
});

it('breaks equal-distance retriever ties by actor id', () => {
  const views = actors();
  views.find(({ id }) => id === 'attack-1')!.position = { x: -1, y: 0, z: 0 };
  views.find(({ id }) => id === 'attack-2')!.position = { x: 1, y: 0, z: 0 };
  const commands = new BotSquad(ids).sample({
    round: 3,
    phase: 'live',
    actors: views,
    bomb: bomb({ state: 'dropped', carrierId: null, position: { x: 0, y: 0, z: 0 } }),
    nav,
    canSee: () => false,
    dt: 1 / 60,
  });

  expect(commands.get('attack-1')?.interact).toBe(true);
  expect(commands.get('attack-2')?.interact).toBe(false);
});

it('ignores a dead closer attacker when assigning dropped-bomb retrieval', () => {
  const views = actors();
  const closer = views.find(({ id }) => id === 'attack-1')!;
  closer.position = { x: 0.2, y: 0, z: 0 };
  closer.alive = false;
  views.find(({ id }) => id === 'attack-2')!.position = { x: 1, y: 0, z: 0 };
  const commands = new BotSquad(ids).sample({
    round: 3,
    phase: 'live',
    actors: views,
    bomb: bomb({ state: 'dropped', carrierId: null, position: { x: 0, y: 0, z: 0 } }),
    nav,
    canSee: () => false,
    dt: 1 / 60,
  });

  expect(commands.get('attack-1')?.interact).toBe(false);
  expect(commands.get('attack-2')?.interact).toBe(true);
});

it('routes the dropped-bomb retriever through the navigation graph', () => {
  const views = actors();
  views.find(({ id }) => id === 'attack-1')!.position = { x: 0, y: 0, z: 10 };
  views.find(({ id }) => id === 'attack-2')!.position = { x: 2, y: 0, z: 10 };
  const commands = new BotSquad(ids).sample({
    round: 3,
    phase: 'live',
    actors: views,
    bomb: bomb({ state: 'dropped', carrierId: null, position: { x: -5, y: 0, z: 0 } }),
    nav,
    canSee: () => false,
    dt: 1 / 60,
  });

  expect(commands.get('attack-1')).toMatchObject({ moveZ: -1, interact: false });
  expect(commands.get('attack-1')?.yaw).toBeCloseTo(0);
});

it('steers a displaced retriever back to the authored corridor before advancing', () => {
  const views = actors();
  views.find(({ id }) => id === 'attack-1')!.position = { x: 4, y: 0, z: 10 };
  views.find(({ id }) => id === 'attack-2')!.position = { x: 8, y: 0, z: 10 };
  const commands = new BotSquad(ids).sample({
    round: 3,
    phase: 'live',
    actors: views,
    bomb: bomb({ state: 'dropped', carrierId: null, position: { x: -5, y: 0, z: 0 } }),
    nav,
    canSee: () => false,
    dt: 1 / 60,
  });

  expect(commands.get('attack-1')).toMatchObject({ moveZ: -1, interact: false });
  expect(commands.get('attack-1')?.yaw).toBeCloseTo(Math.PI / 2);
});

it('keeps advancing toward a same-node interaction target across the old two-metre boundary', () => {
  const views = actors();
  views.find(({ id }) => id === 'attack-2')!.position = { x: 8, y: 0, z: 10 };
  const squad = new BotSquad(ids);

  for (const z of [0.5, 1.5, 2.5, 3.5]) {
    views.find(({ id }) => id === 'attack-1')!.position = { x: 0, y: 0, z };
    const commands = squad.sample({
      round: 3,
      phase: 'live',
      actors: views,
      bomb: bomb({ state: 'dropped', carrierId: null, position: { x: 0, y: 0, z: 4.5 } }),
      nav,
      canSee: () => false,
      dt: 1 / 60,
    });

    expect(commands.get('attack-1')).toMatchObject({
      moveZ: z === 3.5 ? 0 : -1,
      interact: z === 3.5,
    });
    expect(Math.abs(commands.get('attack-1')?.yaw ?? 0)).toBeCloseTo(Math.PI);
  }
});

it.each([
  ['normal attacker', null],
  ['bomb carrier', 'attack-1'],
] as const)('steers a displaced %s back to the authored corridor before advancing', (
  _description,
  carrierId,
) => {
  const views = actors();
  views.find(({ id }) => id === 'attack-1')!.position = { x: 4, y: 3, z: 10 };
  const commands = new BotSquad(ids).sample({
    round: 3,
    phase: 'live',
    actors: views,
    bomb: bomb({ carrierId }),
    nav,
    canSee: () => false,
    dt: 1 / 60,
  });

  expect(commands.get('attack-1')).toMatchObject({ moveZ: -1, interact: false });
  expect(commands.get('attack-1')?.yaw).toBeCloseTo(Math.PI / 2);
});

it('makes an attack-bot carrier plant when it reaches the bomb site', () => {
  const views = actors();
  views.find(({ id }) => id === 'attack-2')!.position = { x: 0, y: 3, z: 0 };
  const commands = new BotSquad(ids).sample({
    round: 3,
    phase: 'live',
    actors: views,
    bomb: bomb({ carrierId: 'attack-2', position: { x: 0, y: 0, z: 0 } }),
    nav,
    canSee: () => false,
    dt: 1 / 60,
  });

  expect(commands.get('attack-2')?.interact).toBe(true);
});

it('counter-pushes defenders toward the nearest living attacker before planting', () => {
  const views = actors();
  views.find(({ id }) => id === 'attack-1')!.position = { x: 8, y: 0, z: 0 };
  views.find(({ id }) => id === 'attack-2')!.position = { x: -8, y: 0, z: 8 };
  for (const actor of views.filter(({ team }) => team === 'defense')) {
    actor.position = { x: 0, y: 0, z: 0 };
    actor.yaw = 0;
  }
  const commands = new BotSquad(ids).sample({
    round: 3,
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
  expect(left.yaw).toBeLessThan(center.yaw);
  expect(center.yaw).toBeCloseTo(-Math.PI / 2);
  expect(right.yaw).toBeGreaterThan(center.yaw);
});

it('routes defender counter-pressure through the navigation graph', () => {
  const views = actors();
  views.find(({ id }) => id === 'attack-1')!.position = { x: -5, y: 0, z: 0 };
  views.find(({ id }) => id === 'attack-2')!.alive = false;
  for (const actor of views.filter(({ team }) => team === 'defense')) {
    actor.position = { x: 0, y: 0, z: -10 };
    actor.yaw = Math.PI;
  }
  const commands = new BotSquad(ids).sample({
    round: 3,
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
  expect(Math.abs(left.yaw)).toBeGreaterThan(2.8);
  expect(Math.abs(center.yaw)).toBeCloseTo(Math.PI);
  expect(Math.abs(right.yaw)).toBeGreaterThan(2.8);
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

it('clears active recovery during an inactive phase before movement resumes', () => {
  const squad = new BotSquad(ids);
  const context = {
    round: 1,
    phase: 'live' as const,
    actors: actors(),
    bomb: bomb(),
    nav,
    canSee: () => false,
    dt: 1 / 60,
  };
  const liveCommands = Array.from({ length: 30 }, () => squad.sample(context));

  squad.sample({ ...context, phase: 'freeze' });
  const resumed = Array.from({ length: 29 }, () => squad.sample(context));

  expect(Math.abs(liveCommands[29]!.get('attack-1')?.moveX ?? 0)).toBe(1);
  expect(resumed.every((commands) => commands.get('attack-1')?.moveX === 0)).toBe(true);
});

it('moves live defenders toward distinct left, center, and right site anchors', () => {
  const views = actors();
  for (const actor of views.filter(({ team }) => team === 'attack')) {
    actor.alive = false;
  }
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

it('keeps advancing squad members on deterministic parallel navigation lanes', () => {
  const views = actors();
  views.find(({ id }) => id === 'attack-1')!.position = { x: 0, y: 0, z: 10 };
  views.find(({ id }) => id === 'attack-2')!.position = { x: 1.5, y: 0, z: 10 };
  views.find(({ id }) => id === 'defense-1')!.position = { x: -1.5, y: 0, z: -10 };
  views.find(({ id }) => id === 'defense-2')!.position = { x: 0, y: 0, z: -10 };
  views.find(({ id }) => id === 'defense-3')!.position = { x: 1.5, y: 0, z: -10 };

  const commands = new BotSquad(ids).sample({
    round: 1,
    phase: 'live',
    actors: views,
    bomb: bomb(),
    nav,
    canSee: () => false,
    dt: 1 / 60,
  });

  expect(commands.get('attack-1')?.yaw).toBeCloseTo(0);
  expect(commands.get('attack-2')?.yaw).toBeCloseTo(0);
  for (const id of ['defense-1', 'defense-2', 'defense-3']) {
    expect(Math.abs(commands.get(id)?.yaw ?? 0)).toBeCloseTo(Math.PI);
  }
});
