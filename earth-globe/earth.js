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
  const heightTex = textureLoader.load(textureConfig.heightmap);

  const specularTex = textureConfig.specular
    ? textureLoader.load(textureConfig.specular)
    : null;

  dayTex.colorSpace = THREE.SRGBColorSpace;
  nightTex.colorSpace = THREE.SRGBColorSpace;
  normalTex.colorSpace = THREE.LinearSRGBColorSpace;
  cloudTex.colorSpace = THREE.LinearSRGBColorSpace;
  heightTex.colorSpace = THREE.LinearSRGBColorSpace;

  const maxAniso = renderer
    ? renderer.capabilities.getMaxAnisotropy()
    : 16;
  dayTex.anisotropy = maxAniso;
  nightTex.anisotropy = maxAniso;
  normalTex.anisotropy = maxAniso;

  if (specularTex) {
    specularTex.colorSpace = THREE.LinearSRGBColorSpace;
    specularTex.anisotropy = maxAniso;
  }

  const [segW, segH] = config.segments;
  const geometry = new THREE.SphereGeometry(earthRadius, segW, segH);

  // --- Regional LOD overlay textures ---
  // Pre-create textures with a small canvas placeholder (NOT a white pixel)
  // This ensures Three.js assigns a unique texture unit for each sampler
  function createRegionalTexPlaceholder() {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 4;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 4, 4);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  const shanghaiDayTex = createRegionalTexPlaceholder();
  const jinshanDayTex = createRegionalTexPlaceholder();

  // UV bounds: vec4(u_min, v_min, u_max, v_max)
  // Three.js SphereGeometry UV: u = (lon+180)/360, v = (90+lat)/180
  //   North pole → UV.y = 1, South pole → UV.y = 0
  // Shanghai WMS BBOX: 119°-123°E, 29°-33°N
  const shanghaiUVBounds = new THREE.Vector4(
    (119 + 180) / 360,   // u_min = 0.83056
    (90 + 29) / 180,     // v_min = 0.66111 (south edge → smaller v)
    (123 + 180) / 360,   // u_max = 0.84167
    (90 + 33) / 180,     // v_max = 0.68333 (north edge → larger v)
  );
  // Jinshan WMS BBOX: 120.8°-121.8°E, 30.4°-31.4°N
  const jinshanUVBounds = new THREE.Vector4(
    (120.8 + 180) / 360, // u_min = 0.83556
    (90 + 30.4) / 180,   // v_min = 0.66889
    (121.8 + 180) / 360, // u_max = 0.83833
    (90 + 31.4) / 180,   // v_max = 0.67444
  );

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
      // Regional LOD overlays
      regionDayTex1: { value: shanghaiDayTex },
      regionDayTex2: { value: jinshanDayTex },
      regionBounds1: { value: shanghaiUVBounds },
      regionBounds2: { value: jinshanUVBounds },
      regionOpacity1: { value: 0.0 },
      regionOpacity2: { value: 0.0 },
      heightMap: { value: heightTex },
      displacementScale: { value: (config.displacementScale ?? 0.01) * earthRadius },
      heightMapSize: { value: new THREE.Vector2(5400, 2700) },
      proceduralBlend: { value: 0.0 },
    },
  });

  const object3D = new THREE.Mesh(geometry, material);

  // --- Async load regional imagery ---
  // Replace placeholder textures with loaded images via TextureLoader.
  // The original in-place canvas resize approach caused WebGL errors
  // (glCopySubTextureCHROMIUM overflow) because GPU texture stayed at 4x4.
  const texLoader = new THREE.TextureLoader();
  function loadRegionalImage(url, uniformKey) {
    texLoader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        // Replace placeholder — do NOT dispose it here, as the GPU
        // texture unit may still be referenced by the shader this frame.
        // The tiny 4x4 placeholder will be GC'd naturally.
        material.uniforms[uniformKey].value = tex;
        console.info(`[Earth] Regional texture loaded: ${url} (${tex.image.width}×${tex.image.height})`);
      },
      undefined,
      () => console.error(`[Earth] Failed to load: ${url}`),
    );
  }

  loadRegionalImage('/textures/regional/shanghai-day.jpg', 'regionDayTex1');
  loadRegionalImage('/textures/regional/jinshan-day.jpg', 'regionDayTex2');
  return {
    object3D,

    /** Access material for external uniform control */
    material,

    /** Shared textures for other components (ocean, etc.) */
    textures: { specular: specularTex, height: heightTex },

    update(ctx) {
      material.uniforms.sunDirection.value.copy(ctx.sunDirection);
      material.uniforms.sunIntensity.value = ctx.sunIntensity;
      material.uniforms.cloudUVOffset.value = ctx.cloudUVOffset;
      material.uniforms.time.value = ctx.time;
    },

    /**
     * Set regional overlay opacity.
     * @param {number} region - 1 (Shanghai) or 2 (Jinshan)
     * @param {number} opacity - 0.0 to 1.0
     */
    setRegionOpacity(region, opacity) {
      const key = region === 1 ? 'regionOpacity1' : 'regionOpacity2';
      material.uniforms[key].value = opacity;
    },

    dispose() {
      tiledDay.cancel();
      geometry.dispose();
      material.dispose();
      dayTex.dispose();
      nightTex.dispose();
      normalTex.dispose();
      heightTex.dispose();
      shanghaiDayTex.dispose();
      jinshanDayTex.dispose();
      // cloudTex is NOT disposed here — it shares the same GPU texture
      // with clouds.js via Three.js TextureLoader URL cache.
      // Ownership belongs to clouds.js which disposes it.
    },
  };
}
