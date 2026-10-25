import * as THREE from 'three';
import {
  BOUNCE_VELOCITY,
  DUCK_TIME,
  FAST_FALL_VELOCITY,
  FLIGHT_HEIGHT,
  GRAVITY,
  JUMP_VELOCITY,
  LANE_CHANGE_SHARPNESS,
  LANES,
  PLAYER,
  PLAYER_COLOR,
} from '../config';
import type { Action } from '../game/Input';
import { extrudeSide, mergeParts, wheelParts } from '../render/geometry';
import { curved, glowMaterial, outlineMaterial, vehicleMaterial } from '../render/materials';
import { createBlobShadow } from '../render/shadow';

const WHEEL_RADIUS = 0.33;

/** Thruster nozzle positions relative to the car, used to emit flames. */
export const NOZZLES = { x: [-0.35, 0.35], y: 0.42, z: 2.15 };

const NOZZLE_IDLE = new THREE.Color(0x8a2a00);
const NOZZLE_HOT = new THREE.Color(0xffe2a0);

export interface PlayerEvents {
  jump(): void;
  land(): void;
  laneChange(direction: number): void;
}

/**
 * The player's roadster. It stays at z = 0 while the world scrolls past;
 * only its lane (x), height (y) and duck state change.
 */
export class Player {
  readonly object = new THREE.Group();
  events?: PlayerEvents;
  flying = false;

  private readonly model = new THREE.Group();
  private readonly wheels: THREE.Mesh[] = [];
  private readonly nozzleMaterial = curved(new THREE.MeshBasicMaterial({ color: NOZZLE_IDLE.clone() }));
  private readonly shadow = createBlobShadow(2.3, 4.6, true);
  private readonly shield = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 16),
    curved(new THREE.MeshBasicMaterial({ color: 0x66d9ff, transparent: true, opacity: 0.28, depthWrite: false })),
  );
  private heat = 0;
  private time = 0;

  x = 0;
  y = 0;
  private ground = 0;
  private lane = 1;
  private prevLane = 1;
  private vy = 0;
  private duckTimer = 0;
  private blinkTimer = 0;

  constructor() {
    this.buildModel();
    this.shield.scale.set(1.35, 0.95, 2.4);
    this.shield.position.y = 0.6;
    this.shield.visible = false;
    this.model.add(this.shield);
    this.object.add(this.model, this.shadow);
  }

  get onGround() {
    return !this.flying && this.y <= this.ground + 1e-3 && this.vy <= 0;
  }

  get currentLane() {
    return this.lane;
  }

  reset() {
    this.lane = this.prevLane = 1;
    this.x = LANES[this.lane];
    this.y = this.ground = 0;
    this.vy = 0;
    this.duckTimer = 0;
    this.blinkTimer = 0;
    this.flying = false;
    this.shield.visible = false;
    this.model.visible = true;
    this.model.rotation.set(0, 0, 0);
    this.model.scale.set(1, 1, 1);
  }

  handle(action: Action) {
    switch (action) {
      case 'left':
      case 'right': {
        const direction = action === 'left' ? -1 : 1;
        const lane = THREE.MathUtils.clamp(this.lane + direction, 0, LANES.length - 1);
        if (lane !== this.lane) {
          this.prevLane = this.lane;
          this.lane = lane;
          this.events?.laneChange(direction);
        }
        break;
      }
      case 'up':
        if (this.onGround) {
          this.vy = JUMP_VELOCITY;
          this.duckTimer = 0;
          this.events?.jump();
        }
        break;
      case 'down':
        if (this.flying) break;
        // Mid-air: slam back down. On the ground: duck.
        if (!this.onGround) this.vy = FAST_FALL_VELOCITY;
        this.duckTimer = DUCK_TIME;
        break;
    }
  }

  /** Bounce the car up after a crash. */
  knock() {
    this.vy = 7;
    this.duckTimer = 0;
  }

  /** Clipped something while changing lane: bounce back where we came from. */
  stumble() {
    this.lane = this.prevLane;
    this.vy = Math.max(this.vy, 4);
    this.duckTimer = 0;
  }

  /** Landed on top of a vehicle: spring off it. */
  bounce() {
    this.vy = BOUNCE_VELOCITY;
    this.duckTimer = 0;
  }

  startFlight() {
    this.flying = true;
    this.duckTimer = 0;
  }

  endFlight() {
    this.flying = false;
    this.vy = 0;
  }

  setShield(on: boolean) {
    this.shield.visible = on;
  }

  /** Flash the car (invulnerable, or a power-up about to run out). */
  blink(seconds: number) {
    this.blinkTimer = Math.max(this.blinkTimer, seconds);
  }

  /** `ground` is the height of whatever is under the car (road or carrier deck). */
  update(dt: number, speed: number, ground = 0) {
    const prevX = this.x;
    const prevY = this.y;
    this.x += (LANES[this.lane] - this.x) * (1 - Math.exp(-LANE_CHANGE_SHARPNESS * dt));
    this.ground = ground;

    if (this.flying) {
      this.y = THREE.MathUtils.damp(this.y, FLIGHT_HEIGHT, 2.5, dt);
      this.vy = 0;
    } else if (this.y <= ground + 1e-3 && this.vy <= 0) {
      this.y = ground; // driving, including up ramps
      this.vy = 0;
    } else {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= ground) {
        this.y = ground;
        this.vy = 0;
        this.model.scale.y = 0.72; // landing squash; animate() springs it back
        this.events?.land();
      }
    }
    this.duckTimer = Math.max(0, this.duckTimer - dt);

    this.blinkTimer = Math.max(0, this.blinkTimer - dt);
    this.model.visible = this.blinkTimer === 0 || Math.floor(this.blinkTimer * 12) % 2 === 0;

    const safeDt = dt > 0 ? dt : 1;
    this.animate(dt, speed, (this.x - prevX) / safeDt, (this.y - prevY) / safeDt);
  }

  /** Writes the player's current hitbox into `out`. */
  getBox(out: THREE.Box3) {
    const h = this.duckTimer > 0 ? PLAYER.duckHeight : PLAYER.height;
    out.min.set(this.x - PLAYER.width / 2, this.y, -PLAYER.length / 2);
    out.max.set(this.x + PLAYER.width / 2, this.y + h, PLAYER.length / 2);
    return out;
  }

  private animate(dt: number, speed: number, lateralVelocity: number, verticalVelocity: number) {
    const { damp } = THREE.MathUtils;
    this.time += dt;
    this.object.position.x = this.x;
    this.model.position.y = this.y;

    // Steer into lane changes, pitch up while rising, squash while ducking.
    const rot = this.model.rotation;
    rot.y = damp(rot.y, -lateralVelocity * 0.015, 14, dt);
    rot.z = damp(rot.z, -lateralVelocity * 0.006, 14, dt);
    rot.x = damp(rot.x, THREE.MathUtils.clamp(verticalVelocity * 0.012, -0.35, 0.35), 10, dt);

    const squash = damp(this.model.scale.y, this.duckTimer > 0 ? 0.55 : 1, 14, dt);
    this.model.scale.set(1 + (1 - squash) * 0.25, squash, 1);

    for (const wheel of this.wheels) wheel.rotation.x -= (speed * dt) / WHEEL_RADIUS;

    this.heat = damp(this.heat, this.onGround ? 0 : 1, 14, dt);
    this.nozzleMaterial.color.lerpColors(NOZZLE_IDLE, NOZZLE_HOT, this.heat);

    if (this.shield.visible) {
      const pulse = 1 + Math.sin(this.time * 6) * 0.04;
      this.shield.scale.set(1.35 * pulse, 0.95 * pulse, 2.4 * pulse);
    }

    // The shadow stays on the surface below and shrinks/fades as the car rises.
    const s = 1 - Math.min(this.y - this.ground, 4) * 0.12;
    this.shadow.position.y = this.ground + 0.03;
    this.shadow.scale.set(s, 1, s);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.5 * s;
  }

  /** Placeholder stylized roadster; faces -z. */
  private buildModel() {
    const body = extrudeSide(
      (s) => {
        s.moveTo(-1.95, 0.34);
        s.lineTo(1.9, 0.34);
        s.quadraticCurveTo(2.1, 0.36, 2.06, 0.5);
        s.quadraticCurveTo(1.6, 0.6, 0.6, 0.62);
        s.lineTo(-1.6, 0.66);
        s.quadraticCurveTo(-1.95, 0.66, -1.95, 0.5);
        s.closePath();
      },
      1.64,
      0.14,
    );
    const canopy = extrudeSide(
      (s) => {
        s.moveTo(0.62, 0.6);
        s.quadraticCurveTo(0.1, 0.93, -0.4, 0.95);
        s.quadraticCurveTo(-1.1, 0.95, -1.45, 0.62);
        s.closePath();
      },
      1.2,
      0.08,
    );

    const shell = mergeParts(
      [
        { geometry: body, color: PLAYER_COLOR, tag: 'paint' },
        { geometry: canopy, color: 0x1c2533 },
        { geometry: new THREE.BoxGeometry(1.3, 0.16, 0.3), color: 0x18181c, at: [0, 0.3, 1.98] }, // diffuser
        { geometry: new THREE.BoxGeometry(1.58, 0.2, 0.06), color: 0x18181c, at: [0, 0.6, 2.06] }, // taillight housing
        { geometry: new THREE.BoxGeometry(0.12, 0.1, 0.22), color: PLAYER_COLOR, at: [-0.82, 0.82, -0.35] }, // mirrors
        { geometry: new THREE.BoxGeometry(0.12, 0.1, 0.22), color: PLAYER_COLOR, at: [0.82, 0.82, -0.35] },
      ],
      true,
    ).geometry;
    this.model.add(new THREE.Mesh(shell, vehicleMaterial), new THREE.Mesh(shell, outlineMaterial));

    const lights = mergeParts([
      { geometry: new THREE.BoxGeometry(1.48, 0.1, 0.05), color: 0xff3030, at: [0, 0.6, 2.1] }, // taillight bar
      { geometry: new THREE.BoxGeometry(0.4, 0.06, 0.05), color: 0xffffff, at: [-0.55, 0.5, -2.13] },
      { geometry: new THREE.BoxGeometry(0.4, 0.06, 0.05), color: 0xffffff, at: [0.55, 0.5, -2.13] },
    ]).geometry;
    this.model.add(new THREE.Mesh(lights, glowMaterial));

    const nozzleGeo = new THREE.CylinderGeometry(0.1, 0.14, 0.25, 14).rotateX(Math.PI / 2);
    for (const x of NOZZLES.x) {
      const nozzle = new THREE.Mesh(nozzleGeo, this.nozzleMaterial);
      nozzle.position.set(x, NOZZLES.y, 2.04);
      this.model.add(nozzle);
    }

    const wheelGeo = mergeParts(wheelParts(WHEEL_RADIUS, 0.28)).geometry;
    for (const [x, z] of [[-0.8, -1.25], [0.8, -1.25], [-0.8, 1.25], [0.8, 1.25]]) {
      const wheel = new THREE.Mesh(wheelGeo, vehicleMaterial);
      wheel.position.set(x, WHEEL_RADIUS, z);
      this.wheels.push(wheel);
      this.model.add(wheel);
    }
  }
}
