import type { EntityId, Team, Vec3 } from '../core/types';

export type BombState =
  | 'carried'
  | 'dropped'
  | 'planting'
  | 'planted'
  | 'defusing'
  | 'defused'
  | 'exploded';

export interface BombConfig {
  plantSeconds: number;
  fuseSeconds: number;
  defuseSeconds: number;
  kitDefuseSeconds: number;
}

export interface ActorAction {
  actorId: EntityId;
  team: Team;
  position: Vec3;
  interact: boolean;
  alive: boolean;
  hasKit: boolean;
}

export interface SiteBounds {
  center: Vec3;
  halfExtents: Vec3;
}

export interface BombSnapshot {
  state: BombState;
  carrierId: EntityId | null;
  position: Vec3;
  progress: number;
  remaining: number;
}

export interface BombEvent {
  type: 'planted' | 'defused' | 'exploded';
}

const DEFUSE_HALF_EXTENTS: Vec3 = { x: 1.5, y: 1.5, z: 1.5 };

function inside(position: Vec3, bounds: SiteBounds): boolean {
  return Math.abs(position.x - bounds.center.x) <= bounds.halfExtents.x
    && Math.abs(position.y - bounds.center.y) <= bounds.halfExtents.y
    && Math.abs(position.z - bounds.center.z) <= bounds.halfExtents.z;
}

export class BombSystem {
  private state: BombState = 'carried';
  private progress = 0;
  private remaining: number;
  private position: Vec3 = { x: 0, y: 0, z: 0 };
  private activeDefuserId: EntityId | null = null;
  private activeDefuserHasKit = false;

  constructor(
    private readonly config: BombConfig,
    private carrierId: EntityId | null,
  ) {
    this.remaining = config.fuseSeconds;
  }

  static plantedForTest(config: BombConfig): BombSystem {
    const bomb = new BombSystem(config, null);
    bomb.state = 'planted';
    return bomb;
  }

  update(dt: number, actor: ActorAction, site: SiteBounds): BombEvent[] {
    const elapsed = Math.max(0, dt);
    if (this.state === 'carried' || this.state === 'planting') {
      return this.updatePlant(elapsed, actor, site);
    }
    if (this.state === 'planted' || this.state === 'defusing') {
      return this.updatePlanted(elapsed, actor);
    }
    return [];
  }

  snapshot(): BombSnapshot {
    return {
      state: this.state,
      carrierId: this.carrierId,
      position: { ...this.position },
      progress: this.progress,
      remaining: this.remaining,
    };
  }

  private updatePlant(dt: number, actor: ActorAction, site: SiteBounds): BombEvent[] {
    if (actor.actorId !== this.carrierId) return [];

    const valid = actor.team === 'attack'
      && actor.interact
      && actor.alive
      && inside(actor.position, site);
    if (!valid) {
      this.state = 'carried';
      this.progress = 0;
      return [];
    }

    this.state = 'planting';
    this.progress += dt;
    if (this.progress < this.config.plantSeconds) return [];

    this.state = 'planted';
    this.position = { ...actor.position };
    this.progress = 0;
    this.carrierId = null;
    return [{ type: 'planted' }];
  }

  private updatePlanted(dt: number, actor: ActorAction): BombEvent[] {
    this.remaining = Math.max(0, this.remaining - dt);
    if (this.remaining === 0) {
      this.state = 'exploded';
      this.progress = 0;
      this.activeDefuserId = null;
      return [{ type: 'exploded' }];
    }

    if (this.activeDefuserId !== null) {
      if (actor.actorId !== this.activeDefuserId) return [];
      if (!this.canDefuse(actor)) {
        this.cancelDefuse();
        return [];
      }
    } else {
      if (!this.canDefuse(actor)) return [];
      this.activeDefuserId = actor.actorId;
      this.activeDefuserHasKit = actor.hasKit;
      this.state = 'defusing';
    }

    this.progress += dt;
    const duration = this.activeDefuserHasKit
      ? this.config.kitDefuseSeconds
      : this.config.defuseSeconds;
    if (this.progress < duration) return [];

    this.state = 'defused';
    this.activeDefuserId = null;
    return [{ type: 'defused' }];
  }

  private canDefuse(actor: ActorAction): boolean {
    return actor.team === 'defense'
      && actor.interact
      && actor.alive
      && inside(actor.position, {
        center: this.position,
        halfExtents: DEFUSE_HALF_EXTENTS,
      });
  }

  private cancelDefuse(): void {
    this.state = 'planted';
    this.progress = 0;
    this.activeDefuserId = null;
    this.activeDefuserHasKit = false;
  }
}
