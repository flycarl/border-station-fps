import { expect, it } from 'vitest';
import { FixedStepClock } from '../../src/core/fixed-step';

it('runs deterministic 60 Hz updates', () => {
  const clock = new FixedStepClock(1 / 60, 0.25);
  let ticks = 0;
  clock.advance(1 / 30, () => { ticks++; });
  expect(ticks).toBe(2);
  expect(clock.alpha).toBeCloseTo(0);
});

it('clears accumulated time for a clean game restart', () => {
  const clock = new FixedStepClock(1 / 60, 0.25);
  let ticks = 0;
  clock.advance(1 / 120, () => { ticks++; });

  clock.reset();
  clock.advance(1 / 120, () => { ticks++; });

  expect(ticks).toBe(0);
  expect(clock.alpha).toBeCloseTo(0.5);
});

it('stops queued fixed updates when a state transition interrupts the frame', () => {
  const clock = new FixedStepClock(1 / 60, 0.25);
  let ticks = 0;

  clock.advance(1 / 15, () => {
    ticks++;
    return false;
  });

  expect(ticks).toBe(1);
  expect(clock.alpha).toBe(0);
});
