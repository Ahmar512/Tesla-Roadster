import type * as THREE from 'three';

/** Performance readout, shown only when the page is opened with `?debug`. */
export class DebugOverlay {
  private readonly el?: HTMLDivElement;
  private elapsed = 0;

  constructor() {
    if (!new URLSearchParams(location.search).has('debug')) return;
    this.el = document.createElement('div');
    this.el.className = 'debug';
    document.body.appendChild(this.el);
  }

  update(dt: number, renderer: THREE.WebGLRenderer, fps: number, qualityLevel: number) {
    if (!this.el) return;
    this.elapsed += dt;
    if (this.elapsed < 0.5) return;
    this.elapsed = 0;
    const { calls, triangles } = renderer.info.render;
    this.el.textContent =
      `${Math.round(fps)} fps · ${calls} draws · ${(triangles / 1000).toFixed(1)}k tris · ` +
      `dpr ${renderer.getPixelRatio()} · q${qualityLevel}`;
  }
}
