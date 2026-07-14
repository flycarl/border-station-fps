import { expect, it } from 'vitest';
import { Hud, projectRadarPosition, type HudSnapshot } from '../../src/ui/hud';

const radar: HudSnapshot['radar'] = {
  bounds: { minX: -17, maxX: 17, minZ: -47, maxZ: 47 },
  bombSite: { x: -1, z: -29 },
  contacts: [
    { id: 'attack-human', team: 'attack', x: 0, z: 39, yaw: 0, human: true, alive: true },
    { id: 'attack-bot-1', team: 'attack', x: -8, z: 13, yaw: 0, human: false, alive: true },
    { id: 'defense-bot-1', team: 'defense', x: -6, z: -36, yaw: Math.PI, human: false, alive: true },
    { id: 'defense-bot-2', team: 'defense', x: 0, z: -36, yaw: Math.PI, human: false, alive: false },
  ],
};

const snapshot = (overrides: Partial<HudSnapshot> = {}): HudSnapshot => ({
  attackScore: 2,
  defenseScore: 3,
  attackersAlive: 2,
  defendersAlive: 1,
  phase: 'live',
  phaseRemaining: 72.4,
  health: 86,
  armor: 40,
  weaponName: 'Vanguard Rifle',
  magazine: 21,
  reserve: 73,
  bombState: 'carried',
  radar,
  ...overrides,
});

it('renders score, timer, health, and ammo', () => {
  const root = document.createElement('div');
  const hud = new Hud(root);

  hud.render(snapshot());

  expect(root.textContent).toContain('2  —  3');
  expect(root.textContent).toContain('1:12');
  expect(root.textContent).toContain('86');
  expect(root.textContent).toContain('21 / 73');
});

it('renders both team survivor counts around the round clock', () => {
  const root = document.createElement('div');
  const hud = new Hud(root);

  hud.render(snapshot());

  expect(root.querySelector('[data-testid="attackers-alive"]')?.textContent).toBe('攻方 2');
  expect(root.querySelector('[data-testid="defenders-alive"]')?.textContent).toBe('守方 1');
});

it('renders the bomb site and only living radar contacts', () => {
  const root = document.createElement('div');
  const hud = new Hud(root);

  hud.render(snapshot());

  expect(root.querySelectorAll('.hud__radar-contact')).toHaveLength(3);
  expect(root.querySelectorAll('.hud__radar-contact--attack')).toHaveLength(2);
  expect(root.querySelectorAll('.hud__radar-contact--defense')).toHaveLength(1);
  expect(root.querySelector('.hud__radar-contact--human')).not.toBeNull();
  expect(root.querySelector('.hud__radar-site')).not.toBeNull();
});

it('projects and clamps world coordinates into a north-up radar', () => {
  const bounds = radar.bounds;

  expect(projectRadarPosition({ x: -17, z: -47 }, bounds)).toEqual({ left: 0, top: 0 });
  expect(projectRadarPosition({ x: 17, z: 47 }, bounds)).toEqual({ left: 100, top: 100 });
  expect(projectRadarPosition({ x: 99, z: -99 }, bounds)).toEqual({ left: 100, top: 0 });
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
  const base = snapshot({
    attackScore: 0, defenseScore: 0, phaseRemaining: 72,
    health: 100, armor: 25, magazine: 30, reserve: 90,
  });
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
