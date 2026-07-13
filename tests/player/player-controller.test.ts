import { expect, it } from 'vitest';
import * as THREE from 'three';
import { computeWishVelocity } from '../../src/player/player-controller';
import { applyCameraPose } from '../../src/world/world-runtime';

it('normalizes diagonal movement', () => {
  expect(computeWishVelocity(1, 1, 0, 6)).toEqual({
    x: Math.SQRT1_2 * 6,
    z: Math.SQRT1_2 * 6,
  });
});

it.each([0, Math.PI])('keeps camera and forward movement aligned at yaw %s', (yaw) => {
  const camera = new THREE.PerspectiveCamera();
  applyCameraPose(camera, { position: { x: 0, y: 0, z: 0 }, yaw, pitch: 0 });
  const cameraForward = camera.getWorldDirection(new THREE.Vector3());
  const wishVelocity = computeWishVelocity(0, -1, yaw, 1);

  expect(cameraForward.x).toBeCloseTo(wishVelocity.x);
  expect(cameraForward.z).toBeCloseTo(wishVelocity.z);
});
