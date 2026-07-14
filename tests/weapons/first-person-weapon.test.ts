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
  expect(rig.root.position.x).not.toBeCloseTo(0.36);

  rig.update(state({ reloading: true }), 0.2);
  expect(Math.abs(rig.diagnostics().weaponRotation.z)).toBeGreaterThan(0.1);
  expect(Math.abs(rifle.rotation.z)).toBeGreaterThan(0.1);

  rig.update(state({ alive: false }), 1 / 60);
  expect(rig.root.visible).toBe(false);
});
