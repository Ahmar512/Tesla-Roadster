import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROAD_WIDTH } from '../config';
import { mergeParts } from '../render/geometry';
import { propMaterial, toon } from '../render/materials';
import type { Zone } from './Environment';
import { PropStrip, tint, type PropStripOptions } from './PropStrip';
import { CURB_WIDTH, SIDEWALK_WIDTH } from './Road';

const EDGE = ROAD_WIDTH / 2;
const BLOCK = 14; // spacing between building lots
const { randFloat, randInt } = THREE.MathUtils;
const pick = <T>(items: readonly T[]) => items[randInt(0, items.length - 1)];

const BUILDING_COLORS = [0xffc98b, 0xf7efe0, 0xa9d3f5, 0xffb0a8, 0xc3e6a5, 0xdcc8f7, 0xfff0a0];
const BILLBOARD_COLORS = [0xff6b6b, 0x4dabf7, 0xffd43b, 0x69db7c, 0xb197fc];
const BUSH_COLORS = [0x4caf50, 0x5cbf5a, 0x43a047, 0x7ccf6a];
const SCRUB_COLORS = [0x9a9a5a, 0x8d8a4e, 0xb0a060, 0x7f8a4a];
const MARS_ROCK_COLORS = [0xc77a55, 0xa0553a, 0xd9956a, 0x8f4a32, 0xb8684a];
// Multiplied over the (orange) mesa geometry.
const MESA_TINT: Partial<Record<Zone, number>> = { desert: 0xffffff, mars: 0xe2826c };
/** Beyond the sidewalk. */
const VERGE = EDGE + CURB_WIDTH + SIDEWALK_WIDTH;

type Place = PropStripOptions['place'];

interface BuildingSize {
  width: number;
  depth: number;
  height: number;
}

const BUILDINGS: BuildingSize[] = [
  { width: 6, depth: 9, height: 9.5 },
  { width: 8, depth: 11, height: 16 },
  { width: 5.5, depth: 8, height: 6.5 },
  { width: 7, depth: 12, height: 22 },
];

/**
 * Everything lining the road. Each kind of prop is one PropStrip (a single
 * instanced draw call); building lots interleave several strips so the
 * skyline varies.
 *
 * Each strip belongs to one or more environments. A prop that recycles
 * while another environment is active is hidden, and a strip with nothing
 * showing is skipped entirely, so only the active environment costs draw calls.
 */
export class Scenery {
  /** The environment newly recycled props are drawn from. */
  zone: Zone = 'city';
  private readonly strips: PropStrip[] = [];
  /** Whether any prop from outside the city has been placed since the last reset. */
  private visited = false;

  constructor(scene: THREE.Scene) {
    /** Limits a strip to some environments: elsewhere its props are hidden. */
    const only =
      (zones: Zone[], place: Place): Place =>
      (slot, index, mesh) => {
        slot.scale.set(1, 1, 1);
        if (this.zone !== 'city') this.visited = true;
        if (zones.includes(this.zone)) place(slot, index, mesh);
        else slot.scale.setScalar(0);
      };

    // Building lots: four building shapes and a billboard lot take turns.
    const lots = BUILDINGS.length + 1;
    const windowMaterial = toon({ map: createWindowTexture() });
    BUILDINGS.forEach((size, i) => {
      this.strips.push(
        new PropStrip(scene, createBuildingGeometry(size), windowMaterial, {
          perSide: 3,
          spacing: lots * BLOCK,
          firstZ: 10 - i * BLOCK,
          rightOffset: 2 * BLOCK,
          place: only(['city'], (slot, index, mesh) => {
            slot.x = slot.side * (EDGE + 5.2 + size.width / 2);
            slot.scale.set(1, randFloat(0.8, 1.3), 1);
            slot.rotY = Math.random() < 0.5 ? 0 : Math.PI;
            tint(mesh, index, pick(BUILDING_COLORS));
          }),
        }),
      );
    });

    this.strips.push(
      new PropStrip(scene, createBillboardGeometry(), propMaterial, {
        perSide: 3,
        spacing: lots * BLOCK,
        firstZ: 10 - BUILDINGS.length * BLOCK,
        rightOffset: 2 * BLOCK,
        place: only(['city'], (slot, index, mesh) => {
          slot.x = slot.side * (EDGE + 7);
          slot.rotY = -slot.side * 0.35; // angled toward oncoming traffic
          tint(mesh, index, pick(BILLBOARD_COLORS));
        }),
      }),

      new PropStrip(scene, createTreeGeometry(), propMaterial, {
        perSide: 14,
        spacing: 12,
        firstZ: 6,
        rightOffset: 6,
        place: only(['city'], (slot) => {
          slot.x = slot.side * (EDGE + CURB_WIDTH + 2.1 + randFloat(-0.2, 0.2));
          slot.rotY = randFloat(0, Math.PI * 2);
          slot.scale.setScalar(randFloat(0.85, 1.2));
        }),
      }),

      new PropStrip(scene, new THREE.IcosahedronGeometry(0.9, 0), toon(), {
        perSide: 20,
        spacing: 8,
        firstZ: 4,
        rightOffset: 4,
        // Bushes in the city, scrub brush in the desert, boulders on Mars.
        place: only(['city', 'desert', 'mars'], (slot, index, mesh) => {
          slot.rotY = randFloat(0, Math.PI * 2);
          if (this.zone === 'city') {
            slot.x = slot.side * (EDGE + 4.6 + randFloat(-0.3, 0.3));
            slot.scale.set(randFloat(1, 1.5), randFloat(0.6, 0.9), randFloat(1, 1.5));
            tint(mesh, index, pick(BUSH_COLORS));
          } else if (this.zone === 'desert') {
            slot.x = slot.side * (VERGE + randFloat(0.5, 12));
            slot.scale.set(randFloat(0.5, 0.9), randFloat(0.35, 0.6), randFloat(0.5, 0.9));
            tint(mesh, index, pick(SCRUB_COLORS));
          } else {
            slot.x = slot.side * (VERGE + randFloat(0.3, 10));
            slot.scale.set(randFloat(0.7, 2), randFloat(0.7, 1.6), randFloat(0.7, 1.8));
            tint(mesh, index, pick(MARS_ROCK_COLORS));
          }
        }),
      }),

      new PropStrip(scene, createLampGeometry(), propMaterial, {
        perSide: 9,
        spacing: 20,
        firstZ: 0,
        rightOffset: 10,
        place: only(['city'], (slot) => {
          slot.x = slot.side * (EDGE + CURB_WIDTH + 0.3);
          slot.rotY = slot.side < 0 ? Math.PI : 0; // arm reaches over the road
        }),
      }),

      new PropStrip(scene, createConeGeometry(), propMaterial, {
        perSide: 16,
        spacing: 10,
        firstZ: -3,
        rightOffset: 5,
        place: only(['city', 'desert'], (slot) => {
          slot.x = slot.side * (EDGE - 0.4);
          slot.scale.setScalar(Math.random() < 0.35 ? 1 : 0); // most spots stay empty
        }),
      }),

      // --- Desert highway and Mars ---

      // Distant mesas in the desert; tinted red, the same shapes make Martian mountains.
      new PropStrip(scene, createMesaGeometry(), propMaterial, {
        perSide: 5,
        spacing: 48,
        firstZ: -20,
        rightOffset: 24,
        place: only(['desert', 'mars'], (slot, index, mesh) => {
          const s = randFloat(0.7, 1.3);
          // Far enough out that the mesa's 12 m base stays off the verge; the butte faces away.
          slot.x = slot.side * (VERGE + 10 + 12 * s + randFloat(0, 12));
          slot.rotY = (slot.side < 0 ? Math.PI : 0) + randFloat(-0.6, 0.6);
          slot.scale.set(s, s * randFloat(0.7, 1.3), s);
          tint(mesh, index, MESA_TINT[this.zone]!);
        }),
      }),

      new PropStrip(scene, createCactusGeometry(), propMaterial, {
        perSide: 10,
        spacing: 16,
        firstZ: 0,
        rightOffset: 8,
        place: only(['desert'], (slot) => {
          slot.x = slot.side * (VERGE + randFloat(1, 9));
          slot.rotY = randFloat(-0.6, 0.6) + (Math.random() < 0.5 ? 0 : Math.PI);
          slot.scale.setScalar(randFloat(0.75, 1.3));
        }),
      }),

      new PropStrip(scene, createPoleGeometry(), propMaterial, {
        perSide: 8,
        spacing: 24,
        firstZ: 0,
        rightOffset: 12,
        place: only(['desert'], (slot) => {
          slot.x = slot.side * (VERGE + 1.2);
          slot.rotY = randFloat(-0.05, 0.05);
          slot.scale.y = randFloat(0.95, 1.05);
        }),
      }),

      new PropStrip(scene, createDesertSignGeometry(), propMaterial, {
        perSide: 2,
        spacing: 85,
        firstZ: -30,
        rightOffset: 42,
        place: only(['desert'], (slot) => {
          slot.x = slot.side * (EDGE + CURB_WIDTH + 1.2);
          slot.rotY = -slot.side * 0.25; // angled toward oncoming traffic
          slot.scale.setScalar(Math.random() < 0.7 ? 1 : 0);
        }),
      }),

      new PropStrip(scene, createCraterGeometry(), propMaterial, {
        perSide: 4,
        spacing: 42,
        firstZ: -10,
        rightOffset: 21,
        place: only(['mars'], (slot) => {
          slot.x = slot.side * (VERGE + randFloat(3, 14));
          slot.rotY = randFloat(0, Math.PI * 2);
          const s = randFloat(0.6, 1.5);
          slot.scale.set(s, randFloat(0.7, 1.3), s);
        }),
      }),

      new PropStrip(scene, createHabitatGeometry(), propMaterial, {
        perSide: 2,
        spacing: 90,
        firstZ: -40,
        rightOffset: 45,
        place: only(['mars'], (slot) => {
          slot.x = slot.side * (VERGE + randFloat(6.5, 9));
          slot.rotY = slot.side < 0 ? Math.PI : 0; // the annex dome sits away from the road
        }),
      }),

      new PropStrip(scene, createSolarArrayGeometry(), propMaterial, {
        perSide: 3,
        spacing: 50,
        firstZ: -5,
        rightOffset: 25,
        place: only(['mars'], (slot) => {
          slot.x = slot.side * (VERGE + randFloat(2.5, 5));
        }),
      }),

      // Landing-zone beacons line the Martian road like street lamps.
      new PropStrip(scene, createBeaconGeometry(), propMaterial, {
        perSide: 9,
        spacing: 20,
        firstZ: 0,
        rightOffset: 10,
        place: only(['mars'], (slot) => {
          slot.x = slot.side * (EDGE + CURB_WIDTH + 0.6);
        }),
      }),

      new PropStrip(scene, createDishGeometry(), propMaterial, {
        perSide: 2,
        spacing: 70,
        firstZ: -25,
        rightOffset: 35,
        place: only(['mars'], (slot) => {
          slot.x = slot.side * (VERGE + randFloat(2, 4));
          slot.rotY = slot.side * -randFloat(0.2, 0.6);
        }),
      }),

      new PropStrip(scene, createRocketGeometry(), propMaterial, {
        perSide: 1,
        spacing: 300,
        firstZ: -60,
        rightOffset: 150,
        place: only(['mars'], (slot) => {
          slot.x = slot.side * (VERGE + randFloat(24, 34));
          slot.rotY = slot.side < 0 ? Math.PI : 0; // launch tower on the far side
        }),
      }),
    );
  }

  /** Back to the city everywhere. Only re-places props if another environment showed up. */
  reset() {
    this.zone = 'city';
    if (!this.visited) return;
    for (const strip of this.strips) strip.refresh();
    this.visited = false;
  }

  update(dz: number) {
    for (const strip of this.strips) strip.update(dz);
  }
}

// ---------------------------------------------------------------------------
// Prop geometry. Everything stands on y = 0 and faces +z (toward the camera).

/** One 3 m x 3.5 m facade module: white wall (tinted per building) with a window. */
function createWindowTexture() {
  const S = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#e4e0d8';
  ctx.fillRect(18, 16, 92, 88); // frame
  ctx.fillStyle = '#5f86b0';
  ctx.fillRect(24, 22, 80, 76); // glass
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); // reflection
  ctx.moveTo(24, 70);
  ctx.lineTo(70, 22);
  ctx.lineTo(90, 22);
  ctx.lineTo(24, 88);
  ctx.fill();
  ctx.fillStyle = '#e4e0d8';
  ctx.fillRect(62, 22, 4, 76); // mullion

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createBuildingGeometry({ width, depth, height }: BuildingSize) {
  const MODULE_W = 3;
  const MODULE_H = 3.5;
  const PLAIN_UV = 0.02; // a texel of bare wall

  const body = new THREE.BoxGeometry(width, height, depth).translate(0, height / 2, 0);
  // Tile the window texture across the walls; face order is +x, -x, +y, -y, +z, -z.
  const faceSizes = [depth, depth, 0, 0, width, width];
  const uv = body.attributes.uv;
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      if (faceSizes[f] === 0) uv.setXY(i, PLAIN_UV, PLAIN_UV);
      else uv.setXY(i, (uv.getX(i) * faceSizes[f]) / MODULE_W, (uv.getY(i) * height) / MODULE_H);
    }
  }

  const plain = (geometry: THREE.BufferGeometry) => {
    const a = geometry.attributes.uv;
    for (let i = 0; i < a.count; i++) a.setXY(i, PLAIN_UV, PLAIN_UV);
    return geometry;
  };
  const roof = plain(new THREE.BoxGeometry(width + 0.4, 0.45, depth + 0.4).translate(0, height + 0.2, 0));
  const unit = plain(new THREE.BoxGeometry(1.6, 1, 1.4).translate(width * 0.2, height + 0.9, -depth * 0.15));

  return mergeGeometries([body, roof, unit])!;
}

function createBillboardGeometry() {
  return mergeParts([
    { geometry: new THREE.CylinderGeometry(0.15, 0.18, 6.5, 8), color: 0xe9e9e9, at: [-2, 3.25, 0] },
    { geometry: new THREE.CylinderGeometry(0.15, 0.18, 6.5, 8), color: 0xe9e9e9, at: [2, 3.25, 0] },
    { geometry: new THREE.BoxGeometry(6.4, 3.4, 0.3), color: 0xf2f2f2, at: [0, 6.3, 0] },
    { geometry: new THREE.BoxGeometry(5.8, 0.9, 0.05), color: 0x3a3a46, at: [0, 5.3, 0.17] },
    { geometry: new THREE.BoxGeometry(1.6, 1.6, 0.05), color: 0xffffff, at: [-1.9, 6.75, 0.17] },
    { geometry: new THREE.BoxGeometry(3, 0.35, 0.05), color: 0x3a3a46, at: [0.9, 7.1, 0.17] },
    { geometry: new THREE.BoxGeometry(2.2, 0.35, 0.05), color: 0x3a3a46, at: [0.5, 6.5, 0.17] },
  ]).geometry;
}

function createTreeGeometry() {
  return mergeParts([
    { geometry: new THREE.CylinderGeometry(0.14, 0.2, 1.8, 6), color: 0x8a5a3c, at: [0, 0.9, 0] },
    { geometry: new THREE.IcosahedronGeometry(1.3, 0), color: 0x43a047, at: [0, 2.7, 0] },
    { geometry: new THREE.IcosahedronGeometry(0.9, 0), color: 0x66bb6a, at: [0.35, 3.6, 0.2] },
  ]).geometry;
}

function createLampGeometry() {
  return mergeParts([
    { geometry: new THREE.CylinderGeometry(0.08, 0.11, 6, 8), color: 0x6b7280, at: [0, 3, 0] },
    { geometry: new THREE.BoxGeometry(1.7, 0.1, 0.12), color: 0x6b7280, at: [-0.85, 5.95, 0] },
    { geometry: new THREE.BoxGeometry(0.7, 0.14, 0.32), color: 0x4b5563, at: [-1.55, 5.9, 0] },
    { geometry: new THREE.BoxGeometry(0.6, 0.04, 0.26), color: 0xfff6cf, at: [-1.55, 5.82, 0] },
  ]).geometry;
}

function createConeGeometry() {
  return mergeParts([
    { geometry: new THREE.BoxGeometry(0.55, 0.06, 0.55), color: 0x222222, at: [0, 0.03, 0] },
    { geometry: new THREE.ConeGeometry(0.22, 0.7, 10), color: 0xff7a1a, at: [0, 0.4, 0] },
    { geometry: new THREE.CylinderGeometry(0.135, 0.165, 0.12, 10), color: 0xffffff, at: [0, 0.42, 0] },
  ]).geometry;
}

// --- Desert -----------------------------------------------------------------

type Vec3 = [number, number, number];

/** Flat-shaded, for a faceted low-poly look on rocks. */
function faceted(geometry: THREE.BufferGeometry) {
  geometry.computeVertexNormals(); // non-indexed, so each face gets its own normal
  return geometry;
}

function createMesaGeometry() {
  return faceted(
    mergeParts([
      { geometry: new THREE.CylinderGeometry(9, 12, 6, 7), color: 0xc8714a, at: [0, 3, 0] },
      { geometry: new THREE.CylinderGeometry(8.4, 9, 1.4, 7), color: 0xe7a46c, at: [0, 6.7, 0] },
      { geometry: new THREE.CylinderGeometry(7.6, 8.4, 5, 7), color: 0xd4825a, at: [0, 9.9, 0] },
      { geometry: new THREE.CylinderGeometry(7.9, 7.6, 0.8, 7), color: 0xf0b884, at: [0, 12.8, 0] },
      // A narrow butte beside it.
      { geometry: new THREE.CylinderGeometry(3, 4.6, 10, 6), color: 0xc8714a, at: [10, 5, -5] },
      { geometry: new THREE.CylinderGeometry(3.3, 3, 0.8, 6), color: 0xf0b884, at: [10, 10.4, -5] },
    ]).geometry,
  );
}

function createCactusGeometry() {
  const green = 0x43a34e;
  const dark = 0x2f7d3a;
  return mergeParts([
    { geometry: new THREE.CylinderGeometry(0.36, 0.42, 4.2, 8), color: green, at: [0, 2.1, 0] },
    { geometry: new THREE.SphereGeometry(0.36, 8, 5), color: green, at: [0, 4.2, 0] },
    { geometry: new THREE.CylinderGeometry(0.2, 0.2, 0.9, 7).rotateZ(Math.PI / 2), color: dark, at: [-0.75, 1.9, 0] },
    { geometry: new THREE.CylinderGeometry(0.23, 0.23, 1.5, 7), color: green, at: [-1.15, 2.6, 0] },
    { geometry: new THREE.SphereGeometry(0.23, 7, 5), color: green, at: [-1.15, 3.35, 0] },
    { geometry: new THREE.CylinderGeometry(0.18, 0.18, 0.75, 7).rotateZ(Math.PI / 2), color: dark, at: [0.7, 2.7, 0] },
    { geometry: new THREE.CylinderGeometry(0.21, 0.21, 1.1, 7), color: green, at: [1.05, 3.2, 0] },
    { geometry: new THREE.SphereGeometry(0.21, 7, 5), color: green, at: [1.05, 3.75, 0] },
  ]).geometry;
}

/** Old wooden telegraph pole. */
function createPoleGeometry() {
  const insulator = (x: number, y: number) => ({
    geometry: new THREE.CylinderGeometry(0.07, 0.08, 0.22, 6),
    color: 0x5fb7d9,
    at: [x, y, 0] as Vec3,
  });
  return mergeParts([
    { geometry: new THREE.CylinderGeometry(0.12, 0.16, 7.5, 6), color: 0x7a5a3e, at: [0, 3.75, 0] },
    { geometry: new THREE.BoxGeometry(2.2, 0.16, 0.16), color: 0x6b4c33, at: [0, 6.9, 0] },
    { geometry: new THREE.BoxGeometry(1.5, 0.14, 0.14), color: 0x6b4c33, at: [0, 6.3, 0] },
    insulator(-1, 7.09),
    insulator(1, 7.09),
    insulator(-0.4, 7.09),
    insulator(0.4, 7.09),
    insulator(-0.65, 6.48),
    insulator(0.65, 6.48),
  ]).geometry;
}

/** Yellow diamond "curve ahead" sign. */
function createDesertSignGeometry() {
  const ink = 0x1b1424;
  return mergeParts([
    { geometry: new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), color: 0x9aa0a8, at: [0, 1.3, 0] },
    { geometry: new THREE.BoxGeometry(1.2, 1.2, 0.06).rotateZ(Math.PI / 4), color: ink, at: [0, 2.75, 0] },
    { geometry: new THREE.BoxGeometry(1.04, 1.04, 0.07).rotateZ(Math.PI / 4), color: 0xffc72c, at: [0, 2.75, 0.01] },
    { geometry: new THREE.BoxGeometry(0.13, 0.5, 0.08), color: ink, at: [-0.14, 2.6, 0.03] },
    { geometry: new THREE.BoxGeometry(0.36, 0.13, 0.08), color: ink, at: [0, 2.83, 0.03] },
    { geometry: new THREE.ConeGeometry(0.17, 0.26, 3).rotateZ(-Math.PI / 2), color: ink, at: [0.27, 2.83, 0.03] },
  ]).geometry;
}

// --- Mars -------------------------------------------------------------------

function createCraterGeometry() {
  return faceted(
    mergeParts([
      { geometry: new THREE.CircleGeometry(3, 14).rotateX(-Math.PI / 2), color: 0x6e2c18, at: [0, 0.04, 0] },
      {
        geometry: new THREE.TorusGeometry(3.3, 0.8, 5, 14).rotateX(Math.PI / 2).scale(1, 0.45, 1),
        color: 0xb5583a,
        at: [0, 0.05, 0],
      },
    ]).geometry,
  );
}

/** A habitat dome with an airlock, linked by a tunnel to a smaller annex. */
function createHabitatGeometry() {
  const shell = 0xeef0f2;
  const base = 0x9a9aa2;
  const glow = 0x9fe3ff;
  const halfDome = (r: number) => new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  return mergeParts([
    { geometry: new THREE.CylinderGeometry(5.4, 5.6, 0.6, 20), color: base, at: [0, 0.3, 0] },
    { geometry: halfDome(5), color: shell, at: [0, 0.55, 0] },
    { geometry: new THREE.TorusGeometry(4.75, 0.14, 4, 24).rotateX(Math.PI / 2), color: base, at: [0, 2.2, 0] },
    { geometry: new THREE.BoxGeometry(1.8, 2.4, 2), color: 0xd8dade, at: [0, 1.4, 4.6] },
    { geometry: new THREE.BoxGeometry(1, 1.7, 0.1), color: 0x3a4a6a, at: [0, 1.2, 5.62] },
    { geometry: new THREE.BoxGeometry(0.9, 0.5, 0.1), color: glow, at: [-2.4, 3, 3.75] },
    { geometry: new THREE.BoxGeometry(0.9, 0.5, 0.1), color: glow, at: [2.4, 3, 3.75] },
    { geometry: new THREE.CylinderGeometry(1.1, 1.1, 5, 12).rotateZ(Math.PI / 2), color: 0xd8dade, at: [7, 1.2, 0] },
    { geometry: new THREE.CylinderGeometry(3.3, 3.4, 0.4, 16), color: base, at: [10.5, 0.2, 0] },
    { geometry: halfDome(3), color: shell, at: [10.5, 0.4, 0] },
    { geometry: new THREE.CylinderGeometry(0.05, 0.05, 2.5, 5), color: base, at: [0, 6.5, 0] },
    { geometry: new THREE.SphereGeometry(0.16, 6, 4), color: 0xff4d4d, at: [0, 7.8, 0] },
  ]).geometry;
}

function createSolarArrayGeometry() {
  return mergeParts(
    [-2.4, 0, 2.4].flatMap((x) => [
      { geometry: new THREE.BoxGeometry(0.12, 1, 0.12), color: 0x8a8e96, at: [x, 0.5, 0] as Vec3 },
      { geometry: new THREE.BoxGeometry(2.2, 0.08, 1.4).rotateX(0.6), color: 0x24387a, at: [x, 1.15, 0] as Vec3 },
      { geometry: new THREE.BoxGeometry(2.24, 0.06, 0.06).rotateX(0.6), color: 0xc8ccd4, at: [x, 1.2, 0] as Vec3 },
    ]),
  ).geometry;
}

function createDishGeometry() {
  const metal = 0xb8bcc4;
  return mergeParts([
    { geometry: new THREE.BoxGeometry(1.4, 0.3, 1.4), color: 0x8a8e96, at: [0, 0.15, 0] },
    { geometry: new THREE.CylinderGeometry(0.15, 0.22, 4, 8), color: metal, at: [0, 2.2, 0] },
    { geometry: new THREE.CylinderGeometry(1.9, 0.45, 0.6, 18).rotateX(0.65), color: 0xf2f2f2, at: [0, 4.4, 0] },
    { geometry: new THREE.CylinderGeometry(0.05, 0.05, 1.5, 5).rotateX(0.65), color: metal, at: [0, 5.1, 0.45] },
    { geometry: new THREE.SphereGeometry(0.16, 6, 4), color: 0xff4d4d, at: [0, 5.7, 0.85] },
  ]).geometry;
}

/** A short pylon with a glowing tip. */
function createBeaconGeometry() {
  return mergeParts([
    { geometry: new THREE.CylinderGeometry(0.3, 0.38, 0.3, 8), color: 0x6b6f78, at: [0, 0.15, 0] },
    { geometry: new THREE.CylinderGeometry(0.11, 0.14, 2.2, 8), color: 0xeceef2, at: [0, 1.4, 0] },
    { geometry: new THREE.CylinderGeometry(0.145, 0.145, 0.35, 8), color: 0xff7a1a, at: [0, 1.9, 0] },
    { geometry: new THREE.SphereGeometry(0.2, 8, 6), color: 0xffe08a, at: [0, 2.6, 0] },
  ]).geometry;
}

/** A stainless rocket standing on its launch pad, tower beside it. */
function createRocketGeometry() {
  const steel = 0xd5dae0;
  const dark = 0x3a3f4a;
  const tower = 0x6b6f78;
  return mergeParts([
    { geometry: new THREE.BoxGeometry(11, 0.8, 11), color: 0x8a8a92, at: [0, 0.4, 0] },
    { geometry: new THREE.BoxGeometry(1.4, 27, 1.4), color: tower, at: [4, 14.3, 0] },
    { geometry: new THREE.BoxGeometry(2.6, 0.5, 0.6), color: tower, at: [2.6, 20.5, 0] },
    { geometry: new THREE.BoxGeometry(2.6, 0.5, 0.6), color: tower, at: [2.6, 10, 0] },
    { geometry: new THREE.CylinderGeometry(1.5, 1.5, 22, 18), color: steel, at: [0, 11.8, 0] },
    { geometry: new THREE.CylinderGeometry(1.53, 1.53, 0.6, 18), color: dark, at: [0, 17.5, 0] },
    { geometry: new THREE.ConeGeometry(1.5, 4.6, 18), color: steel, at: [0, 25.1, 0] },
    { geometry: new THREE.BoxGeometry(4.8, 2.4, 0.25), color: dark, at: [0, 2.2, 0] },
    { geometry: new THREE.BoxGeometry(0.25, 2.4, 4.8), color: dark, at: [0, 2.2, 0] },
  ]).geometry;
}
