import { expect, it } from 'vitest';
import { NavGraph } from '../../src/ai/nav-graph';
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

it('expands the combat footprint and offers two authored routes', () => {
  const map = createBorderStationGraybox();
  const floor = map.solids.find((solid) => solid.id === 'floor');
  const ramps = map.solids.filter((solid) => solid.kind === 'ramp');
  const covers = map.solids.filter((solid) => solid.kind === 'cover');
  const attackSpawn = map.navNodes.find((node) => node.id === 'attack');

  expect(floor?.size.x).toBeGreaterThanOrEqual(34);
  expect(floor?.size.z).toBeGreaterThanOrEqual(90);
  expect(ramps).toHaveLength(2);
  expect(covers.length).toBeGreaterThanOrEqual(5);
  expect(attackSpawn?.neighbors).toEqual(['corner-entry']);
  expect(map.navNodes.find((node) => node.id === 'corner-turn')?.neighbors)
    .toEqual(expect.arrayContaining(['mid-left', 'mid-right']));
  expect(map.navNodes.find((node) => node.id === 'mid-left')?.neighbors)
    .toContain('site-left');
  expect(map.navNodes.find((node) => node.id === 'mid-right')?.neighbors)
    .toContain('site-right');

  const attackZ = map.spawns.find((spawn) => spawn.team === 'attack')!.position.z;
  const defenseZ = map.spawns.find((spawn) => spawn.team === 'defense')!.position.z;
  expect(attackZ - defenseZ).toBeGreaterThanOrEqual(70);
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

it('grounds every wall and cover while preserving their authored tops', () => {
  const solids = createBorderStationGraybox().solids
    .filter(({ kind }) => kind === 'wall' || kind === 'cover');

  for (const solid of solids) {
    expect(solid.center.y - solid.size.y / 2, `${solid.id} bottom`).toBeCloseTo(0);
  }
  const siteCover = solids.find(({ id }) => id === 'cover-site')!;
  const backCover = solids.find(({ id }) => id === 'cover-site-back')!;
  expect(siteCover.center.y + siteCover.size.y / 2).toBeCloseTo(3.4);
  expect(backCover.center.y + backCover.size.y / 2).toBeCloseTo(3.8);
});

it('closes both team-side ends with grounded full-width boundary walls', () => {
  const map = createBorderStationGraybox();
  const floor = map.solids.find(({ id }) => id === 'floor')!;
  const attackBack = map.solids.find(({ id }) => id === 'wall-attack-back');
  const defenseBack = map.solids.find(({ id }) => id === 'wall-defense-back');

  expect(attackBack).toMatchObject({
    center: { x: floor.center.x, y: 2.5, z: floor.center.z + floor.size.z / 2 },
    size: { x: floor.size.x, y: 5, z: 1 },
    kind: 'wall',
  });
  expect(defenseBack).toMatchObject({
    center: { x: floor.center.x, y: 2.5, z: floor.center.z - floor.size.z / 2 },
    size: { x: floor.size.x, y: 5, z: 1 },
    kind: 'wall',
  });
  expect(attackBack!.center.y - attackBack!.size.y / 2).toBe(0);
  expect(defenseBack!.center.y - defenseBack!.size.y / 2).toBe(0);
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

it('forms an L-shaped corner with a wide right entry and lower exit', () => {
  const map = createBorderStationGraybox();
  const cross = map.solids.find((solid) => solid.id === 'corner-cross');
  const returned = map.solids.find((solid) => solid.id === 'corner-return');

  expect(cross).toMatchObject({
    center: { x: -4.5, y: 2, z: 25 },
    size: { x: 23, y: 4, z: 1 },
    yaw: 0,
    kind: 'wall',
  });
  expect(returned).toMatchObject({
    center: { x: 7, y: 2, z: 19.5 },
    size: { x: 1, y: 4, z: 12 },
    yaw: 0,
    kind: 'wall',
  });

  expect(cross!.size.x).toBeGreaterThan(cross!.size.z);
  expect(returned!.size.z).toBeGreaterThan(returned!.size.x);
  expect(cross!.center.x + cross!.size.x / 2).toBe(returned!.center.x);
  expect(cross!.center.z).toBe(returned!.center.z + returned!.size.z / 2 - 0.5);

  const rightBoundary = map.solids.find((solid) => solid.id === 'wall-right')!;
  const rightEntryWidth = rightBoundary.center.x - rightBoundary.size.x / 2
    - (cross!.center.x + cross!.size.x / 2 + returned!.size.x / 2);
  const lowerExitZ = returned!.center.z - returned!.size.z / 2;
  expect(rightEntryWidth).toBeGreaterThanOrEqual(8);
  expect(lowerExitZ).toBeGreaterThan(map.navNodes.find(({ id }) => id === 'mid-right')!.position.z);
});

it('connects both attack routes through the corner turn', () => {
  const map = createBorderStationGraybox();
  const nav = new NavGraph(map.navNodes);
  const entry = map.navNodes.find((node) => node.id === 'corner-entry');
  const turn = map.navNodes.find((node) => node.id === 'corner-turn');

  expect(entry).toMatchObject({
    position: { x: 11, y: 1, z: 29 },
    neighbors: expect.arrayContaining(['attack', 'corner-turn']),
  });
  expect(turn).toMatchObject({
    position: { x: 11, y: 1, z: 12 },
    neighbors: expect.arrayContaining(['corner-entry', 'mid-left', 'mid-right']),
  });
  expect(nav.findPath('attack', 'mid-left')).toEqual([
    'attack',
    'corner-entry',
    'corner-turn',
    'mid-left',
  ]);
  expect(nav.findPath('attack', 'mid-right')).toEqual([
    'attack',
    'corner-entry',
    'corner-turn',
    'mid-right',
  ]);
});

it('keeps every defense spawn exit connected in both directions', () => {
  const map = createBorderStationGraybox();
  const nav = new NavGraph(map.navNodes);

  expect(map.navNodes.find(({ id }) => id === 'defense-left')?.neighbors)
    .toContain('defense');
  expect(map.navNodes.find(({ id }) => id === 'defense-center')?.neighbors)
    .toContain('defense');
  expect(map.navNodes.find(({ id }) => id === 'defense-right')?.neighbors)
    .toContain('defense');
  expect(nav.findPath('defense', 'site-left').at(-1)).toBe('site-left');
  expect(nav.findPath('site-left', 'defense').at(-1)).toBe('defense');
  expect(nav.findPath('site', 'defense').at(-1)).toBe('defense');
  expect(nav.findPath('site-right', 'defense').at(-1)).toBe('defense');
});
