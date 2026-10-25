import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROAD_WIDTH } from '../config';
import { mergeParts } from '../render/geometry';
import { propMaterial, toon } from '../render/materials';
import { PropStrip, tint } from './PropStrip';
import { CURB_WIDTH } from './Road';

const EDGE = ROAD_WIDTH / 2;
const BLOCK = 14; // spacing between building lots
const { randFloat, randInt } = THREE.MathUtils;
const pick = <T>(items: readonly T[]) => items[randInt(0, items.length - 1)];

const BUILDING_COLORS = [0xffc98b, 0xf7efe0, 0xa9d3f5, 0xffb0a8, 0xc3e6a5, 0xdcc8f7, 0xfff0a0];
const BILLBOARD_COLORS = [0xff6b6b, 0x4dabf7, 0xffd43b, 0x69db7c, 0xb197fc];
const BUSH_COLORS = [0x4caf50, 0x5cbf5a, 0x43a047, 0x7ccf6a];

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
 */
export class Scenery {
  private readonly strips: PropStrip[] = [];

  constructor(scene: THREE.Scene) {
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
          place: (slot, index, mesh) => {
            slot.x = slot.side * (EDGE + 5.2 + size.width / 2);
            slot.scale.set(1, randFloat(0.8, 1.3), 1);
            slot.rotY = Math.random() < 0.5 ? 0 : Math.PI;
            tint(mesh, index, pick(BUILDING_COLORS));
          },
        }),
      );
    });

    this.strips.push(
      new PropStrip(scene, createBillboardGeometry(), propMaterial, {
        perSide: 3,
        spacing: lots * BLOCK,
        firstZ: 10 - BUILDINGS.length * BLOCK,
        rightOffset: 2 * BLOCK,
        place: (slot, index, mesh) => {
          slot.x = slot.side * (EDGE + 7);
          slot.rotY = -slot.side * 0.35; // angled toward oncoming traffic
          tint(mesh, index, pick(BILLBOARD_COLORS));
        },
      }),

      new PropStrip(scene, createTreeGeometry(), propMaterial, {
        perSide: 14,
        spacing: 12,
        firstZ: 6,
        rightOffset: 6,
        place: (slot) => {
          slot.x = slot.side * (EDGE + CURB_WIDTH + 2.1 + randFloat(-0.2, 0.2));
          slot.rotY = randFloat(0, Math.PI * 2);
          slot.scale.setScalar(randFloat(0.85, 1.2));
        },
      }),

      new PropStrip(scene, new THREE.IcosahedronGeometry(0.9, 0), toon(), {
        perSide: 20,
        spacing: 8,
        firstZ: 4,
        rightOffset: 4,
        place: (slot, index, mesh) => {
          slot.x = slot.side * (EDGE + 4.6 + randFloat(-0.3, 0.3));
          slot.rotY = randFloat(0, Math.PI * 2);
          slot.scale.set(randFloat(1, 1.5), randFloat(0.6, 0.9), randFloat(1, 1.5));
          tint(mesh, index, pick(BUSH_COLORS));
        },
      }),

      new PropStrip(scene, createLampGeometry(), propMaterial, {
        perSide: 9,
        spacing: 20,
        firstZ: 0,
        rightOffset: 10,
        place: (slot) => {
          slot.x = slot.side * (EDGE + CURB_WIDTH + 0.3);
          slot.rotY = slot.side < 0 ? Math.PI : 0; // arm reaches over the road
        },
      }),

      new PropStrip(scene, createConeGeometry(), propMaterial, {
        perSide: 16,
        spacing: 10,
        firstZ: -3,
        rightOffset: 5,
        place: (slot) => {
          slot.x = slot.side * (EDGE - 0.4);
          slot.scale.setScalar(Math.random() < 0.35 ? 1 : 0); // most spots stay empty
        },
      }),
    );
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
