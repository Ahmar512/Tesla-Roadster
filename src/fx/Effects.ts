import * as THREE from 'three';
import { NOZZLES } from '../player/Player';
import { Particles } from './Particles';
import { SpeedLines } from './SpeedLines';

const DUST = 0xdcd5c6;

/** All the "juice": thruster flames, dust, smoke, crash sparks, speed lines. */
export class Effects {
  /** 0..1; lower quality emits fewer particles. */
  quality = 1;
  private readonly glow = new Particles(300, THREE.AdditiveBlending);
  private readonly smoke = new Particles(240, THREE.NormalBlending);
  private readonly speedLines: SpeedLines;
  private thrustCarry = 0;

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    scene.add(this.smoke.points, this.glow.points);
    this.speedLines = new SpeedLines(camera);
  }

  setViewport(heightPx: number, fovDeg: number) {
    this.glow.setViewport(heightPx, fovDeg);
    this.smoke.setViewport(heightPx, fovDeg);
  }

  /** Big flame burst plus a dust ring when the thrusters fire. */
  thrusterBurst(x: number, y: number) {
    for (const nx of NOZZLES.x) {
      const at: [number, number, number] = [x + nx, y + NOZZLES.y, NOZZLES.z];
      this.glow.emit({ at, count: 10, spread: 0.08, velocity: [0, -5, 5], jitter: 2, size: 0.55, endSize: 0.1, life: 0.3, color: 0xffa040, worldLocked: true }, this.quality);
      this.glow.emit({ at, count: 6, spread: 0.05, velocity: [0, -4, 4], jitter: 1, size: 0.35, endSize: 0.05, life: 0.2, color: 0x7fd8ff, worldLocked: true }, this.quality);
    }
    this.smoke.emit({ at: [x, 0.15, 1], count: 12, spread: 0.6, velocity: [0, 0.6, 0], jitter: 2.5, size: 0.6, endSize: 1.8, life: 0.6, color: DUST, alpha: 0.55, drag: 3, worldLocked: true }, this.quality);
  }

  /** Continuous flames while airborne; call every frame. */
  thrusterTrail(dt: number, x: number, y: number) {
    this.thrustCarry += dt * 60 * this.quality; // particles per second, per nozzle
    const count = Math.floor(this.thrustCarry);
    if (count === 0) return;
    this.thrustCarry -= count;
    for (const nx of NOZZLES.x) {
      const at: [number, number, number] = [x + nx, y + NOZZLES.y, NOZZLES.z];
      this.glow.emit({ at, count, spread: 0.05, velocity: [0, -1.5, 4], jitter: 0.6, size: 0.45, endSize: 0.05, life: 0.22, color: 0xff9a3c, worldLocked: true });
      this.glow.emit({ at, count, spread: 0.03, velocity: [0, -1, 3], jitter: 0.3, size: 0.25, endSize: 0.05, life: 0.12, color: 0x9fe4ff, worldLocked: true });
    }
  }

  landing(x: number) {
    this.smoke.emit({ at: [x, 0.15, 0], count: 14, spread: 1.0, velocity: [0, 0.8, 0], jitter: 2.2, size: 0.5, endSize: 1.6, life: 0.55, color: DUST, alpha: 0.6, drag: 3.5, worldLocked: true }, this.quality);
  }

  laneChange(x: number, direction: number) {
    this.smoke.emit({ at: [x - direction * 0.6, 0.2, 1.4], count: 5, spread: 0.2, velocity: [-direction * 2, 0.6, 1], jitter: 0.6, size: 0.45, endSize: 1.2, life: 0.4, color: 0xe8e4dc, alpha: 0.5, drag: 3, worldLocked: true }, this.quality);
  }

  crash(x: number, y: number) {
    const at: [number, number, number] = [x, y + 0.7, -1.9];
    this.glow.emit({ at, count: 45, spread: 0.3, velocity: [0, 4, 2], jitter: 8, size: 0.22, endSize: 0.05, life: 0.6, color: 0xffd46b, gravity: 14 }, this.quality);
    this.glow.emit({ at, count: 6, spread: 0.2, size: 2.2, endSize: 3.5, life: 0.18, color: 0xffb347 }, this.quality);
    this.smoke.emit({ at, count: 18, spread: 0.6, velocity: [0, 1.6, 0.5], jitter: 1.2, size: 1, endSize: 3.2, life: 1.3, color: 0x5a5a62, alpha: 0.55, drag: 1.5 }, this.quality);
    this.smoke.emit({ at, count: 16, spread: 0.3, velocity: [0, 5, 2], jitter: 5, size: 0.25, life: 0.9, color: 0x2a2a30, gravity: 18 }, this.quality);
  }

  /** Sparkle when an energy cell is collected. */
  collect(x: number, y: number, z: number) {
    this.glow.emit({ at: [x, y, z], count: 6, spread: 0.15, jitter: 3, size: 0.3, endSize: 0.05, life: 0.3, color: 0x7fe8ff });
  }

  powerUp(x: number, y: number, color: THREE.ColorRepresentation) {
    this.glow.emit({ at: [x, y, 0], count: 30, spread: 0.3, jitter: 6, size: 0.4, endSize: 0.05, life: 0.5, color }, this.quality);
    this.glow.emit({ at: [x, y, 0], count: 4, size: 2.5, endSize: 4, life: 0.25, color: 0xffffff, alpha: 0.6 });
  }

  shieldBreak(x: number, y: number) {
    this.glow.emit({ at: [x, y + 0.6, 0], count: 40, spread: 1, jitter: 7, size: 0.35, endSize: 0.05, life: 0.6, color: 0x66d9ff }, this.quality);
  }

  /** Dust and sparks where an obstacle got smashed out of the way. */
  smash(x: number, y: number) {
    this.glow.emit({ at: [x, y + 0.6, -2], count: 20, spread: 0.4, velocity: [0, 3, 0], jitter: 6, size: 0.2, endSize: 0.05, life: 0.45, color: 0xffd46b, gravity: 12 }, this.quality);
    this.smoke.emit({ at: [x, y + 0.4, -2], count: 8, spread: 0.6, velocity: [0, 1.2, 0], jitter: 1.5, size: 0.8, endSize: 2.2, life: 0.7, color: DUST, alpha: 0.5, drag: 2, worldLocked: true }, this.quality);
  }

  /** `speedIntensity` 0..1 fades in the speed lines. */
  update(dt: number, dz: number, speedIntensity: number, speed: number) {
    this.glow.update(dt, dz);
    this.smoke.update(dt, dz);
    this.speedLines.update(dt, speedIntensity, speed);
  }
}
