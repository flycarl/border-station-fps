import type RAPIER from '@dimforge/rapier3d-compat';
import type { PlayerCommand } from '../core/types';

export function computeWishVelocity(
  moveX: number,
  moveZ: number,
  yaw: number,
  speed: number,
): { x: number; z: number } {
  const length = Math.hypot(moveX, moveZ) || 1;
  const normalization = length === Math.SQRT2 ? Math.SQRT1_2 : 1 / length;
  const x = moveX * normalization;
  const z = moveZ * normalization;

  return {
    x: (x * Math.cos(yaw) + z * Math.sin(yaw)) * speed,
    z: (-x * Math.sin(yaw) + z * Math.cos(yaw)) * speed,
  };
}

export class PlayerController {
  private jumpConsumed = false;
  private leftSupportAfterJump = false;

  constructor(private readonly body: RAPIER.RigidBody) {}

  update(command: PlayerCommand, dt: number, grounded: boolean): void {
    const speed = command.walk ? 2.5 : command.crouch ? 3.2 : 6;
    const wish = computeWishVelocity(
      command.moveX,
      command.moveZ,
      command.yaw,
      speed,
    );
    const current = this.body.linvel();
    if (!grounded && this.jumpConsumed) this.leftSupportAfterJump = true;
    if (grounded && this.leftSupportAfterJump) {
      this.jumpConsumed = false;
      this.leftSupportAfterJump = false;
    }
    const shouldJump = grounded && command.jump && !this.jumpConsumed;
    if (shouldJump) this.jumpConsumed = true;

    this.body.setLinvel(
      {
        x: wish.x,
        y: shouldJump ? 5.2 : current.y,
        z: wish.z,
      },
      true,
    );
    void dt;
  }
}
