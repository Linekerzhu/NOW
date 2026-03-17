import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
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
renderer.toneMapping = THREE.ACESFilmicToneMapping;
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
sunLight.position.copy(sunDir.clone().multiplyScalar(CONFIG.lighting.sunLightDistance));
scene.add(sunLight);
scene.add(new THREE.AmbientLight(CONFIG.lighting.ambientColor, CONFIG.lighting.ambientIntensity));

// --- Camera ---
const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, innerWidth / innerHeight, 0.1, 1000);
const sunAngle = Math.atan2(sunDir.x, sunDir.z);
const cameraAngle = sunAngle + CONFIG.camera.sunAngleOffset;
const cameraRadius = CONFIG.camera.distance * CONFIG.camera.distanceScale;
camera.position.set(
  Math.sin(cameraAngle) * cameraRadius,
  CONFIG.camera.initialHeight,
  Math.cos(cameraAngle) * cameraRadius,
);
camera.lookAt(0, 0, 0);

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

const clouds     = createClouds({ config: CONFIG.clouds, earthRadius, cameraPosition: camera.position });
const earth      = createEarth({ config: CONFIG.earth, earthRadius, renderer, cameraPosition: camera.position });
const atmosphere = createAtmosphere({ config: CONFIG.atmosphere, earthRadius, cameraPosition: camera.position });
const aurora     = createAurora({ config: CONFIG.aurora, earthRadius, cameraPosition: camera.position });
const stars      = createStars({ config: CONFIG.stars });
const moon       = createMoon({ config: CONFIG.moon, earthRadius });
const sun        = createSun({ config: CONFIG.sun, earthRadius });

// Set initial moon position
moon.setPosition(new Date());

// --- Scene graph composition ---
// earthGroup gets oblate scaling; scene-level objects do not.
earthGroup.add(clouds.object3D);
earthGroup.add(earth.object3D);
earthGroup.add(aurora.object3D);
earthGroup.add(atmosphere.object3D);
scene.add(stars.object3D);
scene.add(moon.object3D);
scene.add(sun.object3D);

// Components in update order (clouds before earth for cloudUVOffset sync)
const components = [clouds, earth, atmosphere, aurora, stars, moon, sun];

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

// --- Camera orbit ---
const cameraOrbit = {
  angle: cameraAngle,
  height: CONFIG.camera.initialHeight,
  radius: cameraRadius,
  speed: CONFIG.camera.orbitSpeed,
  driftTime: 0,
};

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

  // Camera orbit (delta-based for consistent speed across refresh rates)
  cameraOrbit.angle += cameraOrbit.speed * dtNorm;
  cameraOrbit.driftTime += CONFIG.camera.driftSpeed * dtNorm;
  const driftY = Math.sin(cameraOrbit.driftTime) * CONFIG.camera.driftAmplitude;

  camera.position.set(
    Math.sin(cameraOrbit.angle) * cameraOrbit.radius,
    cameraOrbit.height + driftY,
    Math.cos(cameraOrbit.angle) * cameraOrbit.radius,
  );
  camera.lookAt(0, 0, 0);

  // --- Build per-frame context ---
  ctx.time = animationTime;
  ctx.delta = delta;
  ctx.dtNorm = dtNorm;
  ctx.cloudUVOffset = clouds.cloudUVOffset;  // read current value before loop

  // --- Periodic sun/moon direction update ---
  const now = Date.now();
  if (now - lastSunUpdate > CONFIG.animation.sunUpdateInterval) {
    lastSunUpdate = now;
    const newSunData = getSunDirection(new Date());

    // Update shared state
    ctx.sunDirection.copy(newSunData.direction);
    ctx.sunIntensity = newSunData.distanceFactor;

    // Update scene lighting (not managed by components)
    sunLight.position.copy(newSunData.direction.clone().multiplyScalar(CONFIG.lighting.sunLightDistance));
    sunLight.intensity = CONFIG.lighting.sunIntensityFactor * newSunData.distanceFactor;

    // Update moon position
    moon.setPosition(new Date());
  }

  // --- Update all components uniformly ---
  for (const component of components) {
    component.update(ctx);
  }

  // Read cloud offset explicitly (no more ctx mutation inside clouds.update())
  ctx.cloudUVOffset = clouds.cloudUVOffset;

  // Render through post-processing pipeline
  composer.render();
}
animate();

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

  window.removeEventListener('resize', onResize);

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
  import('lil-gui').then(({ GUI }) => {
    const gui = new GUI({ title: '🌍 Earth Globe' });
    _guiInstance = gui;

    const bloomFolder = gui.addFolder('Bloom');
    bloomFolder.add(bloomPass, 'strength', 0, 2, 0.01);
    bloomFolder.add(bloomPass, 'radius', 0, 2, 0.01);
    bloomFolder.add(bloomPass, 'threshold', 0, 1, 0.01);

    const lightFolder = gui.addFolder('Lighting');
    lightFolder.add(sunLight, 'intensity', 0, 5, 0.01).name('sun intensity');
    lightFolder.add(renderer, 'toneMappingExposure', 0.1, 3, 0.01).name('exposure');

    const cloudFolder = gui.addFolder('Clouds');
    const cloudUniforms = clouds.object3D.material.uniforms;
    cloudFolder.add(cloudUniforms.opacity, 'value', 0, 1, 0.01).name('opacity');

    gui.close();  // collapsed by default
  });
}
