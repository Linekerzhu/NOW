/**
 * main.js — Main orchestrator: scene init, render loop, info presentation cycle
 *
 * The core rhythm:
 *   Earth rotates quietly →
 *   Anchor appears → line grows → card expands → hold → collapse → anchor dims →
 *   Breathing pause →
 *   Next item...
 *   All done → switch level (camera orbit flight) →
 *   Next level starts
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import gsap from 'gsap';

import { createEarthScene } from './earth.js';
import { createCameraController, LEVEL_CONFIG } from './camera.js';
import { createMarkersManager } from './markers.js';
import { startPolling, getItems, seedData, fetchNews, nextLevel } from './data.js';
import {
  updateHUD, updateClock, setupLevelSwitcher, setActiveLevelButton,
  fadeOutHUD, fadeInHUD,
  createInfoCard, animateCardIn, animateCardOut, removeInfoCard,
  updateCardPosition, computeReadDuration,
} from './overlay.js';

// ---------------------------------------------------------------------------
// Scene setup
// ---------------------------------------------------------------------------
const canvas = document.getElementById('globe-canvas');
const overlay = document.getElementById('overlay');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);

// ---------------------------------------------------------------------------
// Post-processing (bloom)
// ---------------------------------------------------------------------------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.55,  // strength
  0.45,  // radius
  0.65   // threshold
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// ---------------------------------------------------------------------------
// Earth, camera, markers
// ---------------------------------------------------------------------------
const earth = createEarthScene(renderer, camera);
scene.add(earth.earthGroup);
scene.add(earth.stars);
scene.add(earth.ambientLight);
scene.add(earth.sunLight);

const cameraCtrl = createCameraController(camera);
const markers = createMarkersManager(scene);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let animTime = 0;
let lastTime = performance.now();
let sunUpdateTimer = 0;
let clockUpdateTimer = 0;
let currentInfoItem = null;  // The item being displayed (for camera follow)

// Generation counter: incremented on every interruption (manual level switch).
// The presentation loop checks this after every await to bail out if stale.
let generation = 0;

// Presentation state
const presentationState = {
  currentLevel: 'L1',
  itemIndex: 0,
  phase: 'idle',  // idle | presenting | breathing | switching
  card: null,
  marker: null,
};

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------
let resizeRaf = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloomPass.resolution.set(w, h);
  });
});

// ---------------------------------------------------------------------------
// Cancellable wait — resolves with false if generation changed
// ---------------------------------------------------------------------------
function wait(ms, gen) {
  return new Promise(resolve => {
    setTimeout(() => resolve(generation === gen), ms);
  });
}

/**
 * Await a GSAP timeline as a promise, but bail out if generation changes.
 * Returns false if cancelled, true if completed normally.
 */
function awaitTimeline(tl, gen) {
  return new Promise(resolve => {
    if (generation !== gen) { resolve(false); return; }
    tl.then(() => resolve(generation === gen));
  });
}

// ---------------------------------------------------------------------------
// Info presentation cycle — iterative (no recursion)
// ---------------------------------------------------------------------------
async function presentationLoop() {
  const gen = generation;

  while (generation === gen) {
    const { currentLevel } = presentationState;
    const items = getItems(currentLevel);

    if (presentationState.itemIndex >= items.length) {
      // All items shown for this level (or no items)
      if (items.length === 0) {
        presentationState.phase = 'idle';
        if (!await wait(10000, gen)) break;
      }

      // Switch to next level
      const next = nextLevel(currentLevel);
      presentationState.phase = 'switching';

      // Fade out HUD
      if (!await awaitTimeline(fadeOutHUD(), gen)) break;

      // Camera transition
      const transitionDone = await new Promise(resolve => {
        const tween = cameraCtrl.transitionTo(next, null, () => resolve(true));
        if (!tween) resolve(true); // Already at target or same level
      });
      if (generation !== gen) break;

      // Update HUD for new level
      updateHUD(next, LEVEL_CONFIG[next]);
      setActiveLevelButton(next);
      if (!await awaitTimeline(fadeInHUD(), gen)) break;

      // Reset for new level
      presentationState.currentLevel = next;
      presentationState.itemIndex = 0;

      // Fetch fresh data
      await fetchNews();
      if (generation !== gen) break;

      continue; // Restart loop with new level
    }

    const item = items[presentationState.itemIndex];
    presentationState.phase = 'presenting';
    currentInfoItem = item;

    // Create marker
    const marker = markers.createMarker(item);
    presentationState.marker = marker;

    // Phase 1+2: Anchor + line animate in
    if (!await awaitTimeline(marker.animateIn(), gen)) break;

    // Phase 3: Create and show card
    const screenPos = marker.getScreenPosition(camera, overlay);
    const card = createInfoCard(item, screenPos.x, screenPos.y, screenPos.visible);
    presentationState.card = card;
    if (!await awaitTimeline(animateCardIn(card), gen)) break;

    // Phase 4: Hold (reading time)
    const readDuration = computeReadDuration(item);
    if (!await wait(readDuration * 1000, gen)) break;

    // Phase 5: Card out + marker out
    if (!await awaitTimeline(animateCardOut(card), gen)) break;
    if (!await awaitTimeline(marker.animateOut(), gen)) break;

    removeInfoCard();
    presentationState.card = null;
    currentInfoItem = null;

    // Phase 6: Breathing pause
    presentationState.phase = 'breathing';
    if (!await wait(1500, gen)) break;

    // Next item
    presentationState.itemIndex++;
  }
}

function startPresentationCycle() {
  presentationState.phase = 'idle';
  presentationState.itemIndex = 0;
  presentationState.currentLevel = cameraCtrl.getCurrentLevel();
  presentationLoop();
}

/**
 * Interrupt the current presentation cycle. All pending awaits will bail out.
 */
function interruptPresentation() {
  generation++;
  // Kill all running GSAP tweens on known targets
  gsap.killTweensOf('#hud');
  if (presentationState.marker) {
    const m = presentationState.marker;
    gsap.killTweensOf(m);
    gsap.killTweensOf(m.anchor?.material);
  }
  if (presentationState.card) {
    gsap.killTweensOf(presentationState.card);
  }
  removeInfoCard();
  markers.cleanup();
  presentationState.card = null;
  presentationState.marker = null;
  currentInfoItem = null;
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------
function animate(now) {
  requestAnimationFrame(animate);

  const rawDelta = (now - lastTime) / 1000;
  const delta = rawDelta > 0.1 ? 1 / 60 : rawDelta;
  lastTime = now;
  animTime += delta;

  // Update sun every 60s
  sunUpdateTimer += delta;
  if (sunUpdateTimer > 60) {
    earth.updateSun(new Date());
    sunUpdateTimer = 0;
  }

  // Update earth (clouds, shaders)
  earth.update(delta, animTime);

  // Update camera
  cameraCtrl.update(delta, currentInfoItem);

  // Update card position if visible
  if (presentationState.card && presentationState.marker) {
    const marker = presentationState.marker;
    const screenPos = marker.getScreenPosition(camera, overlay);
    updateCardPosition(presentationState.card, screenPos.x, screenPos.y, screenPos.visible);
  }

  // Update clock once per second
  clockUpdateTimer += delta;
  if (clockUpdateTimer >= 1.0) {
    updateClock();
    clockUpdateTimer = 0;
  }

  // Render
  composer.render();
}

// ---------------------------------------------------------------------------
// Level switcher (manual override)
// ---------------------------------------------------------------------------
setupLevelSwitcher((level) => {
  if (level === cameraCtrl.getCurrentLevel()) return;
  if (cameraCtrl.isTransitioning()) return;

  // Interrupt current presentation
  interruptPresentation();

  // Transition
  fadeOutHUD();
  cameraCtrl.transitionTo(level, null, () => {
    updateHUD(level, LEVEL_CONFIG[level]);
    setActiveLevelButton(level);
    fadeInHUD();

    // Restart presentation for new level
    presentationState.currentLevel = level;
    presentationState.itemIndex = 0;
    presentationState.phase = 'idle';
    presentationLoop();
  });
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
async function init() {
  // Initial HUD
  updateHUD('L1', LEVEL_CONFIG.L1);
  setActiveLevelButton('L1');
  updateClock();

  // Start data polling
  startPolling();

  // Seed dev data
  await seedData();
  await fetchNews();

  // Start render loop
  requestAnimationFrame(animate);

  // Start presentation after a short delay (let earth render first)
  setTimeout(() => {
    startPresentationCycle();
  }, 2000);
}

init();
