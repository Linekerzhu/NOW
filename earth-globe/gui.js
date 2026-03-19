import * as THREE from 'three';
import { CONFIG } from './config.js';
import { getSunDirection } from './sun.js';

/**
 * Dev-only GUI panel for real-time parameter tuning.
 *
 * Dynamically imports lil-gui so it's tree-shaken in production builds.
 * All preset transitions, camera controls, and material tuning live here,
 * keeping main.js focused on scene setup and the render loop.
 *
 * @param {object} deps - Scene objects the GUI needs to control
 * @param {THREE.PerspectiveCamera} deps.camera
 * @param {import('three/examples/jsm/controls/OrbitControls.js').OrbitControls} deps.controls
 * @param {import('three/examples/jsm/postprocessing/UnrealBloomPass.js').UnrealBloomPass} deps.bloomPass
 * @param {THREE.DirectionalLight} deps.sunLight
 * @param {THREE.WebGLRenderer} deps.renderer
 * @param {import('./earth.js').default} deps.earth
 * @param {import('./clouds.js').default} deps.clouds
 * @param {{ _cameraAnim: object|null, _bloomFadeIn: object|null }} deps.animState - Mutable animation state
 * @param {THREE.Vector3} deps._tmpCtrlOffset - Pre-allocated temp vector for controls sync
 * @returns {Promise<import('lil-gui').GUI>}
 */
export async function initDevGUI({
  camera,
  controls,
  bloomPass,
  sunLight,
  renderer,
  earth,
  clouds,
  animState,
  _tmpCtrlOffset,
}) {
  const { GUI } = await import('lil-gui');
  const gui = new GUI({ title: '🌍 Earth Globe' });

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
  // Animation state is stored in animState._cameraAnim and driven by the main
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
    animState._cameraAnim = {
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
          animState._cameraAnim = null;

          // Re-enable bloom and ramp strength from 0 → saved over 200ms.
          // At close-up zoom levels (Shanghai 200mm) bloom contribution
          // is minimal, so this fast fade is nearly imperceptible.
          bloomPass.enabled = savedBloomEnabled;
          bloomPass.strength = 0;
          const fadeStart = performance.now();
          const fadeDuration = 200;
          animState._bloomFadeIn = {
            step() {
              const p = Math.min((performance.now() - fadeStart) / fadeDuration, 1);
              bloomPass.strength = savedBloomStrength * p * p; // ease-in quad
              if (p >= 1) {
                bloomPass.strength = savedBloomStrength;
                animState._bloomFadeIn = null;
              }
            },
          };

          controls.autoRotate     = preset.autoRotate;
          controls.autoRotateSpeed = preset.autoRotateSpeed;
        }
      },
    };
  }

  // ==== Presets folder ====
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
    if (animState._cameraAnim) return;
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
  earthFolder.add(earthUniforms.displacementScale, 'value', 0, 5, 0.01).name('displacement scale');

  // ==== Clouds ====
  const cloudUniforms = clouds.object3D.material.uniforms;
  const cloudFolder = gui.addFolder('Clouds');
  cloudFolder.add(cloudUniforms.opacity, 'value', 0, 1, 0.01).name('day opacity');
  cloudFolder.add(cloudUniforms.nightCloudOpacity, 'value', 0, 1, 0.01).name('night opacity');

  return gui;
}
