import * as THREE from 'three';

const COUNT = 32;
const dummy = new THREE.Object3D();

interface Line {
  angle: number;
  radius: number;
  z: number;
  length: number;
}

/**
 * Thin white streaks that rush past the edges of the screen at high speed.
 * They live in camera space, so they always frame the view.
 */
export class SpeedLines {
  private readonly mesh: THREE.InstancedMesh;
  private readonly material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  private readonly lines: Line[] = [];

  constructor(camera: THREE.Camera) {
    // A unit-length sliver lying along z; instances rotate it around the view axis.
    const geometry = new THREE.PlaneGeometry(0.035, 1).rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(geometry, this.material, COUNT);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.visible = false;
    camera.add(this.mesh);

    for (let i = 0; i < COUNT; i++) {
      const line = { angle: 0, radius: 0, z: 0, length: 0 };
      this.respawn(line, -2 - Math.random() * 10);
      this.lines.push(line);
    }
  }

  /** `intensity` 0..1 fades the effect in; `speed` drives how fast lines rush past. */
  update(dt: number, intensity: number, speed: number) {
    this.material.opacity = THREE.MathUtils.damp(this.material.opacity, intensity * 0.5, 4, dt);
    this.mesh.visible = this.material.opacity > 0.01;
    if (!this.mesh.visible) return;

    this.lines.forEach((line, i) => {
      line.z += speed * 1.4 * dt;
      if (line.z > -0.5) this.respawn(line, -10 - Math.random() * 4);
      dummy.position.set(Math.cos(line.angle) * line.radius, Math.sin(line.angle) * line.radius, line.z);
      dummy.rotation.set(0, 0, line.angle - Math.PI / 2);
      dummy.scale.set(1, 1, line.length);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private respawn(line: Line, z: number) {
    line.angle = Math.random() * Math.PI * 2;
    // Start away from the center of the view so lines never cross the action.
    line.radius = -z * THREE.MathUtils.randFloat(0.3, 0.6);
    line.z = z;
    line.length = THREE.MathUtils.randFloat(1.5, 3.5);
  }
}
