import * as THREE from 'three';
import vertexShader from './shaders/aurora.vert';
import fragmentShader from './shaders/aurora.frag';

/**
 * Create the aurora borealis/australis component.
 *
 * @param {object} deps
 * @param {object} deps.config - CONFIG.aurora
 * @param {number} deps.earthRadius - earth radius in scene units
 * @param {THREE.Vector3} deps.cameraPosition - live camera position reference
 * @returns {import('./types.js').Component}
 */
export function createAurora({ config, earthRadius, cameraPosition }) {
  // Aurora shell slightly above the atmosphere (~100-300km altitude)
  const [segW, segH] = config.segments;
  const geometry = new THREE.SphereGeometry(earthRadius * config.heightFactor, segW, segH);

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
      time: { value: 0 },
      cameraPos: { value: cameraPosition },  // live reference — updated by camera motion
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  });

  const object3D = new THREE.Mesh(geometry, material);

  return {
    object3D,

    update(ctx) {
      material.uniforms.sunDirection.value.copy(ctx.sunDirection);
      material.uniforms.time.value = ctx.time;
    },

    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
