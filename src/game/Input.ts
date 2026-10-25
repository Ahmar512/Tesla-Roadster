export type Action = 'left' | 'right' | 'up' | 'down';

const SWIPE_THRESHOLD = 28; // pixels

const KEYS: Record<string, Action> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  Space: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
};

/**
 * Turns swipes and arrow keys into game actions. A swipe fires as soon as the
 * finger has moved far enough (not on release), so controls feel instant, and
 * actions are queued so a quick swipe mid-jump is never lost.
 */
export class Input {
  private queue: Action[] = [];
  private startX = 0;
  private startY = 0;
  private tracking = false;

  constructor() {
    window.addEventListener('touchstart', this.onTouchStart, { passive: true });
    window.addEventListener('touchmove', this.onTouchMove, { passive: true });
    window.addEventListener('touchend', this.onTouchEnd, { passive: true });
    window.addEventListener('keydown', this.onKeyDown);
  }

  consume(): Action[] {
    const actions = this.queue;
    this.queue = [];
    return actions;
  }

  private onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    this.startX = t.clientX;
    this.startY = t.clientY;
    this.tracking = true;
  };

  private onTouchMove = (e: TouchEvent) => {
    if (!this.tracking) return;
    const t = e.touches[0];
    const dx = t.clientX - this.startX;
    const dy = t.clientY - this.startY;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return;

    if (Math.abs(dx) > Math.abs(dy)) this.queue.push(dx > 0 ? 'right' : 'left');
    else this.queue.push(dy > 0 ? 'down' : 'up');
    this.tracking = false;
  };

  private onTouchEnd = () => {
    this.tracking = false;
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const action = KEYS[e.code];
    if (!action || e.repeat) return;
    e.preventDefault();
    this.queue.push(action);
  };
}
