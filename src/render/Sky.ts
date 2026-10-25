import * as THREE from 'three';
import { SKY_HORIZON, SKY_TOP } from '../config';

/** Gradient sky dome with a soft sun glow. Follows the camera. */
export function createSky() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(SKY_TOP) },
      uHorizon: { value: new THREE.Color(SKY_HORIZON) },
      uSunDir: { value: new THREE.Vector3(-0.35, 0.32, -1).normalize() },
      uSunColor: { value: new THREE.Color(0xfff2cc) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w; // always at the far plane
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      varying vec3 vDir;
      void main() {
        vec3 dir = normalize(vDir);
        vec3 color = mix(uHorizon, uTop, smoothstep(-0.02, 0.45, dir.y));
        float sun = max(dot(dir, uSunDir), 0.0);
        color += uSunColor * (pow(sun, 600.0) * 1.2 + pow(sun, 12.0) * 0.25);
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }`,
  });

  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), material);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  return sky;
}
