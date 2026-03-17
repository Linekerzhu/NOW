/**
 * camera.js — Camera controller: orbit, GSAP level transitions, idle drift, L1 follow
 */

import * as THREE from 'three';
import gsap from 'gsap';
import { EARTH_RADIUS } from './earth.js';
import { geoToSphere } from './geo.js';

// ---------------------------------------------------------------------------
// Level configurations
// ---------------------------------------------------------------------------
const LEVEL_CONFIG = {
  L1: {
    name: '此刻国网',
    codeName: 'SGCC_NOW',
    distance: 28,
    // High orbit: see all of China
    target: { lat: 35, lon: 105 },
    driftSpeed: 0.002,  // degrees per second
  },
  L2: {
    name: '此刻上海电力',
    codeName: 'SH_POWER_NOW',
    distance: 16,
    // Mid orbit: see Shanghai
    target: { lat: 31.2, lon: 121.5 },
    driftSpeed: 0,
  },
  L3: {
    name: '此刻金山',
    codeName: 'JS_NOW',
    distance: 13,
    // Low orbit: see Jinshan
    target: { lat: 30.7, lon: 121.3 },
    driftSpeed: 0,
  },
};

export { LEVEL_CONFIG };

// ---------------------------------------------------------------------------
// Camera controller
// ---------------------------------------------------------------------------
export function createCameraController(camera) {
  let currentLevel = 'L1';
  let orbitAngle = 0;  // radians, horizontal orbit offset
  let transitioning = false;

  // Internal spherical coords (relative to earth center)
  const state = {
    distance: LEVEL_CONFIG.L1.distance,
    lat: LEVEL_CONFIG.L1.target.lat,
    lon: LEVEL_CONFIG.L1.target.lon,
  };

  function applyState() {
    const pos = geoToSphere(state.lat, state.lon + orbitAngle * (180 / Math.PI), state.distance);
    camera.position.copy(pos);
    camera.lookAt(0, 0, 0);
  }

  // Initial position
  applyState();

  /**
   * Update per frame. Called from render loop.
   * @param {number} delta - seconds since last frame
   * @param {object|null} activeInfo - currently displayed info item (for L1 follow)
   */
  function update(delta, activeInfo) {
    if (transitioning) return;

    const config = LEVEL_CONFIG[currentLevel];

    // Idle drift for L1
    if (config.driftSpeed > 0) {
      orbitAngle += config.driftSpeed * delta * (Math.PI / 180);
    }

    // L1 follow: subtly shift toward active info
    if (currentLevel === 'L1' && activeInfo && activeInfo.latitude != null) {
      const targetLon = activeInfo.longitude;
      const diff = targetLon - (state.lon + orbitAngle * (180 / Math.PI));
      // Subtle follow: shift up to 5 degrees toward info
      const shift = Math.max(-5, Math.min(5, diff * 0.02));
      orbitAngle += shift * delta * (Math.PI / 180);
    }

    applyState();
  }

  /**
   * Transition to a new level with GSAP animation.
   * @param {string} level - 'L1', 'L2', 'L3'
   * @param {function} onStart - called when camera starts moving
   * @param {function} onComplete - called when camera arrives
   * @returns {gsap.core.Tween}
   */
  function transitionTo(level, onStart, onComplete) {
    if (level === currentLevel || transitioning) return null;

    const target = LEVEL_CONFIG[level];
    transitioning = true;
    currentLevel = level;
    orbitAngle = 0;

    if (onStart) onStart();

    const tween = gsap.to(state, {
      distance: target.distance,
      lat: target.target.lat,
      lon: target.target.lon,
      duration: 3.5,
      ease: 'power2.inOut',
      onUpdate: () => applyState(),
      onComplete: () => {
        transitioning = false;
        if (onComplete) onComplete();
      },
    });

    return tween;
  }

  function getCurrentLevel() {
    return currentLevel;
  }

  function isTransitioning() {
    return transitioning;
  }

  return {
    update,
    transitionTo,
    getCurrentLevel,
    isTransitioning,
    applyState,
    LEVEL_CONFIG,
  };
}
