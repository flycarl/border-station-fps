import { expect, it } from 'vitest';
import { BombSystem } from '../../src/match/bomb-system';
import { MatchController } from '../../src/match/match-controller';
import { stepBombAndMatch } from '../../src/match/objective-step';

it('moves freeze to live and awards defense on timeout', () => {
  const match = new MatchController({ freeze: 12, live: 105, result: 5, roundsToWin: 7, halftimeAfter: 6 });
  match.update(12, { attackersAlive: 3, defendersAlive: 3, bombPlanted: false, bombExploded: false, bombDefused: false });
  expect(match.snapshot().phase).toBe('live');
  match.update(105, { attackersAlive: 3, defendersAlive: 3, bombPlanted: false, bombExploded: false, bombDefused: false });
  expect(match.snapshot()).toMatchObject({ phase: 'result', defenseScore: 1 });
});

it('immediately begins a three-second preparation after a non-final timeout', () => {
  const match = new MatchController({ freeze: 3, live: 105, result: 0, roundsToWin: 7, halftimeAfter: 6 });
  const facts = { attackersAlive: 3, defendersAlive: 3, bombPlanted: false, bombExploded: false, bombDefused: false };

  match.update(3, facts);
  match.update(105, facts);

  expect(match.snapshot()).toMatchObject({
    phase: 'freeze',
    round: 2,
    attackScore: 0,
    defenseScore: 1,
    phaseRemaining: 3,
    winner: null,
  });
});

it('stays match-over after seven wins instead of starting round eight', () => {
  const match = new MatchController({ freeze: 0, live: 105, result: 0, roundsToWin: 7, halftimeAfter: 6 });
  const facts = { attackersAlive: 3, defendersAlive: 0, bombPlanted: false, bombExploded: false, bombDefused: false };

  for (let win = 0; win < 7; win++) {
    match.update(0, facts);
    match.update(0, facts);
  }
  match.update(1_000, facts);

  expect(match.snapshot()).toMatchObject({
    phase: 'match-over',
    round: 7,
    attackScore: 7,
    defenseScore: 0,
    winner: 'attack',
  });
});

it('does not advance the objective during three seconds of freeze', () => {
  const match = new MatchController({ freeze: 3, live: 105, result: 0, roundsToWin: 7, halftimeAfter: 6 });
  const bomb = new BombSystem({ plantSeconds: 3.2, fuseSeconds: 35, defuseSeconds: 7, kitDefuseSeconds: 3.5 }, 'attacker-1');
  const actor = {
    actorId: 'attacker-1',
    team: 'attack' as const,
    position: { x: 0, y: 0, z: 0 },
    interact: true,
    alive: true,
    hasKit: false,
  };
  const site = { center: { x: 0, y: 0, z: 0 }, halfExtents: { x: 5, y: 2, z: 5 } };

  stepBombAndMatch(bomb, match, 3, [actor], site, { attackersAlive: 1, defendersAlive: 1 });

  expect(match.snapshot().phase).toBe('live');
  expect(bomb.snapshot()).toMatchObject({
    state: 'carried',
    progress: 0,
    remaining: 35,
  });
});

it('does not resolve elimination after plant until the objective resolves', () => {
  const match = new MatchController({ freeze: 0, live: 105, result: 5, roundsToWin: 7, halftimeAfter: 6 });
  const bomb = BombSystem.plantedForTest({ plantSeconds: 3.2, fuseSeconds: 2, defuseSeconds: 7, kitDefuseSeconds: 3.5 });
  const actor = {
    actorId: 'attacker-1',
    team: 'attack' as const,
    position: { x: 10, y: 0, z: 10 },
    interact: false,
    alive: true,
    hasKit: false,
  };
  const site = { center: { x: 0, y: 0, z: 0 }, halfExtents: { x: 5, y: 2, z: 5 } };

  stepBombAndMatch(bomb, match, 0, [actor], site, { attackersAlive: 1, defendersAlive: 1 });
  stepBombAndMatch(bomb, match, 0, [actor], site, { attackersAlive: 0, defendersAlive: 0 });
  expect(match.snapshot()).toMatchObject({ phase: 'planted', attackScore: 0 });

  stepBombAndMatch(bomb, match, 2, [actor], site, { attackersAlive: 0, defendersAlive: 0 });
  expect(match.snapshot()).toMatchObject({ phase: 'result', attackScore: 1, winner: 'attack' });
});

it('enters planted phase after 3.2 seconds through production composition', () => {
  const match = new MatchController({ freeze: 0, live: 105, result: 5, roundsToWin: 7, halftimeAfter: 6 });
  const bomb = new BombSystem({ plantSeconds: 3.2, fuseSeconds: 35, defuseSeconds: 7, kitDefuseSeconds: 3.5 }, 'attacker-1');
  const actor = {
    actorId: 'attacker-1',
    team: 'attack' as const,
    position: { x: 0, y: 0, z: 0 },
    interact: true,
    alive: true,
    hasKit: false,
  };
  const site = { center: { x: 0, y: 0, z: 0 }, halfExtents: { x: 5, y: 2, z: 5 } };

  stepBombAndMatch(bomb, match, 0, [actor], site, { attackersAlive: 1, defendersAlive: 1 });
  for (let tick = 0; tick < 3.2 * 60; tick++) {
    stepBombAndMatch(bomb, match, 1 / 60, [actor], site, { attackersAlive: 1, defendersAlive: 1 });
  }

  expect(bomb.snapshot().state).toBe('planted');
  expect(match.snapshot().phase).toBe('planted');
});
