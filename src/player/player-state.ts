import type { EntityId, Team, Vec3 } from '../core/types';
import {
  createWeaponState,
  type WeaponState,
} from '../weapons/weapon-system';

export interface PlayerState {
  id: EntityId;
  team: Team;
  position: Vec3;
  yaw: number;
  pitch: number;
  health: number;
  armor: number;
  alive: boolean;
  grounded: boolean;
  primary: WeaponState;
  sidearm: WeaponState;
}

export const createPlayerState = (
  id: EntityId,
  team: Team,
  position: Vec3,
): PlayerState => ({
  id,
  team,
  position,
  yaw: 0,
  pitch: 0,
  health: 100,
  armor: 0,
  alive: true,
  grounded: false,
  primary: createWeaponState('vanguard-rifle'),
  sidearm: createWeaponState('sidearm-9'),
});
