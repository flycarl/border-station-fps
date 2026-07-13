import type { EntityId, Team, Vec3 } from '../core/types';

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
});
