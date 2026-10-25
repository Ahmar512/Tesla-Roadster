import * as THREE from 'three';
import { extrudeSide, mergeParts, recolor, wheelParts, type MergedParts, type Part } from '../render/geometry';
import { curved, glowMaterial, outlineMaterial, vehicleMaterial } from '../render/materials';
import { createBlobShadow } from '../render/shadow';
import type { ObstacleKind } from './ObstacleManager';

// Placeholder models (replaced with real low-poly art in a later phase).
// Vehicles face -z like the player: traffic drives away from the camera,
// so the rear (+z) is the side players see most.

const CAR_COLORS = [0x3b82f6, 0xf5f5f5, 0x22c55e, 0xfacc15, 0x8b5cf6, 0x26303f, 0xf97316, 0x14b8a6];
const TRUCK_COLORS = [0xe11d48, 0x2563eb, 0x16a34a, 0xf59e0b, 0x7c3aed];

const box = (w: number, h: number, l: number) => new THREE.BoxGeometry(w, h, l);
const pick = (colors: number[]) => colors[Math.floor(Math.random() * colors.length)];

export interface ObstacleModel {
  object: THREE.Group;
  /** Gives the model a fresh random paint job (vehicles only). */
  repaint?: () => void;
  /** Turn-signal lamps, for cars that change lane. */
  blinkers?: { left: THREE.Mesh; right: THREE.Mesh };
}

const blinkerMaterial = curved(new THREE.MeshBasicMaterial({ color: 0xffb020 }));

/**
 * Assembles a model: one merged body mesh plus its outline, an optional
 * unlit "glow" mesh for lights, and an optional blob shadow.
 */
function assemble(parts: Part[], glow: Part[], shadow?: [number, number]) {
  const object = new THREE.Group();
  const body = mergeParts(parts, true);
  object.add(new THREE.Mesh(body.geometry, vehicleMaterial), new THREE.Mesh(body.geometry, outlineMaterial));
  if (glow.length) object.add(new THREE.Mesh(mergeParts(glow).geometry, glowMaterial));
  if (shadow) object.add(createBlobShadow(...shadow));
  return { object, body };
}

function paintable(object: THREE.Group, body: MergedParts, colors: number[]): ObstacleModel {
  const repaint = () => recolor(body, 'paint', pick(colors));
  repaint();
  return { object, repaint };
}

/** Body, cabin, bumper and wheels of a generic sedan; `paint` parts are tagged for recoloring. */
export function sedanParts(paint: number): Part[] {
  const shell = extrudeSide(
    (s) => {
      s.moveTo(-1.95, 0.3);
      s.lineTo(1.9, 0.3);
      s.quadraticCurveTo(2.05, 0.3, 2.0, 0.55);
      s.lineTo(1.85, 0.72);
      s.lineTo(-1.9, 0.78);
      s.lineTo(-1.97, 0.45);
      s.closePath();
    },
    1.62,
    0.08,
  );
  const cabin = extrudeSide(
    (s) => {
      s.moveTo(1.0, 0.74);
      s.lineTo(0.4, 1.2);
      s.lineTo(-0.95, 1.2);
      s.lineTo(-1.4, 0.76);
      s.closePath();
    },
    1.34,
    0.06,
  );

  return [
    { geometry: shell, color: paint, tag: 'paint' },
    { geometry: cabin, color: 0x1c2533 },
    { geometry: box(1.3, 0.06, 1.42), color: paint, tag: 'paint', at: [0, 1.27, 0.27] }, // roof
    { geometry: box(1.62, 0.18, 0.16), color: 0x2b2b30, at: [0, 0.38, 2.0] }, // bumper
    { geometry: box(0.42, 0.13, 0.03), color: 0xf2f2f2, at: [0, 0.55, 2.0] }, // plate
    ...wheelParts(0.3, 0.24, [-0.76, 0.3, -1.3]),
    ...wheelParts(0.3, 0.24, [0.76, 0.3, -1.3]),
    ...wheelParts(0.3, 0.24, [-0.76, 0.3, 1.3]),
    ...wheelParts(0.3, 0.24, [0.76, 0.3, 1.3]),
  ];
}

export const TAILLIGHTS: Part[] = [
  { geometry: box(0.38, 0.12, 0.04), color: 0xff2a2a, at: [-0.56, 0.66, 1.99] },
  { geometry: box(0.38, 0.12, 0.04), color: 0xff2a2a, at: [0.56, 0.66, 1.99] },
];

function car(): ObstacleModel {
  const { object, body } = assemble(sedanParts(0xffffff), TAILLIGHTS, [2.4, 4.8]);

  const blinkerGeo = box(0.16, 0.12, 0.05);
  const left = new THREE.Mesh(blinkerGeo, blinkerMaterial);
  const right = new THREE.Mesh(blinkerGeo, blinkerMaterial);
  left.position.set(-0.84, 0.66, 2.0);
  right.position.set(0.84, 0.66, 2.0);
  left.visible = right.visible = false;
  object.add(left, right);

  return { ...paintable(object, body, CAR_COLORS), blinkers: { left, right } };
}

/** Deck height and ramp geometry of the car carrier, shared with gameplay. */
export const CARRIER = { deckHeight: 2.4, length: 14, rampStart: 7, rampEnd: 3 };

/** Height of the carrier's driving surface at local z (rear is +z). */
export function carrierSurface(localZ: number) {
  const { deckHeight, length, rampStart, rampEnd } = CARRIER;
  if (localZ > rampStart || localZ < -length / 2) return 0;
  if (localZ > rampEnd) return (deckHeight * (rampStart - localZ)) / (rampStart - rampEnd);
  return deckHeight;
}

function carrier(): ObstacleModel {
  const { deckHeight, rampStart, rampEnd } = CARRIER;
  const rampRun = rampStart - rampEnd;
  const rampAngle = Math.atan2(deckHeight, rampRun);
  const rampLength = Math.hypot(deckHeight, rampRun);
  const deckLength = rampEnd + 7;

  const ramp = box(2.3, 0.14, rampLength).rotateX(rampAngle);
  const stripes: Part[] = [];
  for (let i = 0; i < 4; i++) {
    const t = (i + 0.5) / 4;
    stripes.push({
      geometry: box(2.0, 0.02, 0.35).rotateX(rampAngle),
      color: 0x1f1f24,
      at: [0, deckHeight * (1 - t) + 0.08 - 0.07, rampEnd + rampRun * t],
    });
  }

  const lowerCars: Part[] = [-3, 0.6].flatMap((z) => [
    { geometry: box(1.5, 0.5, 3.0), color: 0xffffff, tag: 'paint', at: [0, 1.0, z] },
    { geometry: box(1.3, 0.4, 1.6), color: 0x1c2533, at: [0, 1.45, z + 0.2] },
  ]);

  const { object, body } = assemble(
    [
      { geometry: box(2.1, 2.0, 2.2), color: 0xe5e7eb, at: [0, 1.2, -5.85] }, // cab, tucked under the deck
      { geometry: box(2.12, 0.6, 1.2), color: 0x1c2533, at: [0, 1.6, -5.9] }, // cab windows
      { geometry: box(1.9, 0.3, 13.6), color: 0x2b2b30, at: [0, 0.55, 0] }, // chassis
      { geometry: box(2.3, 0.2, deckLength), color: 0x8a909a, at: [0, deckHeight - 0.1, rampEnd - deckLength / 2] },
      { geometry: ramp, color: 0xffc21a, at: [0, deckHeight / 2 - 0.05, (rampStart + rampEnd) / 2] },
      ...stripes,
      { geometry: box(0.08, 0.3, deckLength), color: 0xffc21a, at: [-1.11, deckHeight + 0.15, rampEnd - deckLength / 2] },
      { geometry: box(0.08, 0.3, deckLength), color: 0xffc21a, at: [1.11, deckHeight + 0.15, rampEnd - deckLength / 2] },
      ...[-4.2, -1.2, 2.4].flatMap((z): Part[] => [
        { geometry: box(0.14, 1.7, 0.14), color: 0x6b7280, at: [-1.05, 1.45, z] },
        { geometry: box(0.14, 1.7, 0.14), color: 0x6b7280, at: [1.05, 1.45, z] },
      ]),
      ...lowerCars,
      ...[-5.6, -1.5, 5.6].flatMap((z) => [
        ...wheelParts(0.42, 0.34, [-0.95, 0.42, z]),
        ...wheelParts(0.42, 0.34, [0.95, 0.42, z]),
      ]),
    ],
    [
      { geometry: box(0.3, 0.16, 0.04), color: 0xff2a2a, at: [-0.85, 0.65, 6.82] },
      { geometry: box(0.3, 0.16, 0.04), color: 0xff2a2a, at: [0.85, 0.65, 6.82] },
    ],
    [3, 15],
  );
  return paintable(object, body, CAR_COLORS);
}

/** Black-and-white police cruiser with a flashing light bar. */
export function createPoliceCar() {
  const { object } = assemble(
    [
      ...sedanParts(0x15171c),
      { geometry: box(1.66, 0.38, 1.9), color: 0xf5f5f5, at: [0, 0.56, 0.1] }, // white doors
      { geometry: box(1.2, 0.12, 0.34), color: 0x2b2b30, at: [0, 1.36, 0.3] }, // light bar base
    ],
    [],
    [2.4, 4.8],
  );
  const red = curved(new THREE.MeshBasicMaterial({ color: 0xff2020 }));
  const blue = curved(new THREE.MeshBasicMaterial({ color: 0x2060ff }));
  const lampGeo = box(0.5, 0.14, 0.3);
  const redLamp = new THREE.Mesh(lampGeo, red);
  const blueLamp = new THREE.Mesh(lampGeo, blue);
  redLamp.position.set(-0.3, 1.47, 0.3);
  blueLamp.position.set(0.3, 1.47, 0.3);
  object.add(redLamp, blueLamp, new THREE.Mesh(mergeParts(TAILLIGHTS).geometry, glowMaterial));
  return { object, red, blue };
}

function truck(): ObstacleModel {
  const { object, body } = assemble(
    [
      { geometry: box(2.1, 2.0, 1.9), color: 0xffffff, tag: 'paint', at: [0, 1.35, -3.05] }, // cab
      { geometry: box(2.12, 0.6, 1.0), color: 0x1c2533, at: [0, 1.9, -3.2] }, // side windows
      { geometry: box(1.9, 0.35, 8), color: 0x2b2b30, at: [0, 0.5, 0] }, // chassis
      { geometry: box(2.2, 2.9, 5.8), color: 0xf4f4f6, at: [0, 1.95, 1.05] }, // cargo box
      { geometry: box(2.24, 0.45, 5.6), color: 0xffffff, tag: 'paint', at: [0, 1.4, 1.05] }, // side stripe
      { geometry: box(2.0, 0.45, 0.04), color: 0xffffff, tag: 'paint', at: [0, 1.4, 3.96] }, // rear stripe
      { geometry: box(0.05, 2.6, 0.03), color: 0xc4c4cc, at: [0, 2.0, 3.97] }, // door seam
      { geometry: box(0.08, 0.5, 0.05), color: 0x7a7a85, at: [-0.25, 1.85, 3.98] }, // handles
      { geometry: box(0.08, 0.5, 0.05), color: 0x7a7a85, at: [0.25, 1.85, 3.98] },
      { geometry: box(2.0, 0.2, 0.2), color: 0x2b2b30, at: [0, 0.42, 3.9] }, // bumper
      ...[-3, 0.6, 2.6].flatMap((z) => [
        ...wheelParts(0.42, 0.34, [-0.95, 0.42, z]),
        ...wheelParts(0.42, 0.34, [0.95, 0.42, z]),
      ]),
    ],
    [
      { geometry: box(0.28, 0.16, 0.04), color: 0xff2a2a, at: [-0.85, 0.72, 4.0] },
      { geometry: box(0.28, 0.16, 0.04), color: 0xff2a2a, at: [0.85, 0.72, 4.0] },
      { geometry: box(0.16, 0.1, 0.04), color: 0xffa31a, at: [-1.0, 3.3, 3.97] },
      { geometry: box(0.16, 0.1, 0.04), color: 0xffa31a, at: [1.0, 3.3, 3.97] },
    ],
    [3, 9.2],
  );
  return paintable(object, body, TRUCK_COLORS);
}

function barrier(): ObstacleModel {
  const stripes: Part[] = [];
  for (let i = 0; i < 5; i++) {
    stripes.push({ geometry: box(0.46, 0.42, 0.2), color: i % 2 ? 0xf5f5f5 : 0xff3b30, at: [-0.92 + i * 0.46, 0.66, 0] });
  }
  const { object } = assemble(
    [
      ...stripes,
      { geometry: box(0.12, 0.6, 0.5), color: 0xdedede, at: [-0.95, 0.3, 0] },
      { geometry: box(0.12, 0.6, 0.5), color: 0xdedede, at: [0.95, 0.3, 0] },
    ],
    [
      { geometry: box(0.14, 0.14, 0.14), color: 0xffb020, at: [-0.95, 0.95, 0] },
      { geometry: box(0.14, 0.14, 0.14), color: 0xffb020, at: [0.95, 0.95, 0] },
    ],
  );
  return { object };
}

function sign(): ObstacleModel {
  const chevrons: Part[] = [];
  for (let i = 0; i < 10; i++) {
    chevrons.push({ geometry: box(0.25, 0.14, 0.03), color: i % 2 ? 0x1f1f1f : 0xffd21f, at: [-1.125 + i * 0.25, 1.08, 0.1] });
  }
  const { object } = assemble(
    [
      { geometry: box(2.6, 1.08, 0.14), color: 0xffffff, at: [0, 1.5, 0] }, // border
      { geometry: box(2.44, 0.92, 0.18), color: 0x1f8a4c, at: [0, 1.52, 0] }, // board
      { geometry: box(1.5, 0.12, 0.03), color: 0xffffff, at: [-0.2, 1.75, 0.1] }, // "lettering"
      { geometry: box(1.0, 0.12, 0.03), color: 0xffffff, at: [-0.45, 1.5, 0.1] },
      { geometry: box(0.3, 0.3, 0.03), color: 0xffffff, at: [0.85, 1.55, 0.1] },
      ...chevrons,
      { geometry: new THREE.CylinderGeometry(0.07, 0.07, 2.1, 8), color: 0x9ca3af, at: [-1.32, 1.05, 0] },
      { geometry: new THREE.CylinderGeometry(0.07, 0.07, 2.1, 8), color: 0x9ca3af, at: [1.32, 1.05, 0] },
    ],
    [],
  );
  return { object };
}

export const OBSTACLE_MODELS: Record<ObstacleKind, () => ObstacleModel> = { car, truck, barrier, sign, carrier };
