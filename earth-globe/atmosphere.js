import * as THREE from 'three';
import vertexShader from './shaders/atmosphere.vert';
import fragmentShader from './shaders/atmosphere.frag';

/**
 * Create the atmosphere glow component.
 *
 * @param {object} deps
 * @param {object} deps.config - CONFIG.atmosphere
 * @param {number} deps.earthRadius - earth radius in scene units
 * @param {THREE.Vector3} deps.cameraPosition - live camera position reference
 * @returns {{ object3D: THREE.Mesh, update: (ctx) => void, dispose: () => void }}
 */
export function createAtmosphere({ config, earthRadius, cameraPosition }) {
  const [segW, segH] = config.segments;
  const geometry = new THREE.SphereGeometry(earthRadius * config.heightFactor, segW, segH);

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      cameraPos: { value: cameraPosition },  // live reference — updated by camera motion
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
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
    },

    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
