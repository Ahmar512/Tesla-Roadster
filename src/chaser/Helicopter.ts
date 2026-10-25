import * as THREE from 'three';
import { LANE_WIDTH, LANES } from '../config';
import { mergeParts, type Part } from '../render/geometry';
import { curved, outlineMaterial, vehicleMaterial } from '../render/materials';

type Phase = 'away' | 'arriving' | 'warn' | 'fire' | 'pause' | 'leaving';

export const VOLLEYS = 3;
export const WARN_TIME = 1.1; // the red lane strip flashes this long before the guns fire
export const FIRE_TIME = 0.4;
export const PAUSE_TIME = 0.6; // between volleys
/** Seconds of road the attack needs: volleys plus the gaps between them. */
export const ATTACK_TIME = VOLLEYS * (WARN_TIME + FIRE_TIME) + (VOLLEYS - 1) * PAUSE_TIME;

const HOVER = new THREE.Vector3(0, 7.5, -21); // ahead of and above the car
const ENTRY = new THREE.Vector3(0, 32, -170);
const EXIT = new THREE.Vector3(0, 45, -220);
const STRIP_NEAR = 3; // the warning strip runs up the lane from just behind the car
const STRIP_FAR = -45;

const NAVY = 0x1d3a8a;
const WHITE = 0xf4f6fa;
const DARK = 0x23242b;
const GLASS = 0x1e2a3f;

const DOWN = new THREE.Vector3(0, -1, 0);
const RED = new THREE.Color(0xff2020);
const BLUE = new THREE.Color(0x2060ff);
const DIM = new THREE.Color(0x202028);

/**
 * The police helicopter. Called in at random during a run, it hovers ahead
 * of the car and fires on its lane: a red strip flashes on the lane first,
 * then the guns rake it. It only fires inside a stretch of road the level
 * generator has kept empty, and only if the whole volley fits in that
 * stretch, so a free lane to swerve into is always there.
 */
export class Helicopter {
  readonly object = new THREE.Group();
  /** Red warning strip on the targeted lane; lives on the road, not on the helicopter. */
  readonly strip: THREE.Mesh;
  onWarn?: () => void;
  onFire?: () => void;
  /** A volley ended without hitting the player. */
  onDodged?: () => void;

  private phase: Phase = 'away';
  private readonly body = new THREE.Group();
  private readonly rotor: THREE.Mesh;
  private readonly tailRotor: THREE.Mesh;
  private readonly red = curved(new THREE.MeshBasicMaterial({ color: RED.clone() }));
  private readonly blue = curved(new THREE.MeshBasicMaterial({ color: BLUE.clone() }));
  private readonly beam: THREE.Mesh;
  private readonly stripMaterial: THREE.MeshBasicMaterial;
  private readonly target = new THREE.Vector3();
  private readonly beamFrom = new THREE.Vector3();
  private readonly beamTo = new THREE.Vector3();
  private timer = 0;
  private time = 0;
  private volley = 0;
  private lane = 1;
  private hit = false;
  /** Meters until the empty stretch of road reaches the car, then meters of it left. */
  private safeIn = 0;
  private safeLeft = 0;

  constructor() {
    const { body, rotor, tailRotor } = buildHelicopter(this.red, this.blue);
    this.body.add(body);
    this.rotor = rotor;
    this.tailRotor = tailRotor;
    this.body.add(rotor, tailRotor);
    this.body.scale.setScalar(1.3);
    this.object.add(this.body);

    // Searchlight: a faint cone from the belly to the targeted lane.
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 1.1, 1, 16, 1, true).translate(0, -0.5, 0),
      curved(
        new THREE.MeshBasicMaterial({ color: 0xfff6d0, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false }),
      ),
    );
    this.object.add(this.beam);

    this.stripMaterial = curved(
      new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.strip = new THREE.Mesh(
      // Split along its length so it bends with the curved road instead of sinking under it.
      new THREE.PlaneGeometry(LANE_WIDTH * 0.85, STRIP_NEAR - STRIP_FAR, 1, 24).rotateX(-Math.PI / 2),
      this.stripMaterial,
    );
    this.strip.position.set(0, 0.06, (STRIP_NEAR + STRIP_FAR) / 2);
    this.reset();
  }

  get active() {
    return this.phase !== 'away';
  }

  /** The lane being shot at right now, or null. */
  get firingLane() {
    return this.phase === 'fire' ? this.lane : null;
  }

  /** Where the guns are, for the tracer effect. */
  get gunPosition() {
    return this.body.position;
  }

  reset() {
    this.phase = 'away';
    this.object.visible = false;
    this.strip.visible = false;
  }

  /**
   * Calls the helicopter in. The empty stretch of road starts `safeIn`
   * meters ahead and is `safeLength` meters long.
   */
  start(safeIn: number, safeLength: number) {
    this.phase = 'arriving';
    this.safeIn = safeIn;
    this.safeLeft = safeLength;
    this.volley = 0;
    this.body.position.copy(ENTRY);
    this.object.visible = true;
  }

  /** Breaks off the attack (crash, revive). */
  leave() {
    if (this.phase === 'away') return;
    this.phase = 'leaving';
    this.strip.visible = false;
  }

  /** The player was hit by this volley (so it doesn't count as dodged). */
  markHit() {
    this.hit = true;
  }

  update(dt: number, dz: number, playerX: number, playerLane: number, speed: number) {
    if (this.phase === 'away') return;
    this.time += dt;
    if (this.safeIn > 0) this.safeIn -= dz;
    else this.safeLeft -= dz;
    this.timer -= dt;

    switch (this.phase) {
      case 'arriving':
        if (this.safeIn <= 0) this.nextVolley(playerLane, speed);
        break;
      case 'warn':
        if (this.timer <= 0) {
          this.phase = 'fire';
          this.timer = FIRE_TIME;
          this.hit = false;
          this.onFire?.();
        }
        break;
      case 'fire':
        if (this.timer <= 0) {
          if (!this.hit) this.onDodged?.();
          this.volley++;
          this.phase = 'pause';
          this.timer = PAUSE_TIME;
          this.strip.visible = false;
        }
        break;
      case 'pause':
        if (this.timer <= 0) this.nextVolley(playerLane, speed);
        break;
    }
    this.animate(dt, playerX);
  }

  /** Locks onto the player's lane, if there's enough empty road left for a whole volley. */
  private nextVolley(playerLane: number, speed: number) {
    const needed = speed * (WARN_TIME + FIRE_TIME) + 10;
    if (this.volley >= VOLLEYS || this.safeLeft < needed) {
      this.leave();
      return;
    }
    this.phase = 'warn';
    this.timer = WARN_TIME;
    this.lane = playerLane;
    this.strip.position.x = LANES[playerLane];
    this.strip.visible = true;
    this.onWarn?.();
  }

  private animate(dt: number, playerX: number) {
    const { damp } = THREE.MathUtils;
    const pos = this.body.position;
    if (this.phase === 'leaving') {
      this.target.copy(EXIT);
    } else {
      this.target.copy(HOVER);
      // Drift over the targeted lane while attacking, otherwise shadow the car.
      this.target.x = this.phase === 'warn' || this.phase === 'fire' ? LANES[this.lane] * 0.8 : playerX * 0.5;
      this.target.y += Math.sin(this.time * 1.7) * 0.4;
    }
    const rate = this.phase === 'leaving' ? 0.8 : 1.6;
    pos.x = damp(pos.x, this.target.x, rate * 1.5, dt);
    pos.y = damp(pos.y, this.target.y, rate, dt);
    pos.z = damp(pos.z, this.target.z, rate, dt);
    // Nose down and bank into sideways moves, like a real helicopter.
    this.body.rotation.x = damp(this.body.rotation.x, this.phase === 'leaving' ? -0.35 : 0.18, 2, dt);
    this.body.rotation.z = damp(this.body.rotation.z, (pos.x - this.target.x) * 0.12, 3, dt);

    this.rotor.rotation.y += dt * 28;
    this.tailRotor.rotation.x += dt * 40;
    const flash = Math.floor(this.time * 7) % 2 === 0;
    this.red.color.copy(flash ? RED : DIM);
    this.blue.color.copy(flash ? DIM : BLUE);

    // Searchlight onto the lane under attack (or the car).
    const aimX = this.phase === 'warn' || this.phase === 'fire' ? LANES[this.lane] : playerX;
    const from = this.beamFrom.set(pos.x, pos.y - 0.8, pos.z);
    const to = this.beamTo.set(aimX, 0, -6);
    this.beam.position.copy(from);
    this.beam.scale.set(1, from.distanceTo(to), 1);
    this.beam.quaternion.setFromUnitVectors(DOWN, to.sub(from).normalize());
    this.beam.visible = this.phase !== 'leaving';

    // The strip blinks faster as the guns get ready, then burns solid while they fire.
    if (this.phase === 'warn') {
      const urgency = 1 - this.timer / WARN_TIME;
      const blink = Math.sin(this.time * (14 + urgency * 22)) > 0;
      this.stripMaterial.opacity = blink ? 0.7 : 0.2;
    } else if (this.phase === 'fire') {
      this.stripMaterial.opacity = 0.85;
    }

    if (this.phase === 'leaving' && pos.distanceTo(EXIT) < 20) this.reset();
  }
}

/** Low-poly police helicopter with its nose toward +z (facing the player). */
function buildHelicopter(red: THREE.Material, blue: THREE.Material) {
  const sphere = (sx: number, sy: number, sz: number) => new THREE.SphereGeometry(1, 12, 8).scale(sx, sy, sz);
  const box = (w: number, h: number, l: number) => new THREE.BoxGeometry(w, h, l);
  const cyl = (r1: number, r2: number, h: number, seg = 10) => new THREE.CylinderGeometry(r1, r2, h, seg);

  const parts: Part[] = [
    { geometry: sphere(1.0, 0.85, 1.7), color: NAVY }, // cabin
    { geometry: sphere(1.03, 0.3, 1.62), color: WHITE, at: [0, -0.18, 0] }, // white belly band
    { geometry: sphere(0.82, 0.62, 0.9), color: GLASS, at: [0, 0.18, 0.95] }, // canopy glass
    { geometry: cyl(0.16, 0.3, 3.6).rotateX(Math.PI / 2), color: NAVY, at: [0, 0.25, -2.9] }, // tail boom
    { geometry: box(0.12, 1.0, 0.6), color: NAVY, at: [0, 0.75, -4.55] }, // tail fin
    { geometry: box(1.4, 0.08, 0.38), color: WHITE, at: [0, 0.32, -4.1] }, // stabilizer
    { geometry: cyl(0.14, 0.18, 0.45), color: DARK, at: [0, 0.98, 0] }, // rotor mast
    { geometry: cyl(0.16, 0.2, 0.3), color: DARK, at: [0, -0.85, 1.0] }, // searchlight
    ...[-1, 1].flatMap((side): Part[] => [
      { geometry: box(0.1, 0.1, 2.8), color: DARK, at: [side * 0.8, -1.15, 0] }, // skid
      { geometry: box(0.08, 0.45, 0.08), color: DARK, at: [side * 0.72, -0.9, 0.75] }, // struts
      { geometry: box(0.08, 0.45, 0.08), color: DARK, at: [side * 0.72, -0.9, -0.75] },
    ]),
  ];
  const body = new THREE.Group();
  const merged = mergeParts(parts, true).geometry;
  body.add(new THREE.Mesh(merged, vehicleMaterial), new THREE.Mesh(merged, outlineMaterial));

  // Light bar on the belly, flashing red and blue.
  const lamp = box(0.4, 0.14, 0.3);
  const redLamp = new THREE.Mesh(lamp, red);
  const blueLamp = new THREE.Mesh(lamp, blue);
  redLamp.position.set(-0.32, -0.82, 0.2);
  blueLamp.position.set(0.32, -0.82, 0.2);
  body.add(redLamp, blueLamp);

  const blades = mergeParts([
    { geometry: box(7.6, 0.05, 0.32), color: DARK },
    { geometry: box(0.32, 0.05, 7.6), color: DARK },
  ]).geometry;
  const rotor = new THREE.Mesh(blades, vehicleMaterial);
  rotor.position.y = 1.22;

  const tailBlades = mergeParts([
    { geometry: box(0.04, 1.2, 0.16), color: DARK },
    { geometry: box(0.04, 0.16, 1.2), color: DARK },
  ]).geometry;
  const tailRotor = new THREE.Mesh(tailBlades, vehicleMaterial);
  tailRotor.position.set(0.12, 0.8, -4.55);

  return { body, rotor, tailRotor };
}
