import { expect, it } from 'vitest';
import { createGameRoster, STEP_ORDER } from '../src/game';

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
