export type WeaponId = 'sidearm-9' | 'vanguard-rifle';

export interface WeaponConfig {
  id: WeaponId;
  name: string;
  magazine: number;
  reserve: number;
  roundsPerMinute: number;
  damage: number;
  range: number;
  armorPenetration: number;
  spreadRadians: number;
  reloadSeconds: number;
}

export const WEAPONS: Record<WeaponId, WeaponConfig> = {
  'sidearm-9': {
    id: 'sidearm-9',
    name: 'Sidearm 9',
    magazine: 15,
    reserve: 45,
    roundsPerMinute: 360,
    damage: 31,
    range: 55,
    armorPenetration: 0.45,
    spreadRadians: 0.006,
    reloadSeconds: 1.7,
  },
  'vanguard-rifle': {
    id: 'vanguard-rifle',
    name: 'Vanguard Rifle',
    magazine: 30,
    reserve: 90,
    roundsPerMinute: 640,
    damage: 35,
    range: 95,
    armorPenetration: 0.72,
    spreadRadians: 0.004,
    reloadSeconds: 2.35,
  },
};
