import type { QualityMode, Settings } from '../game/Settings';

const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export type Screen = 'title' | 'garage' | 'pause' | 'revive' | 'over';

export interface MenuActions {
  play(): void;
  resume(): void;
  home(): void;
  revive(): void;
  reviveWithAd(): void;
  declineRevive(): void;
  doubleCells(): void;
  garage(): void;
  closeGarage(): void;
  missions(): void;
  trophies(): void;
}

export interface ReviveOffer {
  caught: boolean;
  price: number;
  cells: number;
  ad: boolean;
}

export interface RunResult {
  score: number;
  best: number;
  isNewBest: boolean;
  cells: number;
  distance: number;
  nearMisses: number;
  nearMissPoints: number;
  caught: boolean;
}

const COUNT_UP_TIME = 0.9; // seconds for the final score to count up
const CONFETTI = 60;
const CONFETTI_COLORS = ['#ff3b3b', '#ffd84a', '#33d6ff', '#7048e8', '#51cf66', '#ff7a1a'];

/** Full-screen menus: title, pause, revive prompt, game over, and the settings panel. */
export class Menus {
  private readonly screens: Record<Screen, HTMLElement> = {
    title: byId('title-screen'),
    pause: byId('pause-screen'),
    revive: byId('revive-screen'),
    over: byId('over-screen'),
    garage: byId('garage-screen'),
  };
  private readonly settingsScreen = byId('settings-screen');
  private readonly reviveRing = byId('revive-ring');
  private readonly reviveCount = byId('revive-count');
  private readonly confetti = byId('confetti');
  private countUp = 0;

  constructor(
    private readonly settings: Settings,
    actions: MenuActions,
  ) {
    // Tap anywhere on the title screen to start (except on its buttons).
    this.screens.title.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('button')) actions.play();
    });
    onClick('retry-btn', actions.play);
    onClick('resume-btn', actions.resume);
    onClick('quit-btn', actions.home);
    onClick('home-btn', actions.home);
    onClick('revive-btn', actions.revive);
    onClick('revive-ad-btn', actions.reviveWithAd);
    onClick('skip-revive-btn', actions.declineRevive);
    onClick('double-btn', actions.doubleCells);
    onClick('garage-btn', actions.garage);
    onClick('garage-back', actions.closeGarage);
    onClick('missions-btn', actions.missions);
    onClick('trophies-btn', actions.trophies);
    onClick('settings-btn', () => this.openSettings());
    onClick('pause-settings-btn', () => this.openSettings());
    onClick('settings-close', () => this.closeSettings());
    this.settingsScreen.addEventListener('click', (e) => {
      if (e.target === this.settingsScreen) this.closeSettings();
    });
    this.wireSettings();
  }

  get settingsOpen() {
    return !this.settingsScreen.classList.contains('off');
  }

  /** Shows one screen (or none) and hides the rest. */
  show(screen: Screen | null) {
    for (const [name, el] of Object.entries(this.screens)) el.classList.toggle('off', name !== screen);
    if (screen !== 'title' && screen !== 'pause') this.closeSettings();
    if (screen !== 'over') this.confetti.replaceChildren();
  }

  showTitle(best: number) {
    byId('title-best').textContent = best.toLocaleString('en-US');
    this.show('title');
  }

  /** "Continue?": pay cells (if the player has enough) or watch an ad (once per run). */
  showRevive(offer: ReviveOffer) {
    byId('revive-title').textContent = offer.caught ? 'BUSTED!' : 'CRASHED!';
    byId('revive-price').textContent = offer.price.toLocaleString('en-US');
    byId('revive-cells').textContent = offer.cells.toLocaleString('en-US');
    byId<HTMLButtonElement>('revive-btn').disabled = offer.cells < offer.price;
    byId('revive-ad-btn').classList.toggle('hidden', !offer.ad);
    this.setReviveTime(1, 0);
    this.show('revive');
  }

  /** `fraction` of the revive window left, drawn as a draining ring. */
  setReviveTime(fraction: number, seconds: number) {
    this.reviveRing.style.setProperty('--left', String(Math.max(0, fraction)));
    const text = seconds > 0 ? String(seconds) : '';
    if (this.reviveCount.textContent !== text) this.reviveCount.textContent = text;
  }

  /** `canDouble`: offer a rewarded ad that doubles the run's cells. */
  showGameOver(run: RunResult, canDouble: boolean) {
    this.setDoubled(!canDouble, run.cells);
    byId('over-title').textContent = run.caught ? 'BUSTED!' : 'CRASHED!';
    byId('over-best').textContent = String(run.best);
    byId('bd-distance').textContent = `${run.distance} m`;
    byId('bd-near-count').textContent = String(run.nearMisses);
    byId('bd-near').textContent = `+${run.nearMissPoints}`;
    byId('run-cells').textContent = String(run.cells);
    const bonus = run.score - run.distance - run.nearMissPoints;
    byId('bd-bonus').textContent = `+${bonus}`;
    byId('bd-bonus-row').classList.toggle('hidden', bonus <= 0);
    byId('new-best').classList.toggle('hidden', !run.isNewBest);
    this.screens.over.classList.toggle('celebrate', run.isNewBest);
    this.countUpScore(run.score);
    if (run.isNewBest) this.burstConfetti();
    this.show('over');
  }

  /** Hides the ×2 cells offer; after watching the ad, shows the doubled count. */
  setDoubled(hide: boolean, cells: number) {
    byId('double-btn').classList.toggle('hidden', hide);
    byId('run-cells').textContent = String(cells);
  }

  openSettings() {
    this.syncSettings();
    this.settingsScreen.classList.remove('off');
  }

  closeSettings() {
    this.settingsScreen.classList.add('off');
  }

  private countUpScore(score: number) {
    const el = byId('final-score');
    cancelAnimationFrame(this.countUp);
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 1000 / COUNT_UP_TIME);
      el.textContent = String(Math.round(score * (1 - (1 - t) ** 3)));
      if (t < 1) this.countUp = requestAnimationFrame(step);
    };
    step(start);
  }

  private burstConfetti() {
    this.confetti.replaceChildren();
    for (let i = 0; i < CONFETTI; i++) {
      const piece = document.createElement('i');
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      piece.style.animationDelay = `${Math.random() * 0.6}s`;
      piece.style.animationDuration = `${1.8 + Math.random() * 1.4}s`;
      piece.style.setProperty('--drift', `${(Math.random() - 0.5) * 160}px`);
      piece.style.setProperty('--spin', `${(Math.random() - 0.5) * 1440}deg`);
      piece.addEventListener('animationend', () => piece.remove());
      this.confetti.appendChild(piece);
    }
  }

  private wireSettings() {
    for (const key of ['music', 'sfx'] as const) {
      byId<HTMLInputElement>(`set-${key}`).addEventListener('input', (e) => {
        this.settings.set(key, Number((e.target as HTMLInputElement).value) / 100);
      });
    }
    for (const key of ['vibration', 'tutorial'] as const) {
      byId(`set-${key}`).addEventListener('click', () => {
        this.settings.set(key, !this.settings.data[key]);
        if (key === 'vibration') this.settings.haptic('tap');
        this.syncSettings();
      });
    }
    for (const btn of byId('set-quality').querySelectorAll<HTMLButtonElement>('button')) {
      btn.addEventListener('click', () => {
        this.settings.set('quality', btn.dataset.value as QualityMode);
        this.syncSettings();
      });
    }
  }

  private syncSettings() {
    const d = this.settings.data;
    byId<HTMLInputElement>('set-music').value = String(Math.round(d.music * 100));
    byId<HTMLInputElement>('set-sfx').value = String(Math.round(d.sfx * 100));
    byId('set-vibration').setAttribute('aria-checked', String(d.vibration));
    byId('set-tutorial').setAttribute('aria-checked', String(d.tutorial));
    for (const btn of byId('set-quality').querySelectorAll<HTMLButtonElement>('button')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.value === d.quality));
    }
  }
}

/** Click handler that also drops focus, so Enter later can't re-press a hidden button. */
function onClick(id: string, fn: () => void) {
  const el = byId(id);
  el.addEventListener('click', () => {
    el.blur();
    fn();
  });
}
