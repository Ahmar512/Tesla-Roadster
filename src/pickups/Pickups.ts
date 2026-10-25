import * as THREE from 'three';
import { DESPAWN_Z, MAGNET_RANGE } from '../config';
import { POWER_UPS, type PowerUpType } from '../game/PowerUps';
import { mergeParts } from '../render/geometry';
import { curved, glowMaterial } from '../render/materials';
import { createBlobShadow } from '../render/shadow';

const MAX_CELLS = 300;
const MAGNET_PULL = 45; // m/s
const dummy = new THREE.Object3D();

interface PowerUpItem {
  type: PowerUpType;
  object: THREE.Group;
  active: boolean;
}

/**
 * Energy cells (the coins) and power-up badges. Cells are one InstancedMesh
 * so hundreds cost a single draw call.
 */
export class Pickups {
  onCell?: (x: number, y: number, z: number) => void;
  onPowerUp?: (type: PowerUpType, x: number, y: number) => void;

  private readonly cells: THREE.InstancedMesh;
  private readonly cx = new Float32Array(MAX_CELLS);
  private readonly cy = new Float32Array(MAX_CELLS);
  private readonly cz = new Float32Array(MAX_CELLS);
  private readonly alive = new Uint8Array(MAX_CELLS);
  private readonly pulled = new Uint8Array(MAX_CELLS);
  private nextCell = 0;
  private readonly items: PowerUpItem[] = [];
  private time = 0;

  constructor(private readonly scene: THREE.Scene) {
    const cell = mergeParts([
      { geometry: new THREE.CylinderGeometry(0.22, 0.22, 0.5, 12), color: 0x33d6ff },
      { geometry: new THREE.CylinderGeometry(0.23, 0.23, 0.12, 12), color: 0xe8fbff, at: [0, 0.12, 0] },
      { geometry: new THREE.CylinderGeometry(0.1, 0.1, 0.1, 10), color: 0xe8fbff, at: [0, 0.3, 0] },
      { geometry: new THREE.BoxGeometry(0.06, 0.2, 0.47).rotateX(0.5), color: 0xffffff, at: [0, -0.08, 0] },
    ]).geometry;
    this.cells = new THREE.InstancedMesh(cell, glowMaterial, MAX_CELLS);
    this.cells.frustumCulled = false;
    this.cells.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.cells);
    this.hideAllCells();
  }

  reset() {
    this.alive.fill(0);
    this.hideAllCells();
    for (const item of this.items) {
      item.active = false;
      item.object.visible = false;
    }
  }

  spawnCell(x: number, y: number, z: number) {
    const i = this.nextCell;
    this.nextCell = (this.nextCell + 1) % MAX_CELLS;
    this.cx[i] = x;
    this.cy[i] = y;
    this.cz[i] = z;
    this.alive[i] = 1;
    this.pulled[i] = 0;
  }

  spawnPowerUp(type: PowerUpType, x: number, z: number) {
    let item = this.items.find((it) => !it.active && it.type === type);
    if (!item) {
      item = { type, object: createBadge(type), active: false };
      this.items.push(item);
      this.scene.add(item.object);
    }
    item.active = true;
    item.object.visible = true;
    item.object.position.set(x, 1.3, z);
  }

  /** Removes pickups between two z values (e.g. a landing zone after flight). */
  clearRange(zNear: number, zFar: number) {
    for (let i = 0; i < MAX_CELLS; i++) {
      if (this.alive[i] && this.cz[i] <= zNear && this.cz[i] >= zFar && !this.pulled[i]) this.alive[i] = 0;
    }
  }

  /** Moves pickups with the world, pulls cells in with the magnet, and collects what the player touches. */
  update(dt: number, dz: number, player: THREE.Vector3, magnet: boolean) {
    this.time += dt;
    const spin = this.time * 3;

    for (let i = 0; i < MAX_CELLS; i++) {
      if (!this.alive[i]) continue;
      this.cz[i] += dz;

      if (magnet && !this.pulled[i] && this.cz[i] > -MAGNET_RANGE && this.cz[i] < 4) this.pulled[i] = 1;
      if (this.pulled[i]) {
        const dx = player.x - this.cx[i];
        const dy = player.y - this.cy[i];
        const dzp = player.z - this.cz[i];
        const dist = Math.hypot(dx, dy, dzp);
        const step = Math.min(dist, (MAGNET_PULL + Math.max(0, dz / dt)) * dt);
        if (dist > 0) {
          this.cx[i] += (dx / dist) * step;
          this.cy[i] += (dy / dist) * step;
          this.cz[i] += (dzp / dist) * step;
        }
      }

      const touching =
        Math.abs(this.cx[i] - player.x) < 1.1 && Math.abs(this.cy[i] - player.y) < 1.3 && Math.abs(this.cz[i] - player.z) < 2;
      if (touching) {
        this.alive[i] = 0;
        this.onCell?.(this.cx[i], this.cy[i], this.cz[i]);
      } else if (this.cz[i] > DESPAWN_Z) {
        this.alive[i] = 0;
      }

      dummy.position.set(this.cx[i], this.cy[i] + Math.sin(spin + this.cz[i] * 0.3) * 0.08, this.cz[i]);
      dummy.rotation.set(0, spin + i, 0.25);
      dummy.scale.setScalar(this.alive[i] ? 1.15 : 0);
      dummy.updateMatrix();
      this.cells.setMatrixAt(i, dummy.matrix);
    }
    this.cells.instanceMatrix.needsUpdate = true;

    for (const item of this.items) {
      if (!item.active) continue;
      const p = item.object.position;
      p.z += dz;
      p.y = 1.3 + Math.sin(this.time * 3) * 0.15;
      item.object.rotation.y = Math.sin(this.time * 2) * 0.5;
      const touching = Math.abs(p.x - player.x) < 1.3 && Math.abs(p.y - player.y) < 1.6 && Math.abs(p.z - player.z) < 2;
      if (touching || p.z > DESPAWN_Z) {
        item.active = false;
        item.object.visible = false;
        if (touching) this.onPowerUp?.(item.type, p.x, p.y);
      }
    }
  }

  private hideAllCells() {
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    for (let i = 0; i < MAX_CELLS; i++) this.cells.setMatrixAt(i, dummy.matrix);
    this.cells.instanceMatrix.needsUpdate = true;
  }
}

/** A glowing round badge with the power-up's icon, floating over the road. */
function createBadge(type: PowerUpType) {
  const info = POWER_UPS[type];
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d')!;

  const glow = ctx.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S / 2);
  glow.addColorStop(0, 'rgba(255,255,255,0.9)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, S, S);

  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.36, 0, Math.PI * 2);
  ctx.fillStyle = info.color;
  ctx.fill();
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#1b1424';
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.36 + 9, 0, Math.PI * 2);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${S * 0.34}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#1b1424';
  if (type === 'multiplier') ctx.strokeText(info.icon, S / 2, S / 2 + 4);
  ctx.fillText(info.icon, S / 2, S / 2 + 4);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const badge = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 1.7),
    curved(new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })),
  );
  const group = new THREE.Group();
  group.add(badge);
  const shadow = createBlobShadow(1.4, 1.4);
  shadow.position.y = -1.27;
  group.add(shadow);
  return group;
}
