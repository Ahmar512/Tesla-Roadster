import * as THREE from 'three';
import {
  CAMERA_DISTANCE,
  CAMERA_HEIGHT,
  DESPAWN_Z,
  FOG_FAR,
  FOG_NEAR,
  GRACE_TIME,
  IDLE_SPEED,
  MAX_SPEED,
  NITRO_SPEED_FACTOR,
  SKY_HORIZON,
  SPEED_TIME,
  START_SPEED,
  STUMBLE_SLOWDOWN,
} from '../config';
import { AudioEngine } from '../audio/AudioEngine';
import type { Track } from '../audio/music';
import { Police } from '../chaser/Police';
import { Effects } from '../fx/Effects';
import { MAX_UPGRADE, PAINTS, powerUpDuration, REVIVE_BASE_PRICE, SHIELD_WEIGHT_PER_LEVEL } from '../meta/catalog';
import { ACHIEVEMENT_REWARD } from '../meta/achievements';
import { Meta } from '../meta/Meta';
import { platform } from '../services/platform';
import { LevelGenerator } from '../level/LevelGenerator';
import { ObstacleManager, type Hit } from '../obstacles/ObstacleManager';
import { Pickups } from '../pickups/Pickups';
import { Player } from '../player/Player';
import { outlineMaterial } from '../render/materials';
import { createSky } from '../render/Sky';
import { DebugOverlay } from '../ui/DebugOverlay';
import { Garage } from '../ui/Garage';
import { Hud } from '../ui/Hud';
import { MetaPanels } from '../ui/MetaPanels';
import { Menus, type RunResult } from '../ui/Menus';
import { Road } from '../world/Road';
import { Environment, ZONE_NAMES } from '../world/Environment';
import { Scenery } from '../world/Scenery';
import { AutoQuality, type QualityLevel } from './AutoQuality';
import { Input } from './Input';
import { POWER_UPS, PowerUps, type PowerUpType } from './PowerUps';
import { Settings } from './Settings';
import { Tutorial, TUTORIAL_LENGTH } from './Tutorial';

type State = 'title' | 'garage' | 'playing' | 'paused' | 'countdown' | 'crashed' | 'revive' | 'over';

const CRASH_DELAY = 1.1; // seconds between the crash and the game-over screen
const CRASH_SLOWMO = 0.2; // time scale right after impact
const NEAR_MISS_POINTS = 50;
const FLIGHT_WARNING = 1.2; // the car blinks this long before Flight Mode ends
const COUNTDOWN = 3; // seconds of 3-2-1 before play resumes
const REVIVE_TIME = 5; // seconds to accept the "Continue?" offer
const REVIVE_CLEAR = 50; // meters of road ahead cleared when reviving
const GARAGE_SPIN = 0.35; // radians per second the garage camera circles the car
const CAMERA_NEAR = 0.1;
const GARAGE_NEAR = 3;
const CARRIER_DECK = 1.5; // driving higher than this means riding a carrier
const CELL_STREAK_GAP = 0.5; // cells collected closer together than this keep the chime climbing

const MUSIC_FOR: Record<State, Track | null> = {
  title: 'menu',
  garage: 'menu',
  playing: 'run',
  paused: 'run',
  countdown: 'run',
  crashed: null,
  revive: null,
  over: 'menu',
};
const SIREN_STATES: State[] = ['playing', 'countdown', 'crashed', 'revive'];

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(60, 1, CAMERA_NEAR, 400);
  private readonly cameraBase = new THREE.Vector3(0, CAMERA_HEIGHT, CAMERA_DISTANCE);
  private readonly lookTarget = new THREE.Vector3();
  private readonly timer = new THREE.Timer();
  private readonly sky = createSky();

  private readonly input = new Input();
  private readonly settings = new Settings();
  private readonly meta = new Meta();
  private readonly panels = new MetaPanels(this.meta);
  private readonly garage = new Garage(this.meta);
  private readonly audio = new AudioEngine();
  private readonly hud: Hud;
  private readonly menus: Menus;
  private readonly debug = new DebugOverlay();
  private readonly quality: AutoQuality;
  private readonly player = new Player();
  private readonly police = new Police();
  private readonly powerUps = new PowerUps();
  private readonly road: Road;
  private readonly scenery: Scenery;
  private readonly environment: Environment;
  private readonly obstacles: ObstacleManager;
  private readonly pickups: Pickups;
  private readonly level: LevelGenerator;
  private readonly tutorial: Tutorial;
  private readonly effects: Effects;
  private readonly playerBox = new THREE.Box3();
  private readonly prevPlayerBox = new THREE.Box3();
  private readonly playerCenter = new THREE.Vector3();

  private state: State = 'title';
  private speed = IDLE_SPEED;
  private score = 0;
  private runCells = 0;
  private distance = 0;
  private nearMisses = 0;
  private nearMissPoints = 0;
  /** Revives bought with cells this run (each costs double the last). */
  private revives = 0;
  private adRevived = false;
  private adShowing = false;
  private cellsDoubled = false;
  private riding = false;
  private garageAngle = 0;
  private cellStreak = 0;
  private cellStreakTimer = 0;
  private reviveTimer = 0;
  private countdown = 0;
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

    this.road = new Road(this.scene, this.renderer);
    this.scenery = new Scenery(this.scene);
    // Owns the lights, sky and fog colors, which change with the environment.
    this.environment = new Environment(this.scene, this.sky, this.road, this.scenery);
    this.obstacles = new ObstacleManager(this.scene);
    this.pickups = new Pickups(this.scene);
    this.level = new LevelGenerator(this.obstacles, this.pickups);
    this.tutorial = new Tutorial(this.obstacles, this.pickups);
    this.effects = new Effects(this.scene, this.camera);
    this.scene.add(this.player.object, this.police.object);
    this.player.reset();
    this.wireEvents();

    this.quality = new AutoQuality((level) => this.applyQuality(level));
    this.quality.setMode(this.settings.data.quality);
    this.audio.setVolumes(this.settings.data.music, this.settings.data.sfx);
    this.settings.onChange = (key) => {
      if (key === 'quality') this.quality.setMode(this.settings.data.quality);
      if (key === 'music' || key === 'sfx') this.audio.setVolumes(this.settings.data.music, this.settings.data.sfx);
    };
    document.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) this.audio.play('click');
    });
    this.hud = new Hud(() => this.pause());
    this.menus = new Menus(this.settings, {
      play: () => this.start(),
      resume: () => this.resume(),
      home: () => this.goHome(),
      revive: () => this.revive(),
      reviveWithAd: () => this.reviveWithAd(),
      declineRevive: () => this.gameOver(),
      doubleCells: () => this.doubleCells(),
      garage: () => this.openGarage(),
      closeGarage: () => this.closeGarage(),
      missions: () => this.panels.openMissions(),
      trophies: () => this.panels.openTrophies(),
    });
    this.wireMeta();
    this.showTitle();
    window.addEventListener('keydown', this.onKeyDown);

    // Never keep running while the app is in the background.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
      this.audio.setBackground(document.hidden);
    });
    window.addEventListener('blur', () => this.pause());

    window.addEventListener('resize', this.resize);
    this.resize();
    this.timer.connect(document); // pauses the clock while the tab is hidden
    this.renderer.setAnimationLoop(this.tick);
  }

  private get difficulty() {
    return (this.speed - START_SPEED) / (MAX_SPEED - START_SPEED);
  }

  /** Score multiplier: the permanent one from missions, doubled by the ×2 power-up. */
  private get multiplier() {
    return this.meta.data.multiplier * (this.powerUps.has('multiplier') ? 2 : 1);
  }

  private wireMeta() {
    const { meta, panels } = this;
    meta.profile.onChange = () => panels.refreshTitle();
    meta.onMissionDone = (text, reward) => {
      panels.toast('🎯', 'MISSION COMPLETE', `${escapeHtml(text)} · <span class="cell-icon"></span>${reward}`);
      this.audio.play('powerUp');
    };
    meta.onSetDone = (multiplier) => {
      panels.toast('✖️', `MULTIPLIER ×${multiplier}!`, 'All missions done. New ones are waiting.');
      this.audio.play('newBest');
    };
    meta.onAchievement = (def) => {
      panels.toast(def.icon, def.name, `${escapeHtml(def.text)} · <span class="cell-icon"></span>${ACHIEVEMENT_REWARD}`);
      this.audio.play('newBest');
    };
    panels.onClaim = () => this.audio.play('newBest');

    this.garage.onPreview = (paint, skin) => this.player.setLook(paint, skin);
    this.garage.onPurchase = () => {
      this.audio.play('powerUp');
      this.settings.haptic('success');
    };
    this.garage.onDenied = () => this.audio.play('beep', 1);
    this.applyLook();

    this.powerUps.durationOf = (type) => powerUpDuration(type, meta.data.upgrades[type]);
    this.police.onEscape = () => meta.add('escapes');
    this.environment.onZoneChange = (zone) => {
      this.hud.popup(ZONE_NAMES[zone], true);
      if (zone !== 'city' && this.state === 'playing') meta.add(zone);
    };
  }

  private applyLook() {
    const { paint, skin } = this.meta.data;
    this.player.setLook(PAINTS.find((p) => p.id === paint)!.color, skin);
  }

  private showTitle() {
    this.setState('title');
    this.menus.showTitle(this.meta.data.best);
    this.panels.refreshTitle();
    this.panels.openDailyIfDue();
  }

  private openGarage() {
    if (this.state !== 'title') return;
    this.panels.closeAll();
    this.garage.open();
    this.garageAngle = 0;
    this.setState('garage');
    this.menus.show('garage');
  }

  private closeGarage() {
    if (this.state !== 'garage') return;
    this.garage.close();
    this.showTitle();
  }

  private wireEvents() {
    this.player.events = {
      jump: () => {
        this.effects.thrusterBurst(this.player.x, this.player.y);
        this.audio.play('jump');
        if (this.state === 'playing') this.meta.add('jumps');
      },
      land: () => {
        this.effects.landing(this.player.x);
        this.audio.play('land');
        this.landBump = 0.25;
      },
      laneChange: (direction) => {
        this.effects.laneChange(this.player.x, direction);
        this.audio.play('laneChange');
        if (this.state === 'playing') this.meta.add('laneChanges');
        this.obstacles.markNearMisses(this.player.currentLane - direction);
      },
    };

    this.obstacles.onNearMiss = () => {
      if (this.state !== 'playing') return;
      const points = NEAR_MISS_POINTS * this.multiplier;
      this.score += points;
      this.nearMisses++;
      this.nearMissPoints += points;
      this.meta.add('nearMisses');
      this.hud.popup(`NEAR MISS +${points}`);
      this.audio.play('nearMiss');
    };

    this.tutorial.onPrompt = (action) => {
      this.hud.showTutorial(action);
      if (action) this.audio.play('prompt');
    };
    this.tutorial.onDone = () => {
      this.hud.popup("YOU'RE READY!", true);
      this.settings.set('tutorial', false);
    };

    this.pickups.onCell = (x, y, z) => {
      this.runCells++;
      this.cellStreak = this.cellStreakTimer > 0 ? this.cellStreak + 1 : 0;
      this.cellStreakTimer = CELL_STREAK_GAP;
      this.audio.play('cell', this.cellStreak);
      this.meta.add('cells');
      this.effects.collect(x, y, z);
      this.hud.setCells(this.runCells);
    };
    this.pickups.onPowerUp = (type, x, y) => this.activatePowerUp(type, x, y);

    this.powerUps.onExpire = (type) => {
      this.audio.play('powerDown');
      if (type === 'flight') this.player.endFlight();
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
    this.audio.play('powerUp');
    this.settings.haptic('tap');
    this.meta.add('powerUps');

    if (type === 'flight') {
      this.player.startFlight();
      this.level.startFlight(this.speed * this.powerUps.durationOf('flight'));
      this.meta.add('flights');
    }
    if (type === 'magnet') this.meta.add('magnets');
    if (type === 'shield') this.player.setShield(true);
  }

  private setState(state: State) {
    this.state = state;
    document.body.dataset.state = state; // CSS shows the matching HUD parts
    this.audio.setMusic(MUSIC_FOR[state]);
    this.audio.setDucked(state === 'paused');
  }

  private start() {
    if (this.state !== 'title' && this.state !== 'over') return;
    this.resetWorld();
    if (this.settings.data.tutorial) {
      this.tutorial.start();
      this.level.reset(-TUTORIAL_LENGTH);
    }
    this.speed = START_SPEED;
    this.score = 0;
    this.runCells = 0;
    this.distance = 0;
    this.nearMisses = 0;
    this.nearMissPoints = 0;
    this.revives = 0;
    this.adRevived = false;
    this.riding = false;
    this.meta.startRun();
    const { upgrades } = this.meta.data;
    this.level.shieldBonus = upgrades.shield * SHIELD_WEIGHT_PER_LEVEL;
    this.hud.reset();
    if (upgrades.shield >= MAX_UPGRADE) {
      this.powerUps.activate('shield');
      this.player.setShield(true);
    }
    this.panels.closeAll();
    this.menus.show(null);
    this.setState('playing');
  }

  private resetWorld() {
    this.environment.reset();
    this.player.reset();
    this.police.reset();
    this.obstacles.reset();
    this.pickups.reset();
    this.level.reset();
    this.tutorial.stop();
    this.powerUps.reset();
    this.input.consume();
    this.speed = IDLE_SPEED;
    this.caught = false;
    this.invulnerable = 0;
    this.timeScale = 1;
    this.player.getBox(this.prevPlayerBox);
  }

  private pause() {
    if (this.state !== 'playing' && this.state !== 'countdown') return;
    this.setState('paused');
    this.menus.show('pause');
  }

  /** Back to the run after a 3-2-1 countdown. */
  private resume() {
    if (this.state === 'paused') this.startCountdown();
  }

  private startCountdown() {
    this.countdown = COUNTDOWN;
    this.audio.play('beep', COUNTDOWN);
    this.menus.show(null);
    this.setState('countdown');
  }

  /** Quit to the title screen; a run in progress still banks its cells and score. */
  private goHome() {
    if (this.state === 'paused') this.saveRun();
    else if (this.state !== 'over') return;
    this.resetWorld();
    this.showTitle();
  }

  private get revivePrice() {
    return REVIVE_BASE_PRICE * 2 ** this.revives;
  }

  /** After a crash: "Continue?" for cells, or for an ad once per run. Straight to game over if neither is possible. */
  private offerRevive() {
    const ad = platform.adsAvailable && !this.adRevived;
    if (!ad && this.meta.data.cells < this.revivePrice) {
      this.gameOver();
      return;
    }
    this.reviveTimer = REVIVE_TIME;
    this.setState('revive');
    this.menus.showRevive({ caught: this.caught, price: this.revivePrice, cells: this.meta.data.cells, ad });
  }

  private revive() {
    if (this.state !== 'revive' || this.adShowing || !this.meta.spend(this.revivePrice)) return;
    this.revives++;
    this.continueRun();
  }

  private reviveWithAd() {
    if (this.state !== 'revive' || this.adShowing || this.adRevived) return;
    this.adShowing = true;
    void platform.showRewardedAd().then((watched) => {
      this.adShowing = false;
      if (!watched || this.state !== 'revive') return;
      this.adRevived = true;
      this.continueRun();
    });
  }

  private continueRun() {
    this.obstacles.clearRange(DESPAWN_Z, -REVIVE_CLEAR);
    this.police.release();
    this.powerUps.reset();
    this.player.revive();
    this.player.setShield(false);
    this.hud.setPowerUps([]);
    this.caught = false;
    this.timeScale = 1;
    this.invulnerable = GRACE_TIME;
    this.player.blink(GRACE_TIME);
    this.player.getBox(this.prevPlayerBox);
    this.startCountdown();
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (this.menus.settingsOpen || this.panels.anyOpen || this.adShowing) {
      if (e.code === 'Escape') {
        this.menus.closeSettings();
        this.panels.closeAll();
      }
      return;
    }
    if (this.state === 'garage') {
      if (e.code === 'Escape') this.closeGarage();
      return;
    }
    if (e.code === 'Enter') {
      if (this.state === 'title' || this.state === 'over') this.start();
      else if (this.state === 'paused') this.resume();
      else if (this.state === 'revive') this.revive();
    } else if (e.code === 'Escape' || e.code === 'KeyP') {
      if (this.state === 'playing' || this.state === 'countdown') this.pause();
      else if (this.state === 'paused') this.resume();
      else if (this.state === 'revive') this.gameOver();
    }
  };

  private handleHit({ obstacle, kind }: Hit) {
    if (kind === 'top') {
      this.player.bounce();
      this.effects.landing(this.player.x);
      this.audio.play('land');
      return;
    }
    if (this.powerUps.has('nitro')) {
      this.obstacles.knock(obstacle, this.player.x);
      this.effects.smash(obstacle.x, this.player.y);
      this.audio.play('smash');
      this.meta.add('smashes');
      this.settings.haptic('bump');
      this.shake = 0.15;
      return;
    }
    if (this.invulnerable > 0) return;
    if (this.powerUps.has('shield')) {
      this.powerUps.consume('shield');
      this.player.setShield(false);
      this.obstacles.knock(obstacle, this.player.x);
      this.effects.shieldBreak(this.player.x, this.player.y);
      this.audio.play('shieldBreak');
      this.meta.add('shieldBlocks');
      this.settings.haptic('hit');
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
    this.audio.play('stumble');
    this.settings.haptic('bump');
    if (this.police.stumble()) {
      this.caught = true;
      this.meta.add('busts');
      this.crash();
    } else {
      this.hud.popup('WATCH OUT!');
    }
  }

  private crash() {
    this.setState('crashed');
    this.crashTimer = CRASH_DELAY;
    this.police.arrest();
    this.tutorial.stop();
    this.settings.haptic('crash');
    if (this.caught) {
      this.shake = 0.3;
      return;
    }
    this.audio.play('crash');
    this.timeScale = CRASH_SLOWMO;
    this.shake = 0.6;
    this.effects.crash(this.player.x, this.player.y);
    this.player.knock();
  }

  private gameOver() {
    if (this.state !== 'crashed' && this.state !== 'revive') return;
    this.setState('over');
    const run = this.saveRun();
    this.cellsDoubled = false;
    this.menus.showGameOver(run, platform.adsAvailable && run.cells > 0);
    if (run.isNewBest) {
      this.audio.play('newBest');
      this.settings.haptic('success');
    }
  }

  /** Banks the run's cells and best score. */
  private saveRun(): RunResult {
    const score = Math.floor(this.score);
    const isNewBest = this.meta.endRun(score, this.runCells);
    return {
      score,
      best: this.meta.data.best,
      isNewBest,
      cells: this.runCells,
      distance: Math.floor(this.distance),
      nearMisses: this.nearMisses,
      nearMissPoints: this.nearMissPoints,
      caught: this.caught,
    };
  }

  /** Game over: watch an ad to double the cells from this run. */
  private doubleCells() {
    if (this.state !== 'over' || this.cellsDoubled || this.adShowing) return;
    this.adShowing = true;
    void platform.showRewardedAd().then((watched) => {
      this.adShowing = false;
      if (!watched || this.cellsDoubled) return;
      this.cellsDoubled = true;
      this.meta.earn(this.runCells);
      this.menus.setDoubled(true, this.runCells * 2);
      this.audio.play('newBest');
    });
  }

  private tick = (time: number) => {
    this.timer.update(time);
    const rawDt = this.timer.getDelta();
    const dt = Math.min(rawDt, 1 / 20);
    let dz = 0;
    let worldDt = dt; // frame time for effects and the police car; 0 while frozen

    switch (this.state) {
      case 'playing':
        // The tutorial eases time to a stop while it waits for a swipe.
        worldDt = dt * this.tutorial.update(dt);
        dz = this.play(worldDt);
        break;
      case 'paused':
        this.input.consume();
        worldDt = 0;
        break;
      case 'countdown': {
        this.input.consume();
        worldDt = 0;
        const shown = Math.ceil(this.countdown);
        this.countdown -= dt;
        const count = Math.max(0, Math.ceil(this.countdown));
        if (count !== shown) this.audio.play('beep', count);
        this.hud.setCountdown(count);
        if (this.countdown <= 0) this.setState('playing');
        break;
      }
      case 'crashed':
      case 'revive':
        this.input.consume();
        // Brief slow motion that eases back to normal speed.
        this.timeScale = THREE.MathUtils.damp(this.timeScale, 1, 3, dt);
        this.player.update(dt * this.timeScale, 0, this.obstacles.groundAt(this.playerBox, this.prevPlayerBox));
        if (this.state === 'crashed') {
          this.crashTimer -= dt;
          if (this.crashTimer <= 0) this.offerRevive();
        } else {
          if (!this.adShowing) this.reviveTimer -= dt;
          this.menus.setReviveTime(this.reviveTimer / REVIVE_TIME, Math.ceil(this.reviveTimer));
          if (this.reviveTimer <= 0) this.gameOver();
        }
        break;
      case 'title':
        // Cruise slowly behind the menu so the scene feels alive.
        this.input.consume();
        dz = IDLE_SPEED * dt;
        this.advanceWorld(dz);
        this.player.update(dt, IDLE_SPEED);
        break;
      case 'garage':
        this.input.consume();
        this.player.update(dt, 0);
        break;
      case 'over':
        this.input.consume();
        break;
    }

    const nitro = this.state === 'playing' && this.powerUps.has('nitro');
    const speedLines = nitro ? 1 : this.state === 'playing' ? THREE.MathUtils.clamp((this.difficulty - 0.3) / 0.5, 0, 1) : 0;
    this.police.update(worldDt, this.player.x, (x, z) => this.obstacles.surfaceAt(x, z));
    this.updateAudio(dt, dz, nitro);
    this.effects.update(worldDt * this.timeScale, dz, speedLines, this.speed * (nitro ? NITRO_SPEED_FACTOR : 1));
    this.updateCamera(this.state === 'paused' ? 0 : dt, nitro);
    this.sky.position.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);

    this.quality.sample(rawDt, this.state === 'playing');
    this.debug.update(rawDt, this.renderer, this.quality.fps, this.quality.level);
  };

  /** One frame of gameplay; returns how far the world moved. */
  private play(dt: number) {
    const p = this.player;
    for (const action of this.input.consume()) {
      if (!this.tutorial.allows(action)) continue;
      if (action === 'down' && p.onGround) this.meta.add('ducks');
      p.handle(action);
    }

    this.powerUps.update(dt);
    if (p.flying && this.powerUps.timeLeft('flight') < FLIGHT_WARNING) p.blink(0.1);
    this.invulnerable = Math.max(0, this.invulnerable - dt);

    if (!this.tutorial.active) this.speed += (MAX_SPEED - this.speed) * (1 - Math.exp(-dt / SPEED_TIME));
    const nitro = this.powerUps.has('nitro');
    const worldSpeed = this.speed * (nitro ? NITRO_SPEED_FACTOR : 1);
    const dz = worldSpeed * dt;
    this.distance += dz;
    this.score += dz * this.multiplier;

    this.environment.update(this.distance);
    this.advanceWorld(dz);
    this.tutorial.scroll(dz);
    this.level.update(dz, this.difficulty);
    this.obstacles.update(dt, dz, this.speed);

    p.getBox(this.playerBox);
    p.update(dt, worldSpeed, this.obstacles.groundAt(this.playerBox, this.prevPlayerBox));
    if (!p.onGround || nitro) this.effects.thrusterTrail(dt, p.x, p.y);
    const riding = p.onGround && p.y > CARRIER_DECK;
    if (riding && !this.riding) this.meta.add('carriers');
    this.riding = riding;

    this.playerCenter.set(p.x, p.y + 0.6, 0);
    this.pickups.update(dt, dz, this.playerCenter, this.powerUps.has('magnet'));

    p.getBox(this.playerBox);
    const hit = this.obstacles.collide(this.playerBox, this.prevPlayerBox);
    if (hit) this.handleHit(hit);
    this.prevPlayerBox.copy(this.playerBox);

    this.hud.setScore(Math.floor(this.score));
    this.hud.setMultiplier(this.multiplier, this.powerUps.has('multiplier'));
    this.hud.setPowerUps(this.powerUps.list());
    this.meta.reach('score', Math.floor(this.score));
    this.meta.reach('distance', Math.floor(this.distance));
    return dz;
  }

  /** The motor whine follows the car's speed; the siren plays while the police are around. */
  private updateAudio(dt: number, dz: number, nitro: boolean) {
    const loud = this.state === 'playing' ? 1 : this.state === 'title' ? 0.35 : 0;
    this.audio.setMotor(loud, dt > 0 ? dz / dt : 0, nitro);
    this.audio.setSiren(this.police.active && SIREN_STATES.includes(this.state));
    this.cellStreakTimer -= dt;
  }

  private advanceWorld(dz: number) {
    this.road.update(dz);
    this.scenery.update(dz);
  }

  private updateCamera(dt: number, nitro: boolean) {
    const { damp } = THREE.MathUtils;
    const p = this.player;
    const cam = this.camera;

    if (this.state === 'garage') {
      this.orbitCar(dt);
      return;
    }
    this.setNear(CAMERA_NEAR);

    // Follow height loosely for hops, closely when riding a carrier, and only
    // partway when flying so the road visibly drops away below.
    const lift = p.flying ? 0.5 : p.y > 2 ? 0.8 : 0.35;
    this.crashZoom = damp(this.crashZoom, ['crashed', 'revive', 'over'].includes(this.state) ? 1 : 0, 4, dt);
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

  /** Garage turntable: the camera circles the parked car. */
  private orbitCar(dt: number) {
    const cam = this.camera;
    const p = this.player;
    this.garageAngle += GARAGE_SPIN * dt;
    const a = this.garageAngle + 0.6;
    cam.position.set(p.x + Math.sin(a) * 7.5, 3, Math.cos(a) * 7.5);
    // Aim off the car so it sits clear of the shop: below it in portrait (the
    // shop is a bottom sheet), to its right in landscape (a side panel).
    const side = cam.aspect > 1.2 ? 3 : 0;
    this.lookTarget.set(p.x + Math.cos(a) * side, cam.aspect > 1.2 ? 0 : -1.4, -Math.sin(a) * side);
    cam.lookAt(this.lookTarget);
    // Circling wide takes the camera past roadside lamps and trees; clip
    // whatever is right next to it so the car is never hidden.
    this.setNear(GARAGE_NEAR);
    // Leaving the garage, the chase camera eases back from here.
    this.cameraBase.copy(cam.position);
  }

  private setNear(near: number) {
    if (this.camera.near === near) return;
    this.camera.near = near;
    this.camera.updateProjectionMatrix();
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

function escapeHtml(text: string) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
