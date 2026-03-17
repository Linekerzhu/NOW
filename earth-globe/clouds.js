import * as THREE from 'three';
import vertexShader from './shaders/clouds.vert';
import fragmentShader from './shaders/clouds.frag';

/**
 * Create the cloud layer component.
 *
 * @param {object} deps
 * @param {object} deps.config - CONFIG.clouds
 * @param {number} deps.earthRadius - earth radius in scene units
 * @returns {{ object3D: THREE.Mesh, cloudUVOffset: number, update: (ctx: import('./types.js').FrameContext) => void, dispose: () => void }}
 */
export function createClouds({ config, earthRadius, cameraPosition }) {
  // Note: same texture URL as earth.js cloudTexture — Three.js TextureLoader
  // caches by URL, so they share the same GPU texture.
  const texture = new THREE.TextureLoader().load('/textures/earth-clouds-2k.jpg');
  texture.colorSpace = THREE.LinearSRGBColorSpace;

  const [segW, segH] = config.segments;
  const geometry = new THREE.SphereGeometry(earthRadius * config.heightFactor, segW, segH);

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      cloudTexture: { value: texture },
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
      cameraPos: { value: cameraPosition },
      opacity: { value: config.opacity },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
  });

  const object3D = new THREE.Mesh(geometry, material);

  return {
    object3D,

    /** Cloud rotation as UV offset — read by earth for shadow sync. */
    get cloudUVOffset() {
      return object3D.rotation.y / (Math.PI * 2);
    },

    /** @param {import('./types.js').FrameContext} ctx */
    update(ctx) {
      // Clouds drift (delta-based, very slow relative to earth surface)
      object3D.rotation.y = (object3D.rotation.y + config.driftSpeed * ctx.dtNorm) % (Math.PI * 2);
      material.uniforms.sunDirection.value.copy(ctx.sunDirection);
    },

    dispose() {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
