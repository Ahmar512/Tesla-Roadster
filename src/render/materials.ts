import * as THREE from 'three';
import { CURVE_STRENGTH, OUTLINE_WIDTH } from '../config';

type Shader = Parameters<THREE.Material['onBeforeCompile']>[0];

/** Shared by every curved material, so the bend can be tuned in one place. */
export const curveUniform = { value: CURVE_STRENGTH };

/** GLSL that bends a view-space position; reused by custom shaders. */
export const CURVE_GLSL = 'mvPosition.y -= uCurve * mvPosition.z * mvPosition.z;';

/**
 * Bends the world down with distance from the camera: the "small planet"
 * look of Subway Surfers. Purely visual; gameplay positions are unchanged.
 */
export function injectCurve(shader: Shader) {
  shader.uniforms.uCurve = curveUniform;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float uCurve;')
    .replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      ${CURVE_GLSL}
      gl_Position = projectionMatrix * mvPosition;`,
    );
}

export function curved<T extends THREE.Material>(material: T): T {
  material.onBeforeCompile = injectCurve;
  material.customProgramCacheKey = () => 'curved';
  return material;
}

// Three flat bands of light instead of a smooth gradient: the cartoon look.
const gradientMap = new THREE.DataTexture(new Uint8Array([120, 195, 255]), 3, 1, THREE.RedFormat);
gradientMap.minFilter = gradientMap.magFilter = THREE.NearestFilter;
gradientMap.needsUpdate = true;

/**
 * Curved toon material. `rim` adds a bright edge where surfaces turn away
 * from the camera, which makes vehicles pop against the background.
 */
export function toon(params: THREE.MeshToonMaterialParameters = {}, rim = 0) {
  const material = new THREE.MeshToonMaterial({ gradientMap, ...params });
  material.onBeforeCompile = (shader) => {
    injectCurve(shader);
    if (rim <= 0) return;
    shader.uniforms.uRim = { value: rim };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uRim;')
      .replace(
        '#include <opaque_fragment>',
        `float rimAmount = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
        outgoingLight += uRim * pow(rimAmount, 3.0);
        #include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => (rim > 0 ? 'toon-rim' : 'toon');
  return material;
}

/** Painted vehicle bodies (player and traffic); colors come from vertices. */
export const vehicleMaterial = toon({ vertexColors: true }, 0.45);

/** Vertex-colored roadside props. */
export const propMaterial = toon({ vertexColors: true });

/** Unlit, so lights and lamps look like they glow. */
export const glowMaterial = curved(new THREE.MeshBasicMaterial({ vertexColors: true }));

/**
 * Cartoon outline: a slightly inflated copy of the mesh, drawn inside-out in
 * a dark color. Needs the `outlineNormal` attribute from addOutlineNormals().
 */
export const outlineMaterial = new THREE.MeshBasicMaterial({ color: 0x1b1424, side: THREE.BackSide });
outlineMaterial.onBeforeCompile = (shader) => {
  shader.uniforms.uOutline = { value: OUTLINE_WIDTH };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec3 outlineNormal;\nuniform float uOutline;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += outlineNormal * uOutline;');
  injectCurve(shader);
};
outlineMaterial.customProgramCacheKey = () => 'outline';
