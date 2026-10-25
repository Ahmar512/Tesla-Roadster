import type { PowerUpType } from '../game/PowerUps';
import { platform } from '../services/platform';
import { ACHIEVEMENT_REWARD, ACHIEVEMENTS, type AchievementDef } from './achievements';
import { DAILY_REWARDS, MAX_MULTIPLIER, MAX_UPGRADE, PAINTS, SKINS, UPGRADE_PRICES, type SkinId } from './catalog';
import { MISSIONS, scaleMission, type MissionDef } from './missions';
import { Profile, today, yesterday, type MissionState, type StatKey, type Stats } from './Profile';

const MISSIONS_PER_SET = 3;

export interface Mission extends MissionState {
  text: string;
}

/**
 * Meta progression: counts what happens in runs and turns it into mission
 * progress, achievements, the daily reward streak and purchases.
 */
export class Meta {
  readonly profile = new Profile();
  onMissionDone?: (text: string, reward: number) => void;
  onSetDone?: (multiplier: number) => void;
  onAchievement?: (def: AchievementDef) => void;
  /** This run's counts. */
  private run: Stats = {};

  constructor() {
    this.refreshMissions();
    this.checkAchievements();
  }

  get data() {
    return this.profile.data;
  }

  // --- Runs ------------------------------------------------------------------

  startRun() {
    this.run = {};
    this.refreshMissions();
  }

  /** Counts something that happened (a jump, a cell, a near miss...). */
  add(key: StatKey, n = 1) {
    if (n <= 0) return;
    const { stats, records } = this.data;
    const value = (this.run[key] ?? 0) + n;
    this.run[key] = value;
    stats[key] = (stats[key] ?? 0) + n;
    if (value > (records[key] ?? 0)) records[key] = value;
    this.progressMissions(key, n, value);
    this.checkAchievements();
  }

  /** For values that only grow during a run, like score and distance. */
  reach(key: StatKey, value: number) {
    this.add(key, value - (this.run[key] ?? 0));
  }

  /** Banks the run; returns whether it was a new best. */
  endRun(score: number, cells: number) {
    this.add('runs');
    const isNewBest = score > this.data.best;
    if (isNewBest) this.data.best = score;
    this.data.cells += cells;
    this.profile.save();
    platform.submitScore(score);
    return isNewBest;
  }

  // --- Missions --------------------------------------------------------------

  get missions(): Mission[] {
    return this.data.missions.active.map((m) => ({ ...m, text: missionDef(m.id).text(m.target) }));
  }

  /** A fresh set when the last one is done; unfinished missions are swapped out each new day. */
  private refreshMissions() {
    const m = this.data.missions;
    const day = today();
    if (m.active.length && m.day === day) return;
    const keep = m.active.filter((s) => s.done);
    m.active = [...keep, ...this.pickMissions(MISSIONS_PER_SET - keep.length, keep)];
    m.day = day;
    this.profile.save();
  }

  private pickMissions(count: number, keep: MissionState[]): MissionState[] {
    const taken = new Set(keep.map((s) => missionDef(s.id).stat));
    const previous = new Set(this.data.missions.active.map((s) => s.id));
    const pool = MISSIONS.filter((d) => !previous.has(d.id)).sort(() => Math.random() - 0.5);
    const picked: MissionState[] = [];
    for (const def of pool) {
      if (picked.length === count) break;
      if (taken.has(def.stat)) continue;
      taken.add(def.stat);
      picked.push({ id: def.id, ...scaleMission(def, this.data.multiplier), progress: 0, done: false });
    }
    return picked;
  }

  private progressMissions(key: StatKey, n: number, runValue: number) {
    let changed = false;
    for (const m of this.data.missions.active) {
      const def = missionDef(m.id);
      if (m.done || def.stat !== key) continue;
      m.progress = Math.min(m.target, def.scope === 'run' ? Math.max(m.progress, runValue) : m.progress + n);
      if (m.progress < m.target) continue;
      m.done = changed = true;
      this.data.cells += m.reward;
      this.onMissionDone?.(def.text(m.target), m.reward);
    }
    if (!changed) return;
    if (this.data.missions.active.every((m) => m.done)) this.completeSet();
    this.profile.save();
  }

  private completeSet() {
    const m = this.data.missions;
    this.data.multiplier = Math.min(MAX_MULTIPLIER, this.data.multiplier + 1);
    m.sets++;
    m.active = this.pickMissions(MISSIONS_PER_SET, []);
    this.onSetDone?.(this.data.multiplier);
  }

  // --- Daily reward streak --------------------------------------------------

  /** Today's unclaimed reward, if any. Missing a day restarts the streak at day 1. */
  get dailyReward(): { day: number; cells: number } | null {
    const { streak } = this.data;
    if (streak.lastClaim === today()) return null;
    const day = streak.lastClaim === yesterday() ? (streak.day % DAILY_REWARDS.length) + 1 : 1;
    return { day, cells: DAILY_REWARDS[day - 1] };
  }

  claimDailyReward() {
    const reward = this.dailyReward;
    if (!reward) return;
    this.data.streak = { day: reward.day, lastClaim: today() };
    this.data.cells += reward.cells;
    this.checkAchievements();
    this.profile.save();
  }

  // --- Shop --------------------------------------------------------------------

  /** Buys (if needed and affordable) and equips a paint. */
  choosePaint(id: string) {
    const paint = PAINTS.find((p) => p.id === id)!;
    if (!this.data.paints.includes(id)) {
      if (!this.profile.spend(paint.price)) return false;
      this.data.paints.push(id);
    }
    this.data.paint = id;
    this.afterPurchase();
    return true;
  }

  chooseSkin(id: SkinId) {
    const skin = SKINS.find((s) => s.id === id)!;
    if (!this.data.skins.includes(id)) {
      if (!this.profile.spend(skin.price)) return false;
      this.data.skins.push(id);
    }
    this.data.skin = id;
    this.afterPurchase();
    return true;
  }

  upgradePrice(type: PowerUpType) {
    const level = this.data.upgrades[type];
    return level >= MAX_UPGRADE ? null : UPGRADE_PRICES[level];
  }

  buyUpgrade(type: PowerUpType) {
    const price = this.upgradePrice(type);
    if (price === null || !this.profile.spend(price)) return false;
    this.data.upgrades[type]++;
    this.afterPurchase();
    return true;
  }

  spend(cells: number) {
    return this.profile.spend(cells);
  }

  earn(cells: number) {
    this.profile.earn(cells);
  }

  private afterPurchase() {
    this.checkAchievements();
    this.profile.save();
  }

  // --- Achievements -------------------------------------------------------------

  private checkAchievements() {
    const unlocked = this.data.achievements;
    for (const def of ACHIEVEMENTS) {
      if (unlocked.includes(def.id) || !def.test(this.data)) continue;
      unlocked.push(def.id);
      this.data.cells += ACHIEVEMENT_REWARD;
      platform.unlockAchievement(def.id);
      this.onAchievement?.(def);
      this.profile.save();
    }
  }
}

function missionDef(id: string): MissionDef {
  return MISSIONS.find((d) => d.id === id) ?? MISSIONS[0];
}
