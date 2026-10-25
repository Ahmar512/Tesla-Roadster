import { POWER_UPS, type PowerUpType } from '../game/PowerUps';

const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const POP_EVERY = 100; // the score bounces each time it passes a multiple of this
const ENDING_SOON = 0.2; // power-up icons blink in their last 20%

/** DOM overlay: score, cells, power-up timers, popups, title and game-over screens. */
export class Hud {
  private readonly hud = byId('hud');
  private readonly score = byId('score');
  private readonly cells = byId('cells');
  private readonly multiplier = byId('multiplier');
  private readonly powerups = byId('powerups');
  private readonly popups = byId('popups');
  private readonly titleScreen = byId('title-screen');
  private readonly titleBest = byId('title-best');
  private readonly titleCells = byId('title-cells');
  private readonly overScreen = byId('over-screen');
  private readonly overTitle = byId('over-title');
  private readonly finalScore = byId('final-score');
  private readonly runCells = byId('run-cells');
  private readonly overBest = byId('over-best');
  private readonly newBest = byId('new-best');
  private readonly timers = new Map<PowerUpType, { row: HTMLElement; fill: HTMLElement }>();
  private shownScore = -1;
  private shownCells = -1;

  constructor(onPlay: () => void) {
    byId('play-btn').addEventListener('click', onPlay);
    byId('retry-btn').addEventListener('click', onPlay);
  }

  showTitle(best: number, totalCells: number) {
    this.titleBest.textContent = String(best);
    this.titleCells.textContent = String(totalCells);
    this.titleScreen.classList.remove('off');
    this.overScreen.classList.add('off');
    this.hud.classList.add('hidden');
    this.powerups.classList.add('hidden');
  }

  showPlaying() {
    this.titleScreen.classList.add('off');
    this.overScreen.classList.add('off');
    this.hud.classList.remove('hidden');
    this.powerups.classList.remove('hidden');
    this.setScore(0);
    this.setCells(0);
    this.setMultiplier(false);
    this.setPowerUps([]);
  }

  showGameOver(score: number, best: number, isNewBest: boolean, cells: number, caught: boolean) {
    this.overTitle.textContent = caught ? 'BUSTED!' : 'CRASHED!';
    this.finalScore.textContent = String(score);
    this.runCells.textContent = String(cells);
    this.overBest.textContent = String(best);
    this.newBest.classList.toggle('hidden', !isNewBest);
    this.overScreen.classList.remove('off');
    this.powerups.classList.add('hidden');
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

function restartAnimation(el: HTMLElement, className: string) {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}
