import { expect, it } from 'vitest';
import { Hud } from '../../src/ui/hud';

it('renders score, timer, health, and ammo', () => {
  const root = document.createElement('div');
  const hud = new Hud(root);

  hud.render({
    attackScore: 2,
    defenseScore: 3,
    phase: 'live',
    phaseRemaining: 72.4,
    health: 86,
    armor: 40,
    weaponName: 'Vanguard Rifle',
    magazine: 21,
    reserve: 73,
    bombState: 'carried',
  });

  expect(root.textContent).toContain('2  —  3');
  expect(root.textContent).toContain('1:12');
  expect(root.textContent).toContain('86');
  expect(root.textContent).toContain('21 / 73');
});

it('clears its owned interface on dispose', () => {
  const root = document.createElement('div');
  const hud = new Hud(root);

  hud.dispose();

  expect(root.childElementCount).toBe(0);
});
