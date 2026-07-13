import { expect, it } from 'vitest';
import * as THREE from 'three';
import { computeWishVelocity, PlayerController } from '../../src/player/player-controller';
import { idleCommand } from '../../src/core/types';
import { applyCameraPose } from '../../src/world/world-runtime';

it('normalizes diagonal movement', () => {
  expect(computeWishVelocity(1, 1, 0, 6)).toEqual({
    x: Math.SQRT1_2 * 6,
    z: Math.SQRT1_2 * 6,
  });
});

it('does not reapply held jump while airborne and permits it after support returns', () => {
  let velocity = { x: 0, y: 0.02, z: 0 };
  const body = {
    linvel: () => velocity,
    setLinvel: (next: typeof velocity) => { velocity = next; },
  };
  const controller = new PlayerController(body as never);
  const command = { ...idleCommand(), jump: true };

  controller.update(command, 1 / 60, false);
  expect(velocity.y).toBe(0.02);
  controller.update(command, 1 / 60, true);
  expect(velocity.y).toBe(5.2);
});

it('does not reapply held jump inside the support skin before support is lost and reacquired', () => {
  let velocity = { x: 0, y: 0, z: 0 };
  const body = {
    linvel: () => velocity,
    setLinvel: (next: typeof velocity) => { velocity = next; },
  };
  const controller = new PlayerController(body as never);
  const command = { ...idleCommand(), jump: true };

  controller.update(command, 1 / 60, true);
  velocity = { ...velocity, y: 4.8 };
  controller.update(command, 1 / 60, true);
  expect(velocity.y).toBe(4.8);
  controller.update(command, 1 / 60, false);
  controller.update(command, 1 / 60, true);
  expect(velocity.y).toBe(5.2);
});

it.each([0, Math.PI])('keeps camera and forward movement aligned at yaw %s', (yaw) => {
  const camera = new THREE.PerspectiveCamera();
  applyCameraPose(camera, { position: { x: 0, y: 0, z: 0 }, yaw, pitch: 0 });
  const cameraForward = camera.getWorldDirection(new THREE.Vector3());
  const wishVelocity = computeWishVelocity(0, -1, yaw, 1);

  expect(cameraForward.x).toBeCloseTo(wishVelocity.x);
  expect(cameraForward.z).toBeCloseTo(wishVelocity.z);
});
