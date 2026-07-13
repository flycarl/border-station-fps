import { expect, it } from 'vitest';
import { BombSystem, type ActorAction } from '../../src/match/bomb-system';

const config = {
  plantSeconds: 3.2,
  fuseSeconds: 35,
  defuseSeconds: 7,
  kitDefuseSeconds: 3.5,
};
const site = {
  center: { x: 0, y: 0, z: 0 },
  halfExtents: { x: 5, y: 2, z: 5 },
};

const action = (overrides: Partial<ActorAction> = {}): ActorAction => ({
  actorId: 'attacker-1',
  team: 'attack',
  position: { x: 0, y: 0, z: 0 },
  interact: true,
  alive: true,
  hasKit: false,
  ...overrides,
});

it('plants after 3.2 uninterrupted seconds inside site', () => {
  const bomb = new BombSystem(config, 'attacker-1');

  const events = bomb.update(3.2, [action()], site);

  expect(bomb.snapshot()).toMatchObject({
    state: 'planted',
    carrierId: null,
    position: { x: 0, y: 0, z: 0 },
    progress: 0,
    remaining: 35,
  });
  expect(events).toEqual([{ type: 'planted' }]);
  expect(bomb.update(0, [action()], site)).toEqual([]);
});

it('uses the kit defuse duration', () => {
  const bomb = BombSystem.plantedForTest(config);

  const events = bomb.update(3.5, [action({
    actorId: 'defender-1',
    team: 'defense',
    hasKit: true,
  })], site);

  expect(bomb.snapshot().state).toBe('defused');
  expect(events).toEqual([{ type: 'defused' }]);
});

it('resets planting only when the active planter loses validity', () => {
  const bomb = new BombSystem(config, 'attacker-1');

  bomb.update(1, [action()], site);
  bomb.update(1, [
    action(),
    action({ actorId: 'attacker-2', interact: false }),
  ], site);
  expect(bomb.snapshot()).toMatchObject({ state: 'planting', progress: 2 });

  bomb.update(1, [action({ interact: false })], site);
  expect(bomb.snapshot()).toMatchObject({ state: 'carried', progress: 0 });
});

it('keeps defuse ownership and fuse countdown through unrelated actor updates', () => {
  const bomb = BombSystem.plantedForTest(config);
  const defender = action({ actorId: 'defender-1', team: 'defense' });

  bomb.update(2, [defender], site);
  bomb.update(1, [
    defender,
    action({ actorId: 'attacker-2', interact: false }),
  ], site);

  expect(bomb.snapshot()).toMatchObject({
    state: 'defusing',
    progress: 3,
    remaining: 32,
  });

  bomb.update(1, [{ ...defender, position: { x: 2, y: 0, z: 0 } }], site);
  expect(bomb.snapshot()).toMatchObject({ state: 'planted', progress: 0, remaining: 31 });
});

it('explodes when the fuse expires and emits the event once', () => {
  const bomb = BombSystem.plantedForTest({ ...config, fuseSeconds: 2 });

  expect(bomb.update(2, [action({ interact: false })], site)).toEqual([{ type: 'exploded' }]);
  expect(bomb.snapshot()).toMatchObject({ state: 'exploded', remaining: 0 });
  expect(bomb.update(1, [action()], site)).toEqual([]);
});

it('decreases the fuse once per tick with six actors', () => {
  const bomb = BombSystem.plantedForTest(config);
  const actors = Array.from({ length: 6 }, (_, index) => action({
    actorId: `actor-${index}`,
    interact: false,
  }));

  bomb.update(1 / 60, actors, site);

  expect(bomb.snapshot().remaining).toBeCloseTo(35 - 1 / 60, 12);
});

it('keeps active defuse progress when unrelated actors are present', () => {
  const bomb = BombSystem.plantedForTest(config);
  const defender = action({ actorId: 'defender-1', team: 'defense' });

  bomb.update(1, [defender], site);
  bomb.update(1, [
    action({ actorId: 'attacker-1', interact: false }),
    action({ actorId: 'attacker-2', interact: false }),
    defender,
    action({ actorId: 'defender-2', team: 'defense', interact: false }),
  ], site);

  expect(bomb.snapshot()).toMatchObject({ state: 'defusing', progress: 2, remaining: 33 });
});

it('drops at the carrier position when the carrier dies', () => {
  const bomb = new BombSystem(config, 'attacker-1');

  bomb.update(1 / 60, [action({ alive: false, position: { x: 3, y: 0, z: -2 } })], site);

  expect(bomb.snapshot()).toMatchObject({
    state: 'dropped',
    carrierId: null,
    position: { x: 3, y: 0, z: -2 },
    progress: 0,
  });
});

it('allows a living attacker to pick up a nearby dropped bomb', () => {
  const bomb = new BombSystem(config, 'attacker-1');
  bomb.update(1 / 60, [action({ alive: false, position: { x: 3, y: 0, z: -2 } })], site);

  bomb.update(1 / 60, [action({
    actorId: 'attacker-2',
    position: { x: 3.5, y: 0, z: -2 },
  })], site);

  expect(bomb.snapshot()).toMatchObject({ state: 'carried', carrierId: 'attacker-2' });
});

it('defuses in seven seconds without a kit', () => {
  const bomb = BombSystem.plantedForTest(config);
  const defender = action({ actorId: 'defender-1', team: 'defense' });

  for (let tick = 0; tick < 7 * 60; tick++) bomb.update(1 / 60, [defender], site);

  expect(bomb.snapshot().state).toBe('defused');
});

it('resolves explosion before defuse when both complete on the same tick', () => {
  const bomb = BombSystem.plantedForTest({ ...config, fuseSeconds: 7 });
  const defender = action({ actorId: 'defender-1', team: 'defense' });

  for (let tick = 0; tick < 7 * 60; tick++) bomb.update(1 / 60, [defender], site);

  expect(bomb.snapshot().state).toBe('exploded');
});
