import * as THREE from 'three';
import vertexShader from './shaders/atmosphere.vert';
import fragmentShader from './shaders/atmosphere.frag';

/**
 * Create the atmosphere component with physically-based scattering.
 *
 * Uses a BackSide sphere slightly larger than the earth. The fragment
 * shader ray-marches through the atmosphere shell, accumulating
 * Rayleigh + Mie single-scattering for realistic limb colors,
 * sunsets, and horizon glow.
 *
 * @param {object} deps
 * @param {object} deps.config - CONFIG.atmosphere
 * @param {number} deps.earthRadius - earth radius in scene units
 * @param {THREE.Vector3} deps.cameraPosition - live camera position reference
 * @returns {{ object3D: THREE.Mesh, update: (ctx) => void, dispose: () => void }}
 */
export function createAtmosphere({ config, earthRadius, cameraPosition }) {
  const [segW, segH] = config.segments;
  const atmosRadius = earthRadius * config.heightFactor;
  const geometry = new THREE.SphereGeometry(atmosRadius, segW, segH);

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      cameraPos: { value: cameraPosition },
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
      earthRadius: { value: earthRadius },
      atmosphereRadius: { value: atmosRadius },
      sunIntensity: { value: 1.5 },
    },
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });

  const object3D = new THREE.Mesh(geometry, material);

  return {
    object3D,

    update(ctx) {
      material.uniforms.sunDirection.value.copy(ctx.sunDirection);
      material.uniforms.sunIntensity.value = 1.5 * ctx.sunIntensity;
    },

    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
