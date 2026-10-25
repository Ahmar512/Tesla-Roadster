import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface Part {
  geometry: THREE.BufferGeometry;
  color: THREE.ColorRepresentation;
  at?: [number, number, number];
  /** Parts sharing a tag can be recolored together later (e.g. car paint). */
  tag?: string;
}

export interface MergedParts {
  geometry: THREE.BufferGeometry;
  ranges: Record<string, [start: number, count: number][]>;
}

const tmpColor = new THREE.Color();

/**
 * Merges many simple parts into one vertex-colored geometry, so a whole
 * vehicle is a single draw call instead of one per part.
 */
export function mergeParts(parts: Part[], withOutline = false): MergedParts {
  const ranges: MergedParts['ranges'] = {};
  let offset = 0;

  const geometries = parts.map(({ geometry, color, at, tag }) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.deleteAttribute('uv');
    if (at) g.translate(...at);

    const count = g.attributes.position.count;
    const colors = new Float32Array(count * 3);
    tmpColor.set(color);
    for (let i = 0; i < count; i++) tmpColor.toArray(colors, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    if (tag) (ranges[tag] ??= []).push([offset, count]);
    offset += count;
    return g;
  });

  const geometry = mergeGeometries(geometries)!;
  for (const g of geometries) g.dispose();
  if (withOutline) addOutlineNormals(geometry);
  return { geometry, ranges };
}

/** Repaints every part with the given tag. */
export function recolor({ geometry, ranges }: MergedParts, tag: string, color: THREE.ColorRepresentation) {
  const attr = geometry.attributes.color as THREE.BufferAttribute;
  tmpColor.set(color);
  for (const [start, count] of ranges[tag] ?? []) {
    for (let i = start; i < start + count; i++) attr.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b);
  }
  attr.needsUpdate = true;
}

/**
 * Outline shells push vertices out along their normals. Hard-edged shapes
 * have split normals at corners, which would tear the outline open, so this
 * stores one averaged normal per corner position instead.
 */
export function addOutlineNormals(geometry: THREE.BufferGeometry) {
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  const key = (i: number) =>
    `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)}`;

  const sums = new Map<string, THREE.Vector3>();
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    let sum = sums.get(k);
    if (!sum) sums.set(k, (sum = new THREE.Vector3()));
    sum.x += nor.getX(i);
    sum.y += nor.getY(i);
    sum.z += nor.getZ(i);
  }

  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const n = sums.get(key(i))!.clone().normalize();
    n.toArray(out, i * 3);
  }
  geometry.setAttribute('outlineNormal', new THREE.BufferAttribute(out, 3));
}

/**
 * Extrudes a vehicle side profile into a rounded body. The profile is drawn
 * in (u, y) with +u toward the front; the result faces -z, centered on x.
 */
export function extrudeSide(draw: (shape: THREE.Shape) => void, width: number, bevel: number) {
  const shape = new THREE.Shape();
  draw(shape);
  const depth = Math.max(0.01, width - bevel * 2);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 3,
    curveSegments: 10,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.rotateY(Math.PI / 2);
  return geometry;
}

/** A wheel lying on its side (axis along x): tire, rim and one spoke so spinning reads. */
export function wheelParts(radius: number, width: number, at: [number, number, number] = [0, 0, 0]): Part[] {
  return [
    { geometry: new THREE.CylinderGeometry(radius, radius, width, 16).rotateZ(Math.PI / 2), color: 0x1d1d22, at },
    {
      geometry: new THREE.CylinderGeometry(radius * 0.6, radius * 0.6, width + 0.02, 12).rotateZ(Math.PI / 2),
      color: 0xc9ced6,
      at,
    },
    { geometry: new THREE.BoxGeometry(width + 0.04, radius * 1.1, radius * 0.22), color: 0x5b616b, at },
  ];
}
