import * as THREE from 'three';
import { curved } from './materials';

let texture: THREE.CanvasTexture | undefined;
let sharedMaterial: THREE.MeshBasicMaterial | undefined;

function shadowTexture() {
  if (!texture) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(0,0,0,1)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    texture = new THREE.CanvasTexture(canvas);
  }
  return texture;
}

function createMaterial() {
  return curved(
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, opacity: 0.5, depthWrite: false }),
  );
}

/**
 * A soft dark ellipse lying on the road, much cheaper than real shadows.
 * Pass `own = true` when the shadow's opacity will be animated.
 */
export function createBlobShadow(width: number, length: number, own = false) {
  const material = own ? createMaterial() : (sharedMaterial ??= createMaterial());
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, length).rotateX(-Math.PI / 2), material);
  mesh.position.y = 0.03;
  mesh.renderOrder = 1;
  return mesh;
}
