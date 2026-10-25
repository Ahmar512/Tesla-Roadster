import { POWER_UPS, type PowerUpType } from '../game/PowerUps';

// Everything that can be bought with energy cells.

export interface Paint {
  id: string;
  name: string;
  color: number;
  price: number;
}

export const PAINTS: Paint[] = [
  { id: 'red', name: 'ROCKET RED', color: 0xe3202e, price: 0 },
  { id: 'white', name: 'PEARL WHITE', color: 0xf2f4f7, price: 500 },
  { id: 'black', name: 'MIDNIGHT', color: 0x23232b, price: 750 },
  { id: 'blue', name: 'ELECTRIC BLUE', color: 0x1f6fe0, price: 1000 },
  { id: 'yellow', name: 'SUNBURST', color: 0xffc21a, price: 1000 },
  { id: 'green', name: 'LIME', color: 0x52c43a, price: 1250 },
  { id: 'purple', name: 'ULTRAVIOLET', color: 0x7a3df0, price: 1500 },
  { id: 'pink', name: 'BUBBLEGUM', color: 0xff6fb5, price: 2000 },
];

export type SkinId = 'none' | 'stripes' | 'twotone' | 'flames' | 'neon' | 'chrome' | 'gold';

export interface Skin {
  id: SkinId;
  name: string;
  price: number;
  /** Chrome and gold replace the paint color instead of decorating it. */
  replacesPaint?: boolean;
}

export const SKINS: Skin[] = [
  { id: 'none', name: 'FACTORY', price: 0 },
  { id: 'stripes', name: 'RACING STRIPES', price: 3000 },
  { id: 'twotone', name: 'TWO-TONE', price: 3000 },
  { id: 'flames', name: 'HOT FLAMES', price: 4500 },
  { id: 'neon', name: 'NEON GLOW', price: 5000 },
  { id: 'chrome', name: 'CHROME', price: 6500, replacesPaint: true },
  { id: 'gold', name: 'SOLID GOLD', price: 8000, replacesPaint: true },
];

// Power-up upgrades: 5 levels each, prices doubling.
export const MAX_UPGRADE = 5;
export const UPGRADE_PRICES = [500, 1000, 2000, 4000, 8000];

/** Seconds each upgrade level adds to a timed power-up. */
export const UPGRADE_SECONDS: Record<Exclude<PowerUpType, 'shield'>, number> = {
  flight: 1,
  magnet: 2,
  multiplier: 2,
  nitro: 0.8,
};

/** Shield: each level makes shields this much more common; max level starts every run with one. */
export const SHIELD_WEIGHT_PER_LEVEL = 0.3;

export function powerUpDuration(type: PowerUpType, level: number) {
  return type === 'shield' ? 0 : POWER_UPS[type].duration + UPGRADE_SECONDS[type] * level;
}

/** What an upgrade level gives, for the garage. */
export function describeUpgrade(type: PowerUpType, level: number) {
  if (type !== 'shield') return `${+powerUpDuration(type, level).toFixed(1)} S`;
  if (level >= MAX_UPGRADE) return 'START WITH ONE';
  return level === 0 ? 'NORMAL' : `+${Math.round(level * SHIELD_WEIGHT_PER_LEVEL * 100)}% MORE OFTEN`;
}

// Revive: pay cells (doubling each time in a run), or watch an ad once per run.
export const REVIVE_BASE_PRICE = 500;

// Daily reward calendar; day 7 is the big one, then it starts over.
export const DAILY_REWARDS = [100, 200, 300, 500, 750, 1000, 2500];

export const MAX_MULTIPLIER = 30;
