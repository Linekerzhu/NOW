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

// Camera animation state (driven by main loop, NOT a separate RAF)
let _cameraAnim = null;
// Bloom fade-in state (runs after camera animation completes)
let _bloomFadeIn = null;

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
  if (_cameraAnim) {
    _cameraAnim.step();
  }

  // OrbitControls handles camera position — just update damping
  controls.update();

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
    _tmpSunLightPos.copy(newSunData.direction).multiplyScalar(CONFIG.lighting.sunLightDistance);
    sunLight.position.copy(_tmpSunLightPos);
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

  // Bloom fade-in after camera transition completes
  if (_bloomFadeIn) {
    _bloomFadeIn.step();
  }

  // Always render through the EffectComposer so OutputPass tone mapping
  // stays consistent. BloomPass is disabled during camera transitions
  // (see animateTo) to prevent black-rectangle artifacts from rapid FOV
  // changes, while keeping the visual appearance nearly identical.
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
  _cameraAnim = null;
  _bloomFadeIn = null;

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
  import('lil-gui').then(({ GUI }) => {
    const gui = new GUI({ title: '🌍 Earth Globe' });
    _guiInstance = gui;

    // ==== Utilities ====

    /** Convert geographic longitude (°E) to scene camera azimuth (atan2(x,z)). */
    function lonToAzimuth(lonDeg) {
      const phi = (lonDeg + 180) * Math.PI / 180;
      return Math.atan2(-Math.cos(phi), Math.sin(phi));
    }

    // ==== Camera state proxy (synced bidirectionally with OrbitControls) ====
    const _initOff = camera.position.clone().sub(controls.target);
    const camState = {
      focalLength: Math.round(camera.getFocalLength()),
      elevation: Math.round(THREE.MathUtils.radToDeg(Math.asin(_initOff.y / _initOff.length())) * 10) / 10,
      distance: Math.round(_initOff.length() * 10) / 10,
      latitudeOffset: controls.target.y,
    };

    // ==== Preset resolution (config → runtime) ====
    const defaultFocalLength = camera.getFocalLength();

    /** Resolve a config preset into the runtime format needed by animateTo. */
    function resolvePreset(p) {
      return {
        get azimuth() {
          if (p.longitude === null) {
            // Follow sun position
            const sd = getSunDirection(new Date());
            return Math.atan2(sd.direction.x, sd.direction.z) + CONFIG.camera.sunAngleOffset;
          }
          return lonToAzimuth(p.longitude);
        },
        elevation: p.elevation,
        distance: p.distance,
        focalLength: p.focalLength ?? defaultFocalLength,
        latitudeOffset: p.latitudeOffset,
        autoRotate: p.autoRotate,
        autoRotateSpeed: p.autoRotateSpeed,
      };
    }

    const PRESETS = {
      oneWorld:  resolvePreset(CONFIG.presets.oneWorld),
      chinaGrid: resolvePreset(CONFIG.presets.chinaGrid),
      shanghai:  resolvePreset(CONFIG.presets.shanghai),
    };

    // ==== Smooth camera transition ====
    // Animation state is stored in _cameraAnim and driven by the main
    // animate() loop — NO separate RAF loop — eliminating the race
    // condition that caused black-square flashes.

    function animateTo(preset, duration = CONFIG.presets.animationDuration) {
      const t0 = performance.now();

      // Capture start state
      const off0 = camera.position.clone().sub(controls.target);
      const r0   = off0.length();
      const az0  = Math.atan2(off0.x, off0.z);
      const el0  = Math.asin(off0.y / r0);
      const fl0  = camera.getFocalLength();
      const ty0  = controls.target.y;

      // Target state
      const r1  = preset.distance;
      const el1 = THREE.MathUtils.degToRad(preset.elevation);
      const fl1 = preset.focalLength;
      const ty1 = preset.latitudeOffset;

      // Shortest azimuth path (wrap around ±π)
      let az1 = preset.azimuth;     // getter runs here for oneWorld
      let dAz = az1 - az0;
      if (dAz > Math.PI) dAz -= 2 * Math.PI;
      if (dAz < -Math.PI) dAz += 2 * Math.PI;
      az1 = az0 + dAz;

      // Pause auto-rotate during animation
      controls.autoRotate = false;

      // Completely disable the bloom pass during camera transitions.
      // This prevents the black-rectangle artifact caused by the bloom
      // pass's internal render target processing during rapid FOV changes.
      // OutputPass still runs → tone mapping remains consistent.
      const savedBloomEnabled = bloomPass.enabled;
      const savedBloomStrength = bloomPass.strength;
      bloomPass.enabled = false;

      // Store animation state — main loop drives it
      _cameraAnim = {
        step() {
          const elapsed = performance.now() - t0;
          const raw = Math.min(elapsed / duration, 1);
          // Cubic ease-in-out
          const e = raw < 0.5
            ? 4 * raw * raw * raw
            : 1 - Math.pow(-2 * raw + 2, 3) / 2;

          const r  = THREE.MathUtils.lerp(r0, r1, e);
          const az = THREE.MathUtils.lerp(az0, az1, e);
          const el = THREE.MathUtils.lerp(el0, el1, e);
          const fl = THREE.MathUtils.lerp(fl0, fl1, e);
          const ty = THREE.MathUtils.lerp(ty0, ty1, e);

          controls.target.set(0, ty, 0);
          camera.position.set(
            r * Math.cos(el) * Math.sin(az),
            ty + r * Math.sin(el),
            r * Math.cos(el) * Math.cos(az),
          );
          camera.setFocalLength(fl);
          camera.updateProjectionMatrix();

          // Sync GUI sliders
          camState.distance       = Math.round(r * 10) / 10;
          camState.elevation      = Math.round(THREE.MathUtils.radToDeg(el) * 10) / 10;
          camState.latitudeOffset = Math.round(ty * 10) / 10;
          camState.focalLength    = Math.round(fl);

          if (raw >= 1) {
            _cameraAnim = null;

            // Re-enable bloom and ramp strength from 0 → saved over 200ms.
            // At close-up zoom levels (Shanghai 200mm) bloom contribution
            // is minimal, so this fast fade is nearly imperceptible.
            bloomPass.enabled = savedBloomEnabled;
            bloomPass.strength = 0;
            const fadeStart = performance.now();
            const fadeDuration = 200;
            _bloomFadeIn = {
              step() {
                const p = Math.min((performance.now() - fadeStart) / fadeDuration, 1);
                bloomPass.strength = savedBloomStrength * p * p; // ease-in quad
                if (p >= 1) {
                  bloomPass.strength = savedBloomStrength;
                  _bloomFadeIn = null;
                }
              },
            };

            controls.autoRotate     = preset.autoRotate;
            controls.autoRotateSpeed = preset.autoRotateSpeed;
          }
        },
      };
    }

    const presetFolder = gui.addFolder('📍 Presets');
    const pCfg = CONFIG.presets;
    const presetActions = {
      [pCfg.oneWorld.label]:  () => animateTo(PRESETS.oneWorld),
      [pCfg.chinaGrid.label]: () => animateTo(PRESETS.chinaGrid),
      [pCfg.shanghai.label]:  () => animateTo(PRESETS.shanghai),
    };
    presetFolder.add(presetActions, pCfg.oneWorld.label);
    presetFolder.add(presetActions, pCfg.chinaGrid.label);
    presetFolder.add(presetActions, pCfg.shanghai.label);

    // ==== Camera (advanced) ====
    const cameraFolder = gui.addFolder('Camera');
    cameraFolder.add(controls, 'autoRotate').name('auto rotate');
    cameraFolder.add(controls, 'autoRotateSpeed', 0, 3, 0.1).name('rotate speed');

    cameraFolder.add(camState, 'focalLength', 10, 200, 1).name('focal length (mm)')
      .onChange(val => {
        camera.setFocalLength(val);
        camera.updateProjectionMatrix();
      }).listen();

    cameraFolder.add(camState, 'elevation', -89, 89, 0.5).name('elevation (°)')
      .onChange(val => {
        const offset = camera.position.clone().sub(controls.target);
        const r = offset.length();
        const azimuth = Math.atan2(offset.x, offset.z);
        const elRad = THREE.MathUtils.degToRad(val);
        camera.position.set(
          controls.target.x + r * Math.cos(elRad) * Math.sin(azimuth),
          controls.target.y + r * Math.sin(elRad),
          controls.target.z + r * Math.cos(elRad) * Math.cos(azimuth),
        );
        controls.update();
      }).listen();

    cameraFolder.add(camState, 'distance', CONFIG.earth.radius * 1.2, CONFIG.earth.radius * 10, 0.1)
      .name('distance')
      .onChange(val => {
        const offset = camera.position.clone().sub(controls.target).normalize();
        camera.position.copy(controls.target).addScaledVector(offset, val);
        controls.update();
      }).listen();

    cameraFolder.add(camState, 'latitudeOffset', -15, 15, 0.1).name('latitude offset')
      .onChange(val => {
        controls.target.y = val;
        controls.update();
      }).listen();

    // Sync GUI from mouse-driven OrbitControls interactions
    // Skip during camera animation (step() already syncs GUI)
    controls.addEventListener('change', () => {
      if (_cameraAnim) return;
      _tmpCtrlOffset.copy(camera.position).sub(controls.target);
      const r = _tmpCtrlOffset.length();
      camState.distance       = Math.round(r * 10) / 10;
      camState.elevation      = Math.round(THREE.MathUtils.radToDeg(Math.asin(_tmpCtrlOffset.y / r)) * 10) / 10;
      camState.latitudeOffset = Math.round(controls.target.y * 10) / 10;
      camState.focalLength    = Math.round(camera.getFocalLength());
    });

    // Dev monitoring: log GPU resource usage periodically
    window.setInterval(() => {
      const info = renderer.info;
      console.info(
        `[GPU] Draw calls: ${info.render.calls}, Triangles: ${info.render.triangles}, Textures: ${info.memory.textures}, Geometries: ${info.memory.geometries}`,
      );
    }, 10000);

    // ==== Bloom ====
    const bloomFolder = gui.addFolder('Bloom');
    bloomFolder.add(bloomPass, 'strength', 0, 2, 0.01);
    bloomFolder.add(bloomPass, 'radius', 0, 2, 0.01);
    bloomFolder.add(bloomPass, 'threshold', 0, 1, 0.01);

    // ==== Lighting ====
    const lightFolder = gui.addFolder('Lighting');
    lightFolder.add(sunLight, 'intensity', 0, 5, 0.01).name('sun intensity');
    lightFolder.add(renderer, 'toneMappingExposure', 0.1, 3, 0.01).name('exposure');

    // ==== Earth Surface ====
    const earthUniforms = earth.object3D.material.uniforms;
    const earthFolder = gui.addFolder('Earth Surface');
    earthFolder.add(earthUniforms.twilightIntensity, 'value', 0, 3, 0.01).name('twilight warmth');
    earthFolder.add(earthUniforms.blueHourIntensity, 'value', 0, 3, 0.01).name('blue hour');
    earthFolder.add(earthUniforms.nightBrightness, 'value', 0, 3, 0.01).name('night brightness');
    earthFolder.add(earthUniforms.cityLightBoost, 'value', 0, 3, 0.01).name('city lights');
    earthFolder.add(earthUniforms.ambientDim, 'value', 0, 0.5, 0.01).name('day dimming');
    earthFolder.add(earthUniforms.normalStrength, 'value', 0, 10, 0.1).name('normal strength');

    // ==== Clouds ====
    const cloudUniforms = clouds.object3D.material.uniforms;
    const cloudFolder = gui.addFolder('Clouds');
    cloudFolder.add(cloudUniforms.opacity, 'value', 0, 1, 0.01).name('day opacity');
    cloudFolder.add(cloudUniforms.nightCloudOpacity, 'value', 0, 1, 0.01).name('night opacity');
  });
}
