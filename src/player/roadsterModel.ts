import * as THREE from 'three';
import { PLAYER_COLOR } from '../config';
import { loft, mergeParts, type LoftSection, type Part } from '../render/geometry';
import { glowMaterial, outlineMaterial, vehicleMaterial } from '../render/materials';
import { createUnderglow } from './skins';

export const WHEEL_RADIUS = 0.34;

/** Thruster nozzle positions relative to the car, used to emit flames. */
export const NOZZLES = { x: [-0.35, 0.35], y: 0.42, z: 2.15 };

const GLASS = 0x1e2a3f;
const TRIM = 0x17171c;
const TAILLIGHT = 0xff4a3a;
const HEADLIGHT = 0xf4fbff;

// Wheel centers [x, z]: front axle at -z (the car faces -z).
const WHEELS: [number, number][] = [
  [-0.78, -1.3],
  [0.78, -1.3],
  [-0.8, 1.28],
  [0.8, 1.28],
];

/** Shorthand for a loft section: z, half width, bottom, top, top width. */
const sec = (z: number, halfWidth: number, bottom: number, top: number, topWidth = 1): LoftSection => ({
  z,
  halfWidth,
  bottom,
  top,
  topWidth,
});

// Main body: a long sloping nose, a pinched waist at the doors and wide rear
// haunches, ending in a ducktail over a flat rear face.
const BODY = [
  sec(-2.18, 0.48, 0.26, 0.34, 0.8),
  sec(-2.04, 0.7, 0.19, 0.42, 0.82),
  sec(-1.7, 0.8, 0.16, 0.5, 0.8),
  sec(-1.2, 0.81, 0.16, 0.55, 0.78),
  sec(-0.6, 0.77, 0.16, 0.58, 0.8),
  sec(0, 0.76, 0.16, 0.6, 0.82),
  sec(0.6, 0.83, 0.16, 0.62, 0.8),
  sec(1.15, 0.88, 0.17, 0.64, 0.74),
  sec(1.65, 0.87, 0.2, 0.66, 0.74),
  sec(1.98, 0.82, 0.25, 0.7, 0.8),
  sec(2.1, 0.76, 0.3, 0.66, 0.84),
];

// Raised fenders over each wheel, so the hood and rear deck sit lower between them.
const FRONT_FENDER = [
  sec(-1.95, 0.12, 0.3, 0.42),
  sec(-1.65, 0.22, 0.3, 0.57),
  sec(-1.25, 0.24, 0.3, 0.62),
  sec(-0.85, 0.2, 0.3, 0.6),
  sec(-0.55, 0.1, 0.3, 0.5),
];
const REAR_HAUNCH = [
  sec(0.35, 0.1, 0.3, 0.56),
  sec(0.8, 0.26, 0.3, 0.7),
  sec(1.3, 0.3, 0.3, 0.76),
  sec(1.75, 0.27, 0.3, 0.74),
  sec(2.02, 0.16, 0.3, 0.68),
];

// Wraparound tinted canopy: steep windshield, short roof, long fastback.
const CANOPY = [
  sec(-0.78, 0.6, 0.5, 0.56, 0.85),
  sec(-0.4, 0.63, 0.5, 0.8, 0.72),
  sec(0.05, 0.62, 0.5, 0.97, 0.66),
  sec(0.5, 0.61, 0.5, 1.0, 0.64),
  sec(1.0, 0.6, 0.5, 0.9, 0.66),
  sec(1.5, 0.55, 0.5, 0.74, 0.7),
  sec(1.82, 0.44, 0.5, 0.67, 0.76),
];

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/**
 * The player's hero roadster: a low, wedge-shaped electric supercar (inspired
 * by modern EV roadsters, with no real branding). Faces -z.
 *
 * Draw calls: body (+ outline), lights, nozzles, and one per wheel so the
 * wheels can spin (plus the underglow, only with the Neon skin).
 */
export function buildRoadster(nozzleMaterial: THREE.Material) {
  const object = new THREE.Group();

  const mirror = (side: number): Part[] => [
    { geometry: box(0.15, 0.07, 0.17), color: PLAYER_COLOR, at: [side * 0.75, 0.7, -0.5], tag: 'paint' },
    { geometry: box(0.12, 0.04, 0.08), color: TRIM, at: [side * 0.66, 0.68, -0.48] },
  ];
  const fins = [-0.39, -0.13, 0.13, 0.39].map(
    (x): Part => ({ geometry: box(0.035, 0.13, 0.26), color: 0x2c2c34, at: [x, 0.25, 2.0] }),
  );

  const shell = mergeParts(
    [
      { geometry: loft(BODY), color: PLAYER_COLOR, tag: 'paint' },
      ...[-1, 1].flatMap((side): Part[] => [
        { geometry: loft(FRONT_FENDER, 14), color: PLAYER_COLOR, at: [side * 0.56, 0, 0], tag: 'paint' },
        { geometry: loft(REAR_HAUNCH, 14), color: PLAYER_COLOR, at: [side * 0.6, 0, 0], tag: 'paint' },
        { geometry: box(0.06, 0.1, 1.5), color: TRIM, at: [side * 0.77, 0.21, -0.05] }, // side skirt
        ...mirror(side),
      ]),
      { geometry: loft(CANOPY, 20, 2.6), color: GLASS },
      { geometry: box(1.36, 0.16, 0.24), color: TRIM, at: [0, 0.27, 1.98] }, // diffuser
      ...fins,
      { geometry: box(1.5, 0.17, 0.08), color: TRIM, at: [0, 0.6, 2.08] }, // taillight housing
      { geometry: box(1.2, 0.2, 0.06), color: TRIM, at: [0, 0.41, 2.1] }, // thruster panel
      { geometry: box(0.86, 0.07, 0.1), color: TRIM, at: [0, 0.25, -2.1] }, // front intake
    ],
    true,
  );
  object.add(new THREE.Mesh(shell.geometry, vehicleMaterial), new THREE.Mesh(shell.geometry, outlineMaterial));

  // Full-width rear light bar that wraps round the corners, and slim split headlights.
  const wrap = (side: number) =>
    box(0.22, 0.09, 0.05)
      .rotateY(side * 0.75)
      .translate(side * 0.82, 0.6, 2.0);
  const headlight = (side: number) =>
    box(0.34, 0.045, 0.1)
      .rotateY(side * -0.38)
      .rotateZ(side * 0.08)
      .translate(side * 0.47, 0.42, -2.03);
  const lights = mergeParts([
    { geometry: box(1.4, 0.09, 0.04), color: TAILLIGHT, at: [0, 0.6, 2.17] },
    { geometry: wrap(-1), color: TAILLIGHT },
    { geometry: wrap(1), color: TAILLIGHT },
    { geometry: headlight(-1), color: HEADLIGHT },
    { geometry: headlight(1), color: HEADLIGHT },
  ]).geometry;
  object.add(new THREE.Mesh(lights, glowMaterial));

  // Both thruster nozzles in one mesh; they glow hotter while airborne.
  const nozzle = (x: number) => new THREE.CylinderGeometry(0.1, 0.14, 0.25, 14).rotateX(Math.PI / 2).translate(x, NOZZLES.y, 2.04);
  const nozzles = mergeParts(NOZZLES.x.map((x) => ({ geometry: nozzle(x), color: 0xffffff }))).geometry;
  object.add(new THREE.Mesh(nozzles, nozzleMaterial));

  const wheelGeo = mergeParts(aeroWheelParts(WHEEL_RADIUS, 0.3)).geometry;
  const wheels = WHEELS.map(([x, z]) => {
    const wheel = new THREE.Mesh(wheelGeo, vehicleMaterial);
    wheel.position.set(x, WHEEL_RADIUS, z);
    object.add(wheel);
    return wheel;
  });

  const underglow = createUnderglow();
  object.add(underglow);

  return { object, wheels, shell, underglow };
}

/** A wheel lying on its side (axis along x): fat tire, silver aero rim with five spokes. */
function aeroWheelParts(radius: number, width: number): Part[] {
  const sideways = (g: THREE.BufferGeometry) => g.rotateZ(Math.PI / 2);
  const parts: Part[] = [
    { geometry: sideways(new THREE.CylinderGeometry(radius, radius, width, 18)), color: 0x1d1d22 },
    { geometry: sideways(new THREE.CylinderGeometry(radius * 0.72, radius * 0.72, width + 0.02, 18)), color: 0xd5dae2 },
    { geometry: sideways(new THREE.CylinderGeometry(radius * 0.6, radius * 0.6, width + 0.03, 18)), color: 0x2a2d35 },
    { geometry: sideways(new THREE.CylinderGeometry(radius * 0.16, radius * 0.16, width + 0.06, 10)), color: 0xd5dae2 },
  ];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spoke = box(width + 0.05, radius * 0.5, radius * 0.17)
      .translate(0, radius * 0.33, 0)
      .rotateX(a);
    parts.push({ geometry: spoke, color: 0xd5dae2 });
  }
  return parts;
}
