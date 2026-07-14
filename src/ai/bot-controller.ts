import {
  idleCommand,
  type EntityId,
  type PlayerCommand,
  type Team,
  type Vec3,
} from '../core/types';

export type BotObjective = 'advance' | 'hold' | 'plant' | 'defuse';

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

type BotState = 'advance' | 'engage' | 'plant' | 'hold' | 'defuse';

const MAX_ENGAGE_DISTANCE = 42;
const VIEW_CONE_COSINE = Math.cos((120 * Math.PI / 180) / 2);
const INTERACT_DISTANCE = 1.5;
const HOLD_RADIUS = 1.5;
const PRESSURE_DISTANCE = 15;
const AIM_ERROR_INTERVAL = 0.35;

const distance = (left: Vec3, right: Vec3): number => Math.hypot(
  left.x - right.x,
  left.y - right.y,
  left.z - right.z,
);

const aimYaw = (from: Vec3, to: Vec3): number => Math.atan2(
  -(to.x - from.x),
  -(to.z - from.z),
);

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
      return command;
    }

    const enemy = this.visibleEnemy(context);
    if (enemy) {
      this.updateEngagement(enemy.id, Math.max(0, context.dt));
      this.state = 'engage';
      this.aimAt(command, context.self.position, enemy.position);
      this.moveWhileEngaging(command, context.self.position, enemy.position);
      command.fire = this.reactionElapsed >= this.reactionDelay;
      return command;
    }

    this.clearEngagement();
    this.state = context.objective;
    this.moveForObjective(command, context);
    return command;
  }

  reset(seed: number): void {
    this.randomState = seed >>> 0;
    this.state = 'advance';
    this.clearEngagement();
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
    this.aimErrorYaw = (this.random() * 2 - 1) * 0.014;
    this.aimErrorPitch = (this.random() * 2 - 1) * 0.009;
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
    if ((this.state === 'plant' || this.state === 'defuse') && closeEnough) {
      command.interact = true;
      return;
    }
    if (planarDistance > 0.1) command.moveZ = -1;
  }

  private clearEngagement(): void {
    this.targetId = null;
    this.reactionElapsed = 0;
    this.aimErrorElapsed = 0;
  }
}
