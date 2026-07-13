import { expect, it } from 'vitest';
import {
  BORDER_STATION_RAMP_PITCH,
  createBorderStationGraybox,
} from '../../src/world/border-station-graybox';

it('has separated spawns, a reachable site, ramp, and cover', () => {
  const map = createBorderStationGraybox();

  expect(map.spawns.filter((spawn) => spawn.team === 'attack')).toHaveLength(3);
  expect(map.spawns.filter((spawn) => spawn.team === 'defense')).toHaveLength(3);
  expect(map.solids.some((solid) => solid.kind === 'ramp')).toBe(true);
  expect(map.solids.some((solid) => solid.kind === 'cover')).toBe(true);
  expect(map.navNodes.some((node) => node.tags.includes('site'))).toBe(true);
});

it('raises the main ramp along the attack-to-site direction', () => {
  const map = createBorderStationGraybox();
  const ramp = map.solids.find((solid) => solid.id === 'ramp-main');
  expect(ramp).toBeDefined();

  const halfLength = ramp!.size.z / 2;
  const halfThickness = ramp!.size.y / 2;
  const surfaceHeightAt = (localZ: number): number =>
    ramp!.center.y +
    halfThickness * Math.cos(BORDER_STATION_RAMP_PITCH) -
    localZ * Math.sin(BORDER_STATION_RAMP_PITCH);

  const attackEdgeHeight = surfaceHeightAt(halfLength);
  const siteEdgeHeight = surfaceHeightAt(-halfLength);
  const floor = map.solids.find((solid) => solid.id === 'floor');
  expect(floor).toBeDefined();
  const floorHeight = floor!.center.y + floor!.size.y / 2;

  expect(BORDER_STATION_RAMP_PITCH).toBe(0.18);
  expect(siteEdgeHeight).toBeGreaterThan(attackEdgeHeight);
  expect(attackEdgeHeight).toBeCloseTo(floorHeight, 2);
});

it('faces attack spawns toward the site and defense spawns toward attackers', () => {
  const map = createBorderStationGraybox();

  expect(map.spawns.filter((spawn) => spawn.team === 'attack').map((spawn) => spawn.yaw)).toEqual([
    0,
    0,
    0,
  ]);
  expect(map.spawns.filter((spawn) => spawn.team === 'defense').map((spawn) => spawn.yaw)).toEqual([
    Math.PI,
    Math.PI,
    Math.PI,
  ]);
});
