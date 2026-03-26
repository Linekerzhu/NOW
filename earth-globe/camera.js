/**
 * camera.js — 三级轨道摄像机控制
 *
 * 提取自 gui.js 的 animateTo 逻辑，用于 M3 层级切换飞行。
 * 使用球坐标系 (distance, azimuth, elevation) 控制摄像机位置。
 */

import * as THREE from 'three';

// =========================================================================
//  Level orbit configurations
// =========================================================================

/** Convert geographic longitude (°E) to scene camera azimuth. */
function lonToAzimuth(lonDeg) {
  const phi = (lonDeg + 180) * Math.PI / 180;
  return Math.atan2(-Math.cos(phi), Math.sin(phi));
}

/**
 * 三级轨道参数
 * 复用 config.js 已校准的 presets 参数风格。
 */
export const LEVEL_ORBITS = {
  L1: {
    longitude: 105,
    elevation: -23.4,
    distance: 14.8,
    focalLength: 37,
    latitudeOffset: 8.5,
    autoRotate: false,
    autoRotateSpeed: 0.3,
    label: '此刻国网',
    labelEn: 'SGCC_NOW',
    showBoundaries: null,
  },
  L2: {
    longitude: 121.5,
    elevation: 46.7,
    distance: 14.3,
    focalLength: 200,
    latitudeOffset: -3.9,
    autoRotate: false,
    autoRotateSpeed: 0.3,
    label: '此刻上海电力',
    labelEn: 'SGCC_SH_NOW',
    showBoundaries: 'shanghai',
  },
  L3: {
    longitude: 121.34,
    elevation: 50,
    distance: 12.5,
    focalLength: 250,
    latitudeOffset: -4.5,
    autoRotate: false,
    autoRotateSpeed: 0.1,
    label: '此刻金山',
    labelEn: 'JINSHAN_NOW',
    showBoundaries: 'jinshan',
  },
};

// =========================================================================
//  Camera fly animation (extracted from gui.js animateTo)
// =========================================================================

/**
 * 飞行到指定层级轨道。
 *
 * 使用球坐标插值 + OrbitControls 同步，与 gui.js animateTo 相同逻辑。
 * 飞行期间暂停 autoRotate 和 bloom pass，完成后恢复。
 *
 * @param {string} level - 'L1' | 'L2' | 'L3'
 * @param {THREE.PerspectiveCamera} camera
 * @param {import('three/examples/jsm/controls/OrbitControls.js').OrbitControls} controls
 * @param {import('three/examples/jsm/postprocessing/UnrealBloomPass.js').UnrealBloomPass} bloomPass
 * @param {{ _cameraAnim: object|null, _bloomFadeIn: object|null }} animState
 * @param {number} [duration=3000] - 飞行时长 (ms)
 * @returns {Promise<void>}
 */
export function flyToLevel(level, camera, controls, bloomPass, animState, duration = 3000) {
  const orbit = LEVEL_ORBITS[level];
  if (!orbit) return Promise.resolve();

  return new Promise((resolve) => {
    const t0 = performance.now();

    // ---- Capture start state ----
    const off0 = camera.position.clone().sub(controls.target);
    const r0   = off0.length();
    const az0  = Math.atan2(off0.x, off0.z);
    const el0  = Math.asin(off0.y / r0);
    const fl0  = camera.getFocalLength();
    const ty0  = controls.target.y;

    // ---- Target state ----
    const r1  = orbit.distance;
    const el1 = THREE.MathUtils.degToRad(orbit.elevation);
    const fl1 = orbit.focalLength;
    const ty1 = orbit.latitudeOffset;

    // Shortest azimuth path (wrap around ±π)
    let az1 = lonToAzimuth(orbit.longitude);
    let dAz = az1 - az0;
    if (dAz > Math.PI) dAz -= 2 * Math.PI;
    if (dAz < -Math.PI) dAz += 2 * Math.PI;
    az1 = az0 + dAz;

    // ---- Pause auto-rotate & bloom during flight ----
    controls.autoRotate = false;
    const savedBloomEnabled = bloomPass.enabled;
    const savedBloomStrength = bloomPass.strength;
    bloomPass.enabled = false;

    // ---- Register animation step in animState (driven by main RAF) ----
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

        if (raw >= 1) {
          animState._cameraAnim = null;

          // Re-enable bloom with fade-in
          bloomPass.enabled = savedBloomEnabled;
          bloomPass.strength = 0;
          const fadeStart = performance.now();
          const fadeDuration = 200;
          animState._bloomFadeIn = {
            step() {
              const p = Math.min((performance.now() - fadeStart) / fadeDuration, 1);
              bloomPass.strength = savedBloomStrength * p * p;
              if (p >= 1) {
                bloomPass.strength = savedBloomStrength;
                animState._bloomFadeIn = null;
              }
            },
          };

          controls.autoRotate = orbit.autoRotate;
          controls.autoRotateSpeed = orbit.autoRotateSpeed;

          resolve();
        }
      },
    };
  });
}
