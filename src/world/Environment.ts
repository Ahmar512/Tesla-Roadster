import * as THREE from 'three';
import { FOG_FAR, FOG_NEAR, SKY_HORIZON, SKY_TOP, ZONE_LENGTH, ZONE_TRANSITION } from '../config';
import type { Road } from './Road';
import type { Scenery } from './Scenery';

export type Zone = 'city' | 'desert' | 'mars';

/** The order environments rotate in during a run. */
export const ZONES: Zone[] = ['city', 'desert', 'mars'];

export const ZONE_NAMES: Record<Zone, string> = { city: 'CITY', desert: 'DESERT HIGHWAY', mars: 'MARS' };

interface Palette {
  skyTop: number;
  skyHorizon: number; // also the fog and background color
  sunGlow: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  sunLight: number;
  sunIntensity: number;
  fogNear: number;
  fogFar: number;
  ground: number;
  // Multiplied over the road textures.
  road: number;
  paving: number;
  curb: number;
  side: number;
}

const PALETTES: Record<Zone, Palette> = {
  city: {
    skyTop: SKY_TOP,
    skyHorizon: SKY_HORIZON,
    sunGlow: 0xfff2cc,
    hemiSky: 0xffffff,
    hemiGround: 0x9cbf86,
    hemiIntensity: 1.5,
    sunLight: 0xfff3df,
    sunIntensity: 2.2,
    fogNear: FOG_NEAR,
    fogFar: FOG_FAR,
    ground: 0x8fd16f,
    road: 0xffffff,
    paving: 0xffffff,
    curb: 0xffffff,
    side: 0xb9b2a4,
  },
  // Warm, hazy and sun-bleached.
  desert: {
    skyTop: 0x4f9be0,
    skyHorizon: 0xf7e3bf,
    sunGlow: 0xffe2a8,
    hemiSky: 0xfff3df,
    hemiGround: 0xd9b27a,
    hemiIntensity: 1.5,
    sunLight: 0xffe9c4,
    sunIntensity: 2.4,
    fogNear: 55,
    fogFar: 160,
    ground: 0xe9c38a,
    road: 0xfff1e0,
    paving: 0xf2cf98,
    curb: 0xffe6c4,
    side: 0xc89a62,
  },
  // Butterscotch dusty sky with a cool sun glow, red-orange ground.
  mars: {
    skyTop: 0xc2714b,
    skyHorizon: 0xf0bf94,
    sunGlow: 0xe6f0ff,
    hemiSky: 0xffe0c8,
    hemiGround: 0xb8603e,
    hemiIntensity: 1.4,
    sunLight: 0xffdcc0,
    sunIntensity: 2.2,
    fogNear: 50,
    fogFar: 150,
    ground: 0xc9643c,
    road: 0xf0c4ac,
    paving: 0xe08a62,
    curb: 0xd99478,
    side: 0xa04a2c,
  },
};

const COLOR_KEYS = ['skyTop', 'skyHorizon', 'sunGlow', 'hemiSky', 'hemiGround', 'sunLight', 'ground', 'road', 'paving', 'curb', 'side'] as const;
type ColorKey = (typeof COLOR_KEYS)[number];

const zoneAt = (index: number) => ZONES[((index % ZONES.length) + ZONES.length) % ZONES.length];

/**
 * Rotates the scenery between environments as the run goes on. Approaching
 * each boundary, the sky, fog, light and ground colors blend over
 * ZONE_TRANSITION meters, while props recycling at the far end already come
 * from the next environment, so the new region drives in from the horizon.
 */
export class Environment {
  /** Fires when the player reaches a new environment (the end of the blend, as its props arrive). */
  onZoneChange?: (zone: Zone) => void;

  private readonly hemi = new THREE.HemisphereLight();
  private readonly sun = new THREE.DirectionalLight();
  private readonly skyUniforms: Record<string, THREE.IUniform>;
  private readonly colors = Object.fromEntries(COLOR_KEYS.map((k) => [k, new THREE.Color()])) as Record<ColorKey, THREE.Color>;
  private readonly from = new THREE.Color();
  private readonly to = new THREE.Color();
  private current: Zone = 'city';
  private applied = '';

  constructor(
    private readonly scene: THREE.Scene,
    sky: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>,
    private readonly road: Road,
    private readonly scenery: Scenery,
  ) {
    this.skyUniforms = sky.material.uniforms;
    this.sun.position.set(5, 12, 9); // from behind the camera, so the rears of cars are lit
    scene.add(this.hemi, this.sun);
    this.reset();
  }

  /** The environment the player is in. */
  get zone() {
    return this.current;
  }

  /** Back to the city (title screen, new run). */
  reset() {
    this.current = 'city';
    this.scenery.reset();
    this.blend('city', 'city', 1);
  }

  /** Call every frame with the distance driven this run. */
  update(distance: number) {
    // The zone we're in or heading into, and how far into its transition we are.
    const index = Math.floor((distance + ZONE_TRANSITION) / ZONE_LENGTH);
    const start = index * ZONE_LENGTH - ZONE_TRANSITION;
    const t = THREE.MathUtils.smoothstep(distance, start, start + ZONE_TRANSITION);
    this.blend(zoneAt(index - 1), zoneAt(index), t);

    // Props recycle ~150 m ahead, so switch them over one transition early.
    this.scenery.zone = zoneAt(Math.floor((distance + ZONE_TRANSITION) / ZONE_LENGTH));

    const zone = zoneAt(Math.floor(distance / ZONE_LENGTH));
    if (zone !== this.current) {
      this.current = zone;
      this.onZoneChange?.(zone);
    }
  }

  private blend(fromZone: Zone, toZone: Zone, t: number) {
    const key = `${fromZone}>${toZone}:${t.toFixed(3)}`;
    if (key === this.applied) return;
    this.applied = key;

    const a = PALETTES[fromZone];
    const b = PALETTES[toZone];
    for (const k of COLOR_KEYS) this.colors[k].copy(this.from.set(a[k])).lerp(this.to.set(b[k]), t);
    const mix = (k: 'hemiIntensity' | 'sunIntensity' | 'fogNear' | 'fogFar') => THREE.MathUtils.lerp(a[k], b[k], t);
    const c = this.colors;

    this.skyUniforms.uTop.value.copy(c.skyTop);
    this.skyUniforms.uHorizon.value.copy(c.skyHorizon);
    this.skyUniforms.uSunColor.value.copy(c.sunGlow);
    (this.scene.background as THREE.Color).copy(c.skyHorizon);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(c.skyHorizon);
    fog.near = mix('fogNear');
    fog.far = mix('fogFar');

    this.hemi.color.copy(c.hemiSky);
    this.hemi.groundColor.copy(c.hemiGround);
    this.hemi.intensity = mix('hemiIntensity');
    this.sun.color.copy(c.sunLight);
    this.sun.intensity = mix('sunIntensity');

    this.road.setColors(c);
  }
}
