import { POWER_UP_TYPES, POWER_UPS, type PowerUpType } from '../game/PowerUps';
import { describeUpgrade, MAX_UPGRADE, PAINTS, SKINS, type SkinId } from '../meta/catalog';
import type { Meta } from '../meta/Meta';

const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

type Tab = 'paint' | 'skins' | 'upgrades';

/** Little swatches for the skin cards. */
const SKIN_SWATCH: Record<SkinId, string> = {
  none: 'var(--paint)',
  stripes: 'linear-gradient(90deg, var(--paint) 30%, #fff 30% 42%, var(--paint) 42% 58%, #fff 58% 70%, var(--paint) 70%)',
  twotone: 'linear-gradient(180deg, #26262e 50%, var(--paint) 50%)',
  flames: 'linear-gradient(160deg, #ffd84a 15%, #ff7a1a 40%, var(--paint) 60%)',
  neon: 'radial-gradient(circle at 50% 120%, #33f0ff 35%, var(--paint) 70%)',
  chrome: 'linear-gradient(160deg, #f4f7fb 20%, #8a94a3 55%, #c9d0da 80%)',
  gold: 'linear-gradient(160deg, #fff1a8 15%, #c8901c 55%, #f4c542 80%)',
};

const cellPrice = (n: number) => `<span class="cell-icon"></span>${n.toLocaleString('en-US')}`;

/**
 * The garage: buy and equip paints and skins (previewed live on the car),
 * and buy power-up upgrades.
 */
export class Garage {
  /** Shows a look on the car without buying it. */
  onPreview?: (paint: number, skin: SkinId) => void;
  onPurchase?: () => void;
  onDenied?: () => void;
  private tab: Tab = 'paint';
  private paint = PAINTS[0].id;
  private skin: SkinId = 'none';
  private readonly items = byId('garage-items');
  private readonly name = byId('garage-name');
  private readonly action = byId<HTMLButtonElement>('garage-action');

  constructor(private readonly meta: Meta) {
    for (const btn of byId('garage-tabs').querySelectorAll<HTMLButtonElement>('button')) {
      btn.addEventListener('click', () => {
        this.tab = btn.dataset.tab as Tab;
        this.render();
      });
    }
    this.action.addEventListener('click', () => this.buyOrEquip());
  }

  open() {
    this.paint = this.meta.data.paint;
    this.skin = this.meta.data.skin;
    this.render();
  }

  /** Puts the equipped look back on the car (leaving without buying). */
  close() {
    this.preview(this.meta.data.paint, this.meta.data.skin);
  }

  private preview(paint: string, skin: SkinId) {
    this.onPreview?.(PAINTS.find((p) => p.id === paint)!.color, skin);
  }

  private render() {
    const { data } = this.meta;
    for (const btn of byId('garage-tabs').querySelectorAll('button')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.tab === this.tab));
    }
    const upgrades = this.tab === 'upgrades';
    this.name.classList.toggle('hidden', upgrades);
    this.action.classList.toggle('hidden', upgrades);
    this.items.classList.toggle('upgrades', upgrades);
    this.items.style.setProperty('--paint', hex(PAINTS.find((p) => p.id === this.paint)!.color));
    this.items.replaceChildren();
    if (upgrades) {
      for (const type of POWER_UP_TYPES) this.items.appendChild(this.upgradeRow(type));
      return;
    }

    const list = this.tab === 'paint' ? PAINTS : SKINS;
    const selected = this.tab === 'paint' ? this.paint : this.skin;
    const owned: string[] = this.tab === 'paint' ? data.paints : data.skins;
    const equipped = this.tab === 'paint' ? data.paint : data.skin;
    for (const item of list) {
      const card = document.createElement('button');
      card.className = 'item';
      card.setAttribute('aria-pressed', String(item.id === selected));
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = 'color' in item ? hex(item.color) : SKIN_SWATCH[item.id];
      const label = document.createElement('span');
      label.className = 'item-price';
      label.innerHTML = item.id === equipped ? '✓' : owned.includes(item.id) ? 'OWNED' : cellPrice(item.price);
      card.append(swatch, label);
      card.addEventListener('click', () => {
        if (this.tab === 'paint') this.paint = item.id;
        else this.skin = item.id as SkinId;
        this.preview(this.paint, this.skin);
        this.render();
      });
      this.items.appendChild(card);
    }

    const item = list.find((i) => i.id === selected)!;
    this.name.textContent = item.name;
    this.action.disabled = false;
    this.action.classList.remove('cant-afford');
    if (item.id === equipped) {
      this.action.textContent = 'EQUIPPED';
      this.action.disabled = true;
    } else if (owned.includes(item.id)) {
      this.action.textContent = 'EQUIP';
    } else {
      this.action.innerHTML = `BUY ${cellPrice(item.price)}`;
      this.action.classList.toggle('cant-afford', data.cells < item.price);
    }
  }

  private buyOrEquip() {
    const ok = this.tab === 'paint' ? this.meta.choosePaint(this.paint) : this.meta.chooseSkin(this.skin);
    if (ok) this.onPurchase?.();
    else this.onDenied?.();
    this.render();
  }

  private upgradeRow(type: PowerUpType) {
    const info = POWER_UPS[type];
    const level = this.meta.data.upgrades[type];
    const price = this.meta.upgradePrice(type);
    const row = document.createElement('div');
    row.className = 'upgrade';
    const pips = Array.from({ length: MAX_UPGRADE }, (_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('');
    const next = level < MAX_UPGRADE ? ` → ${describeUpgrade(type, level + 1)}` : '';
    row.innerHTML = `
      <span class="upgrade-icon" style="background:${info.color}">${info.icon}</span>
      <span class="upgrade-info">
        <span class="upgrade-name">${info.label.replace('!', '')}</span>
        <span class="pips">${pips}</span>
        <span class="upgrade-desc">${describeUpgrade(type, level)}${next}</span>
      </span>`;
    const buy = document.createElement('button');
    buy.className = 'btn btn-small btn-green';
    if (price === null) {
      buy.textContent = 'MAX';
      buy.disabled = true;
    } else {
      buy.innerHTML = cellPrice(price);
      buy.classList.toggle('cant-afford', this.meta.data.cells < price);
      buy.addEventListener('click', () => {
        if (this.meta.buyUpgrade(type)) this.onPurchase?.();
        else this.onDenied?.();
        this.render();
      });
    }
    row.appendChild(buy);
    return row;
  }
}

function hex(color: number) {
  return `#${color.toString(16).padStart(6, '0')}`;
}
