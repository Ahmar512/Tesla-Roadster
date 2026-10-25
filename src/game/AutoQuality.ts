export interface QualityLevel {
  pixelRatio: number;
  outlines: boolean;
  particles: number;
}

const LEVELS: QualityLevel[] = [
  { pixelRatio: 2, outlines: true, particles: 1 },
  { pixelRatio: 1.5, outlines: true, particles: 1 },
  { pixelRatio: 1, outlines: false, particles: 0.5 },
];

const MIN_FPS = 48;

/**
 * Watches the frame rate during play and steps quality down (never back up,
 * to avoid flip-flopping) when a phone can't hold a smooth frame rate.
 */
export class AutoQuality {
  fps = 60;
  level = 0;
  private frames = 0;
  private time = 0;
  private settle = 3; // seconds of play ignored first (shader warm-up, loading)

  constructor(private readonly apply: (level: QualityLevel) => void) {
    apply(LEVELS[0]);
  }

  /** Call every frame with the real, unclamped frame time. */
  sample(dt: number, playing: boolean) {
    this.frames++;
    this.time += dt;
    if (this.time < 1) return;

    this.fps = this.frames / this.time;
    this.frames = 0;
    this.time = 0;
    if (!playing) return;
    if (this.settle > 0) {
      this.settle--;
      return;
    }

    if (this.fps < MIN_FPS && this.level < LEVELS.length - 1) {
      this.level++;
      this.apply(LEVELS[this.level]);
      this.settle = 2;
    }
  }
}
