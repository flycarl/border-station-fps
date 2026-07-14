import { expect, it } from 'vitest';
import { BotController } from '../../src/ai/bot-controller';
import { idleCommand } from '../../src/core/types';

const baseContext = () => ({
  self: { position: { x: 0, y: 0, z: 0 }, yaw: 0, alive: true },
  enemies: [],
  canSee: () => true,
  objective: 'hold' as const,
  targetNode: { x: 0, y: 0, z: -2 },
  dt: 1 / 60,
});

it('does not fire at an occluded enemy', () => {
  const bot = new BotController('bot-1', 'defense', 7);
  let canSeeCalls = 0;
  const command = bot.update({
    self: { position: { x: 0, y: 0, z: 0 }, yaw: 0, alive: true },
    enemies: [{ id: 'p', position: { x: 0, y: 0, z: -10 }, alive: true }],
    canSee: () => {
      canSeeCalls += 1;
      return false;
    },
    objective: 'hold',
    targetNode: { x: 0, y: 0, z: -2 },
    dt: 1,
  });

  expect(canSeeCalls).toBe(1);
  expect(command.fire).toBe(false);
});

it('requires both range and the 120-degree view cone to engage', () => {
  const outOfCone = new BotController('bot-cone', 'defense', 3);
  const outOfRange = new BotController('bot-range', 'defense', 3);
  const widenedCone = new BotController('bot-wide-cone', 'defense', 3);

  const coneCommand = outOfCone.update({
    ...baseContext(),
    enemies: [{ id: 'enemy', position: { x: 10, y: 0, z: -5 }, alive: true }],
    dt: 1,
  });
  const rangeCommand = outOfRange.update({
    ...baseContext(),
    enemies: [{ id: 'enemy', position: { x: 0, y: 0, z: -43 }, alive: true }],
    dt: 1,
  });
  const widenedConeCommand = widenedCone.update({
    ...baseContext(),
    enemies: [{ id: 'enemy', position: { x: 10, y: 0, z: -7 }, alive: true }],
    dt: 1,
  });

  expect(coneCommand.fire).toBe(false);
  expect(rangeCommand.fire).toBe(false);
  expect(widenedConeCommand.fire).toBe(true);
});

// The final seed produces a first PRNG sample of 0.9999999997671694.
it.each([0, 1, 7, 653_637_408])(
  'waits at least 0.16 seconds and fires by exactly 0.38 seconds for seed %i',
  (seed) => {
    const earlyBot = new BotController('bot-early', 'defense', seed);
    const boundaryBot = new BotController('bot-boundary', 'defense', seed);
    const context = {
      ...baseContext(),
      enemies: [{ id: 'enemy', position: { x: 0, y: 0, z: -10 }, alive: true }],
    };

    expect(earlyBot.update({ ...context, dt: 0.159_999 }).fire).toBe(false);
    expect(boundaryBot.update({ ...context, dt: 0.38 }).fire).toBe(true);
  },
);

it('keeps pressure with deterministic advance and strafe movement while engaging at range', () => {
  const first = new BotController('bot-pressure', 'defense', 7);
  const second = new BotController('bot-pressure', 'defense', 7);
  const context = {
    ...baseContext(),
    enemies: [{ id: 'enemy', position: { x: 0, y: 0, z: -30 }, alive: true }],
    dt: 0.2,
  };

  const firstCommand = first.update(context);
  const secondCommand = second.update(context);
  expect(firstCommand.moveZ).toBeLessThan(0);
  expect(Math.abs(firstCommand.moveX)).toBeGreaterThan(0);
  expect(firstCommand).toEqual(secondCommand);
});

it('returns a complete command and normalized movement toward a nav target', () => {
  const bot = new BotController('bot-1', 'attack', 7);
  const command = bot.update({
    ...baseContext(),
    objective: 'advance',
    targetNode: { x: 3, y: 0, z: 4 },
  });

  expect(Object.keys(command).sort()).toEqual(Object.keys(idleCommand()).sort());
  expect(Math.hypot(command.moveX, command.moveZ)).toBeCloseTo(1);
  expect(command.moveX).toBe(0);
  expect(command.moveZ).toBe(-1);
});

it.each(['plant', 'defuse'] as const)(
  'holds interact for %s only near the objective',
  (objective) => {
    const nearBot = new BotController('near', 'attack', 7);
    const farBot = new BotController('far', 'attack', 7);

    expect(nearBot.update({
      ...baseContext(),
      objective,
      targetNode: { x: 1, y: 0, z: 0 },
    }).interact).toBe(true);
    expect(farBot.update({
      ...baseContext(),
      objective,
      targetNode: { x: 4, y: 0, z: 0 },
    }).interact).toBe(false);
  },
);

it('replays the same first command after resetting to the same seed', () => {
  const bot = new BotController('bot-1', 'defense', 11);
  const context = {
    ...baseContext(),
    enemies: [{ id: 'enemy', position: { x: 1, y: 0, z: -10 }, alive: true }],
    dt: 0.1,
  };

  const first = bot.update(context);
  bot.reset(11);

  expect(bot.update(context)).toEqual(first);
});
