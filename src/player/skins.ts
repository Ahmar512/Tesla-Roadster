import * as THREE from 'three';
import type { SkinId } from '../meta/catalog';
import type { MergedParts } from '../render/geometry';
import { curved } from '../render/materials';

type Shade = (c: THREE.Vector3, n: THREE.Vector3, paint: THREE.Color, out: THREE.Color) => void;

const WHITE = new THREE.Color(0xf4f6fa);
const NAVY = new THREE.Color(0x1d2236);
const GRAPHITE = new THREE.Color(0x26262e);
const SILVER = new THREE.Color(0xc9ced6);
const FLAME_OUTER = new THREE.Color(0xff7a1a);
const FLAME_INNER = new THREE.Color(0xffd84a);
const NEON = new THREE.Color(0x33f0ff);
const CHROME = [0xdfe6ee, 0x8c97a8, 0x4b5363, 0x9aa3b0].map((c) => new THREE.Color(c));
const GOLD = [0xffe680, 0xd9a227, 0x8f5e0e, 0xc8901c].map((c) => new THREE.Color(c));

/** A contrasting color for decals on this paint. */
const contrast = (paint: THREE.Color) => (paint.getHSL({ h: 0, s: 0, l: 0 }).l > 0.6 ? NAVY : WHITE);

/** Metal: banded by how much each face points up, like a cartoon reflection. */
const metal =
  (bands: THREE.Color[]): Shade =>
  (_c, n, _p, out) => {
    out.copy(n.y > 0.5 ? bands[0] : n.y > 0.1 ? bands[1] : n.y > -0.3 ? bands[2] : bands[3]);
  };

// Each skin colors one triangle at a time from its center `c` and normal `n`.
// The car faces -z: the nose is near z = -2.1, the tail near z = +2.1.
const SKIN_SHADES: Record<SkinId, Shade> = {
  none: (_c, _n, paint, out) => out.copy(paint),

  // Twin stripes along the hood, roof line and deck.
  stripes: (c, n, paint, out) => {
    const x = Math.abs(c.x);
    out.copy(n.y > 0.3 && x > 0.07 && x < 0.24 ? contrast(paint) : paint);
  },

  // Dark upper half.
  twotone: (c, _n, paint, out) => {
    const dark = paint.getHSL({ h: 0, s: 0, l: 0 }).l < 0.2 ? SILVER : GRAPHITE;
    out.copy(c.y > 0.62 ? dark : paint);
  },

  // Flames licking back from the nose along the sides and over the hood.
  flames: (c, n, paint, out) => {
    const back = (c.z + 2.2) / 2.8; // 0 at the nose, 1 about mid-car
    if (Math.abs(n.x) > 0.35 && back < 1) {
      const top = 0.28 + (1 - back) * 0.42 + 0.07 * Math.sin(c.z * 13);
      out.copy(c.y < top - 0.12 ? FLAME_INNER : c.y < top ? FLAME_OUTER : paint);
      return;
    }
    if (n.y > 0.3) {
      const tip = -0.9 + 0.35 * Math.cos(c.x * 9);
      out.copy(c.z < tip - 0.45 ? FLAME_INNER : c.z < tip ? FLAME_OUTER : paint);
      return;
    }
    out.copy(paint);
  },

  // Glowing sills along the bottom of the sides; the underglow is a separate mesh.
  neon: (c, n, paint, out) => {
    out.copy(Math.abs(n.x) > 0.5 && c.y < 0.36 ? NEON : paint);
  },

  chrome: metal(CHROME),
  gold: metal(GOLD),
};

const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();
const edge = new THREE.Vector3();
const center = new THREE.Vector3();
const normal = new THREE.Vector3();
const paintColor = new THREE.Color();
const faceColor = new THREE.Color();

/** Repaints the car body's 'paint' parts with a color and skin, one flat color per triangle. */
export function paintCar(shell: MergedParts, paint: number, skin: SkinId) {
  const pos = shell.geometry.attributes.position as THREE.BufferAttribute;
  const col = shell.geometry.attributes.color as THREE.BufferAttribute;
  const shade = SKIN_SHADES[skin];
  paintColor.set(paint);
  for (const [start, count] of shell.ranges.paint ?? []) {
    for (let i = start; i < start + count; i += 3) {
      a.fromBufferAttribute(pos, i);
      b.fromBufferAttribute(pos, i + 1);
      c.fromBufferAttribute(pos, i + 2);
      center.copy(a).add(b).add(c).divideScalar(3);
      normal.subVectors(b, a).cross(edge.subVectors(c, a)).normalize();
      shade(center, normal, paintColor, faceColor);
      for (let v = i; v < i + 3; v++) col.setXYZ(v, faceColor.r, faceColor.g, faceColor.b);
    }
  }
  col.needsUpdate = true;
}

/** Soft cyan glow on the road under the car (the Neon skin). */
export function createUnderglow() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(51,240,255,1)');
  gradient.addColorStop(1, 'rgba(51,240,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const material = curved(
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 6).rotateX(-Math.PI / 2), material);
  mesh.position.y = 0.05;
  mesh.visible = false;
  return mesh;
}
