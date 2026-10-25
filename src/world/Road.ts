import * as THREE from 'three';
import { LANE_WIDTH, ROAD_WIDTH } from '../config';
import { toon } from '../render/materials';

const ROAD_LENGTH = 320;
const CENTER_Z = -ROAD_LENGTH / 2 + 20;
const SEGMENTS = 96; // enough vertices along the length for the curved-world bend

const ROAD_TILE = 64; // the road texture covers 64 m: dashes plus random wear
const CURB_TILE = 2;
const PAVING_TILE = 2;

export const CURB_WIDTH = 0.35;
export const CURB_HEIGHT = 0.2;
export const SIDEWALK_WIDTH = 3.5;

/**
 * The road meshes never move; their textures scroll instead, which gives an
 * endless highway from a handful of meshes.
 */
export class Road {
  private readonly scrolling: { texture: THREE.Texture; tile: number }[] = [];
  private readonly anisotropy: number;

  constructor(
    private readonly scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
  ) {
    this.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const edge = ROAD_WIDTH / 2;

    const roadMat = toon({ map: this.scrollingTexture(createRoadCanvas(), ROAD_TILE, 1) });
    this.strip(ROAD_WIDTH, roadMat, 0, 0);

    const curbMat = toon({ map: this.scrollingTexture(createCurbCanvas(), CURB_TILE, 1) });
    const pavingMat = toon({ map: this.scrollingTexture(createPavingCanvas(), PAVING_TILE, SIDEWALK_WIDTH / 2) });
    const sideMat = toon({ color: 0xb9b2a4 });

    for (const side of [-1, 1]) {
      const sidewalkX = side * (edge + CURB_WIDTH + SIDEWALK_WIDTH / 2);
      this.strip(CURB_WIDTH, curbMat, side * (edge + CURB_WIDTH / 2), CURB_HEIGHT);
      this.strip(CURB_HEIGHT, curbMat, side * edge, CURB_HEIGHT / 2, (side * Math.PI) / 2);
      this.strip(SIDEWALK_WIDTH, pavingMat, sidewalkX, CURB_HEIGHT);
      this.strip(CURB_HEIGHT, sideMat, side * (edge + CURB_WIDTH + SIDEWALK_WIDTH), CURB_HEIGHT / 2, (-side * Math.PI) / 2);
    }

    this.strip(400, toon({ color: 0x8fd16f }), 0, -0.02);
  }

  update(dz: number) {
    for (const s of this.scrolling) s.texture.offset.y = (s.texture.offset.y + dz / s.tile) % 1;
  }

  /** A long flat strip along the road; `tilt` stands it up as a vertical face. */
  private strip(width: number, material: THREE.Material, x: number, y: number, tilt = 0) {
    const geometry = new THREE.PlaneGeometry(width, ROAD_LENGTH, 1, SEGMENTS).rotateX(-Math.PI / 2);
    if (tilt) geometry.rotateZ(tilt);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, CENTER_Z);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  private scrollingTexture(canvas: HTMLCanvasElement, tile: number, repeatX: number) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, ROAD_LENGTH / tile);
    texture.anisotropy = this.anisotropy;
    texture.colorSpace = THREE.SRGBColorSpace;
    this.scrolling.push({ texture, tile });
    return texture;
  }
}

function canvas2d(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext('2d')! };
}

function createRoadCanvas() {
  const W = 256;
  const H = 2048; // 32 px per meter
  const PX = H / ROAD_TILE;
  const { canvas, ctx } = canvas2d(W, H);
  const x = (meters: number) => (meters / ROAD_WIDTH + 0.5) * W;
  const rand = THREE.MathUtils.randFloat;

  ctx.fillStyle = '#4b505a';
  ctx.fillRect(0, 0, W, H);

  // Asphalt speckle
  for (let i = 0; i < 9000; i++) {
    const shade = 62 + Math.random() * 38;
    ctx.fillStyle = `rgb(${shade},${shade},${shade + 8})`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5);
  }

  // Darker wheel tracks worn into each lane
  ctx.fillStyle = 'rgba(25,25,30,0.12)';
  for (let lane = -1; lane <= 1; lane++) {
    for (const off of [-0.65, 0.65]) ctx.fillRect(x(lane * LANE_WIDTH + off) - 6, 0, 12, H);
  }

  // Patches and manhole covers, kept clear of the tile seam
  for (let i = 0; i < 5; i++) {
    const w = rand(1.2, 2.2) * PX;
    const h = rand(2, 5) * PX;
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(30,32,38,0.35)' : 'rgba(120,124,132,0.18)';
    ctx.fillRect(x(rand(-ROAD_WIDTH / 2 + 1.5, ROAD_WIDTH / 2 - 1.5)) - w / 2, rand(0, H - h), w, h);
  }
  for (let i = 0; i < 2; i++) {
    const cx = x(THREE.MathUtils.randInt(-1, 1) * LANE_WIDTH);
    const cy = rand(PX, H - PX);
    ctx.fillStyle = '#3a3e46';
    ctx.beginPath();
    ctx.arc(cx, cy, 0.38 * PX, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5f646e';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Lane markings: solid edges, dashed dividers (4 m dash every 8 m)
  const line = (0.16 / ROAD_WIDTH) * W;
  ctx.fillStyle = '#f6f6f2';
  for (const m of [-1.5 * LANE_WIDTH, 1.5 * LANE_WIDTH]) ctx.fillRect(x(m) - line / 2, 0, line, H);
  for (const m of [-LANE_WIDTH / 2, LANE_WIDTH / 2]) {
    for (let y = 0; y < H; y += 8 * PX) ctx.fillRect(x(m) - line / 2, y, line, 4 * PX);
  }

  return canvas;
}

function createCurbCanvas() {
  const { canvas, ctx } = canvas2d(32, 64); // one red and one white block, 1 m each
  ctx.fillStyle = '#e8413c';
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = '#f5f2ea';
  ctx.fillRect(0, 32, 32, 32);
  return canvas;
}

function createPavingCanvas() {
  const S = 128; // one 2 m x 2 m slab
  const { canvas, ctx } = canvas2d(S, S);
  ctx.fillStyle = '#ddd6c8';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 500; i++) {
    const shade = 200 + Math.random() * 30;
    ctx.fillStyle = `rgb(${shade},${shade - 6},${shade - 18})`;
    ctx.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }
  ctx.fillStyle = '#b9b1a1';
  ctx.fillRect(0, 0, S, 3);
  ctx.fillRect(0, 0, 3, S);
  return canvas;
}
