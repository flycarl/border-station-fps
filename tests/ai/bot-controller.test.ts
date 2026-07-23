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
    dt: 0.7,
  });

  expect(canSeeCalls).toBe(1);
  expect(command.fire).toBe(false);
});

it('requires both the reduced 34-metre range and 105-degree view cone to engage', () => {
  const outOfCone = new BotController('bot-cone', 'defense', 3);
  const outOfRange = new BotController('bot-range', 'defense', 3);
  const widenedCone = new BotController('bot-wide-cone', 'defense', 3);

  const coneCommand = outOfCone.update({
    ...baseContext(),
    enemies: [{ id: 'enemy', position: { x: 10, y: 0, z: -7 }, alive: true }],
    dt: 0.7,
  });
  const rangeCommand = outOfRange.update({
    ...baseContext(),
    enemies: [{ id: 'enemy', position: { x: 0, y: 0, z: -35 }, alive: true }],
    dt: 0.7,
  });
  const widenedConeCommand = widenedCone.update({
    ...baseContext(),
    enemies: [{ id: 'enemy', position: { x: 10, y: 0, z: -8 }, alive: true }],
    dt: 0.7,
  });

  expect(coneCommand.fire).toBe(false);
  expect(rangeCommand.fire).toBe(false);
  expect(widenedConeCommand.fire).toBe(true);
});

// The final seed produces a first PRNG sample of 0.9999999997671694.
it.each([0, 1, 7, 653_637_408])(
  'waits at least 0.45 seconds and fires by exactly 0.8 seconds for seed %i',
  (seed) => {
    const earlyBot = new BotController('bot-early', 'defense', seed);
    const boundaryBot = new BotController('bot-boundary', 'defense', seed);
    const context = {
      ...baseContext(),
      enemies: [{ id: 'enemy', position: { x: 0, y: 0, z: -10 }, alive: true }],
    };

    expect(earlyBot.update({ ...context, dt: 0.449_999 }).fire).toBe(false);
    expect(boundaryBot.update({ ...context, dt: 0.8 }).fire).toBe(true);
  },
);

it('fires again after the precise burst and pause boundaries', () => {
  const bot = new BotController('bot-burst', 'defense', 653_637_408);
  const context = {
    ...baseContext(),
    enemies: [{ id: 'enemy', position: { x: 0, y: 0, z: -10 }, alive: true }],
  };

  expect(bot.update({ ...context, dt: 0.799_999 }).fire).toBe(false);
  expect(bot.update({ ...context, dt: 0.000_001 }).fire).toBe(true);
  expect(bot.update({ ...context, dt: 0.279_998 }).fire).toBe(true);
  expect(bot.update({ ...context, dt: 0.000_002 }).fire).toBe(false);
  expect(bot.update({ ...context, dt: 0.479_998 }).fire).toBe(false);
  expect(bot.update({ ...context, dt: 0.000_002 }).fire).toBe(true);
});

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

it('keeps softened seeded aim error stable until the 0.35-second resample boundary', () => {
  const first = new BotController('bot-sustained', 'defense', 17);
  const replay = new BotController('bot-sustained', 'defense', 17);
  const context = {
    ...baseContext(),
    enemies: [{ id: 'enemy', position: { x: 0, y: 0, z: -10 }, alive: true }],
  };

  const sampleSequence = (bot: BotController) => [
    bot.update({ ...context, dt: 0 }),
    bot.update({ ...context, dt: 0.349 }),
    bot.update({ ...context, dt: 0.001 }),
  ];
  const firstSequence = sampleSequence(first);
  const replaySequence = sampleSequence(replay);

  expect(firstSequence[1]!.yaw).toBe(firstSequence[0]!.yaw);
  expect(firstSequence[1]!.pitch).toBe(firstSequence[0]!.pitch);
  expect(firstSequence[2]!.yaw).not.toBe(firstSequence[1]!.yaw);
  expect(firstSequence[2]!.pitch).not.toBe(firstSequence[1]!.pitch);
  for (const command of firstSequence) {
    expect(Math.abs(command.yaw)).toBeLessThanOrEqual(0.125);
    expect(Math.abs(command.pitch)).toBeLessThanOrEqual(0.088);
  }
  expect(firstSequence.some((command) => Math.abs(command.yaw) > 0.065
    || Math.abs(command.pitch) > 0.040)).toBe(true);
  expect(replaySequence).toEqual(firstSequence);
});

it('moves a holding bot toward its anchor until it reaches the hold radius', () => {
  const farBot = new BotController('far-hold', 'defense', 7);
  const nearBot = new BotController('near-hold', 'defense', 7);

  expect(farBot.update({
    ...baseContext(),
    targetNode: { x: 0, y: 0, z: -2 },
  }).moveZ).toBe(-1);
  expect(nearBot.update({
    ...baseContext(),
    targetNode: { x: 0, y: 0, z: -1 },
  }).moveZ).toBe(0);
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

it.each(['plant', 'defuse', 'retrieve'] as const)(
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

it('resumes planting and interacts after an enemy leaves engagement', () => {
  const bot = new BotController('carrier', 'attack', 7);
  const engage = bot.update({
    ...baseContext(),
    objective: 'plant',
    targetNode: { x: 1, y: 0, z: 0 },
    enemies: [{ id: 'enemy', position: { x: 0, y: 0, z: -10 }, alive: true }],
    dt: 0.2,
  });
  const resumed = bot.update({
    ...baseContext(),
    objective: 'plant',
    targetNode: { x: 1, y: 0, z: 0 },
    enemies: [],
    dt: 1 / 60,
  });

  expect(engage.interact).toBe(false);
  expect(resumed.interact).toBe(true);
  expect(resumed.fire).toBe(false);
});

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

it('starts deterministic lateral recovery after 0.5 seconds without planar progress', () => {
  const first = new BotController('stuck-objective', 'attack', 7);
  const replay = new BotController('stuck-objective', 'attack', 7);
  const context = {
    ...baseContext(),
    objective: 'advance' as const,
    targetNode: { x: 0, y: 0, z: -20 },
    dt: 0.1,
  };

  const commands = Array.from({ length: 5 }, () => first.update(context));
  const replayCommands = Array.from({ length: 5 }, () => replay.update(context));

  expect(commands.slice(0, 4).every(({ moveX }) => moveX === 0)).toBe(true);
  expect(Math.abs(commands[4]!.moveX)).toBe(1);
  expect(commands[4]!.moveZ).toBe(0);
  expect(replayCommands).toEqual(commands);
});

it('resets accumulated stall time after meaningful planar displacement', () => {
  const bot = new BotController('moving-objective', 'attack', 7);
  const context = {
    ...baseContext(),
    objective: 'advance' as const,
    targetNode: { x: 0, y: 0, z: -20 },
    dt: 0.1,
  };

  for (let sample = 0; sample < 4; sample++) bot.update(context);
  bot.update({
    ...context,
    self: { ...context.self, position: { x: 0.01, y: 0, z: 0 } },
  });
  const afterReset = Array.from({ length: 4 }, () => bot.update({
    ...context,
    self: { ...context.self, position: { x: 0.01, y: 0, z: 0 } },
  }));

  expect(afterReset.every(({ moveX }) => moveX === 0)).toBe(true);
});

it('treats 0.05 to 0.06 as the exact 0.01 minimum planar progress', () => {
  const bot = new BotController('decimal-progress', 'attack', 7);
  const context = {
    ...baseContext(),
    self: {
      ...baseContext().self,
      position: { x: 0.05, y: 0, z: 0 },
    },
    objective: 'advance' as const,
    targetNode: { x: 0, y: 0, z: -20 },
    dt: 0.1,
  };

  for (let sample = 0; sample < 4; sample++) bot.update(context);
  const atBoundary = bot.update({
    ...context,
    self: {
      ...context.self,
      position: { x: 0.06, y: 0, z: 0 },
    },
  });

  expect(atBoundary.moveX).toBe(0);
  expect(atBoundary.moveZ).toBe(-1);
});

it('starts recovery on tick 30 at the production 60 Hz timestep', () => {
  const bot = new BotController('sixty-hertz-stall', 'attack', 7);
  const context = {
    ...baseContext(),
    objective: 'advance' as const,
    targetNode: { x: 0, y: 0, z: -20 },
    dt: 1 / 60,
  };

  const commands = Array.from({ length: 30 }, () => bot.update(context));

  expect(commands.slice(0, 29).every(({ moveX }) => moveX === 0)).toBe(true);
  expect(Math.abs(commands[29]!.moveX)).toBe(1);
  expect(commands[29]!.moveZ).toBe(0);
});

it('never accumulates recovery while holding an interaction command', () => {
  const bot = new BotController('stationary-interaction', 'attack', 7);
  const interactionContext = {
    ...baseContext(),
    objective: 'plant' as const,
    targetNode: { x: 1, y: 0, z: 0 },
    dt: 0.1,
  };

  const interactions = Array.from({ length: 10 }, () => bot.update(interactionContext));
  const movement = Array.from({ length: 4 }, () => bot.update({
    ...interactionContext,
    objective: 'advance' as const,
    targetNode: { x: 0, y: 0, z: -20 },
  }));

  expect(interactions.every(({ interact, moveX, moveZ }) => (
    interact && moveX === 0 && moveZ === 0
  ))).toBe(true);
  expect(movement.every(({ moveX }) => moveX === 0)).toBe(true);
});

it('recovers engagement movement without changing aim or fire state', () => {
  const stuck = new BotController('stuck-engagement', 'defense', 17);
  const progressing = new BotController('stuck-engagement', 'defense', 17);
  const context = {
    ...baseContext(),
    enemies: [{ id: 'enemy', position: { x: 0, y: 0, z: -30 }, alive: true }],
    dt: 0.1,
  };
  let stuckCommand = stuck.update(context);
  let progressingCommand = progressing.update(context);
  for (let sample = 1; sample < 5; sample++) {
    stuckCommand = stuck.update(context);
    progressingCommand = progressing.update({
      ...context,
      self: {
        ...context.self,
        position: { x: sample * 0.01, y: 0, z: 0 },
      },
      enemies: [{ id: 'enemy', position: { x: sample * 0.01, y: 0, z: -30 }, alive: true }],
    });
  }

  expect(Math.abs(stuckCommand.moveX)).toBe(1);
  expect(stuckCommand.moveZ).toBe(0);
  expect(stuckCommand.yaw).toBe(progressingCommand.yaw);
  expect(stuckCommand.pitch).toBe(progressingCommand.pitch);
  expect(stuckCommand.fire).toBe(progressingCommand.fire);
});

it('ends recovery immediately after the full 0.6 seconds', () => {
  const bot = new BotController('persistent-recovery', 'attack', 7);
  const context = {
    ...baseContext(),
    objective: 'advance' as const,
    targetNode: { x: 0, y: 0, z: -20 },
    dt: 0.1,
  };
  for (let sample = 0; sample < 5; sample++) bot.update(context);

  const recoveryCommands = Array.from({ length: 5 }, (_, sample) => bot.update({
    ...context,
    self: {
      ...context.self,
      position: { x: (sample + 1) * 0.01, y: 0, z: 0 },
    },
  }));

  expect(recoveryCommands.every(({ moveX, moveZ }) => (
    Math.abs(moveX) === 1 && moveZ === 0
  ))).toBe(true);
  expect(bot.update({
    ...context,
    self: {
      ...context.self,
      position: { x: 0.06, y: 0, z: 0 },
    },
  })).toMatchObject({ moveX: 0, moveZ: -1 });
});

it('alternates the lateral direction on a subsequent recovery', () => {
  const bot = new BotController('alternating-recovery', 'attack', 7);
  const context = {
    ...baseContext(),
    objective: 'advance' as const,
    targetNode: { x: 0, y: 0, z: -20 },
    dt: 0.1,
  };

  const firstRecovery = Array.from({ length: 5 }, () => bot.update(context))[4]!;
  for (let sample = 0; sample < 5; sample++) bot.update(context);
  const nextStallCommands = Array.from({ length: 5 }, () => bot.update(context));
  const secondRecovery = nextStallCommands[4]!;

  expect(nextStallCommands.slice(0, 4).every(({ moveX }) => moveX === 0)).toBe(true);
  expect(secondRecovery.moveX).toBe(-firstRecovery.moveX);
  expect(secondRecovery.moveZ).toBe(0);
});

it.each(['dead', 'stationary'] as const)(
  'clears active recovery during the %s lifecycle before movement resumes',
  (lifecycle) => {
    const bot = new BotController('lifecycle-recovery', 'attack', 7);
    const movingContext = {
      ...baseContext(),
      objective: 'advance' as const,
      targetNode: { x: 0, y: 0, z: -20 },
      dt: 0.1,
    };
    const activeRecovery = Array.from({ length: 5 }, () => bot.update(movingContext))[4]!;

    bot.update(lifecycle === 'dead'
      ? { ...movingContext, self: { ...movingContext.self, alive: false } }
      : { ...movingContext, objective: 'hold', targetNode: movingContext.self.position });
    const resumed = Array.from({ length: 4 }, () => bot.update(movingContext));

    expect(Math.abs(activeRecovery.moveX)).toBe(1);
    expect(resumed.every(({ moveX, moveZ }) => moveX === 0 && moveZ === -1)).toBe(true);
  },
);
