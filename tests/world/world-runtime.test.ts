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

it('removes actor bodies and collider identities for clean restart', async () => {
  const runtime = await WorldRuntime.createHeadless();

  try {
    const baseline = runtime.diagnostics();
    runtime.spawnPlayer({ x: 0, y: 1, z: 0 }, 'player-bravo');
    expect(runtime.diagnostics()).toMatchObject({
      bodies: baseline.bodies + 1,
      colliders: baseline.colliders + 1,
    });

    runtime.removePlayer('player-bravo');

    expect(runtime.diagnostics()).toMatchObject(baseline);
    expect(runtime.raycast(
      { x: 0, y: 1, z: -3 },
      { x: 0, y: 0, z: 1 },
      10,
    )?.entityId).not.toBe('player-bravo');
  } finally {
    runtime.dispose();
  }
});

it('can exclude the firing actor and return the real target actor ID', async () => {
  const runtime = await WorldRuntime.createHeadless();

  try {
    runtime.spawnPlayer({ x: 0, y: 0, z: 0 }, 'shooter');
    runtime.spawnPlayer({ x: 0, y: 0, z: 5 }, 'target');
    runtime.step(1 / 60);

    const hit = runtime.raycast(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      10,
      'shooter',
    );

    expect(hit?.entityId).toBe('target');
  } finally {
    runtime.dispose();
  }
});
