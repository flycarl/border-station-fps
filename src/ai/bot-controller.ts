import {
  idleCommand,
  type EntityId,
  type PlayerCommand,
  type Team,
  type Vec3,
} from '../core/types';

export type BotObjective = 'advance' | 'hold' | 'plant' | 'retrieve' | 'defuse';

export interface BotView {
  position: Vec3;
  yaw: number;
  alive: boolean;
}

export interface EnemyView {
  id: EntityId;
  position: Vec3;
  alive: boolean;
}

export interface BotContext {
  self: BotView;
  enemies: EnemyView[];
  canSee(from: Vec3, to: Vec3): boolean;
  objective: BotObjective;
  targetNode: Vec3;
  dt: number;
}

type BotState = 'advance' | 'engage' | 'plant' | 'retrieve' | 'hold' | 'defuse';

const MAX_ENGAGE_DISTANCE = 42;
const VIEW_CONE_COSINE = Math.cos((120 * Math.PI / 180) / 2);
const INTERACT_DISTANCE = 1.5;
const HOLD_RADIUS = 1.5;
const PRESSURE_DISTANCE = 15;
const AIM_ERROR_INTERVAL = 0.35;
const AIM_ERROR_YAW_BOUND = 0.035;
const AIM_ERROR_PITCH_BOUND = 0.020;
const MIN_PLANAR_PROGRESS = 0.01;
const STALL_TRIGGER_TIME = 0.5;
const RECOVERY_DURATION = 0.6;
const STALL_COMPARISON_EPSILON = 1e-12;

const distance = (left: Vec3, right: Vec3): number => Math.hypot(
  left.x - right.x,
  left.y - right.y,
  left.z - right.z,
);

const aimYaw = (from: Vec3, to: Vec3): number => Math.atan2(
  -(to.x - from.x),
  -(to.z - from.z),
);

const stableIdParity = (id: EntityId): number => {
  let parity = 0;
  for (let index = 0; index < id.length; index++) parity ^= id.charCodeAt(index);
  return parity & 1;
};

export class BotController {
  private randomState = 0;
  private state: BotState = 'advance';
  private targetId: EntityId | null = null;
  private reactionElapsed = 0;
  private reactionDelay = 0.25;
  private aimErrorYaw = 0;
  private aimErrorPitch = 0;
  private aimErrorElapsed = 0;
  private strafeDirection = 1;
  private previousPositionX = 0;
  private previousPositionZ = 0;
  private hasPreviousPosition = false;
  private stallElapsed = 0;
  private recoveryRemaining = 0;
  private recoveryDirection = 1;
  private nextRecoveryDirection = 1;

  constructor(
    readonly id: EntityId,
    readonly team: Team,
    seed: number,
  ) {
    this.reset(seed);
  }

  update(context: BotContext): PlayerCommand {
    const command = idleCommand();
    command.yaw = context.self.yaw;
    if (!context.self.alive) {
      this.clearEngagement();
      this.resetStuckRecovery();
      return command;
    }

    const enemy = this.visibleEnemy(context);
    if (enemy) {
      this.updateEngagement(enemy.id, Math.max(0, context.dt));
      this.state = 'engage';
      this.aimAt(command, context.self.position, enemy.position);
      this.moveWhileEngaging(command, context.self.position, enemy.position);
      command.fire = this.reactionElapsed >= this.reactionDelay;
      return this.applyStuckRecovery(command, context);
    }

    this.clearEngagement();
    this.state = context.objective;
    this.moveForObjective(command, context);
    return this.applyStuckRecovery(command, context);
  }

  reset(seed: number): void {
    this.randomState = seed >>> 0;
    this.state = 'advance';
    this.clearEngagement();
    this.resetStuckRecovery();
    this.nextRecoveryDirection = ((seed >>> 0) ^ stableIdParity(this.id)) & 1 ? 1 : -1;
  }

  private random(): number {
    this.randomState = (Math.imul(1_664_525, this.randomState) + 1_013_904_223) >>> 0;
    return this.randomState / 0x1_0000_0000;
  }

  private visibleEnemy(context: BotContext): EnemyView | undefined {
    const forwardX = -Math.sin(context.self.yaw);
    const forwardZ = -Math.cos(context.self.yaw);
    return context.enemies
      .filter((enemy) => {
        if (!enemy.alive) return false;
        const range = distance(context.self.position, enemy.position);
        if (range > MAX_ENGAGE_DISTANCE) return false;
        const dx = enemy.position.x - context.self.position.x;
        const dz = enemy.position.z - context.self.position.z;
        const horizontalDistance = Math.hypot(dx, dz);
        if (horizontalDistance === 0) return false;
        const viewDot = (forwardX * dx + forwardZ * dz) / horizontalDistance;
        return viewDot >= VIEW_CONE_COSINE
          && context.canSee(context.self.position, enemy.position);
      })
      .sort((left, right) => distance(context.self.position, left.position)
        - distance(context.self.position, right.position)
        || left.id.localeCompare(right.id))[0];
  }

  private updateEngagement(targetId: EntityId, dt: number): void {
    if (this.targetId !== targetId) {
      this.targetId = targetId;
      this.reactionElapsed = 0;
      this.reactionDelay = 0.16 + this.random() * 0.22;
      this.aimErrorElapsed = 0;
      this.resampleAimError();
      this.strafeDirection = this.random() < 0.5 ? -1 : 1;
    }
    this.reactionElapsed += dt;
    this.aimErrorElapsed += dt;
    while (this.aimErrorElapsed >= AIM_ERROR_INTERVAL) {
      this.aimErrorElapsed -= AIM_ERROR_INTERVAL;
      this.resampleAimError();
    }
  }

  private resampleAimError(): void {
    this.aimErrorYaw = (this.random() * 2 - 1) * AIM_ERROR_YAW_BOUND;
    this.aimErrorPitch = (this.random() * 2 - 1) * AIM_ERROR_PITCH_BOUND;
  }

  private aimAt(command: PlayerCommand, from: Vec3, to: Vec3): void {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    command.yaw = aimYaw(from, to) + this.aimErrorYaw;
    command.pitch = Math.atan2(dy, Math.hypot(dx, dz)) + this.aimErrorPitch;
  }

  private moveWhileEngaging(command: PlayerCommand, from: Vec3, to: Vec3): void {
    command.moveX = 0.42 * this.strafeDirection;
    if (distance(from, to) > PRESSURE_DISTANCE) command.moveZ = -0.4;
  }

  private moveForObjective(command: PlayerCommand, context: BotContext): void {
    const dx = context.targetNode.x - context.self.position.x;
    const dz = context.targetNode.z - context.self.position.z;
    const planarDistance = Math.hypot(dx, dz);
    command.yaw = planarDistance > 0 ? aimYaw(context.self.position, context.targetNode) : command.yaw;

    if (this.state === 'hold' && planarDistance <= HOLD_RADIUS) return;

    const closeEnough = distance(context.self.position, context.targetNode)
      <= INTERACT_DISTANCE;
    if ((this.state === 'plant'
      || this.state === 'retrieve'
      || this.state === 'defuse') && closeEnough) {
      command.interact = true;
      return;
    }
    if (planarDistance > 0.1) command.moveZ = -1;
  }

  private applyStuckRecovery(command: PlayerCommand, context: BotContext): PlayerCommand {
    if (Math.hypot(command.moveX, command.moveZ) === 0) {
      this.resetStuckRecovery();
      return command;
    }

    const dt = Math.max(0, context.dt);
    if (this.recoveryRemaining > Number.EPSILON) {
      command.moveX = this.recoveryDirection;
      command.moveZ = 0;
      this.recoveryRemaining = Math.max(0, this.recoveryRemaining - dt);
      this.rememberPosition(context.self.position);
      return command;
    }

    if (this.hasPreviousPosition) {
      const progress = Math.hypot(
        context.self.position.x - this.previousPositionX,
        context.self.position.z - this.previousPositionZ,
      );
      this.stallElapsed = progress + STALL_COMPARISON_EPSILON >= MIN_PLANAR_PROGRESS
        ? 0
        : this.stallElapsed + dt;
    } else {
      this.stallElapsed = dt;
    }
    this.rememberPosition(context.self.position);

    if (this.stallElapsed + STALL_COMPARISON_EPSILON >= STALL_TRIGGER_TIME) {
      this.recoveryDirection = this.nextRecoveryDirection;
      this.nextRecoveryDirection *= -1;
      this.recoveryRemaining = Math.max(0, RECOVERY_DURATION - dt);
      this.stallElapsed = 0;
      command.moveX = this.recoveryDirection;
      command.moveZ = 0;
    }
    return command;
  }

  private rememberPosition(position: Vec3): void {
    this.previousPositionX = position.x;
    this.previousPositionZ = position.z;
    this.hasPreviousPosition = true;
  }

  private resetStuckRecovery(): void {
    this.hasPreviousPosition = false;
    this.stallElapsed = 0;
    this.recoveryRemaining = 0;
  }

  private clearEngagement(): void {
    this.targetId = null;
    this.reactionElapsed = 0;
    this.aimErrorElapsed = 0;
  }
}
