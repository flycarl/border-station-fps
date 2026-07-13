import { expect, it } from 'vitest';
import { MatchController } from '../../src/match/match-controller';

it('moves freeze to live and awards defense on timeout', () => {
  const match = new MatchController({ freeze: 12, live: 105, result: 5, roundsToWin: 7, halftimeAfter: 6 });
  match.update(12, { attackersAlive: 3, defendersAlive: 3, bombPlanted: false, bombExploded: false, bombDefused: false });
  expect(match.snapshot().phase).toBe('live');
  match.update(105, { attackersAlive: 3, defendersAlive: 3, bombPlanted: false, bombExploded: false, bombDefused: false });
  expect(match.snapshot()).toMatchObject({ phase: 'result', defenseScore: 1 });
});
