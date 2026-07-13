import { expect, it } from 'vitest';
import { createBorderStationGraybox } from '../../src/world/border-station-graybox';

it('has separated spawns, a reachable site, ramp, and cover', () => {
  const map = createBorderStationGraybox();

  expect(map.spawns.filter((spawn) => spawn.team === 'attack')).toHaveLength(3);
  expect(map.spawns.filter((spawn) => spawn.team === 'defense')).toHaveLength(3);
  expect(map.solids.some((solid) => solid.kind === 'ramp')).toBe(true);
  expect(map.solids.some((solid) => solid.kind === 'cover')).toBe(true);
  expect(map.navNodes.some((node) => node.tags.includes('site'))).toBe(true);
});
