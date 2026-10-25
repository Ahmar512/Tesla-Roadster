import * as THREE from 'three';
import { CELL_HEIGHT, CHUNK_GAP_END, CHUNK_GAP_START, FIRST_CHUNK_Z, FLIGHT_HEIGHT, LANES, SPAWN_DISTANCE } from '../config';
import { randomPowerUp } from '../game/PowerUps';
import { carrierSurface, CARRIER } from '../obstacles/models';
import { TRAFFIC_SPEED, type ObstacleKind, type ObstacleManager } from '../obstacles/ObstacleManager';
import type { Pickups } from '../pickups/Pickups';
import { mirrorRows, patternLength, PATTERNS, SLOT_LENGTH, slotAt, solve, type Pattern, type Row, type Slot, type Step } from './patterns';

const SLOT_KIND: Partial<Record<Slot, ObstacleKind>> = {
  c: 'car',
  m: 'car',
  x: 'car',
  t: 'truck',
  b: 'barrier',
  s: 'sign',
  r: 'carrier',
};

const CELL_SPACING = 3;
const CELL_CHANCE = 0.7; // share of patterns that get a cell trail
const POWER_UP_EVERY: [number, number] = [380, 620]; // meters between power-ups
const LANDING_ZONE = 40; // empty road where Flight Mode ends

/**
 * Lays out the road ahead: obstacle patterns separated by gaps, energy cells
 * along the safe path, occasional power-ups, and the sky trail during flight.
 *
 * All z values are world positions that scroll toward the player (+z) along
 * with everything else.
 */
export class LevelGenerator {
  private nextZ = FIRST_CHUNK_Z;
  private lastPattern?: Pattern;
  private untilPowerUp = 0;
  /** Moving traffic drives ahead in its lane, so keep parked obstacles out of its way. */
  private reserved: { lane: number; nearZ: number; farZ: number }[] = [];
  private skyUntilZ: number | null = null;
  private skyLane = 1;
  /** Extra shield weight from the shield upgrade. */
  shieldBonus = 0;

  constructor(
    private readonly obstacles: ObstacleManager,
    private readonly pickups: Pickups,
  ) {
    this.reset();
  }

  /** `startZ` leaves the road before it empty (e.g. for the tutorial). */
  reset(startZ = FIRST_CHUNK_Z) {
    this.nextZ = startZ;
    this.lastPattern = undefined;
    this.untilPowerUp = THREE.MathUtils.randFloat(...POWER_UP_EVERY) * 0.5;
    this.reserved = [];
    this.skyUntilZ = null;
  }

  update(dz: number, difficulty: number) {
    this.nextZ += dz;
    if (this.skyUntilZ !== null) this.skyUntilZ += dz;
    for (const r of this.reserved) {
      r.nearZ += dz;
      r.farZ += dz;
    }
    this.reserved = this.reserved.filter((r) => r.farZ < 20);

    while (this.nextZ > -SPAWN_DISTANCE) {
      if (this.skyUntilZ !== null) this.emitSky();
      else this.emitPattern(difficulty);
    }
  }

  /**
   * Flight Mode covers `distance` meters. Fill that stretch with a trail of
   * cells in the sky, and make sure the spot where the car lands is empty.
   */
  startFlight(distance: number) {
    const landZ = -distance;
    this.obstacles.clearRange(landZ + LANDING_ZONE / 2, landZ - LANDING_ZONE);
    this.pickups.clearRange(landZ + LANDING_ZONE / 2, landZ - LANDING_ZONE);
    this.skyUntilZ = landZ;
  }

  private emitSky() {
    const skyUntil = this.skyUntilZ!;
    if (this.nextZ > skyUntil) {
      const length = 30;
      if (Math.random() < 0.4) this.skyLane = THREE.MathUtils.clamp(this.skyLane + (Math.random() < 0.5 ? -1 : 1), 0, 2);
      for (let d = 0; d < length && this.nextZ - d > skyUntil; d += CELL_SPACING) {
        this.pickups.spawnCell(LANES[this.skyLane], FLIGHT_HEIGHT + 0.6, this.nextZ - d);
      }
      this.nextZ -= length;
    } else {
      this.skyUntilZ = null;
      this.nextZ -= LANDING_ZONE;
    }
  }

  private emitPattern(difficulty: number) {
    const pattern = pickPattern(difficulty, this.lastPattern);
    this.lastPattern = pattern;
    const rows = Math.random() < 0.5 ? mirrorRows(pattern.rows) : pattern.rows;
    const start = this.nextZ;
    const length = patternLength(rows);

    for (const row of rows) {
      for (let lane = 0; lane < LANES.length; lane++) {
        const slot = slotAt(row, lane);
        const kind = SLOT_KIND[slot];
        if (!kind) continue;
        const nearZ = start - row.at;
        const z = nearZ - SLOT_LENGTH[slot] / 2;
        const moving = slot === 'm' || slot === 'x';
        if (!moving && this.isReserved(lane, nearZ, nearZ - SLOT_LENGTH[slot])) continue;
        this.obstacles.spawn(kind, lane, z, { moving, changesLane: slot === 'x' });
        if (moving) {
          // It closes in at (1 - TRAFFIC_SPEED) of the player's speed, so it
          // travels this far up the road before the player passes it.
          const drift = (SPAWN_DISTANCE * TRAFFIC_SPEED) / (1 - TRAFFIC_SPEED) + 10;
          this.reserved.push({ lane, nearZ, farZ: nearZ - SLOT_LENGTH[slot] - drift });
        }
      }
    }

    if (Math.random() < CELL_CHANCE) {
      const steps = solve(rows);
      if (steps) this.layCells(rows, steps, start, length);
    }

    const gap = THREE.MathUtils.lerp(CHUNK_GAP_START, CHUNK_GAP_END, difficulty);
    this.untilPowerUp -= length + gap;
    if (this.untilPowerUp <= 0) {
      this.untilPowerUp = THREE.MathUtils.randFloat(...POWER_UP_EVERY);
      this.pickups.spawnPowerUp(randomPowerUp(this.shieldBonus), LANES[THREE.MathUtils.randInt(0, 2)], start - length - gap / 2);
    }
    this.nextZ = start - length - gap;
  }

  /**
   * A trail of cells along the solved path: straight lines on open road,
   * arcs over things to hop, and up the ramp onto carrier decks.
   */
  private layCells(rows: Row[], steps: Step[], start: number, length: number) {
    // Lane changes happen once the obstacle in the current lane is passed.
    const laneAt = (d: number) => {
      let lane = steps[0].lane;
      for (let i = 0; i < rows.length; i++) {
        const prevEnd = i > 0 ? rows[i - 1].at + SLOT_LENGTH[slotAt(rows[i - 1], steps[i - 1].lane)] + 2 : -Infinity;
        if (d >= Math.max(prevEnd, rows[i].at - 8)) lane = steps[i].lane;
      }
      return lane;
    };

    for (let d = -6; d <= length + 6; d += CELL_SPACING) {
      const lane = laneAt(d);
      let y = CELL_HEIGHT;
      let blocked = false;

      rows.forEach((row, i) => {
        const slot = slotAt(row, lane);
        const len = SLOT_LENGTH[slot];
        if (slot === '.' || slot === 's') return;
        if (slot === 'r') {
          y = Math.max(y, carrierSurface(row.at + CARRIER.rampStart - d) + CELL_HEIGHT);
          return;
        }
        if (steps[i].move === 'hop' && steps[i].lane === lane && d > row.at - 8 && d < row.at + len + 8) {
          const t = (d - (row.at - 8)) / (len + 16);
          y = Math.max(y, CELL_HEIGHT + 2.2 * Math.sin(Math.PI * t));
          return;
        }
        if (d > row.at - 1 && d < row.at + len + 1) blocked = true;
      });

      if (!blocked) this.pickups.spawnCell(LANES[lane], y, start - d);
    }
  }

  private isReserved(lane: number, nearZ: number, farZ: number) {
    return this.reserved.some((r) => r.lane === lane && nearZ > r.farZ && farZ < r.nearZ);
  }
}

function pickPattern(difficulty: number, last?: Pattern) {
  const pool = PATTERNS.filter((p) => p.minDifficulty <= difficulty && p !== last);
  const total = pool.reduce((sum, p) => sum + p.weight, 0);
  let r = Math.random() * total;
  for (const p of pool) {
    r -= p.weight;
    if (r <= 0) return p;
  }
  return pool[0];
}
