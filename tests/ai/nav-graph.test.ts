import { expect, it } from 'vitest';
import { NavGraph } from '../../src/ai/nav-graph';

it('finds the route from attack spawn to site', () => {
  const graph = new NavGraph([
    { id: 'a', position: { x: 0, y: 0, z: 0 }, neighbors: ['m'], tags: [] },
    { id: 'm', position: { x: 0, y: 0, z: 5 }, neighbors: ['a', 's'], tags: [] },
    { id: 's', position: { x: 0, y: 0, z: 10 }, neighbors: ['m'], tags: ['site'] },
  ]);

  expect(graph.findPath('a', 's')).toEqual(['a', 'm', 's']);
});

it('breaks equal-cost route ties by node id', () => {
  const graph = new NavGraph([
    { id: 'start', position: { x: 0, y: 0, z: 0 }, neighbors: ['right', 'left'], tags: [] },
    { id: 'left', position: { x: -1, y: 0, z: 1 }, neighbors: ['goal'], tags: [] },
    { id: 'right', position: { x: 1, y: 0, z: 1 }, neighbors: ['goal'], tags: [] },
    { id: 'goal', position: { x: 0, y: 0, z: 2 }, neighbors: [], tags: ['site'] },
  ]);

  expect(graph.findPath('start', 'goal')).toEqual(['start', 'left', 'goal']);
});

it('rejects unknown start and goal ids', () => {
  const graph = new NavGraph([
    { id: 'known', position: { x: 0, y: 0, z: 0 }, neighbors: [], tags: [] },
  ]);

  expect(() => graph.findPath('missing', 'known')).toThrow('Unknown nav node: missing');
  expect(() => graph.findPath('known', 'missing')).toThrow('Unknown nav node: missing');
});

it('rejects an unknown neighbor referenced by a visited node', () => {
  const graph = new NavGraph([
    {
      id: 'start',
      position: { x: 0, y: 0, z: 0 },
      neighbors: ['missing'],
      tags: [],
    },
    {
      id: 'goal',
      position: { x: 0, y: 0, z: -10 },
      neighbors: [],
      tags: ['site'],
    },
  ]);

  expect(() => graph.findPath('start', 'goal'))
    .toThrow('Unknown nav node: missing');
});

it('finds the nearest tagged node deterministically', () => {
  const graph = new NavGraph([
    { id: 'site-b', position: { x: 1, y: 0, z: 0 }, neighbors: [], tags: ['site'] },
    { id: 'site-a', position: { x: -1, y: 0, z: 0 }, neighbors: [], tags: ['site'] },
    { id: 'spawn', position: { x: 0, y: 0, z: 0.1 }, neighbors: [], tags: ['spawn'] },
  ]);

  expect(graph.nearest({ x: 0, y: 0, z: 0 }, 'site').id).toBe('site-a');
});
