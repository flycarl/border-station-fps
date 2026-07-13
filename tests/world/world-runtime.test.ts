import { expect, it } from 'vitest';
import { WorldRuntime } from '../../src/world/world-runtime';

it('returns the registered player actor ID when a ray hits its Rapier capsule', async () => {
  const runtime = await WorldRuntime.createHeadless();

  try {
    runtime.spawnPlayer({ x: 0, y: 0, z: 0 }, 'player-bravo');
    runtime.step(1 / 60);

    const hit = runtime.raycast(
      { x: 0, y: 0, z: -3 },
      { x: 0, y: 0, z: 1 },
      10,
    );

    expect(hit?.entityId).toBe('player-bravo');
  } finally {
    runtime.dispose();
  }
});
