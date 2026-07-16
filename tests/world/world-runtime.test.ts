import { expect, it } from 'vitest';
import { createBorderStationGraybox } from '../../src/world/border-station-graybox';
import {
  createBombSiteMarkerGeometry,
  createSolidRampGeometry,
  WorldRuntime,
} from '../../src/world/world-runtime';

const mainRamp = createBorderStationGraybox().solids.find((solid) => solid.id === 'ramp-main')!;

it('builds each ramp as a closed ground-to-slope triangular prism', () => {
  const geometry = createSolidRampGeometry(mainRamp);
  try {
    const positions = geometry.getAttribute('position');
    expect(positions.count).toBe(6);
    expect(geometry.index?.count).toBe(24);
    geometry.computeBoundingBox();
    expect(geometry.boundingBox?.min.y).toBe(0);
    expect(geometry.boundingBox?.max.y).toBeCloseTo(
      Math.tan(0.18) * mainRamp.size.z,
    );
  } finally {
    geometry.dispose();
  }
});

it('builds only red outline geometry from the authoritative bomb-site extents', () => {
  const site = createBorderStationGraybox().bombSite;
  const marker = createBombSiteMarkerGeometry(site);

  try {
    marker.outline.computeBoundingBox();

    const expectedBounds = {
      min: {
        x: site.center.x - site.halfExtents.x,
        z: site.center.z - site.halfExtents.z,
      },
      max: {
        x: site.center.x + site.halfExtents.x,
        z: site.center.z + site.halfExtents.z,
      },
    };
    expect(marker.outline.boundingBox).toMatchObject(expectedBounds);
    expect(marker).not.toHaveProperty('fill');
    expect(marker.outline.getAttribute('position').count).toBeGreaterThan(8);
  } finally {
    marker.outline.dispose();
  }
});

it('keeps the cosmetic bomb-site marker out of the Rapier collider set', async () => {
  const map = createBorderStationGraybox();
  const runtime = await WorldRuntime.createHeadless(true);

  try {
    expect(runtime.diagnostics().colliders).toBe(map.solids.length);
  } finally {
    runtime.dispose();
  }
});

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

it('disables a dead actor without removing its authoritative body or collider resources', async () => {
  const runtime = await WorldRuntime.createHeadless();

  try {
    const deadBody = runtime.spawnPlayer({ x: 8, y: 0, z: 8 }, 'dead-actor');
    const targetBody = runtime.spawnPlayer({ x: 8, y: 0, z: 4 }, 'living-target');
    runtime.step(1 / 60);
    const before = runtime.diagnostics();

    runtime.setPlayerActive('dead-actor', false);

    expect(runtime.playerStatus('dead-actor')).toMatchObject({
      active: false,
      raycastRegistered: false,
      meshVisible: false,
    });
    expect(runtime.diagnostics()).toMatchObject(before);
    expect(runtime.isPlayerSupported('dead-actor')).toBe(false);
    expect(runtime.raycast(
      { x: 8, y: 0.65, z: 10 },
      { x: 0, y: 0, z: -1 },
      10,
    )?.entityId).toBe('living-target');

    const deathPosition = { ...deadBody.translation() };
    targetBody.setTranslation({ x: 12, y: 0, z: 4 }, true);
    const navigator = runtime.spawnPlayer({ x: 8, y: 0, z: 10 }, 'navigator');
    navigator.setLinvel({ x: 0, y: 0, z: -6 }, true);
    for (let step = 0; step < 60; step++) runtime.step(1 / 60);
    expect(navigator.translation().z).toBeLessThan(6);
    expect(deadBody.translation()).toMatchObject(deathPosition);

    runtime.setPlayerActive('dead-actor', true);
    expect(runtime.playerStatus('dead-actor')).toMatchObject({
      active: true,
      raycastRegistered: true,
    });
    expect(runtime.raycast(
      { x: 8, y: 0.65, z: 10 },
      { x: 0, y: 0, z: -1 },
      10,
    )?.entityId).toBe('dead-actor');
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

it('advances and expires cosmetic bullet tracers with the world step', async () => {
  const runtime = await WorldRuntime.createHeadless();
  try {
    runtime.spawnBulletTracer(
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 1, z: -12 },
      'attack',
    );
    expect(runtime.diagnostics().tracers).toBe(1);

    runtime.step(0.06);
    expect(runtime.diagnostics().tracers).toBe(1);
    runtime.step(0.06);
    expect(runtime.diagnostics().tracers).toBe(0);
  } finally {
    runtime.dispose();
  }
});

it.each([
  ['floor', { x: 8, y: 0.85, z: 20 }],
  ['ramp', { x: mainRamp.center.x, y: mainRamp.center.y + 1.5, z: mainRamp.center.z }],
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
