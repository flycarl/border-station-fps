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

it('keeps timer and ammo renders out of the live announcer and announces objective changes once', async () => {
  const root = document.createElement('div');
  const hud = new Hud(root);
  const base = {
    attackScore: 0, defenseScore: 0, phase: 'live', phaseRemaining: 72,
    health: 100, armor: 25, weaponName: 'Vanguard Rifle', magazine: 30,
    reserve: 90, bombState: 'carried',
  };
  hud.render(base);
  const announcer = root.querySelector('[aria-live="polite"]');
  expect(root.querySelector('.hud')?.hasAttribute('aria-live')).toBe(false);
  const initial = announcer?.textContent;
  const mutations: MutationRecord[] = [];
  const observer = new MutationObserver((records) => mutations.push(...records));
  observer.observe(announcer!, { childList: true, characterData: true, subtree: true });

  hud.render({ ...base, phaseRemaining: 71, magazine: 29 });
  await Promise.resolve();
  expect(announcer?.textContent).toBe(initial);
  expect(mutations).toHaveLength(0);
  hud.render({ ...base, bombState: 'planted' });
  await Promise.resolve();
  expect(announcer?.textContent).toBe('炸弹已安装');
  expect(mutations).toHaveLength(1);
  hud.render({ ...base, bombState: 'planted', phaseRemaining: 34 });
  await Promise.resolve();
  expect(announcer?.textContent).toBe('炸弹已安装');
  expect(mutations).toHaveLength(1);
  hud.render({ ...base, phase: 'freeze', bombState: 'carried' });
  await Promise.resolve();
  expect(announcer?.textContent).toBe('');
  expect(mutations).toHaveLength(2);
  observer.disconnect();
});
