import { expect, it } from 'vitest';
import { FirstPersonWeaponRig } from '../../src/weapons/first-person-weapon';

const state = (overrides: Partial<Parameters<FirstPersonWeaponRig['update']>[0]> = {}) => ({
  weaponId: 'vanguard-rifle' as const,
  movement: 0,
  fired: false,
  reloading: false,
  alive: true,
  paused: false,
  ...overrides,
});

it('builds authored rifle and pistol silhouettes with named functional parts', () => {
  const rig = new FirstPersonWeaponRig();

  expect(rig.root.getObjectByName('rifle-receiver')).toBeDefined();
  expect(rig.root.getObjectByName('rifle-handguard')).toBeDefined();
  expect(rig.root.getObjectByName('rifle-magazine')).toBeDefined();
  expect(rig.root.getObjectByName('rifle-optic')).toBeDefined();
  expect(rig.root.getObjectByName('pistol-slide')).toBeDefined();
  expect(rig.root.getObjectByName('pistol-grip')).toBeDefined();
  expect(rig.root.getObjectByName('support-hand')).toBeDefined();
});

it('switches weapons and applies recoil, movement sway, reload pose, and alive visibility', () => {
  const rig = new FirstPersonWeaponRig();
  const rifle = rig.root.getObjectByName('rifle')!;
  const pistol = rig.root.getObjectByName('pistol')!;

  rig.update(state({ weaponId: 'sidearm-9' }), 1 / 60);
  expect(rig.diagnostics().weaponId).toBe('sidearm-9');
  expect(rifle.visible).toBe(false);
  expect(pistol.visible).toBe(true);

  rig.update(state({ fired: true, movement: 1 }), 1 / 60);
  expect(rig.diagnostics().weaponOffset.z).toBeGreaterThan(0);
  expect(rifle.visible).toBe(true);
  expect(rifle.position.z).toBeGreaterThan(0);
  expect(rig.root.position.x).not.toBe(0.36);

  rig.update(state({ reloading: true }), 0.2);
  expect(Math.abs(rig.diagnostics().weaponRotation.z)).toBeGreaterThan(0.1);
  expect(Math.abs(rifle.rotation.z)).toBeGreaterThan(0.1);

  rig.update(state({ alive: false }), 1 / 60);
  expect(rig.root.visible).toBe(false);
});

it('keeps one second of walking sway below a comfortable travel budget', () => {
  const rig = new FirstPersonWeaponRig();
  let previous = rig.root.position.clone();
  let travel = 0;

  for (let frame = 0; frame < 60; frame += 1) {
    rig.update(state({ movement: 1 }), 1 / 60);
    travel += rig.root.position.distanceTo(previous);
    previous = rig.root.position.clone();
  }

  expect(travel).toBeLessThan(0.2);
});

it('restores the authored pistol pose instead of accumulating transform drift', () => {
  const rig = new FirstPersonWeaponRig();
  const pistol = rig.root.getObjectByName('pistol')!;
  pistol.position.set(2, 2, 2);
  pistol.rotation.set(0.4, 0.4, 0.4);

  rig.update(state({ weaponId: 'sidearm-9' }), 1 / 60);

  expect(rig.diagnostics().weaponOffset).toEqual({ x: 0.02, y: -0.02, z: -0.06 });
  expect(rig.diagnostics().weaponRotation.y).toBe(0);
});

it('restores authored local poses even while the weapon is hidden', () => {
  const rig = new FirstPersonWeaponRig();
  const pistol = rig.root.getObjectByName('pistol')!;
  pistol.position.set(2, 2, 2);
  pistol.rotation.set(0.4, 0.4, 0.4);

  rig.update(state({ weaponId: 'sidearm-9', alive: false }), 1 / 60);

  expect(rig.diagnostics().weaponOffset).toEqual({ x: 0.02, y: -0.02, z: -0.06 });
  expect(rig.diagnostics().weaponRotation).toEqual({ x: 0, y: 0, z: 0 });
});

it('accumulates recoil across shots and recovers toward the authored pose', () => {
  const rig = new FirstPersonWeaponRig();

  rig.update(state({ fired: true }), 1 / 60);
  const firstKick = rig.diagnostics().weaponOffset.z;
  rig.update(state({ fired: true }), 1 / 60);
  const secondKick = rig.diagnostics().weaponOffset.z;

  expect(secondKick).toBeGreaterThan(firstKick);

  for (let frame = 0; frame < 60; frame += 1) {
    rig.update(state(), 1 / 60);
  }

  expect(rig.diagnostics().weaponOffset.z).toBeLessThan(firstKick * 0.1);
});
