export type EntityId = string;
export type Team = 'attack' | 'defense';
export type RoundPhase = 'freeze' | 'live' | 'planted' | 'result' | 'match-over';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface PlayerCommand {
  moveX: number;
  moveZ: number;
  yaw: number;
  pitch: number;
  jump: boolean;
  crouch: boolean;
  walk: boolean;
  fire: boolean;
  reload: boolean;
  interact: boolean;
  slot: 1 | 2 | 3 | 4;
}

export const idleCommand = (): PlayerCommand => ({
  moveX: 0,
  moveZ: 0,
  yaw: 0,
  pitch: 0,
  jump: false,
  crouch: false,
  walk: false,
  fire: false,
  reload: false,
  interact: false,
  slot: 1,
});
