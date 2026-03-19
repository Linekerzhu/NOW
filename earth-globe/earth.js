import * as THREE from 'three';
import vertexShader from './shaders/earth.vert';
import fragmentShader from './shaders/earth.frag';
import { createTiledTexture } from './tiledTexture.js';

/**
 * Create the Earth surface component.
 *
 * @param {object} deps
 * @param {object} deps.config - CONFIG.earth
 * @param {object} deps.textureConfig - CONFIG.textures
 * @param {number} deps.earthRadius - earth radius in scene units
 * @param {THREE.WebGLRenderer} deps.renderer - for anisotropy query
 * @param {THREE.Vector3} deps.cameraPosition - live camera position reference
 * @returns {{ object3D: THREE.Mesh, update: (ctx) => void, dispose: () => void }}
 */
export function createEarth({ config, textureConfig, surfaceConfig, earthRadius, renderer, cameraPosition }) {
  const sc = surfaceConfig || {};
  const textureLoader = new THREE.TextureLoader();

  // --- Day texture: tiled progressive loading (16K) with 8K placeholder ---
  const tileConfig = textureConfig.dayTiles;
  const tiledDay = createTiledTexture({
    basePath: tileConfig.basePath,
    cols: tileConfig.cols,
    rows: tileConfig.rows,
    tileWidth: tileConfig.tileWidth,
    tileHeight: tileConfig.tileHeight,
    placeholder: tileConfig.placeholder,
    onProgress: (loaded, total) => {
      console.info(`[Earth] Day texture tile ${loaded}/${total}`);
    },
  });
  const dayTex = tiledDay.texture;

  const nightTex = textureLoader.load(textureConfig.night);
  const normalTex = textureLoader.load(textureConfig.normal);
  // Shared with clouds.js — Three.js TextureLoader caches by URL, so the
  // same GPU texture is reused automatically.
  const cloudTex = textureLoader.load(textureConfig.clouds);

  dayTex.colorSpace = THREE.SRGBColorSpace;
  nightTex.colorSpace = THREE.SRGBColorSpace;
  normalTex.colorSpace = THREE.LinearSRGBColorSpace;
  cloudTex.colorSpace = THREE.LinearSRGBColorSpace;

  const maxAniso = renderer
    ? renderer.capabilities.getMaxAnisotropy()
    : 16;
  dayTex.anisotropy = maxAniso;
  nightTex.anisotropy = maxAniso;
  normalTex.anisotropy = maxAniso;

  const [segW, segH] = config.segments;
  const geometry = new THREE.SphereGeometry(earthRadius, segW, segH);

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      dayTexture: { value: dayTex },
      nightTexture: { value: nightTex },
      normalMap: { value: normalTex },
      cloudTexture: { value: cloudTex },
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
      cameraPos: { value: cameraPosition },  // live reference — updated by camera motion
      ambientDim: { value: config.ambientDim },
      normalStrength: { value: config.normalStrength },
      sunIntensity: { value: 1.0 },
      cloudUVOffset: { value: 0.0 },
      time: { value: 0.0 },
      twilightIntensity: { value: sc.twilightIntensity ?? 0.42 },
      blueHourIntensity: { value: sc.blueHourIntensity ?? 0.16 },
      nightBrightness: { value: sc.nightBrightness ?? 0.53 },
      cityLightBoost: { value: sc.cityLightBoost ?? 0.75 },
    },
  });

  const object3D = new THREE.Mesh(geometry, material);

  return {
    object3D,

    update(ctx) {
      material.uniforms.sunDirection.value.copy(ctx.sunDirection);
      material.uniforms.sunIntensity.value = ctx.sunIntensity;
      material.uniforms.cloudUVOffset.value = ctx.cloudUVOffset;
      material.uniforms.time.value = ctx.time;
    },

    dispose() {
      tiledDay.cancel();
      geometry.dispose();
      material.dispose();
      dayTex.dispose();
      nightTex.dispose();
      normalTex.dispose();
      // cloudTex is NOT disposed here — it shares the same GPU texture
      // with clouds.js via Three.js TextureLoader URL cache.
      // Ownership belongs to clouds.js which disposes it.
    },
  };
}
