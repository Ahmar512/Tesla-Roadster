import * as THREE from 'three';
import { CELL_HEIGHT, LANES, PLAYER } from '../config';
import type { ObstacleKind, ObstacleManager } from '../obstacles/ObstacleManager';
import { SPECS } from '../obstacles/ObstacleManager';
import type { Pickups } from '../pickups/Pickups';
import type { Action } from './Input';

interface Step {
  action: Action;
  kind: ObstacleKind;
  lanes: number[];
  /** Near end of the obstacles; scrolls toward the player like everything else. */
  z: number;
}

/** The prompt appears when the obstacles are this far in front of the car. */
const PROMPT_DISTANCE = 10;
/** How fast time eases to a stop for a prompt, and back to normal after it. */
const SLOWDOWN_RATE = 8;
/** Where the regular level starts once the tutorial stretch is laid out. */
export const TUTORIAL_LENGTH = 300;

/**
 * First-run tutorial: an easy stretch of road with one obstacle per move.
 * As each one gets close, time eases to a stop and a prompt shows the swipe
 * to make. Only that swipe is accepted, so the player can't fail.
 */
export class Tutorial {
  /** Called with the action to prompt for, or null to hide the prompt. */
  onPrompt?: (action: Action | null) => void;
  onDone?: () => void;
  active = false;
  private steps: Step[] = [];
  private next = 0;
  private prompting = false;
  private scale = 1;

  constructor(
    private readonly obstacles: ObstacleManager,
    private readonly pickups: Pickups,
  ) {}

  /** Lays out the tutorial road. The player starts in the middle lane. */
  start() {
    this.active = true;
    this.next = 0;
    this.prompting = false;
    this.scale = 1;
    this.steps = [
      { action: 'left', kind: 'truck', lanes: [1, 2], z: -70 },
      { action: 'right', kind: 'truck', lanes: [0], z: -130 },
      { action: 'up', kind: 'barrier', lanes: [0, 1, 2], z: -190 },
      { action: 'down', kind: 'sign', lanes: [0, 1, 2], z: -250 },
    ];
    for (const step of this.steps) {
      for (const lane of step.lanes) this.obstacles.spawn(step.kind, lane, step.z - SPECS[step.kind].length / 2);
    }

    // Cells along the safe path, arcing over the barrier.
    const hopZ = this.steps[2].z;
    const trail = (lane: number, from: number, to: number) => {
      for (let z = from; z > to; z -= 3) {
        const t = THREE.MathUtils.clamp((hopZ + 8 - z) / 16, 0, 1);
        this.pickups.spawnCell(LANES[lane], CELL_HEIGHT + 2.2 * Math.sin(Math.PI * t), z);
      }
    };
    trail(1, -20, -55);
    trail(0, -66, -122);
    trail(1, -136, -280);
  }

  stop() {
    if (this.prompting) this.onPrompt?.(null);
    this.active = false;
    this.prompting = false;
    this.scale = 1;
  }

  /** Whether the player may make this move right now. */
  allows(action: Action) {
    if (!this.active) return true;
    if (!this.prompting || action !== this.steps[this.next].action) return false;
    this.prompting = false;
    this.next++;
    this.onPrompt?.(null);
    return true;
  }

  /** Call with the real frame time; returns the time scale for this frame. */
  update(dt: number) {
    if (!this.active) return 1;
    const step = this.steps[this.next];
    if (step && !this.prompting && step.z > -(PLAYER.length / 2 + PROMPT_DISTANCE)) {
      this.prompting = true;
      this.onPrompt?.(step.action);
    }
    if (!step && this.steps[this.steps.length - 1].z > PLAYER.length) {
      this.stop();
      this.onDone?.();
    }
    this.scale = THREE.MathUtils.damp(this.scale, this.prompting ? 0 : 1, SLOWDOWN_RATE, dt);
    return this.scale;
  }

  scroll(dz: number) {
    for (const step of this.steps) step.z += dz;
  }
}
