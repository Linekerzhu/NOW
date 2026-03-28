import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CONFIG } from './config.js';
import { createEarth } from './earth.js';
import { createAtmosphere } from './atmosphere.js';
import { createClouds } from './clouds.js';
import { createStars } from './stars.js';
import { createAurora } from './aurora.js';
import { createMoon } from './moon.js';
import { getSunDirection } from './sun.js';
import { createSun } from './sunVisual.js';
import { showLoading, hideLoading, setProgress, showWebGLError } from './loading.js';
import { buildGrid, fetchCloudCover } from './weatherService.js';
import { generateCloudTexture } from './weatherCloudTexture.js';
import { createOverlayContainer } from './overlay.js';
import { initHUD, setupLevelButtons } from './hud.js';
import { loadNewsData } from './data.js';
import { initLevelLoop, startDisplayLoop } from './levelLoop.js';
import { LEVEL_ORBITS } from './camera.js';
import { createOcean } from './ocean.js';

// ============================================================================
//  [Improvement #5] WebGL compatibility detection
// ============================================================================
function isWebGLAvailable() {
  if (!window.WebGLRenderingContext) return false;
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

if (!isWebGLAvailable()) {
  showWebGLError();
  throw new Error('WebGL not supported');
}

// Show loading overlay
showLoading();

// --- Renderer ---
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (e) {
  showWebGLError();
  throw e;
}
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = CONFIG.renderer.toneMappingExposure;
document.body.appendChild(renderer.domElement);

// --- Scene ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// --- Sun computation ---
const sunData = getSunDirection(new Date());
const sunDir = sunData.direction.clone();

// --- Lighting ---
const sunLight = new THREE.DirectionalLight(
  CONFIG.lighting.sunColor,
  CONFIG.lighting.sunIntensityFactor * sunData.distanceFactor,
);
sunLight.position.copy(sunDir).multiplyScalar(CONFIG.lighting.sunLightDistance);
scene.add(sunLight);
scene.add(new THREE.AmbientLight(CONFIG.lighting.ambientColor, CONFIG.lighting.ambientIntensity));

// --- Camera ---
const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, innerWidth / innerHeight, 0.1, 2000);
const sunAngle = Math.atan2(sunDir.x, sunDir.z);
const cameraAngle = sunAngle + CONFIG.camera.sunAngleOffset;
const cameraRadius = CONFIG.camera.distance * CONFIG.camera.distanceScale;
camera.position.set(
  Math.sin(cameraAngle) * cameraRadius,
  CONFIG.camera.initialHeight,
  Math.cos(cameraAngle) * cameraRadius,
);
camera.lookAt(0, 0, 0);

// --- Interactive Camera Controls (OrbitControls) ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = false;            // keep globe centered
controls.minDistance = CONFIG.earth.radius * 1.2;
controls.maxDistance = CONFIG.earth.radius * 10;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.3;
controls.zoomSpeed = 0.8;
controls.rotateSpeed = 0.5;
controls.maxPolarAngle = Math.PI;      // allow full vertical rotation

// --- Post-processing: Bloom ---
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  CONFIG.bloom.strength,
  CONFIG.bloom.radius,
  CONFIG.bloom.threshold,
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// --- Earth group (oblate) ---
const earthGroup = new THREE.Group();
earthGroup.scale.set(1.0, CONFIG.earth.oblateness, 1.0);
scene.add(earthGroup);

// ---------------------------------------------------------------------------
//  Create components using unified protocol: { object3D, update(ctx), dispose() }
//  Update order matters: clouds must run before earth (sets ctx.cloudUVOffset).
// ---------------------------------------------------------------------------
const earthRadius = CONFIG.earth.radius;

const clouds     = createClouds({ config: CONFIG.clouds, textureConfig: CONFIG.textures, earthRadius, cameraPosition: camera.position });
const earth      = createEarth({ config: CONFIG.earth, textureConfig: CONFIG.textures, surfaceConfig: CONFIG.earthSurface, earthRadius, renderer, cameraPosition: camera.position });
const atmosphere = createAtmosphere({ config: CONFIG.atmosphere, earthRadius, cameraPosition: camera.position });
const aurora     = createAurora({ config: CONFIG.aurora, earthRadius, cameraPosition: camera.position });
const stars      = createStars({ config: CONFIG.stars });
const moon       = createMoon({ config: CONFIG.moon, earthRadius, cameraPosition: camera.position });
const sun        = createSun({ config: CONFIG.sun, earthRadius });

const ocean = createOcean({
  config: CONFIG.ocean,
  earthRadius,
  cameraPosition: camera.position,
  specularTex: earth.textures.specular,
  heightTex: earth.textures.height,
});

// Set initial moon position
moon.setPosition(new Date());

// --- Scene graph composition ---
// earthGroup gets oblate scaling; scene-level objects do not.
earthGroup.add(clouds.object3D);
earthGroup.add(earth.object3D);
earthGroup.add(ocean.object3D);
earthGroup.add(aurora.object3D);
earthGroup.add(atmosphere.object3D);
scene.add(stars.object3D);
scene.add(moon.object3D);
scene.add(sun.object3D);

// Components in update order (clouds before earth for cloudUVOffset sync)
const components = [clouds, earth, ocean, atmosphere, aurora, stars, moon, sun];


// --- Weather system ---
const weatherGrid = buildGrid(CONFIG.weather.gridResolution);
let lastWeatherUpdate = 0; // force immediate first fetch
let weatherTexture = null; // reusable CanvasTexture
const weatherState = {
  enabled: CONFIG.weather.enabled,
  blurRadius: CONFIG.weather.blurRadius,
  contrast: CONFIG.weather.contrast,
  noiseStrength: CONFIG.weather.noiseStrength,
  noiseScale: CONFIG.weather.noiseScale,
  lastFetchTime: null,
  status: 'idle', // 'idle' | 'fetching' | 'ok' | 'error'
};

async function refreshWeather() {
  if (!weatherState.enabled) return;
  weatherState.status = 'fetching';
  const data = await fetchCloudCover(weatherGrid);
  if (!data) {
    weatherState.status = 'error';
    return;
  }
  weatherTexture = generateCloudTexture(
    data,
    {
      width: CONFIG.weather.textureWidth,
      height: CONFIG.weather.textureHeight,
      blurRadius: weatherState.blurRadius,
      contrast: weatherState.contrast,
      noiseStrength: weatherState.noiseStrength,
      noiseScale: weatherState.noiseScale,
    },
    weatherTexture,
  );
  clouds.setCloudTexture(weatherTexture);
  weatherState.lastFetchTime = new Date();
  weatherState.status = 'ok';
  console.info('[Weather] Cloud texture updated from Open-Meteo data');
}

// Kick off initial weather fetch (non-blocking)
if (CONFIG.weather.enabled) {
  refreshWeather();
}

// --- Loading manager hooks (uses extracted loading.js) ---
THREE.DefaultLoadingManager.onError = (url) => {
  console.warn('Failed to load:', url);
};

THREE.DefaultLoadingManager.onProgress = (_url, itemsLoaded, itemsTotal) => {
  setProgress((itemsLoaded / itemsTotal) * 100);
};

THREE.DefaultLoadingManager.onLoad = () => {
  hideLoading();
};

// Fallback: remove loading overlay even if textures fail
setTimeout(() => hideLoading(), CONFIG.loading.fallbackTimeout);

// --- Timers ---
let lastSunUpdate = Date.now();
const clock = new THREE.Clock();
let animationTime = 0;

// Pre-allocated temp vector for sun light position (avoids per-update clone)
const _tmpSunLightPos = new THREE.Vector3();
// Pre-allocated temp vector for controls.change calculations
const _tmpCtrlOffset = new THREE.Vector3();

// --- Per-frame context (reused object to avoid GC) ---
const ctx = {
  sunDirection: sunDir,
  sunIntensity: sunData.distanceFactor,
  camera,
  time: 0,
  delta: 0,
  dtNorm: 0,
  cloudUVOffset: 0,
};

// ============================================================================
//  [Improvement #4] Scene lifecycle: pause / resume / destroy
// ============================================================================
let animationFrameId = null;
let paused = false;

// Shared mutable animation state — gui.js writes, animate() reads.
// Using a single object avoids the need for gui.js to import main.js state.
const animState = { _cameraAnim: null, _bloomFadeIn: null };

function animate() {
  animationFrameId = requestAnimationFrame(animate);

  if (paused) return;

  let delta = clock.getDelta();

  // [Improvement #1] Delta clamp — prevents scene "jump" after returning
  // from a background tab (rAF pauses, getDelta() returns seconds of absence)
  if (delta > 0.1) delta = 1 / 60;

  animationTime = (animationTime + delta) % CONFIG.animation.timeModulo;

  // Frame-rate compensation: normalize delta to 60fps equivalent
  const dtNorm = delta * 60;

  // --- Camera animation (preset transitions) runs BEFORE controls.update ---
  // This guarantees camera position + projection matrix are consistent
  // when render occurs. No more dual-RAF race condition.
  if (animState._cameraAnim) {
    animState._cameraAnim.step();
  }

  // OrbitControls handles camera position — just update damping
  controls.update();

  // --- Build per-frame context ---
  ctx.time = animationTime;
  ctx.delta = delta;
  ctx.dtNorm = dtNorm;
  ctx.cloudUVOffset = clouds.cloudUVOffset;  // read current value before loop

    // --- Distance-adaptive terrain exaggeration ---
    // Capped at 2.5x for 512-segment geometry to prevent triangle flicker.
    // Phase 4 LOD (1024+ segments) will raise this to 10-15x.
    const camDist = camera.position.length();
    const distRatio = camDist / earthRadius;
    const exaggeration = THREE.MathUtils.lerp(1.0, 2.5,
      THREE.MathUtils.smoothstep(distRatio, 1.25, 1.55));
    const dispScale = exaggeration * earthRadius * 0.001389;
    earth.material.uniforms.displacementScale.value = dispScale;
    // Ocean surface tracks sea level: slightly above displaced sea floor
    const seaLevelScale = 1.0 + (CONFIG.ocean.seaLevel + 0.01) * dispScale / earthRadius;
    ocean.object3D.scale.setScalar(seaLevelScale);
    // Procedural biome blend: disabled by default (satellite textures sufficient).
    // Enable via GUI "procedural blend" slider if needed for stylized look.
    // earth.material.uniforms.proceduralBlend.value = 0.0;

  // --- Periodic sun/moon direction update ---
  const now = Date.now();
  if (now - lastSunUpdate > CONFIG.animation.sunUpdateInterval) {
    lastSunUpdate = now;
    const newSunData = getSunDirection(new Date());

    // Update shared state
    ctx.sunDirection.copy(newSunData.direction);
    ctx.sunIntensity = newSunData.distanceFactor;

    // Update scene lighting (not managed by components)
    _tmpSunLightPos.copy(newSunData.direction).multiplyScalar(CONFIG.lighting.sunLightDistance);
    sunLight.position.copy(_tmpSunLightPos);
    sunLight.intensity = CONFIG.lighting.sunIntensityFactor * newSunData.distanceFactor;

    // Update moon position
    moon.setPosition(new Date());
  }

  // --- Periodic weather refresh ---
  if (weatherState.enabled && now - lastWeatherUpdate > CONFIG.weather.refreshInterval) {
    lastWeatherUpdate = now;
    refreshWeather();
  }

  // --- Update all components uniformly ---
  for (const component of components) {
    component.update(ctx);
  }

  // Read cloud offset explicitly (no more ctx mutation inside clouds.update())
  ctx.cloudUVOffset = clouds.cloudUVOffset;

  // Bloom fade-in after camera transition completes
  if (animState._bloomFadeIn) {
    animState._bloomFadeIn.step();
  }

  composer.render();
}
animate();

// ============================================================================
//  M3: Level loop + HUD + data loading
// ============================================================================
createOverlayContainer();

// Kiosk mode detection
if (new URLSearchParams(location.search).has('kiosk')) {
  document.body.classList.add('kiosk');
}

// Initialize HUD
initHUD();

// Setup level buttons (dispatch CustomEvent for levelLoop to handle)
setupLevelButtons(LEVEL_ORBITS, (level) => {
  window.dispatchEvent(new CustomEvent('level-switch', { detail: { level } }));
});

// Load data and boundaries, then start the display loop
(async () => {
  const [newsData] = await Promise.all([
    loadNewsData(),
    initLevelLoop(earthGroup, earth),
  ]);

  console.info('[M3] Data loaded:', {
    L1: newsData.L1?.length || 0,
    L2: newsData.L2?.length || 0,
    L3: newsData.L3?.length || 0,
  });

  startDisplayLoop(newsData, camera, controls, bloomPass, animState, earthGroup, renderer.domElement);
})();

// ============================================================================
//  [Improvement #3] Resize debounce — coalesces rapid resize events
// ============================================================================
let resizeTimeout = null;
function handleResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.resolution.set(window.innerWidth, window.innerHeight);
}
const onResize = () => {
  if (resizeTimeout) cancelAnimationFrame(resizeTimeout);
  resizeTimeout = requestAnimationFrame(handleResize);
};
window.addEventListener('resize', onResize);

// ============================================================================
//  [Improvement #4 cont.] Exported lifecycle API
// ============================================================================

/** Pause the animation loop (rendering stops, rAF continues to allow resume). */
export function pause() {
  paused = true;
  clock.stop();
}

/** Resume the animation loop after a pause. */
export function resume() {
  if (!paused) return;
  paused = false;
  clock.start();
  // getDelta() after start() returns time since stop — clamp will handle it
}

/** Fully destroy the scene: cancel rAF, dispose all GPU resources. */
export function destroy() {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  animationFrameId = null;
  animState._cameraAnim = null;
  animState._bloomFadeIn = null;

  window.removeEventListener('resize', onResize);
  controls.dispose();

  for (const component of components) {
    component.dispose();
  }

  renderer.dispose();
  composer.dispose();
  renderer.domElement.remove();

  // Clean up dev GUI if present
  if (_guiInstance) { _guiInstance.destroy(); _guiInstance = null; }
}

// ============================================================================
//  lil-gui live tuning panel (dev mode only)
// ============================================================================
let _guiInstance = null;
if (import.meta.env.DEV) {
  import('./gui.js').then(({ initDevGUI }) => {
    initDevGUI({
      camera,
      controls,
      bloomPass,
      sunLight,
      renderer,
      earth,
      clouds,
      animState,
      _tmpCtrlOffset,
      weatherState,
      refreshWeather,
    }).then(gui => { _guiInstance = gui; });
  });
}
