import { WEAPONS, type WeaponId } from './weapon-data';
import type {
  EntityId,
  PlayerCommand,
  Team,
  Vec3,
} from '../core/types';

export type { WeaponId } from './weapon-data';

export interface WeaponState {
  id: WeaponId;
  magazine: number;
  reserve: number;
  nextFireAt: number;
  reloadEndsAt: number | null;
}

export interface Damageable {
  health: number;
  armor: number;
  alive: boolean;
}

export interface CombatActor extends Damageable {
  id: EntityId;
  team: Team;
  primary: WeaponState;
  sidearm: WeaponState;
}

export interface CameraRay {
  origin: Vec3;
}

export interface WeaponRaycaster {
  raycast(
    origin: Vec3,
    direction: Vec3,
    maxDistance: number,
    excludeEntityId?: EntityId,
  ): {
    entityId: EntityId | null;
    distance: number;
    point: Vec3;
  } | null;
}

export interface WeaponEvent {
  type: 'shot' | 'hit' | 'kill';
  actorId: EntityId;
  targetId: EntityId | null;
  point: Vec3;
}

export const createWeaponState = (id: WeaponId): WeaponState => ({
  id,
  magazine: WEAPONS[id].magazine,
  reserve: WEAPONS[id].reserve,
  nextFireAt: 0,
  reloadEndsAt: null,
});

export function tryFire(state: WeaponState, now: number): { fired: boolean } {
  const config = WEAPONS[state.id];
  if (
    state.reloadEndsAt !== null ||
    state.magazine === 0 ||
    now < state.nextFireAt
  ) {
    return { fired: false };
  }

  state.magazine--;
  state.nextFireAt = now + 60 / config.roundsPerMinute;
  return { fired: true };
}

export function applyDamage(
  target: Damageable,
  rawDamage: number,
  penetration: number,
): Damageable {
  const absorbed = Math.min(target.armor, rawDamage * (1 - penetration));
  const health = Math.max(0, target.health - (rawDamage - absorbed));
  return {
    health,
    armor: Math.max(0, target.armor - absorbed),
    alive: health > 0,
  };
}

function completeReload(state: WeaponState, now: number): void {
  if (state.reloadEndsAt === null || now < state.reloadEndsAt) return;

  const config = WEAPONS[state.id];
  const rounds = Math.min(config.magazine - state.magazine, state.reserve);
  state.magazine += rounds;
  state.reserve -= rounds;
  state.reloadEndsAt = null;
}

function startReload(state: WeaponState, now: number): void {
  const config = WEAPONS[state.id];
  if (
    state.reloadEndsAt !== null ||
    state.magazine === config.magazine ||
    state.reserve === 0
  ) {
    return;
  }

  state.reloadEndsAt = now + config.reloadSeconds;
}

function endpoint(origin: Vec3, direction: Vec3, distance: number): Vec3 {
  return {
    x: origin.x + direction.x * distance,
    y: origin.y + direction.y * distance,
    z: origin.z + direction.z * distance,
  };
}

export class WeaponSystem {
  private readonly actorTimes = new Map<EntityId, number>();
  private randomState: number;

  constructor(
    private readonly world: WeaponRaycaster,
    private readonly getActor: (id: EntityId) => CombatActor | undefined,
    seed = 0x12345678,
  ) {
    this.randomState = seed >>> 0;
  }

  update(
    actorId: EntityId,
    command: PlayerCommand,
    cameraRay: CameraRay,
    dt: number,
  ): WeaponEvent[] {
    const now = (this.actorTimes.get(actorId) ?? 0) + Math.max(0, dt);
    this.actorTimes.set(actorId, now);
    const actor = this.getActor(actorId);
    if (!actor || !actor.alive) return [];

    completeReload(actor.primary, now);
    completeReload(actor.sidearm, now);

    if (command.slot !== 1 && command.slot !== 2) return [];
    const weapon = command.slot === 2 ? actor.sidearm : actor.primary;
    if (command.reload) startReload(weapon, now);
    if (!command.fire || !tryFire(weapon, now).fired) return [];

    const config = WEAPONS[weapon.id];
    const direction = this.spreadDirection(
      command.yaw,
      command.pitch,
      config.spreadRadians,
    );
    const hit = this.world.raycast(cameraRay.origin, direction, config.range, actorId);
    const point = hit?.point ?? endpoint(cameraRay.origin, direction, config.range);
    const events: WeaponEvent[] = [
      { type: 'shot', actorId, targetId: null, point },
    ];

    if (!hit || hit.entityId === null) return events;
    const target = this.getActor(hit.entityId);
    if (!target || !target.alive || target.team === actor.team) return events;

    const damaged = applyDamage(
      target,
      config.damage,
      config.armorPenetration,
    );
    target.health = damaged.health;
    target.armor = damaged.armor;
    target.alive = damaged.alive;
    events.push({ type: 'hit', actorId, targetId: target.id, point });
    if (!target.alive) {
      events.push({ type: 'kill', actorId, targetId: target.id, point });
    }

    return events;
  }

  private spreadDirection(yaw: number, pitch: number, spread: number): Vec3 {
    const spreadYaw = yaw + (this.random() * 2 - 1) * spread;
    const spreadPitch = pitch + (this.random() * 2 - 1) * spread;
    const cosPitch = Math.cos(spreadPitch);
    return {
      x: -Math.sin(spreadYaw) * cosPitch,
      y: Math.sin(spreadPitch),
      z: -Math.cos(spreadYaw) * cosPitch,
    };
  }

  private random(): number {
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 0x100000000;
  }
}
