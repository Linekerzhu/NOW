import * as THREE from 'three';
import vertexShader from './shaders/ocean.vert';
import fragmentShader from './shaders/ocean.frag';

/**
 * Create the ocean component.
 *
 * A smooth sphere at earthRadius (sea level) with Beer-Lambert
 * depth coloring and GGX sun glint. Uses the specular map to
 * mask land areas (discard in fragment shader).
 */
export function createOcean({ config, earthRadius, cameraPosition, specularTex, heightTex }) {
  const [segW, segH] = config.segments;
  // Slight offset above earth base radius ensures ocean renders in front
  // of undisplaced earth surface, but still behind displaced land
  const geometry = new THREE.SphereGeometry(earthRadius + 0.002, segW, segH);

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
      cameraPos: { value: cameraPosition },
      sunIntensity: { value: 1.0 },
      time: { value: 0.0 },
      specularMap: { value: specularTex },
      heightMap: { value: heightTex },
      seaLevel: { value: config.seaLevel },
      maxDepth: { value: config.maxDepth },
      deepColor: { value: new THREE.Color(...config.deepColor) },
      shallowColor: { value: new THREE.Color(...config.shallowColor) },
      maxOpacity: { value: config.opacity },
    },
    transparent: true,
    depthWrite: true,
    side: THREE.FrontSide,
  });

  const object3D = new THREE.Mesh(geometry, material);

  return {
    object3D,
    update(ctx) {
      material.uniforms.sunDirection.value.copy(ctx.sunDirection);
      material.uniforms.sunIntensity.value = ctx.sunIntensity;
      material.uniforms.time.value = ctx.time;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
