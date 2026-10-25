import type { PowerUpType } from '../game/PowerUps';
import { PAINTS, type SkinId } from './catalog';

/** Everything the game counts, both per run and as lifetime totals. */
export type StatKey =
  | 'runs'
  | 'score'
  | 'distance'
  | 'cells'
  | 'nearMisses'
  | 'carriers'
  | 'jumps'
  | 'ducks'
  | 'laneChanges'
  | 'powerUps'
  | 'flights'
  | 'magnets'
  | 'smashes'
  | 'shieldBlocks'
  | 'escapes'
  | 'busts'
  | 'desert'
  | 'mars';

export type Stats = Partial<Record<StatKey, number>>;

export interface MissionState {
  id: string;
  target: number;
  reward: number;
  progress: number;
  done: boolean;
}

export interface ProfileData {
  version: 1;
  /** Spendable energy cells. */
  cells: number;
  best: number;
  paint: string;
  skin: SkinId;
  paints: string[];
  skins: SkinId[];
  upgrades: Record<PowerUpType, number>;
  /** Permanent score multiplier, raised by completing mission sets. */
  multiplier: number;
  missions: { day: string; sets: number; active: MissionState[] };
  streak: { day: number; lastClaim: string };
  achievements: string[];
  /** Lifetime totals. */
  stats: Stats;
  /** Best value reached in a single run. */
  records: Stats;
}

const KEY = 'roadster-rush.profile';
const OLD_BEST_KEY = 'roadster-rush.best';
const OLD_CELLS_KEY = 'roadster-rush.cells';

function defaults(): ProfileData {
  return {
    version: 1,
    cells: 0,
    best: 0,
    paint: PAINTS[0].id,
    skin: 'none',
    paints: [PAINTS[0].id],
    skins: ['none'],
    upgrades: { flight: 0, magnet: 0, multiplier: 0, shield: 0, nitro: 0 },
    multiplier: 1,
    missions: { day: '', sets: 0, active: [] },
    streak: { day: 0, lastClaim: '' },
    achievements: [],
    stats: {},
    records: {},
  };
}

/** Local calendar date as YYYY-MM-DD; daily missions and rewards roll over at local midnight. */
export function today(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return today(d);
}

/** The player's saved progress. */
export class Profile {
  readonly data: ProfileData;
  /** Fires after anything changes (to refresh the cell counter, etc.). */
  onChange?: () => void;

  constructor() {
    this.data = load();
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // Storage unavailable (private mode); progress just won't persist.
    }
    this.onChange?.();
  }

  earn(cells: number) {
    this.data.cells += cells;
    this.save();
  }

  /** Spends cells if there are enough; returns whether it did. */
  spend(cells: number) {
    if (this.data.cells < cells) return false;
    this.data.cells -= cells;
    this.save();
    return true;
  }
}

function load(): ProfileData {
  const data = defaults();
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<ProfileData>;
      return { ...data, ...parsed, upgrades: { ...data.upgrades, ...parsed.upgrades } };
    }
    // First launch with this version: carry over the Phase 3–5 saves.
    data.best = Number(localStorage.getItem(OLD_BEST_KEY)) || 0;
    data.cells = Number(localStorage.getItem(OLD_CELLS_KEY)) || 0;
    data.stats.cells = data.cells;
  } catch {
    // Missing or corrupt: start fresh.
  }
  return data;
}
