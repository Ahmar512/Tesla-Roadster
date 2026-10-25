import { ACHIEVEMENTS } from '../meta/achievements';
import { DAILY_REWARDS } from '../meta/catalog';
import type { Meta } from '../meta/Meta';

const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const TOAST_TIME = 3200; // ms

/** Missions, trophies and daily reward panels, plus in-game toasts. */
export class MetaPanels {
  onClaim?: () => void;
  private readonly modals = ['missions-screen', 'trophies-screen', 'daily-screen'].map((id) => byId(id));
  private readonly toasts = byId('toasts');

  constructor(private readonly meta: Meta) {
    for (const modal of this.modals) {
      modal.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target === modal || target.classList.contains('modal-close')) modal.classList.add('off');
      });
    }
    byId('daily-claim').addEventListener('click', () => {
      this.meta.claimDailyReward();
      byId('daily-screen').classList.add('off');
      this.onClaim?.();
    });
  }

  get anyOpen() {
    return this.modals.some((m) => !m.classList.contains('off'));
  }

  closeAll() {
    for (const modal of this.modals) modal.classList.add('off');
  }

  openMissions() {
    byId('missions-mult').textContent = String(this.meta.data.multiplier);
    byId('missions-list').replaceChildren(
      ...this.meta.missions.map((m) => {
        const li = document.createElement('li');
        li.className = m.done ? 'done' : '';
        li.innerHTML = `
          <span class="mission-text"></span>
          <span class="mission-reward"><span class="cell-icon"></span>${m.reward}</span>
          <span class="progress"><i style="transform: scaleX(${m.progress / m.target})"></i></span>
          <span class="mission-count">${m.done ? 'DONE!' : `${fmt(m.progress)} / ${fmt(m.target)}`}</span>`;
        li.querySelector('.mission-text')!.textContent = m.text;
        return li;
      }),
    );
    byId('missions-screen').classList.remove('off');
  }

  openTrophies() {
    const unlocked = this.meta.data.achievements;
    byId('trophies-count').textContent = `${unlocked.length} / ${ACHIEVEMENTS.length}`;
    byId('trophies-list').replaceChildren(
      ...ACHIEVEMENTS.map((a) => {
        const li = document.createElement('li');
        li.className = unlocked.includes(a.id) ? 'unlocked' : '';
        li.innerHTML = `<span class="trophy-icon">${a.icon}</span><span class="trophy-name">${a.name}</span><span class="trophy-text">${a.text}</span>`;
        return li;
      }),
    );
    byId('trophies-screen').classList.remove('off');
  }

  /** Shows the daily reward calendar if today's reward hasn't been claimed. */
  openDailyIfDue() {
    const reward = this.meta.dailyReward;
    if (!reward) return false;
    byId('daily-days').replaceChildren(
      ...DAILY_REWARDS.map((cells, i) => {
        const li = document.createElement('li');
        const day = i + 1;
        li.className = day < reward.day ? 'claimed' : day === reward.day ? 'today' : '';
        li.innerHTML = `<span class="day">DAY ${day}</span><span class="cell-icon"></span><span>${fmt(cells)}</span>`;
        return li;
      }),
    );
    byId('daily-claim').innerHTML = `CLAIM <span class="cell-icon"></span>${fmt(reward.cells)}`;
    byId('daily-screen').classList.remove('off');
    return true;
  }

  /** Cells, multiplier and the missions badge on the title screen. */
  refreshTitle() {
    const { data } = this.meta;
    byId('title-cells').textContent = fmt(data.cells);
    byId('title-mult').textContent = String(data.multiplier);
    byId('garage-cells').textContent = fmt(data.cells);
    const done = data.missions.active.filter((m) => m.done).length;
    const badge = byId('missions-badge');
    badge.textContent = `${done}/${data.missions.active.length}`;
    badge.classList.toggle('hidden', data.missions.active.length === 0);
  }

  /** A banner that slides down from the top, e.g. "MISSION COMPLETE". */
  toast(icon: string, title: string, text: string) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-body"><b></b><span></span></span>`;
    el.querySelector('b')!.textContent = title;
    el.querySelector('.toast-body span')!.innerHTML = text;
    this.toasts.appendChild(el);
    setTimeout(() => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 400);
    }, TOAST_TIME);
  }
}

function fmt(n: number) {
  return Math.floor(n).toLocaleString('en-US');
}
