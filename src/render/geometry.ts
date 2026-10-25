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

/** One cross-section of a lofted body, at a point along its length. */
export interface LoftSection {
  z: number;
  /** Half the width at the widest point of the section. */
  halfWidth: number;
  bottom: number;
  top: number;
  /** Width at the very top as a fraction of the full width (tumblehome). Default 1. */
  topWidth?: number;
}

/**
 * Builds a smooth body by sweeping rounded cross-sections along z (sections
 * must be sorted by z). Unlike extrudeSide, the width can change along the
 * length: narrow noses, wide haunches. Ends are closed with flat caps.
 * `roundness` is the superellipse exponent: 2 is an ellipse, higher is boxier.
 */
export function loft(sections: LoftSection[], segments = 20, roundness = 3.5, steps = 4) {
  const rings = smoothSections(sections, steps);
  const positions: number[] = [];
  const indices: number[] = [];
  const e = 2 / roundness;
  const shaped = (v: number) => Math.sign(v) * Math.abs(v) ** e;

  const ringPoints = (s: LoftSection) => {
    const points: [number, number, number][] = [];
    const yc = (s.bottom + s.top) / 2;
    const hh = (s.top - s.bottom) / 2;
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const sin = Math.sin(a);
      const taper = sin > 0 ? 1 + ((s.topWidth ?? 1) - 1) * sin : 1;
      points.push([s.halfWidth * shaped(Math.cos(a)) * taper, yc + hh * shaped(sin), s.z]);
    }
    return points;
  };

  // Sides: quads between consecutive rings, wound to face outward.
  for (const ring of rings) for (const p of ringPoints(ring)) positions.push(...p);
  for (let k = 0; k < rings.length - 1; k++) {
    for (let i = 0; i < segments; i++) {
      const a = k * segments + i;
      const b = k * segments + ((i + 1) % segments);
      const c = a + segments;
      const d = b + segments;
      indices.push(a, b, c, b, d, c);
    }
  }

  // Flat caps get their own vertices so their normals don't smear the sides.
  const cap = (ring: LoftSection, facingBack: boolean) => {
    const start = positions.length / 3;
    const points = ringPoints(ring);
    for (const p of points) positions.push(...p);
    positions.push(0, (ring.bottom + ring.top) / 2, ring.z);
    const center = start + segments;
    for (let i = 0; i < segments; i++) {
      const a = start + i;
      const b = start + ((i + 1) % segments);
      if (facingBack) indices.push(center, a, b);
      else indices.push(center, b, a);
    }
  };
  cap(rings[0], false);
  cap(rings[rings.length - 1], true);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Adds `steps - 1` Catmull-Rom interpolated sections between each pair, for smooth curves along z. */
function smoothSections(sections: LoftSection[], steps: number): LoftSection[] {
  const keys = ['z', 'halfWidth', 'bottom', 'top', 'topWidth'] as const;
  const value = (s: LoftSection, k: (typeof keys)[number]) => (k === 'topWidth' ? (s.topWidth ?? 1) : s[k]);
  const out: LoftSection[] = [];
  for (let i = 0; i < sections.length - 1; i++) {
    const p0 = sections[Math.max(0, i - 1)];
    const p1 = sections[i];
    const p2 = sections[i + 1];
    const p3 = sections[Math.min(sections.length - 1, i + 2)];
    for (let j = 0; j < steps; j++) {
      const t = j / steps;
      const s = {} as LoftSection;
      for (const k of keys) {
        s[k] = catmullRom(value(p0, k), value(p1, k), value(p2, k), value(p3, k), t);
      }
      out.push(s);
    }
  }
  out.push(sections[sections.length - 1]);
  return out;
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
