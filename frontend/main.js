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
import { startPolling, stopPolling, getItems, seedData, fetchNews, nextLevel } from './data.js';
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
let currentInfoItem = null;  // The item being displayed (for camera follow)
let presenting = false;      // Whether we're in a presentation cycle

// Presentation state
const presentationState = {
  currentLevel: 'L1',
  itemIndex: 0,
  phase: 'idle',  // idle | presenting | breathing | switching
  card: null,
  marker: null,
  noDataTimer: 0,
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
// Info presentation cycle
// ---------------------------------------------------------------------------

function startPresentationCycle() {
  presenting = true;
  presentationState.phase = 'idle';
  presentationState.itemIndex = 0;
  presentationState.currentLevel = cameraCtrl.getCurrentLevel();
  presentNext();
}

async function presentNext() {
  const { currentLevel } = presentationState;
  const items = getItems(currentLevel);

  if (presentationState.itemIndex >= items.length) {
    // All items shown for this level (or no items)
    if (items.length === 0) {
      // "No data" — earth turns quietly, wait 10s then switch
      presentationState.phase = 'idle';
      await wait(10000);
    }

    // Switch to next level
    const next = nextLevel(currentLevel);
    presentationState.phase = 'switching';

    // Fade out HUD
    await fadeOutHUD();

    // Camera transition
    await new Promise(resolve => {
      cameraCtrl.transitionTo(next, null, resolve);
    });

    // Update HUD for new level
    updateHUD(next, LEVEL_CONFIG[next]);
    setActiveLevelButton(next);
    await fadeInHUD();

    // Reset for new level
    presentationState.currentLevel = next;
    presentationState.itemIndex = 0;

    // Fetch fresh data
    await fetchNews();

    presentNext();
    return;
  }

  const item = items[presentationState.itemIndex];
  presentationState.phase = 'presenting';
  currentInfoItem = item;

  // Create marker
  const marker = markers.createMarker(item);
  presentationState.marker = marker;

  // Phase 1+2: Anchor + line animate in
  const inTl = marker.animateIn();
  await inTl.then ? inTl : new Promise(resolve => inTl.eventCallback('onComplete', resolve));

  // Phase 3: Create and show card
  const screenPos = marker.getScreenPosition(camera, overlay);
  const card = createInfoCard(item, screenPos.x, screenPos.y, screenPos.visible);
  presentationState.card = card;
  const cardInTl = animateCardIn(card);
  await cardInTl.then ? cardInTl : new Promise(resolve => cardInTl.eventCallback('onComplete', resolve));

  // Phase 4: Hold (reading time)
  const readDuration = computeReadDuration(item);
  await wait(readDuration * 1000);

  // Phase 5: Card out + marker out
  const cardOutTl = animateCardOut(card);
  await cardOutTl.then ? cardOutTl : new Promise(resolve => cardOutTl.eventCallback('onComplete', resolve));

  const outTl = marker.animateOut();
  await outTl.then ? outTl : new Promise(resolve => outTl.eventCallback('onComplete', resolve));

  removeInfoCard();
  presentationState.card = null;
  currentInfoItem = null;

  // Phase 6: Breathing pause
  presentationState.phase = 'breathing';
  await wait(1500);

  // Next item
  presentationState.itemIndex++;
  presentNext();
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------
function animate(now) {
  requestAnimationFrame(animate);

  const rawDelta = (now - lastTime) / 1000;
  const delta = rawDelta > 0.1 ? 1 / 60 : rawDelta;
  lastTime = now;
  animTime = (animTime + delta) % 20000;

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

  // Update clock
  updateClock();

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
  gsap.killTweensOf('*');
  removeInfoCard();
  markers.cleanup();
  currentInfoItem = null;

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
    presentNext();
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
