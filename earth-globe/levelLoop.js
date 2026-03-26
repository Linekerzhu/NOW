/**
 * levelLoop.js — 完整展示循环编排
 *
 * 串联层级切换、摄像机飞行、边界线显示/隐藏、逐条信息展示为无限循环。
 */

import gsap from 'gsap';
import { flyToLevel, LEVEL_ORBITS } from './camera.js';
import { showNewsSequence } from './cardLifecycle.js';
import { loadBoundaries, showBoundaries, hideBoundaries } from './boundaries.js';
import { updateHUDLevel } from './hud.js';

const LEVEL_ORDER = ['L1', 'L2', 'L3'];

// Pre-loaded boundary line objects
const boundaryLines = {
  shanghai: null,
  jinshan: null,
};

// Abort controller for interrupting current level
let abortController = null;

// Earth object for regional texture control
let earthObj = null;

// Regional overlay config per level
const LEVEL_REGIONS = {
  L1: { r1: 0, r2: 0 },      // no overlays
  L2: { r1: 1, r2: 0 },      // Shanghai overlay only
  L3: { r1: 1, r2: 1 },      // Shanghai + Jinshan overlays
};

/**
 * 初始化：预加载 GeoJSON 边界线
 * @param {THREE.Group} earthGroup
 */
export async function initLevelLoop(earthGroup, earth) {
  earthObj = earth;
  try {
    const [shanghai, jinshan] = await Promise.all([
      loadBoundaries('/geo/shanghai-districts.json', earthGroup),
      loadBoundaries('/geo/jinshan.json', earthGroup),
    ]);
    boundaryLines.shanghai = shanghai;
    boundaryLines.jinshan = jinshan;
    console.info('[LevelLoop] Boundaries pre-loaded');
  } catch (err) {
    console.warn('[LevelLoop] Failed to load boundaries:', err);
  }
}

/**
 * 运行完整展示循环 (无限循环)
 *
 * 流程: L1 → L2 → L3 → L1 → ...
 *   HUD 更新 → 飞行 → 边界线淡入 → 逐条展示 → 等待 → 边界线淡出
 *
 * @param {object} newsData - { L1: [], L2: [], L3: [] }
 * @param {THREE.PerspectiveCamera} camera
 * @param {import('three/examples/jsm/controls/OrbitControls.js').OrbitControls} controls
 * @param {*} bloomPass
 * @param {object} animState
 * @param {THREE.Group} earthGroup
 * @param {HTMLCanvasElement} canvas
 */
export async function startDisplayLoop(newsData, camera, controls, bloomPass, animState, earthGroup, canvas) {
  let currentLevelIdx = 0;
  let isFirstRun = true;

  // Listen for manual level switch
  window.addEventListener('level-switch', (e) => {
    const targetLevel = e.detail?.level;
    if (targetLevel && LEVEL_ORDER.includes(targetLevel)) {
      currentLevelIdx = LEVEL_ORDER.indexOf(targetLevel);
      // Abort current display to skip to the new level
      if (abortController) {
        abortController.abort();
      }
    }
  });

  while (true) {
    const level = LEVEL_ORDER[currentLevelIdx];
    const config = LEVEL_ORBITS[level];
    const items = newsData[level] || [];

    abortController = new AbortController();
    const { signal } = abortController;

    try {
      // 1. Update HUD
      updateHUDLevel(level, config);

      // 2. Fly to level (skip on very first iteration — already at starting position)
      if (!isFirstRun) {
        await flyToLevel(level, camera, controls, bloomPass, animState);
      } else {
        // On first run, fly to L1 immediately
        await flyToLevel(level, camera, controls, bloomPass, animState, 2000);
        isFirstRun = false;
      }

      // 3. Show boundaries (L2/L3)
      const bKey = config.showBoundaries;
      if (bKey && boundaryLines[bKey]) {
        showBoundaries(boundaryLines[bKey]);
      }

      // 3b. Activate regional overlay textures
      const regions = LEVEL_REGIONS[level];
      if (earthObj && regions) {
        gsap.to({ v: earthObj.material.uniforms.regionOpacity1.value }, {
          v: regions.r1, duration: 1.5, ease: 'power2.out',
          onUpdate() { earthObj.setRegionOpacity(1, this.targets()[0].v); },
        });
        gsap.to({ v: earthObj.material.uniforms.regionOpacity2.value }, {
          v: regions.r2, duration: 1.5, ease: 'power2.out',
          onUpdate() { earthObj.setRegionOpacity(2, this.targets()[0].v); },
        });
      }

      // 4. Settle pause
      await delay(500, signal);

      // 5. Show news items one by one
      if (items.length > 0) {
        await showNewsSequence(items, earthGroup, camera, canvas, { focalLength: config.focalLength });
      } else {
        await delay(10000, signal);
      }

      // 6. Post-display dwell
      await delay(3000, signal);

      // 7. Hide boundaries & regional overlays
      if (bKey && boundaryLines[bKey]) {
        hideBoundaries(boundaryLines[bKey]);
      }
      // Fade out regional overlays
      if (earthObj && regions) {
        gsap.to({ v: earthObj.material.uniforms.regionOpacity1.value }, {
          v: 0, duration: 0.8, ease: 'power2.in',
          onUpdate() { earthObj.setRegionOpacity(1, this.targets()[0].v); },
        });
        gsap.to({ v: earthObj.material.uniforms.regionOpacity2.value }, {
          v: 0, duration: 0.8, ease: 'power2.in',
          onUpdate() { earthObj.setRegionOpacity(2, this.targets()[0].v); },
        });
      }
      if (bKey && boundaryLines[bKey]) {
        await delay(600, signal);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        // Manual switch — hide any visible boundaries
        for (const key of Object.keys(boundaryLines)) {
          if (boundaryLines[key]) {
            hideBoundaries(boundaryLines[key], 0.3);
          }
        }
        await delay(300);
        continue; // Restart loop at new level
      }
      console.error('[LevelLoop] Error in level', level, err);
    }

    // Advance to next level
    currentLevelIdx = (currentLevelIdx + 1) % LEVEL_ORDER.length;
  }
}

/**
 * Abortable delay utility
 * @param {number} ms
 * @param {AbortSignal} [signal]
 * @returns {Promise<void>}
 */
function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    }
  });
}
