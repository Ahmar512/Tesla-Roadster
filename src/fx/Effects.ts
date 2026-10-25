import * as THREE from 'three';
import { LIFT_JET_Y, LIFT_JETS, NOZZLES, ROLL_PIVOT } from '../player/Player';
import { Particles } from './Particles';
import { SpeedLines } from './SpeedLines';

const DUST = 0xdcd5c6;
const VAPOR = 0xf4f8ff; // thruster exhaust: white vapor, like a cold-gas jet
const JET_CORE = 0xcfe8ff; // the bright spot right at each jet
const JET_SPEED = 14;

/** All the "juice": thruster vapor, dust, smoke, crash sparks, speed lines. */
export class Effects {
  /** 0..1; lower quality emits fewer particles. */
  quality = 1;
  private readonly glow = new Particles(300, THREE.AdditiveBlending);
  private readonly smoke = new Particles(520, THREE.NormalBlending);
  private readonly speedLines: SpeedLines;
  private thrustCarry = 0;
  private nitroCarry = 0;
  private gunCarry = 0;
  private readonly jetAt: [number, number, number] = [0, 0, 0];

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    scene.add(this.smoke.points, this.glow.points);
    this.speedLines = new SpeedLines(camera);
  }

  setViewport(heightPx: number, fovDeg: number) {
    this.glow.setViewport(heightPx, fovDeg);
    this.smoke.setViewport(heightPx, fovDeg);
  }

  /** Lift-off: a blast of white vapor from the four lift jets and a billow of smoke off the road. */
  thrusterBurst(x: number, y: number) {
    for (const [jx, jz] of LIFT_JETS) {
      const at: [number, number, number] = [x + jx, y + LIFT_JET_Y, jz];
      this.smoke.emit({ at, count: 10, spread: 0.08, velocity: [0, -JET_SPEED, 0], jitter: 1.5, size: 0.35, endSize: 1.4, life: 0.35, color: VAPOR, alpha: 1, drag: 3 }, this.quality);
      this.glow.emit({ at, count: 4, spread: 0.05, velocity: [0, -10, 0], jitter: 0.5, size: 0.4, endSize: 0.1, life: 0.12, color: JET_CORE }, this.quality);
    }
    this.smoke.emit({ at: [x, 0.3, 0], count: 24, spread: 1.4, velocity: [0, 0.8, 0], jitter: 3.5, size: 0.9, endSize: 3, life: 0.9, color: VAPOR, alpha: 0.85, drag: 3, worldLocked: true }, this.quality);
  }

  /**
   * White vapor jets pointing down from under the car while it's airborne;
   * call every frame. `roll` is the car's barrel-roll angle, so the jets
   * turn with the car through the hop roll.
   */
  thrusterTrail(dt: number, x: number, y: number, roll = 0) {
    this.thrustCarry += dt * 110 * this.quality; // particles per second, per jet
    const count = Math.floor(this.thrustCarry);
    if (count === 0) return;
    this.thrustCarry -= count;
    const cos = Math.cos(roll);
    const sin = Math.sin(roll);
    const dy = LIFT_JET_Y - ROLL_PIVOT;
    // "Down" in the car's frame, rotated with the roll.
    const down: [number, number, number] = [sin * JET_SPEED, -cos * JET_SPEED, 0];
    for (const [jx, jz] of LIFT_JETS) {
      // The jet's position rotated round the roll axis.
      const at: [number, number, number] = [x + jx * cos - dy * sin, y + ROLL_PIVOT + jx * sin + dy * cos, jz];
      // The column moves with the car (not locked to the road), so it hangs
      // straight down like a real lift jet; it widens as it slows. This
      // frame's particles are spread along the jet so it stays one solid
      // column even when the frame rate drops.
      for (let i = 0; i < count; i++) {
        const along = Math.random() * dt;
        this.jetAt[0] = at[0] + down[0] * along;
        this.jetAt[1] = at[1] + down[1] * along;
        this.jetAt[2] = at[2];
        this.smoke.emit({ at: this.jetAt, count: 1, spread: 0.04, velocity: down, jitter: 0.5, size: 0.25, endSize: 1.1, life: 0.26, color: VAPOR, alpha: 1, drag: 3 });
      }
      this.glow.emit({ at, count, spread: 0.02, velocity: down, jitter: 0.1, size: 0.3, endSize: 0.1, life: 0.07, color: JET_CORE });
      // Where a jet reaches the road it spreads out into a cloud that's left behind.
      if (y < 4 && Math.random() < 0.5) {
        this.smoke.emit({ at: [at[0], 0.2, jz], count: 1, spread: 0.3, velocity: [0, 0.6, 0], jitter: 2.5, size: 0.8, endSize: 2.4, life: 0.6, color: VAPOR, alpha: 0.75, drag: 3, worldLocked: true });
      }
    }
  }

  /** Nitro: white vapor streaming straight back from the rear nozzles; call every frame. */
  nitroTrail(dt: number, x: number, y: number) {
    this.nitroCarry += dt * 90 * this.quality;
    const count = Math.floor(this.nitroCarry);
    if (count === 0) return;
    this.nitroCarry -= count;
    for (const nx of NOZZLES.x) {
      const at: [number, number, number] = [x + nx, y + NOZZLES.y, NOZZLES.z];
      for (let i = 0; i < count; i++) {
        this.jetAt[0] = at[0];
        this.jetAt[1] = at[1];
        this.jetAt[2] = at[2] + JET_SPEED * Math.random() * dt;
        this.smoke.emit({ at: this.jetAt, count: 1, spread: 0.05, velocity: [0, 0, JET_SPEED], jitter: 0.5, size: 0.25, endSize: 1.1, life: 0.25, color: VAPOR, alpha: 1, drag: 2, worldLocked: true });
      }
      this.glow.emit({ at, count, spread: 0.03, velocity: [0, 0, 6], jitter: 0.2, size: 0.3, endSize: 0.06, life: 0.06, color: JET_CORE, worldLocked: true });
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

  /**
   * Helicopter gunfire raking a lane: tracers from the gun down to the road
   * and sparks and dust where they hit; call every frame while firing.
   */
  gunfire(dt: number, gun: THREE.Vector3, laneX: number) {
    this.gunCarry += dt * 55 * this.quality; // rounds per second
    const count = Math.floor(this.gunCarry);
    this.gunCarry -= count;
    for (let i = 0; i < count; i++) {
      const hitX = laneX + (Math.random() - 0.5) * 1.6;
      const hitZ = 3 - Math.random() * 16;
      const flight = 0.1; // seconds for a tracer to reach the road
      const from: [number, number, number] = [gun.x, gun.y - 1, gun.z];
      this.glow.emit({ at: from, count: 1, velocity: [(hitX - gun.x) / flight, (0.1 - from[1]) / flight, (hitZ - gun.z) / flight], size: 0.55, endSize: 0.35, life: flight, color: 0xffe08a });
      const at: [number, number, number] = [hitX, 0.15, hitZ];
      this.glow.emit({ at, count: 6, spread: 0.1, velocity: [0, 4, 0], jitter: 4, size: 0.25, endSize: 0.05, life: 0.25, color: 0xffd46b, gravity: 16 });
      this.smoke.emit({ at, count: 1, spread: 0.2, velocity: [0, 1.2, 0], jitter: 1, size: 0.4, endSize: 1.3, life: 0.45, color: DUST, alpha: 0.6, drag: 3, worldLocked: true });
    }
  }

  /** `speedIntensity` 0..1 fades in the speed lines. */
  update(dt: number, dz: number, speedIntensity: number, speed: number) {
    this.glow.update(dt, dz);
    this.smoke.update(dt, dz);
    this.speedLines.update(dt, speedIntensity, speed);
  }
}
