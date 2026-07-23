import { expect, it } from 'vitest';
import { SoundAwarenessSystem } from '../../src/audio/sound-awareness';

it('turns audible world events into broad front and rear directions without coordinates', () => {
  const awareness = new SoundAwarenessSystem();
  awareness.emit({
    sourceId: 'enemy-right',
    position: { x: 8, y: 1, z: -8 },
    strength: 1,
    lifetime: 1,
    maxDistance: 40,
  });

  const [front] = awareness.snapshot({ x: 0, y: 1, z: 0 }, 0);
  expect(front).toMatchObject({
    id: 'enemy-right',
    behind: false,
  });
  expect(front!.direction).toBeGreaterThan(0);
  expect(front).not.toHaveProperty('position');

  awareness.emit({
    sourceId: 'enemy-rear',
    position: { x: -4, y: 1, z: 10 },
    strength: 1,
    lifetime: 1,
    maxDistance: 40,
  });
  const rear = awareness
    .snapshot({ x: 0, y: 1, z: 0 }, 0)
    .find(({ id }) => id === 'enemy-rear');
  expect(rear?.behind).toBe(true);
  expect(Math.abs(rear?.arrowAngle ?? 0)).toBeGreaterThan(90);
});

it('expires old cues and ignores sounds beyond their audible radius', () => {
  const awareness = new SoundAwarenessSystem();
  awareness.emit({
    sourceId: 'far-enemy',
    position: { x: 0, y: 1, z: -30 },
    strength: 1,
    lifetime: 0.5,
    maxDistance: 12,
  });
  expect(awareness.snapshot({ x: 0, y: 1, z: 0 }, 0)).toHaveLength(0);

  awareness.emit({
    sourceId: 'near-enemy',
    position: { x: 0, y: 1, z: -5 },
    strength: 1,
    lifetime: 0.5,
    maxDistance: 12,
  });
  awareness.update(0.6);
  expect(awareness.snapshot({ x: 0, y: 1, z: 0 }, 0)).toHaveLength(0);
});
