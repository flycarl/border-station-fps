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

it('does not report an airborne actor as supported at its jump apex', async () => {
  const runtime = await WorldRuntime.createHeadless(true);
  try {
    const body = runtime.spawnPlayer({ x: 8, y: 4, z: 20 }, 'jumper');
    body.setLinvel({ x: 0, y: 0.01, z: 0 }, true);
    runtime.step(1 / 60);
    expect(runtime.isPlayerSupported('jumper')).toBe(false);
  } finally {
    runtime.dispose();
  }
});

it.each([
  ['floor', { x: 8, y: 0.85, z: 20 }],
  ['ramp', { x: 0, y: 2.25, z: -4 }],
] as const)('reports %s support from a walkable map surface', async (_surface, position) => {
  const runtime = await WorldRuntime.createHeadless(true);
  try {
    runtime.spawnPlayer(position, 'walker');
    for (let step = 0; step < 30; step++) runtime.step(1 / 60);
    expect(runtime.isPlayerSupported('walker')).toBe(true);
  } finally {
    runtime.dispose();
  }
});
