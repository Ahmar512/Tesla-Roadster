import type { StatKey } from './Profile';

export interface MissionDef {
  id: string;
  /** `n` is the target, already scaled for the player's level. */
  text: (n: number) => string;
  stat: StatKey;
  /** 'run' must be done within a single run; 'total' adds up across runs. */
  scope: 'run' | 'total';
  base: number;
  /** One-off goals like "reach Mars" don't get harder. */
  fixed?: boolean;
  reward: number;
}

const fmt = (n: number) => n.toLocaleString('en-US');

export const MISSIONS: MissionDef[] = [
  { id: 'cells-total', text: (n) => `Collect ${fmt(n)} cells`, stat: 'cells', scope: 'total', base: 300, reward: 150 },
  { id: 'cells-run', text: (n) => `Collect ${fmt(n)} cells in one run`, stat: 'cells', scope: 'run', base: 120, reward: 200 },
  { id: 'score-run', text: (n) => `Score ${fmt(n)} in one run`, stat: 'score', scope: 'run', base: 4000, reward: 200 },
  { id: 'score-big', text: (n) => `Score ${fmt(n)} in one run`, stat: 'score', scope: 'run', base: 12000, reward: 350 },
  { id: 'dist-total', text: (n) => `Drive ${fmt(n)} m`, stat: 'distance', scope: 'total', base: 3000, reward: 150 },
  { id: 'dist-run', text: (n) => `Drive ${fmt(n)} m in one run`, stat: 'distance', scope: 'run', base: 1500, reward: 250 },
  { id: 'near-total', text: (n) => `Get ${n} near misses`, stat: 'nearMisses', scope: 'total', base: 10, reward: 150 },
  { id: 'near-run', text: (n) => `Get ${n} near misses in one run`, stat: 'nearMisses', scope: 'run', base: 3, reward: 250 },
  { id: 'carriers-total', text: (n) => `Ride ${n} car carriers`, stat: 'carriers', scope: 'total', base: 5, reward: 150 },
  { id: 'carriers-run', text: (n) => `Ride ${n} car carriers in one run`, stat: 'carriers', scope: 'run', base: 3, reward: 250 },
  { id: 'jumps-total', text: (n) => `Thruster-hop ${n} times`, stat: 'jumps', scope: 'total', base: 40, reward: 100 },
  { id: 'jumps-run', text: (n) => `Hop ${n} times in one run`, stat: 'jumps', scope: 'run', base: 20, reward: 150 },
  { id: 'ducks-total', text: (n) => `Duck ${n} times`, stat: 'ducks', scope: 'total', base: 25, reward: 100 },
  { id: 'lanes-total', text: (n) => `Change lanes ${n} times`, stat: 'laneChanges', scope: 'total', base: 150, reward: 100 },
  { id: 'lanes-run', text: (n) => `Change lanes ${n} times in one run`, stat: 'laneChanges', scope: 'run', base: 50, reward: 150 },
  { id: 'powerups-total', text: (n) => `Grab ${n} power-ups`, stat: 'powerUps', scope: 'total', base: 4, reward: 150 },
  { id: 'powerups-run', text: (n) => `Grab ${n} power-ups in one run`, stat: 'powerUps', scope: 'run', base: 2, reward: 200 },
  { id: 'flights', text: (n) => `Use Flight Mode ${n} times`, stat: 'flights', scope: 'total', base: 2, reward: 150 },
  { id: 'magnets', text: (n) => `Use the Magnet ${n} times`, stat: 'magnets', scope: 'total', base: 2, reward: 150 },
  { id: 'smashes', text: (n) => `Smash ${n} cars with Nitro`, stat: 'smashes', scope: 'total', base: 4, reward: 200 },
  { id: 'shields', text: (n) => `Block ${n} hits with a Shield`, stat: 'shieldBlocks', scope: 'total', base: 2, reward: 200 },
  { id: 'escapes', text: (n) => `Escape the police ${n} times`, stat: 'escapes', scope: 'total', base: 2, reward: 200 },
  { id: 'runs', text: (n) => `Play ${n} runs`, stat: 'runs', scope: 'total', base: 5, reward: 100 },
  { id: 'desert', text: () => 'Reach the desert highway', stat: 'desert', scope: 'run', base: 1, fixed: true, reward: 300 },
  { id: 'mars', text: () => 'Reach Mars', stat: 'mars', scope: 'run', base: 1, fixed: true, reward: 500 },
];

/** Targets grow 20% (and rewards 10%) for each multiplier level already earned. */
export function scaleMission(def: MissionDef, multiplier: number) {
  const tier = multiplier - 1;
  const raw = def.fixed ? def.base : def.base * (1 + 0.2 * tier);
  const step = raw >= 1000 ? 100 : raw >= 100 ? 10 : 1;
  return {
    target: Math.max(1, Math.round(raw / step) * step),
    reward: Math.round((def.reward * (1 + 0.1 * tier)) / 10) * 10,
  };
}
