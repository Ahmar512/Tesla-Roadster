import * as THREE from 'three';
import { CHASE_TIME } from '../config';
import { createPoliceCar } from '../obstacles/models';

type State = 'away' | 'chasing' | 'caught';

// Distance behind the player (the player sits at z = 0, the camera at ~8.5).
const AWAY_Z = 20;
const CHASING_Z = 5.2;
// When it catches you it pulls up alongside, so the zoomed-in camera sees both cars.
const CAUGHT_Z = 1.2;
const CAUGHT_SIDE = 2.4;

const RED = new THREE.Color(0xff2020);
const BLUE = new THREE.Color(0x2060ff);
const DIM = new THREE.Color(0x202028);

/**
 * The police car that chases you after a stumble. It tails you, lights
 * flashing, for CHASE_TIME seconds; stumble again before then and you're caught.
 */
export class Police {
  readonly object: THREE.Group;
  private readonly red: THREE.MeshBasicMaterial;
  private readonly blue: THREE.MeshBasicMaterial;
  private state: State = 'away';
  private chaseTimer = 0;
  private z = AWAY_Z;
  private x = 0;
  private time = 0;

  constructor() {
    const car = createPoliceCar();
    this.object = car.object;
    this.red = car.red;
    this.blue = car.blue;
    this.object.visible = false;
  }

  get chasing() {
    return this.state === 'chasing';
  }

  reset() {
    this.state = 'away';
    this.z = AWAY_Z;
    this.object.visible = false;
  }

  /** Starts (or restarts) the chase. Returns true if it was already chasing: you're caught. */
  stumble() {
    if (this.state === 'chasing') return true;
    this.state = 'chasing';
    this.chaseTimer = CHASE_TIME;
    return false;
  }

  /** Pull up right behind the player (game over). */
  arrest() {
    this.state = 'caught';
  }

  update(dt: number, playerX: number, surfaceAt: (x: number, z: number) => number) {
    this.time += dt;
    if (this.state === 'chasing') {
      this.chaseTimer -= dt;
      if (this.chaseTimer <= 0) this.state = 'away';
    }

    const targetZ = { away: AWAY_Z, chasing: CHASING_Z, caught: CAUGHT_Z }[this.state];
    // Pull over on the side with more road (toward the middle).
    const targetX = this.state === 'caught' ? playerX + (playerX > 0 ? -CAUGHT_SIDE : CAUGHT_SIDE) : playerX;
    this.z = THREE.MathUtils.damp(this.z, targetZ, this.state === 'away' ? 1.2 : 2.5, dt);
    this.x = THREE.MathUtils.damp(this.x, targetX, 3, dt);
    this.object.visible = this.z < AWAY_Z - 2;
    if (!this.object.visible) return;

    this.object.position.set(this.x, surfaceAt(this.x, this.z), this.z);
    this.object.rotation.y = (targetX - this.x) * -0.12;

    const flash = Math.floor(this.time * 7) % 2 === 0;
    this.red.color.copy(flash ? RED : DIM);
    this.blue.color.copy(flash ? DIM : BLUE);
  }
}
