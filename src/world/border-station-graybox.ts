import type { Team, Vec3 } from '../core/types';

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
        size: { x: 22, y: 0.5, z: 64 },
        yaw: 0,
        kind: 'floor',
      },
      {
        id: 'ramp-main',
        center: { x: 0, y: 1.3, z: -4 },
        size: { x: 7, y: 0.5, z: 13 },
        yaw: 0,
        kind: 'ramp',
      },
      {
        id: 'cover-mid-left',
        center: { x: -3.7, y: 1, z: 4 },
        size: { x: 2, y: 2, z: 2 },
        yaw: 0,
        kind: 'cover',
      },
      {
        id: 'cover-site',
        center: { x: 3, y: 2.2, z: -17 },
        size: { x: 3, y: 2.4, z: 2 },
        yaw: 0,
        kind: 'cover',
      },
      {
        id: 'wall-left',
        center: { x: -11, y: 2, z: 0 },
        size: { x: 1, y: 4, z: 64 },
        yaw: 0,
        kind: 'wall',
      },
      {
        id: 'wall-right',
        center: { x: 11, y: 2, z: 0 },
        size: { x: 1, y: 4, z: 64 },
        yaw: 0,
        kind: 'wall',
      },
    ],
    spawns: [
      { id: 'a1', team: 'attack', position: { x: -2, y: 1, z: 25 }, yaw: Math.PI },
      { id: 'a2', team: 'attack', position: { x: 0, y: 1, z: 25 }, yaw: Math.PI },
      { id: 'a3', team: 'attack', position: { x: 2, y: 1, z: 25 }, yaw: Math.PI },
      { id: 'd1', team: 'defense', position: { x: -2, y: 3, z: -24 }, yaw: 0 },
      { id: 'd2', team: 'defense', position: { x: 0, y: 3, z: -24 }, yaw: 0 },
      { id: 'd3', team: 'defense', position: { x: 2, y: 3, z: -24 }, yaw: 0 },
    ],
    bombSite: {
      center: { x: 0, y: 2, z: -18 },
      halfExtents: { x: 6, y: 2, z: 5 },
    },
    navNodes: [
      {
        id: 'attack',
        position: { x: 0, y: 1, z: 23 },
        neighbors: ['mid'],
        tags: ['spawn-attack'],
      },
      {
        id: 'mid',
        position: { x: 0, y: 1, z: 5 },
        neighbors: ['attack', 'ramp'],
        tags: ['cover'],
      },
      {
        id: 'ramp',
        position: { x: 0, y: 2, z: -6 },
        neighbors: ['mid', 'site'],
        tags: ['ramp'],
      },
      {
        id: 'site',
        position: { x: 0, y: 3, z: -18 },
        neighbors: ['ramp', 'defense'],
        tags: ['site'],
      },
      {
        id: 'defense',
        position: { x: 0, y: 3, z: -24 },
        neighbors: ['site'],
        tags: ['spawn-defense'],
      },
    ],
  };
}
