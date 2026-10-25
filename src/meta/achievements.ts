import { MAX_UPGRADE, PAINTS } from './catalog';
import type { ProfileData } from './Profile';

export interface AchievementDef {
  id: string;
  name: string;
  text: string;
  icon: string;
  test: (p: ProfileData) => boolean;
}

export const ACHIEVEMENT_REWARD = 250;

const total = (p: ProfileData, key: keyof ProfileData['stats'], n: number) => (p.stats[key] ?? 0) >= n;
const record = (p: ProfileData, key: keyof ProfileData['records'], n: number) => (p.records[key] ?? 0) >= n;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-run', name: 'IGNITION', text: 'Finish your first run', icon: '🔑', test: (p) => total(p, 'runs', 1) },
  { id: 'score-10k', name: 'SPEED DEMON', text: 'Score 10,000 in one run', icon: '⚡', test: (p) => record(p, 'score', 10_000) },
  { id: 'score-50k', name: 'HIGH ROLLER', text: 'Score 50,000 in one run', icon: '🏆', test: (p) => record(p, 'score', 50_000) },
  { id: 'score-100k', name: 'LEGEND', text: 'Score 100,000 in one run', icon: '👑', test: (p) => record(p, 'score', 100_000) },
  { id: 'desert', name: 'ROAD TRIP', text: 'Reach the desert highway', icon: '🌵', test: (p) => record(p, 'desert', 1) },
  { id: 'mars', name: 'MARTIAN', text: 'Drive all the way to Mars', icon: '🪐', test: (p) => record(p, 'mars', 1) },
  { id: 'dist-10k', name: 'COMMUTER', text: 'Drive 10 km in total', icon: '🛣️', test: (p) => total(p, 'distance', 10_000) },
  { id: 'dist-100k', name: 'GLOBETROTTER', text: 'Drive 100 km in total', icon: '🌍', test: (p) => total(p, 'distance', 100_000) },
  { id: 'near-100', name: 'DAREDEVIL', text: 'Get 100 near misses', icon: '😎', test: (p) => total(p, 'nearMisses', 100) },
  { id: 'cells-1k', name: 'CHARGED UP', text: 'Collect 1,000 cells', icon: '🔋', test: (p) => total(p, 'cells', 1_000) },
  { id: 'cells-10k', name: 'POWER PLANT', text: 'Collect 10,000 cells', icon: '🏭', test: (p) => total(p, 'cells', 10_000) },
  { id: 'carriers-25', name: 'HITCHHIKER', text: 'Ride 25 car carriers', icon: '🚛', test: (p) => total(p, 'carriers', 25) },
  { id: 'escapes-10', name: 'GETAWAY DRIVER', text: 'Escape the police 10 times', icon: '🚨', test: (p) => total(p, 'escapes', 10) },
  { id: 'busts-10', name: 'REPEAT OFFENDER', text: 'Get busted 10 times', icon: '🚓', test: (p) => total(p, 'busts', 10) },
  { id: 'smash-50', name: 'WRECKING BALL', text: 'Smash 50 cars with Nitro', icon: '💥', test: (p) => total(p, 'smashes', 50) },
  { id: 'powerups-50', name: 'POWER HUNGRY', text: 'Grab 50 power-ups', icon: '🍀', test: (p) => total(p, 'powerUps', 50) },
  { id: 'max-upgrade', name: 'FULLY LOADED', text: 'Max out any upgrade', icon: '🔧', test: (p) => Object.values(p.upgrades).some((l) => l >= MAX_UPGRADE) },
  { id: 'all-paints', name: 'PAINT SHOP', text: 'Own every paint color', icon: '🎨', test: (p) => p.paints.length >= PAINTS.length },
  { id: 'skin', name: 'STYLE ICON', text: 'Buy a skin', icon: '✨', test: (p) => p.skins.length > 1 },
  { id: 'mult-10', name: 'MULTIPLIER ×10', text: 'Raise your multiplier to ×10', icon: '✖️', test: (p) => p.multiplier >= 10 },
  { id: 'streak-7', name: 'DEDICATED', text: 'Claim a 7-day reward streak', icon: '📅', test: (p) => p.streak.day >= 7 },
];
