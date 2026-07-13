import { expect, it } from 'vitest';
import { computeWishVelocity } from '../../src/player/player-controller';

it('normalizes diagonal movement', () => {
  expect(computeWishVelocity(1, 1, 0, 6)).toEqual({
    x: Math.SQRT1_2 * 6,
    z: Math.SQRT1_2 * 6,
  });
});
