import { expect, it } from 'vitest';
import { FixedStepClock } from '../../src/core/fixed-step';

it('runs deterministic 60 Hz updates', () => {
  const clock = new FixedStepClock(1 / 60, 0.25);
  let ticks = 0;
  clock.advance(1 / 30, () => ticks++);
  expect(ticks).toBe(2);
  expect(clock.alpha).toBeCloseTo(0);
});
