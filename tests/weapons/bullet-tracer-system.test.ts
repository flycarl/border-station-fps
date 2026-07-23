import * as THREE from 'three';
import { expect, it } from 'vitest';
import { BulletTracerSystem } from '../../src/weapons/bullet-tracer-system';

it('moves a visible team-colored bullet tracer and expires it', () => {
  const scene = new THREE.Scene();
  const tracers = new BulletTracerSystem(scene);

  tracers.spawn(
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 1, z: -20 },
    'attack',
  );

  expect(tracers.diagnostics()).toMatchObject({
    active: 1,
    bullets: [{ team: 'attack', progress: 0 }],
  });
  expect(scene.children).toHaveLength(1);
  expect((scene.children[0] as THREE.Group).children.some((child) => (
    child as THREE.Line
  ).isLine)).toBe(true);
  const head = (scene.children[0] as THREE.Group).children.find((child) => (
    child as THREE.Mesh
  ).isMesh) as THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  expect(head.geometry.type).toBe('BoxGeometry');
  expect(head.material.color.getHex()).toBe(0xffffff);

  tracers.update(0.06);
  expect(tracers.diagnostics().bullets[0]?.progress).toBeCloseTo(0.5, 2);

  tracers.update(0.06);
  expect(tracers.diagnostics()).toEqual({ active: 0, bullets: [] });
  expect(scene.children).toHaveLength(0);
});

it('clears active tracers and rejects new effects after disposal', () => {
  const scene = new THREE.Scene();
  const tracers = new BulletTracerSystem(scene);
  tracers.spawn({ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, 'defense');

  tracers.dispose();
  tracers.spawn({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }, 'attack');

  expect(tracers.diagnostics()).toEqual({ active: 0, bullets: [] });
  expect(scene.children).toHaveLength(0);
});
