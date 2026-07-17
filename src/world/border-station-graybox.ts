import type { Team, Vec3 } from '../core/types';

export const BORDER_STATION_RAMP_PITCH = 0.18;

export interface SolidDef {
  id: string;
  center: Vec3;
  size: Vec3;
  yaw: number;
  kind: 'floor' | 'wall' | 'ramp' | 'cover';
}

export interface SpawnDef {
  id: string;
  team: Team;
  position: Vec3;
  yaw: number;
}

export interface NavNode {
  id: string;
  position: Vec3;
  neighbors: string[];
  tags: string[];
}

export interface GrayboxDefinition {
  solids: SolidDef[];
  spawns: SpawnDef[];
  bombSite: { center: Vec3; halfExtents: Vec3 };
  navNodes: NavNode[];
}

export function createBorderStationGraybox(): GrayboxDefinition {
  return {
    solids: [
      {
        id: 'floor',
        center: { x: 0, y: -0.25, z: 0 },
        size: { x: 34, y: 0.5, z: 94 },
        yaw: 0,
        kind: 'floor',
      },
      {
        id: 'ramp-main',
        center: { x: -5, y: 1.007, z: -16 },
        size: { x: 8, y: 0.5, z: 14 },
        yaw: 0,
        kind: 'ramp',
      },
      {
        id: 'ramp-flank',
        center: { x: 8, y: 1.007, z: -16 },
        size: { x: 6, y: 0.5, z: 14 },
        yaw: 0,
        kind: 'ramp',
      },
      {
        id: 'cover-mid-left',
        center: { x: -8, y: 1.2, z: 13 },
        size: { x: 3, y: 2.4, z: 3 },
        yaw: 0,
        kind: 'cover',
      },
      {
        id: 'cover-mid-right',
        center: { x: 7, y: 1, z: 6 },
        size: { x: 2.5, y: 2, z: 4 },
        yaw: 0.22,
        kind: 'cover',
      },
      {
        id: 'cover-lane-divider',
        center: { x: 0, y: 1.5, z: -2 },
        size: { x: 3, y: 3, z: 7 },
        yaw: 0,
        kind: 'cover',
      },
      {
        id: 'cover-flank',
        center: { x: 11.5, y: 1.25, z: -9 },
        size: { x: 2.5, y: 2.5, z: 4 },
        yaw: -0.18,
        kind: 'cover',
      },
      {
        id: 'cover-site',
        center: { x: 2, y: 1.7, z: -29 },
        size: { x: 4, y: 3.4, z: 2.5 },
        yaw: 0,
        kind: 'cover',
      },
      {
        id: 'cover-site-back',
        center: { x: -9, y: 1.9, z: -32 },
        size: { x: 3, y: 3.8, z: 3 },
        yaw: 0,
        kind: 'cover',
      },
      {
        id: 'corner-cross',
        center: { x: -4.5, y: 2, z: 25 },
        size: { x: 23, y: 4, z: 1 },
        yaw: 0,
        kind: 'wall',
      },
      {
        id: 'corner-return',
        center: { x: 7, y: 2, z: 19.5 },
        size: { x: 1, y: 4, z: 12 },
        yaw: 0,
        kind: 'wall',
      },
      {
        id: 'wall-left',
        center: { x: -17, y: 2.5, z: 0 },
        size: { x: 1, y: 5, z: 94 },
        yaw: 0,
        kind: 'wall',
      },
      {
        id: 'wall-right',
        center: { x: 17, y: 2.5, z: 0 },
        size: { x: 1, y: 5, z: 94 },
        yaw: 0,
        kind: 'wall',
      },
    ],
    spawns: [
      { id: 'a1', team: 'attack', position: { x: -4, y: 1, z: 39 }, yaw: 0 },
      { id: 'a2', team: 'attack', position: { x: 0, y: 1, z: 39 }, yaw: 0 },
      { id: 'a3', team: 'attack', position: { x: 4, y: 1, z: 39 }, yaw: 0 },
      { id: 'd1', team: 'defense', position: { x: -6, y: 3, z: -36 }, yaw: Math.PI },
      { id: 'd2', team: 'defense', position: { x: 0, y: 3, z: -36 }, yaw: Math.PI },
      { id: 'd3', team: 'defense', position: { x: 6, y: 3, z: -36 }, yaw: Math.PI },
    ],
    bombSite: {
      center: { x: -1, y: 2, z: -29 },
      halfExtents: { x: 9, y: 2.5, z: 6 },
    },
    navNodes: [
      {
        id: 'attack',
        position: { x: 0, y: 1, z: 36 },
        neighbors: ['corner-entry'],
        tags: ['spawn-attack'],
      },
      {
        id: 'corner-entry',
        position: { x: 11, y: 1, z: 29 },
        neighbors: ['attack', 'corner-turn'],
        tags: ['corner'],
      },
      {
        id: 'corner-turn',
        position: { x: 11, y: 1, z: 12 },
        neighbors: ['corner-entry', 'mid-left', 'mid-right'],
        tags: ['corner'],
      },
      {
        id: 'mid-left',
        position: { x: -8, y: 1, z: 13 },
        neighbors: ['corner-turn', 'site-left'],
        tags: ['cover'],
      },
      {
        id: 'mid-right',
        position: { x: 9, y: 1, z: 8 },
        neighbors: ['corner-turn', 'site-right'],
        tags: ['cover'],
      },
      {
        id: 'site-left',
        position: { x: -5, y: 2.4, z: -22 },
        neighbors: ['mid-left', 'site', 'defense-left'],
        tags: ['ramp'],
      },
      {
        id: 'site-right',
        position: { x: 8, y: 2.4, z: -22 },
        neighbors: ['mid-right', 'site', 'defense-right'],
        tags: ['ramp'],
      },
      {
        id: 'site',
        position: { x: -1, y: 3, z: -29 },
        neighbors: ['site-left', 'site-right', 'defense-center'],
        tags: ['site'],
      },
      {
        id: 'defense-left',
        position: { x: -6, y: 1, z: -30 },
        neighbors: ['site-left', 'defense'],
        tags: ['spawn-exit'],
      },
      {
        id: 'defense-center',
        position: { x: -2, y: 1, z: -31 },
        neighbors: ['site', 'defense'],
        tags: ['spawn-exit'],
      },
      {
        id: 'defense-right',
        position: { x: 6, y: 1, z: -31 },
        neighbors: ['site-right', 'defense'],
        tags: ['spawn-exit'],
      },
      {
        id: 'defense',
        position: { x: 0, y: 3, z: -36 },
        neighbors: ['defense-left', 'defense-center', 'defense-right'],
        tags: ['spawn-defense'],
      },
    ],
  };
}
