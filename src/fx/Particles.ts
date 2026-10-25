import * as THREE from 'three';
import { CURVE_GLSL, curveUniform } from '../render/materials';

export interface Burst {
  at: [number, number, number];
  count: number;
  /** Random start offset in each axis. */
  spread?: number;
  velocity?: [number, number, number];
  /** Random velocity added in each axis. */
  jitter?: number;
  size: number;
  endSize?: number;
  life: number;
  color: THREE.ColorRepresentation;
  alpha?: number;
  gravity?: number;
  drag?: number;
  /** Scrolls with the road (dust, vapor trails) instead of hanging in the air. */
  worldLocked?: boolean;
}

const KILL_Z = 8; // just in front of the camera

/**
 * A fixed-size pool of soft round particles drawn as one Points object.
 * New bursts overwrite the oldest particles, so nothing is ever allocated
 * during play.
 */
export class Particles {
  readonly points: THREE.Points;
  private readonly sizeScale = { value: 1 };
  private readonly position: Float32Array;
  private readonly color: Float32Array;
  private readonly size: Float32Array;
  private readonly velocity: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly startSize: Float32Array;
  private readonly endSize: Float32Array;
  private readonly startAlpha: Float32Array;
  private readonly gravity: Float32Array;
  private readonly drag: Float32Array;
  private readonly locked: Uint8Array;
  private next = 0;
  private alive = 0;

  constructor(
    private readonly capacity: number,
    blending: THREE.Blending,
  ) {
    this.position = new Float32Array(capacity * 3);
    this.color = new Float32Array(capacity * 4);
    this.size = new Float32Array(capacity);
    this.velocity = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.startSize = new Float32Array(capacity);
    this.endSize = new Float32Array(capacity);
    this.startAlpha = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.locked = new Uint8Array(capacity);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.position, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(this.color, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending,
      uniforms: { uCurve: curveUniform, uSizeScale: this.sizeScale },
      vertexShader: /* glsl */ `
        uniform float uCurve;
        uniform float uSizeScale;
        attribute vec4 aColor;
        attribute float aSize;
        varying vec4 vColor;
        void main() {
          vColor = aColor;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          ${CURVE_GLSL}
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = aSize * uSizeScale / max(-mvPosition.z, 0.1);
        }`,
      fragmentShader: /* glsl */ `
        varying vec4 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = vColor.a * smoothstep(0.5, 0.15, d);
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor.rgb, a);
          #include <colorspace_fragment>
        }`,
    });

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
  }

  /** Converts world-size particles to pixels; call on resize/FOV change. */
  setViewport(heightPx: number, fovDeg: number) {
    this.sizeScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  emit(b: Burst, quality = 1) {
    const count = Math.max(1, Math.round(b.count * quality));
    const color = new THREE.Color(b.color);
    const spread = b.spread ?? 0;
    const jitter = b.jitter ?? 0;
    const [vx, vy, vz] = b.velocity ?? [0, 0, 0];
    const rand = () => Math.random() * 2 - 1;

    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.capacity;
      if (this.life[i] <= 0) this.alive++;

      this.position[i * 3] = b.at[0] + rand() * spread;
      this.position[i * 3 + 1] = b.at[1] + rand() * spread;
      this.position[i * 3 + 2] = b.at[2] + rand() * spread;
      this.velocity[i * 3] = vx + rand() * jitter;
      this.velocity[i * 3 + 1] = vy + rand() * jitter;
      this.velocity[i * 3 + 2] = vz + rand() * jitter;
      color.toArray(this.color, i * 4);
      this.startAlpha[i] = b.alpha ?? 1;
      this.life[i] = this.maxLife[i] = b.life * (0.75 + Math.random() * 0.5);
      this.startSize[i] = b.size;
      this.endSize[i] = b.endSize ?? b.size;
      this.gravity[i] = b.gravity ?? 0;
      this.drag[i] = b.drag ?? 0;
      this.locked[i] = b.worldLocked ? 1 : 0;
    }
  }

  update(dt: number, dz: number) {
    if (this.alive === 0) return;
    const p = this.position;
    const v = this.velocity;

    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0 || p[i * 3 + 2] > KILL_Z) {
        this.life[i] = 0;
        this.size[i] = 0;
        this.alive--;
        continue;
      }

      const damping = Math.exp(-this.drag[i] * dt);
      v[i * 3] *= damping;
      v[i * 3 + 1] = v[i * 3 + 1] * damping - this.gravity[i] * dt;
      v[i * 3 + 2] *= damping;
      p[i * 3] += v[i * 3] * dt;
      p[i * 3 + 1] += v[i * 3 + 1] * dt;
      p[i * 3 + 2] += v[i * 3 + 2] * dt + (this.locked[i] ? dz : 0);

      const t = 1 - this.life[i] / this.maxLife[i];
      this.size[i] = this.startSize[i] + (this.endSize[i] - this.startSize[i]) * t;
      this.color[i * 4 + 3] = this.startAlpha[i] * (1 - t);
    }

    const attrs = this.points.geometry.attributes;
    attrs.position.needsUpdate = true;
    attrs.aColor.needsUpdate = true;
    attrs.aSize.needsUpdate = true;
  }
}
