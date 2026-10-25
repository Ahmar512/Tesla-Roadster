import type { Action } from '../game/Input';
import { POWER_UPS, type PowerUpType } from '../game/PowerUps';

const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const POP_EVERY = 100; // the score bounces each time it passes a multiple of this
const ENDING_SOON = 0.2; // power-up icons blink in their last 20%

const TUTORIAL_TEXT: Record<Action, { arrow: string; text: string; key: string }> = {
  left: { arrow: '⬅', text: 'SWIPE LEFT', key: '←' },
  right: { arrow: '➡', text: 'SWIPE RIGHT', key: '→' },
  up: { arrow: '⬆', text: 'SWIPE UP TO HOP', key: '↑' },
  down: { arrow: '⬇', text: 'SWIPE DOWN TO DUCK', key: '↓' },
};

/**
 * In-game DOM overlay: score, cells, power-up timers, popups, the pause
 * button, the 3-2-1 countdown and tutorial prompts. Which parts show is
 * driven by CSS from `body[data-state]`.
 */
export class Hud {
  private readonly score = byId('score');
  private readonly cells = byId('cells');
  private readonly multiplier = byId('multiplier');
  private readonly powerups = byId('powerups');
  private readonly popups = byId('popups');
  private readonly countdown = byId('countdown');
  private readonly tutorial = byId('tutorial-prompt');
  private readonly timers = new Map<PowerUpType, { row: HTMLElement; fill: HTMLElement }>();
  private readonly showKeys = matchMedia('(hover: hover) and (pointer: fine)').matches;
  private shownScore = -1;
  private shownCells = -1;
  private shownCount = 0;

  constructor(onPause: () => void) {
    const pause = byId('pause-btn');
    pause.addEventListener('click', () => {
      pause.blur();
      onPause();
    });
  }

  /** Clears everything for a fresh run. */
  reset() {
    this.setScore(0);
    this.setCells(0);
    this.setMultiplier(false);
    this.setPowerUps([]);
    this.showTutorial(null);
    this.setCountdown(0);
  }

  /** Shows a big 3-2-1 number; 0 hides it. */
  setCountdown(n: number) {
    if (n === this.shownCount) return;
    this.shownCount = n;
    this.countdown.textContent = n > 0 ? String(n) : '';
    this.countdown.classList.toggle('hidden', n <= 0);
    if (n > 0) restartAnimation(this.countdown, 'tick');
  }

  /** Tutorial prompt for the move to make, or null to hide it. */
  showTutorial(action: Action | null) {
    this.tutorial.classList.toggle('hidden', !action);
    if (!action) return;
    const t = TUTORIAL_TEXT[action];
    this.tutorial.dataset.action = action;
    byId('tutorial-arrow').textContent = t.arrow;
    byId('tutorial-text').textContent = t.text;
    byId('tutorial-key').textContent = this.showKeys ? `or press ${t.key}` : '';
  }

  setScore(score: number) {
    if (score === this.shownScore) return;
    if (Math.floor(score / POP_EVERY) > Math.floor(this.shownScore / POP_EVERY) && this.shownScore >= 0) {
      restartAnimation(this.score, 'pop');
    }
    this.shownScore = score;
    this.score.textContent = String(score);
  }

  setCells(cells: number) {
    if (cells === this.shownCells) return;
    this.shownCells = cells;
    this.cells.textContent = String(cells);
  }

  setMultiplier(on: boolean) {
    this.multiplier.classList.toggle('hidden', !on);
  }

  /** Bottom-left power-up icons with draining timer bars. */
  setPowerUps(active: { type: PowerUpType; fraction: number }[]) {
    for (const [type, timer] of this.timers) {
      if (!active.some((a) => a.type === type)) {
        timer.row.remove();
        this.timers.delete(type);
      }
    }
    for (const { type, fraction } of active) {
      let timer = this.timers.get(type);
      if (!timer) {
        timer = createTimer(type);
        this.powerups.appendChild(timer.row);
        this.timers.set(type, timer);
      }
      timer.fill.style.transform = `scaleX(${fraction})`;
      timer.row.classList.toggle('ending', POWER_UPS[type].duration > 0 && fraction < ENDING_SOON);
    }
  }

  /** Floating text in the middle of the screen, e.g. "NEAR MISS +50". */
  popup(text: string, big = false) {
    const el = document.createElement('div');
    el.className = big ? 'popup big' : 'popup';
    el.textContent = text;
    el.addEventListener('animationend', () => el.remove());
    this.popups.appendChild(el);
  }
}

function createTimer(type: PowerUpType) {
  const info = POWER_UPS[type];
  const row = document.createElement('div');
  row.className = 'powerup';
  const icon = document.createElement('div');
  icon.className = 'powerup-icon';
  icon.style.background = info.color;
  icon.textContent = info.icon;
  row.appendChild(icon);

  const fill = document.createElement('div');
  fill.className = 'powerup-fill';
  fill.style.background = info.color;
  if (info.duration > 0) {
    const bar = document.createElement('div');
    bar.className = 'powerup-bar';
    bar.appendChild(fill);
    row.appendChild(bar);
  }
  return { row, fill };
}

export function restartAnimation(el: HTMLElement, className: string) {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}
