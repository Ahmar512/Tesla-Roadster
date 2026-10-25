export type PowerUpType = 'flight' | 'magnet' | 'multiplier' | 'shield' | 'nitro';

export interface PowerUpInfo {
  label: string;
  icon: string;
  color: string;
  /** Seconds it lasts; 0 means "until used" (the shield). */
  duration: number;
  /** How often it is picked when a power-up spawns. */
  weight: number;
}

export const POWER_UPS: Record<PowerUpType, PowerUpInfo> = {
  flight: { label: 'FLIGHT MODE!', icon: '🚀', color: '#ff7a1a', duration: 8, weight: 1 },
  magnet: { label: 'MAGNET!', icon: '🧲', color: '#e03131', duration: 10, weight: 1.5 },
  multiplier: { label: 'DOUBLE SCORE!', icon: '×2', color: '#f59f00', duration: 15, weight: 1.2 },
  shield: { label: 'SHIELD!', icon: '🛡️', color: '#1c7ed6', duration: 0, weight: 1 },
  nitro: { label: 'NITRO!', icon: '💨', color: '#7048e8', duration: 5, weight: 0.8 },
};

export const POWER_UP_TYPES = Object.keys(POWER_UPS) as PowerUpType[];

export function randomPowerUp(): PowerUpType {
  const total = POWER_UP_TYPES.reduce((sum, t) => sum + POWER_UPS[t].weight, 0);
  let r = Math.random() * total;
  for (const type of POWER_UP_TYPES) {
    r -= POWER_UPS[type].weight;
    if (r <= 0) return type;
  }
  return 'magnet';
}

/** Tracks which power-ups are active and how long each has left. */
export class PowerUps {
  /** Fires when a timed power-up runs out. */
  onExpire?: (type: PowerUpType) => void;
  private readonly remaining = new Map<PowerUpType, number>();

  reset() {
    this.remaining.clear();
  }

  /** Starts a power-up, or refills it if it's already running. */
  activate(type: PowerUpType) {
    this.remaining.set(type, POWER_UPS[type].duration || Infinity);
  }

  /** Uses up a power-up early (the shield absorbing a hit). */
  consume(type: PowerUpType) {
    this.remaining.delete(type);
  }

  has(type: PowerUpType) {
    return this.remaining.has(type);
  }

  timeLeft(type: PowerUpType) {
    return this.remaining.get(type) ?? 0;
  }

  update(dt: number) {
    for (const [type, left] of this.remaining) {
      if (left === Infinity) continue;
      if (left - dt <= 0) {
        this.remaining.delete(type);
        this.onExpire?.(type);
      } else {
        this.remaining.set(type, left - dt);
      }
    }
  }

  /** Active power-ups with the fraction of time left (1 for the shield), for the HUD. */
  list(): { type: PowerUpType; fraction: number }[] {
    return [...this.remaining].map(([type, left]) => ({
      type,
      fraction: left === Infinity ? 1 : left / POWER_UPS[type].duration,
    }));
  }
}
