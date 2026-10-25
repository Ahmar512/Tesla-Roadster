import * as THREE from 'three';
import {
  CAMERA_DISTANCE,
  CAMERA_HEIGHT,
  FOG_FAR,
  FOG_NEAR,
  GRACE_TIME,
  IDLE_SPEED,
  MAX_SPEED,
  NITRO_SPEED_FACTOR,
  SKY_HORIZON,
  SPEED_RAMP,
  START_SPEED,
  STUMBLE_SLOWDOWN,
} from '../config';
import { Police } from '../chaser/Police';
import { Effects } from '../fx/Effects';
import { LevelGenerator } from '../level/LevelGenerator';
import { ObstacleManager, type Hit } from '../obstacles/ObstacleManager';
import { Pickups } from '../pickups/Pickups';
import { Player } from '../player/Player';
import { outlineMaterial } from '../render/materials';
import { createSky } from '../render/Sky';
import { DebugOverlay } from '../ui/DebugOverlay';
import { Hud } from '../ui/Hud';
import { Road } from '../world/Road';
import { Scenery } from '../world/Scenery';
import { AutoQuality, type QualityLevel } from './AutoQuality';
import { Input } from './Input';
import { POWER_UPS, PowerUps, type PowerUpType } from './PowerUps';

type State = 'title' | 'playing' | 'crashed' | 'over';

const BEST_KEY = 'roadster-rush.best';
const CELLS_KEY = 'roadster-rush.cells';
const CRASH_DELAY = 1.1; // seconds between the crash and the game-over screen
const CRASH_SLOWMO = 0.2; // time scale right after impact
const NEAR_MISS_POINTS = 50;
const FLIGHT_WARNING = 1.2; // the car blinks this long before Flight Mode ends

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
  private readonly cameraBase = new THREE.Vector3(0, CAMERA_HEIGHT, CAMERA_DISTANCE);
  private readonly lookTarget = new THREE.Vector3();
  private readonly timer = new THREE.Timer();
  private readonly sky = createSky();

  private readonly input = new Input();
  private readonly hud: Hud;
  private readonly debug = new DebugOverlay();
  private readonly quality: AutoQuality;
  private readonly player = new Player();
  private readonly police = new Police();
  private readonly powerUps = new PowerUps();
  private readonly road: Road;
  private readonly scenery: Scenery;
  private readonly obstacles: ObstacleManager;
  private readonly pickups: Pickups;
  private readonly level: LevelGenerator;
  private readonly effects: Effects;
  private readonly playerBox = new THREE.Box3();
  private readonly prevPlayerBox = new THREE.Box3();
  private readonly playerCenter = new THREE.Vector3();

  private state: State = 'title';
  private speed = IDLE_SPEED;
  private score = 0;
  private runCells = 0;
  private best = loadNumber(BEST_KEY);
  private totalCells = loadNumber(CELLS_KEY);
  private caught = false;
  private invulnerable = 0;
  private crashTimer = 0;
  private timeScale = 1;
  private shake = 0;
  private landBump = 0;
  private crashZoom = 0;
  private baseFov = 60;
  private maxPixelRatio = 2;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(SKY_HORIZON);
    this.scene.fog = new THREE.Fog(SKY_HORIZON, FOG_NEAR, FOG_FAR);
    this.scene.add(this.sky, this.camera);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9cbf86, 1.5));
    const sun = new THREE.DirectionalLight(0xfff3df, 2.2);
    sun.position.set(5, 12, 9); // from behind the camera, so the rears of cars are lit
    this.scene.add(sun);

    this.road = new Road(this.scene, this.renderer);
    this.scenery = new Scenery(this.scene);
    this.obstacles = new ObstacleManager(this.scene);
    this.pickups = new Pickups(this.scene);
    this.level = new LevelGenerator(this.obstacles, this.pickups);
    this.effects = new Effects(this.scene, this.camera);
    this.scene.add(this.player.object, this.police.object);
    this.player.reset();
    this.wireEvents();

    this.quality = new AutoQuality((level) => this.applyQuality(level));
    this.hud = new Hud(() => this.start());
    this.hud.showTitle(this.best, this.totalCells);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' && (this.state === 'title' || this.state === 'over')) this.start();
    });

    window.addEventListener('resize', this.resize);
    this.resize();
    this.timer.connect(document); // pauses the clock while the tab is hidden
    this.renderer.setAnimationLoop(this.tick);
  }

  private get difficulty() {
    return (this.speed - START_SPEED) / (MAX_SPEED - START_SPEED);
  }

  private get multiplier() {
    return this.powerUps.has('multiplier') ? 2 : 1;
  }

  private wireEvents() {
    this.player.events = {
      jump: () => this.effects.thrusterBurst(this.player.x, this.player.y),
      land: () => {
        this.effects.landing(this.player.x);
        this.landBump = 0.25;
      },
      laneChange: (direction) => {
        this.effects.laneChange(this.player.x, direction);
        this.obstacles.markNearMisses(this.player.currentLane - direction);
      },
    };

    this.obstacles.onNearMiss = () => {
      if (this.state !== 'playing') return;
      this.score += NEAR_MISS_POINTS * this.multiplier;
      this.hud.popup(`NEAR MISS +${NEAR_MISS_POINTS * this.multiplier}`);
    };

    this.pickups.onCell = (x, y, z) => {
      this.runCells++;
      this.effects.collect(x, y, z);
      this.hud.setCells(this.runCells);
    };
    this.pickups.onPowerUp = (type, x, y) => this.activatePowerUp(type, x, y);

    this.powerUps.onExpire = (type) => {
      if (type === 'flight') this.player.endFlight();
      if (type === 'multiplier') this.hud.setMultiplier(false);
      if (type === 'flight' || type === 'nitro') {
        // A moment of safety to get your bearings.
        this.invulnerable = GRACE_TIME;
        this.player.blink(GRACE_TIME);
      }
    };
  }

  private activatePowerUp(type: PowerUpType, x: number, y: number) {
    const info = POWER_UPS[type];
    this.powerUps.activate(type);
    this.hud.popup(info.label, true);
    this.effects.powerUp(x, y, info.color);

    if (type === 'flight') {
      this.player.startFlight();
      this.level.startFlight(this.speed * info.duration);
    }
    if (type === 'shield') this.player.setShield(true);
    if (type === 'multiplier') this.hud.setMultiplier(true);
  }

  private start() {
    this.player.reset();
    this.police.reset();
    this.obstacles.reset();
    this.pickups.reset();
    this.level.reset();
    this.powerUps.reset();
    this.input.consume();
    this.speed = START_SPEED;
    this.score = 0;
    this.runCells = 0;
    this.caught = false;
    this.invulnerable = 0;
    this.timeScale = 1;
    this.crashZoom = 0;
    this.player.getBox(this.prevPlayerBox);
    this.state = 'playing';
    this.hud.showPlaying();
  }

  private handleHit({ obstacle, kind }: Hit) {
    if (kind === 'top') {
      this.player.bounce();
      this.effects.landing(this.player.x);
      return;
    }
    if (this.powerUps.has('nitro')) {
      this.obstacles.knock(obstacle, this.player.x);
      this.effects.smash(obstacle.x, this.player.y);
      this.shake = 0.15;
      return;
    }
    if (this.invulnerable > 0) return;
    if (this.powerUps.has('shield')) {
      this.powerUps.consume('shield');
      this.player.setShield(false);
      this.obstacles.knock(obstacle, this.player.x);
      this.effects.shieldBreak(this.player.x, this.player.y);
      this.invulnerable = GRACE_TIME;
      this.player.blink(GRACE_TIME);
      this.shake = 0.25;
      return;
    }
    if (kind === 'side') this.stumble();
    else this.crash();
  }

  /** Clipped something sideways: lose speed, and the police start chasing. */
  private stumble() {
    this.player.stumble();
    this.speed = Math.max(START_SPEED, this.speed * STUMBLE_SLOWDOWN);
    this.shake = 0.3;
    this.invulnerable = 0.5;
    this.effects.smash(this.player.x, this.player.y);
    navigator.vibrate?.(60);
    if (this.police.stumble()) {
      this.caught = true;
      this.crash();
    } else {
      this.hud.popup('WATCH OUT!');
    }
  }

  private crash() {
    this.state = 'crashed';
    this.crashTimer = CRASH_DELAY;
    this.police.arrest();
    navigator.vibrate?.(200);
    if (this.caught) {
      this.shake = 0.3;
      return;
    }
    this.timeScale = CRASH_SLOWMO;
    this.shake = 0.6;
    this.effects.crash(this.player.x, this.player.y);
    this.player.knock();
  }

  private gameOver() {
    this.state = 'over';
    const score = Math.floor(this.score);
    const isNewBest = score > this.best;
    if (isNewBest) {
      this.best = score;
      saveNumber(BEST_KEY, score);
    }
    this.totalCells += this.runCells;
    saveNumber(CELLS_KEY, this.totalCells);
    this.hud.showGameOver(score, this.best, isNewBest, this.runCells, this.caught);
  }

  private tick = (time: number) => {
    this.timer.update(time);
    const rawDt = this.timer.getDelta();
    const dt = Math.min(rawDt, 1 / 20);
    let dz = 0;

    switch (this.state) {
      case 'playing':
        dz = this.play(dt);
        break;
      case 'crashed':
        // Brief slow motion that eases back to normal speed.
        this.timeScale = THREE.MathUtils.damp(this.timeScale, 1, 3, dt);
        this.crashTimer -= dt;
        this.player.update(dt * this.timeScale, 0, this.obstacles.groundAt(this.playerBox, this.prevPlayerBox));
        if (this.crashTimer <= 0) this.gameOver();
        break;
      case 'title':
        // Cruise slowly behind the menu so the scene feels alive.
        this.input.consume();
        dz = IDLE_SPEED * dt;
        this.advanceWorld(dz);
        this.player.update(dt, IDLE_SPEED);
        break;
      case 'over':
        this.input.consume();
        break;
    }

    const nitro = this.state === 'playing' && this.powerUps.has('nitro');
    const speedLines = nitro ? 1 : this.state === 'playing' ? THREE.MathUtils.clamp((this.difficulty - 0.3) / 0.5, 0, 1) : 0;
    this.police.update(dt, this.player.x, (x, z) => this.obstacles.surfaceAt(x, z));
    this.effects.update(dt * this.timeScale, dz, speedLines, this.speed * (nitro ? NITRO_SPEED_FACTOR : 1));
    this.updateCamera(dt, nitro);
    this.sky.position.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);

    this.quality.sample(rawDt, this.state === 'playing');
    this.debug.update(rawDt, this.renderer, this.quality.fps, this.quality.level);
  };

  /** One frame of gameplay; returns how far the world moved. */
  private play(dt: number) {
    const p = this.player;
    for (const action of this.input.consume()) p.handle(action);

    this.powerUps.update(dt);
    if (p.flying && this.powerUps.timeLeft('flight') < FLIGHT_WARNING) p.blink(0.1);
    this.invulnerable = Math.max(0, this.invulnerable - dt);

    this.speed = Math.min(MAX_SPEED, this.speed + SPEED_RAMP * dt);
    const nitro = this.powerUps.has('nitro');
    const worldSpeed = this.speed * (nitro ? NITRO_SPEED_FACTOR : 1);
    const dz = worldSpeed * dt;
    this.score += dz * this.multiplier;

    this.advanceWorld(dz);
    this.level.update(dz, this.difficulty);
    this.obstacles.update(dt, dz, this.speed);

    p.getBox(this.playerBox);
    p.update(dt, worldSpeed, this.obstacles.groundAt(this.playerBox, this.prevPlayerBox));
    if (!p.onGround || nitro) this.effects.thrusterTrail(dt, p.x, p.y);

    this.playerCenter.set(p.x, p.y + 0.6, 0);
    this.pickups.update(dt, dz, this.playerCenter, this.powerUps.has('magnet'));

    p.getBox(this.playerBox);
    const hit = this.obstacles.collide(this.playerBox, this.prevPlayerBox);
    if (hit) this.handleHit(hit);
    this.prevPlayerBox.copy(this.playerBox);

    this.hud.setScore(Math.floor(this.score));
    this.hud.setPowerUps(this.powerUps.list());
    return dz;
  }

  private advanceWorld(dz: number) {
    this.road.update(dz);
    this.scenery.update(dz);
  }

  private updateCamera(dt: number, nitro: boolean) {
    const { damp } = THREE.MathUtils;
    const p = this.player;
    const cam = this.camera;

    // Follow height loosely for hops, closely when riding a carrier, and only
    // partway when flying so the road visibly drops away below.
    const lift = p.flying ? 0.5 : p.y > 2 ? 0.8 : 0.35;
    this.crashZoom = damp(this.crashZoom, this.state === 'crashed' || this.state === 'over' ? 1 : 0, 4, dt);
    this.landBump = damp(this.landBump, 0, 10, dt);
    this.cameraBase.x = damp(this.cameraBase.x, p.x * 0.6, 6, dt);
    this.cameraBase.y = damp(this.cameraBase.y, CAMERA_HEIGHT + p.y * lift - this.crashZoom * 0.8, 5, dt);
    this.cameraBase.z = CAMERA_DISTANCE - this.crashZoom * 2.2;
    cam.position.copy(this.cameraBase);
    cam.position.y -= this.landBump;

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      const s = this.shake * 0.5;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
    }

    this.lookTarget.set(p.x * 0.4, 0.8 + p.y * (p.flying ? 0.25 : lift - 0.15), -12);
    cam.lookAt(this.lookTarget);

    // Widen the view as speed builds (and a lot more on nitro).
    const speedFov = this.state === 'playing' ? Math.max(0, this.difficulty) * 8 + (nitro ? 12 : 0) : 0;
    const fov = damp(cam.fov, this.baseFov + speedFov, 3, dt);
    if (Math.abs(fov - cam.fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
      this.effects.setViewport(this.renderer.domElement.height, fov);
    }
  }

  private applyQuality(level: QualityLevel) {
    this.maxPixelRatio = level.pixelRatio;
    outlineMaterial.visible = level.outlines;
    this.effects.quality = level.particles;
    this.resize();
  }

  private resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.maxPixelRatio));
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;

    // Portrait phones are narrow: raise the vertical FOV so all three lanes
    // stay visible, keeping roughly a 50° horizontal view.
    const vFov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(25)) / this.camera.aspect));
    this.baseFov = THREE.MathUtils.clamp(vFov, 58, 80);
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.effects.setViewport(this.renderer.domElement.height, this.camera.fov);
  };
}

function loadNumber(key: string) {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

function saveNumber(key: string, value: number) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Storage unavailable (private mode); progress just won't persist.
  }
}
