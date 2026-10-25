import * as THREE from 'three';
import { DESPAWN_Z, LANES, PLAYER } from '../config';
import { carrierSurface, OBSTACLE_MODELS, type ObstacleModel } from './models';

export type ObstacleKind = 'car' | 'truck' | 'barrier' | 'sign' | 'carrier';

interface Spec {
  width: number;
  length: number;
  bottom: number; // hitbox starts this high above the road
  height: number;
}

// How each obstacle must be beaten:
//   car     – change lane or thruster-hop over it
//   truck   – too tall to hop: change lane
//   barrier – hop over it
//   sign    – overhead bar: duck under it
//   carrier – drive up its ramp and ride on top
export const SPECS: Record<ObstacleKind, Spec> = {
  car: { width: 1.7, length: 4, bottom: 0, height: 1.3 },
  truck: { width: 2.2, length: 8, bottom: 0, height: 3.4 },
  barrier: { width: 2.3, length: 0.4, bottom: 0, height: 0.9 },
  sign: { width: 2.5, length: 0.4, bottom: 1.0, height: 1.0 },
  carrier: { width: 2.3, length: 14, bottom: 0, height: 2.4 },
};

// Hitboxes are slightly smaller than the visuals so near misses feel fair.
const HITBOX_INSET = 0.2;
// The player can drive up onto a surface at most this much higher than itself.
const STEP_HEIGHT = 0.5;
// Moving traffic drives at this fraction of the player's speed.
export const TRAFFIC_SPEED = 0.35;
const LANE_CHANGE_TRIGGER_Z = -42; // lane-changers signal once this close
const SIGNAL_TIME = 0.75;
const LANE_CHANGE_TIME = 0.6;
const NEAR_MISS_RANGE = 14; // dodging out of a lane with traffic this close ahead counts

export type HitKind = 'front' | 'side' | 'top';

export interface Hit {
  obstacle: Obstacle;
  kind: HitKind;
}

export interface SpawnOptions {
  moving?: boolean;
  changesLane?: boolean;
}

export interface Obstacle {
  kind: ObstacleKind;
  model: ObstacleModel;
  lane: number;
  x: number;
  z: number;
  prevZ: number;
  moving: boolean;
  changer: 'idle' | 'signal' | 'move' | 'done' | null;
  changeTimer: number;
  fromX: number;
  toLane: number;
  nearMiss: boolean;
  knocked: THREE.Vector3 | null;
  lift: number;
  spin: number;
  knockTime: number;
}

export class ObstacleManager {
  /** Fires when the player dodges out of a lane just before hitting traffic. */
  onNearMiss?: () => void;

  private readonly active: Obstacle[] = [];
  private readonly pools: Record<ObstacleKind, ObstacleModel[]> = { car: [], truck: [], barrier: [], sign: [], carrier: [] };
  private readonly box = new THREE.Box3();
  private time = 0;

  constructor(private readonly scene: THREE.Scene) {}

  reset() {
    for (const o of this.active) this.release(o);
    this.active.length = 0;
  }

  spawn(kind: ObstacleKind, lane: number, z: number, opts: SpawnOptions = {}) {
    const model = this.pools[kind].pop() ?? this.create(kind);
    model.object.visible = true;
    model.object.rotation.set(0, 0, 0);
    model.repaint?.();
    const o: Obstacle = {
      kind,
      model,
      lane,
      x: LANES[lane],
      z,
      prevZ: z,
      moving: !!opts.moving,
      changer: opts.changesLane ? 'idle' : null,
      changeTimer: 0,
      fromX: 0,
      toLane: lane,
      nearMiss: false,
      knocked: null,
      lift: 0,
      spin: 0,
      knockTime: 0,
    };
    this.place(o);
    this.active.push(o);
  }

  /** Removes everything whose center lies between the two z values (e.g. a landing zone). */
  clearRange(zNear: number, zFar: number) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const o = this.active[i];
      if (o.z <= zNear && o.z >= zFar) this.removeAt(i);
    }
  }

  /** Moves everything toward the player; moving traffic drives away a bit slower. */
  update(dt: number, dz: number, speed: number) {
    this.time += dt;
    const blink = Math.floor(this.time * 6) % 2 === 0;

    for (let i = this.active.length - 1; i >= 0; i--) {
      const o = this.active[i];
      if (o.knocked) {
        this.updateKnocked(o, dt, dz);
        if (o.knockTime > 1.5) this.removeAt(i);
        continue;
      }

      o.prevZ = o.z;
      o.z += dz - (o.moving ? speed * TRAFFIC_SPEED * dt : 0);
      if (o.changer) this.updateLaneChange(o, dt, blink);
      this.place(o);

      if (o.nearMiss && o.z - SPECS[o.kind].length / 2 > PLAYER.length / 2) {
        o.nearMiss = false;
        this.onNearMiss?.();
      }
      if (o.z - SPECS[o.kind].length / 2 > DESPAWN_Z) this.removeAt(i);
    }
  }

  /**
   * Height of the surface under the player: carrier ramps and decks. A deck
   * only counts if the player was already riding it (drove up the ramp) or
   * is coming down from above, so changing lane into a carrier's side
   * doesn't teleport you on top.
   */
  groundAt(box: THREE.Box3, prevBox: THREE.Box3) {
    let ground = 0;
    for (const o of this.active) {
      if (o.kind !== 'carrier' || o.knocked) continue;
      if (!this.overlapsX(o, box)) continue;
      const center = (box.min.z + box.max.z) / 2;
      const surface = carrierSurface(center - o.z);
      const wasRiding = this.overlapsX(o, prevBox) && prevBox.min.y >= carrierSurface(center - o.prevZ) - 0.3;
      if (wasRiding || prevBox.min.y >= surface - 0.15) ground = Math.max(ground, surface);
    }
    return ground;
  }

  /** Height of the drivable surface at a point (used for the police car). */
  surfaceAt(x: number, z: number) {
    let ground = 0;
    for (const o of this.active) {
      if (o.kind === 'carrier' && !o.knocked && Math.abs(x - o.x) < SPECS.carrier.width / 2) {
        ground = Math.max(ground, carrierSurface(z - o.z));
      }
    }
    return ground;
  }

  /**
   * The first obstacle the player is touching, and how: from above (land on
   * it), from the side (clipped it while changing lane) or head-on.
   */
  collide(box: THREE.Box3, prevBox: THREE.Box3): Hit | null {
    for (const o of this.active) {
      if (o.knocked) continue;

      if (o.kind === 'carrier') {
        // The ramp makes the rear safe; only the deck's sides are solid.
        if (!this.overlapsX(o, box) || this.overlapsX(o, prevBox)) continue;
        const surface = carrierSurface((box.min.z + box.max.z) / 2 - o.z);
        if (surface > box.min.y + STEP_HEIGHT) return { obstacle: o, kind: 'side' };
        continue;
      }

      this.hitbox(o, this.box);
      if (!this.box.intersectsBox(box)) continue;
      if (prevBox.min.y >= this.box.max.y - 0.1) return { obstacle: o, kind: 'top' };
      const wasBeside = prevBox.max.x <= this.box.min.x || prevBox.min.x >= this.box.max.x;
      return { obstacle: o, kind: wasBeside ? 'side' : 'front' };
    }
    return null;
  }

  /** Sends an obstacle flying (nitro, shield). */
  knock(o: Obstacle, fromX: number) {
    const dir = o.x >= fromX ? 1 : -1;
    o.knocked = new THREE.Vector3(dir * THREE.MathUtils.randFloat(8, 13), THREE.MathUtils.randFloat(8, 12), -12);
    o.spin = dir * THREE.MathUtils.randFloat(4, 7);
    o.knockTime = 0;
    o.nearMiss = false;
  }

  /** Marks traffic just ahead in a lane the player is leaving, for near-miss bonuses. */
  markNearMisses(lane: number) {
    for (const o of this.active) {
      if (o.lane !== lane || o.knocked || o.kind === 'carrier' || o.kind === 'sign') continue;
      const gap = -(o.z + SPECS[o.kind].length / 2) - PLAYER.length / 2;
      if (gap > 0 && gap < NEAR_MISS_RANGE) o.nearMiss = true;
    }
  }

  private hitbox(o: Obstacle, out: THREE.Box3) {
    const spec = SPECS[o.kind];
    out.min.set(o.x - spec.width / 2 + HITBOX_INSET, spec.bottom, o.z - spec.length / 2 + HITBOX_INSET);
    out.max.set(o.x + spec.width / 2 - HITBOX_INSET, spec.bottom + spec.height - 0.05, o.z + spec.length / 2 - HITBOX_INSET);
    return out;
  }

  private overlapsX(o: Obstacle, box: THREE.Box3) {
    const half = SPECS[o.kind].width / 2 - HITBOX_INSET;
    const halfLength = SPECS[o.kind].length / 2;
    return box.max.x > o.x - half && box.min.x < o.x + half && box.max.z > o.z - halfLength && box.min.z < o.z + halfLength;
  }

  /** Signal, then glide into an adjacent lane that's clear. */
  private updateLaneChange(o: Obstacle, dt: number, blink: boolean) {
    const blinkers = o.model.blinkers;
    if (o.changer === 'idle' && o.z > LANE_CHANGE_TRIGGER_Z) {
      const options = [o.lane - 1, o.lane + 1].filter((l) => l >= 0 && l < LANES.length && this.laneClear(l, o.z, o));
      if (options.length === 0) {
        o.changer = 'done';
        return;
      }
      o.toLane = options[Math.floor(Math.random() * options.length)];
      o.changer = 'signal';
      o.changeTimer = 0;
    }

    if (o.changer === 'signal' || o.changer === 'move') {
      o.changeTimer += dt;
      if (blinkers) {
        const side = o.toLane < o.lane ? blinkers.left : blinkers.right;
        side.visible = blink;
      }
    }
    if (o.changer === 'signal' && o.changeTimer >= SIGNAL_TIME) {
      o.changer = 'move';
      o.changeTimer = 0;
      o.fromX = o.x;
    }
    if (o.changer === 'move') {
      const t = Math.min(1, o.changeTimer / LANE_CHANGE_TIME);
      o.x = THREE.MathUtils.lerp(o.fromX, LANES[o.toLane], t * t * (3 - 2 * t));
      if (t >= 1) {
        o.lane = o.toLane;
        o.changer = 'done';
        if (blinkers) blinkers.left.visible = blinkers.right.visible = false;
      }
    }
  }

  private laneClear(lane: number, z: number, self: Obstacle) {
    return !this.active.some((o) => o !== self && !o.knocked && o.lane === lane && Math.abs(o.z - z) < SPECS[o.kind].length / 2 + 10);
  }

  private updateKnocked(o: Obstacle, dt: number, dz: number) {
    const v = o.knocked!;
    v.y -= 30 * dt;
    o.x += v.x * dt;
    o.lift = Math.max(0, o.lift + v.y * dt);
    o.z += dz + v.z * dt;
    o.knockTime += dt;
    this.place(o);
    o.model.object.rotation.z += o.spin * dt;
    o.model.object.rotation.x -= o.spin * 0.4 * dt;
  }

  private place(o: Obstacle) {
    o.model.object.position.set(o.x, o.lift, o.z);
  }

  private removeAt(i: number) {
    this.release(this.active[i]);
    this.active[i] = this.active[this.active.length - 1];
    this.active.pop();
  }

  private release(o: Obstacle) {
    o.model.object.visible = false;
    if (o.model.blinkers) o.model.blinkers.left.visible = o.model.blinkers.right.visible = false;
    this.pools[o.kind].push(o.model);
  }

  private create(kind: ObstacleKind) {
    const model = OBSTACLE_MODELS[kind]();
    this.scene.add(model.object);
    return model;
  }
}
