import { expect, it } from 'vitest';
import { BombSystem } from '../../src/match/bomb-system';
import { bombFactsFrom, MatchController } from '../../src/match/match-controller';

it('moves freeze to live and awards defense on timeout', () => {
  const match = new MatchController({ freeze: 12, live: 105, result: 5, roundsToWin: 7, halftimeAfter: 6 });
  match.update(12, { attackersAlive: 3, defendersAlive: 3, bombPlanted: false, bombExploded: false, bombDefused: false });
  expect(match.snapshot().phase).toBe('live');
  match.update(105, { attackersAlive: 3, defendersAlive: 3, bombPlanted: false, bombExploded: false, bombDefused: false });
  expect(match.snapshot()).toMatchObject({ phase: 'result', defenseScore: 1 });
});

it('does not award attack for defender elimination after the bomb is planted', () => {
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

  match.update(0, { attackersAlive: 1, defendersAlive: 1, ...bombFactsFrom(bomb.snapshot()) });
  match.update(0, { attackersAlive: 1, defendersAlive: 0, ...bombFactsFrom(bomb.snapshot()) });
  expect(match.snapshot()).toMatchObject({ phase: 'planted', attackScore: 0 });

  bomb.update(2, actor, site);
  match.update(2, { attackersAlive: 1, defendersAlive: 0, ...bombFactsFrom(bomb.snapshot()) });
  expect(match.snapshot()).toMatchObject({ phase: 'result', attackScore: 1, winner: 'attack' });
});
