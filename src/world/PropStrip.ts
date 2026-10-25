import * as THREE from 'three';

const RECYCLE_Z = 20;
const dummy = new THREE.Object3D();

export interface PropSlot {
  side: -1 | 1;
  x: number;
  z: number;
  rotY: number;
  scale: THREE.Vector3;
}

export interface PropStripOptions {
  perSide: number;
  spacing: number;
  /** z of the nearest slot on the left side. */
  firstZ: number;
  /** Shifts the right side so the two sides don't mirror each other. */
  rightOffset?: number;
  /** Randomizes a slot's x/rotation/scale (and color) each time it recycles. */
  place: (slot: PropSlot, index: number, mesh: THREE.InstancedMesh) => void;
}

/**
 * A row of identical props on both sides of the road, drawn as a single
 * InstancedMesh. Props scroll with the world and recycle to the far end.
 */
export class PropStrip {
  readonly mesh: THREE.InstancedMesh;
  private readonly slots: PropSlot[] = [];
  private readonly span: number;

  constructor(
    scene: THREE.Scene,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    private readonly opts: PropStripOptions,
  ) {
    this.mesh = new THREE.InstancedMesh(geometry, material, opts.perSide * 2);
    this.mesh.frustumCulled = false;
    this.span = opts.perSide * opts.spacing;

    for (const side of [-1, 1] as const) {
      for (let i = 0; i < opts.perSide; i++) {
        const z = opts.firstZ - i * opts.spacing - (side > 0 ? (opts.rightOffset ?? 0) : 0);
        const slot: PropSlot = { side, x: 0, z, rotY: 0, scale: new THREE.Vector3(1, 1, 1) };
        this.slots.push(slot);
        opts.place(slot, this.slots.length - 1, this.mesh);
      }
    }
    this.update(0);
    scene.add(this.mesh);
  }

  /** Re-places every prop where it stands (e.g. after switching environment). */
  refresh() {
    this.slots.forEach((slot, i) => this.opts.place(slot, i, this.mesh));
    this.update(0);
  }

  update(dz: number) {
    let visible = false;
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      slot.z += dz;
      if (slot.z > RECYCLE_Z) {
        slot.z -= this.span;
        this.opts.place(slot, i, this.mesh);
      }
      dummy.position.set(slot.x, 0, slot.z);
      dummy.rotation.set(0, slot.rotY, 0);
      dummy.scale.copy(slot.scale);
      if (slot.scale.x !== 0) visible = true;
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    // Strips with every slot hidden (props from another environment) cost no draw call.
    this.mesh.visible = visible;
  }
}

/** Sets an instance color and flags the buffer for upload. */
export function tint(mesh: THREE.InstancedMesh, index: number, color: THREE.ColorRepresentation) {
  mesh.setColorAt(index, new THREE.Color(color));
  mesh.instanceColor!.needsUpdate = true;
}
