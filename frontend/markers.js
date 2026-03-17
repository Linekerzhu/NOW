/**
 * markers.js — 3D markers: anchor points + guide lines + lifecycle control
 *
 * Each news item gets:
 * - A green diamond anchor on the globe surface
 * - A green guide line extending outward along the surface normal
 * - Lifecycle: appear → grow → hold → shrink → disappear
 */

import * as THREE from 'three';
import gsap from 'gsap';
import { geoToSphere, geoToNormal } from './geo.js';
import { EARTH_RADIUS } from './earth.js';

const LINE_LENGTH = 1.8;  // Length of guide line in scene units
const ANCHOR_SIZE = 0.08;

// ---------------------------------------------------------------------------
// Create anchor point (green diamond) — uses Sprite to always face camera
// ---------------------------------------------------------------------------
function createAnchorSprite() {
  // Create a small canvas for the diamond shape
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  // Draw diamond
  const cx = size / 2, cy = size / 2, r = size / 2 - 2;
  ctx.fillStyle = '#00ff00';
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(ANCHOR_SIZE, ANCHOR_SIZE, 1);
  sprite._anchorTexture = texture; // Store for disposal
  return sprite;
}

// ---------------------------------------------------------------------------
// Create guide line
// ---------------------------------------------------------------------------
function createGuideLine() {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(6); // 2 points × 3 components
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.LineBasicMaterial({
    color: 0x00ff00,
    opacity: 0,
    transparent: true,
    depthWrite: false,
  });

  return { line: new THREE.Line(geometry, material), geometry, material };
}

// ---------------------------------------------------------------------------
// Marker class
// ---------------------------------------------------------------------------
class Marker {
  constructor(item, scene) {
    this.item = item;
    this.scene = scene;
    this.active = false;

    // Compute position on sphere
    const surfacePos = geoToSphere(item.latitude, item.longitude, EARTH_RADIUS + 0.02);
    const normal = geoToNormal(item.latitude, item.longitude);

    this.surfacePos = surfacePos;
    this.normal = normal;
    this.endPos = surfacePos.clone().add(normal.clone().multiplyScalar(LINE_LENGTH));

    // Create 3D objects (sprite always faces camera)
    this.anchor = createAnchorSprite();
    this.anchor.position.copy(surfacePos);

    const { line, geometry: lineGeom, material: lineMat } = createGuideLine();
    this.line = line;
    this.lineGeom = lineGeom;
    this.lineMat = lineMat;

    // Temp vector for line interpolation (avoids per-frame allocation)
    this._tmpVec = new THREE.Vector3();

    // Set initial line (zero length)
    this._setLineLength(0);

    // Progress: 0 = nothing, 1 = fully extended
    this.progress = 0;

    scene.add(this.anchor);
    scene.add(this.line);
  }

  _setLineLength(t) {
    // t: 0..1, how much of the line is visible
    const start = this.surfacePos;
    const end = this._tmpVec.copy(this.surfacePos).lerp(this.endPos, t);
    const positions = this.lineGeom.attributes.position.array;
    positions[0] = start.x; positions[1] = start.y; positions[2] = start.z;
    positions[3] = end.x;   positions[4] = end.y;   positions[5] = end.z;
    this.lineGeom.attributes.position.needsUpdate = true;
  }

  /**
   * Get the screen-space position of the card attachment point.
   * @param {THREE.Camera} camera
   * @param {HTMLElement} container
   * @returns {{ x: number, y: number, visible: boolean }}
   */
  getScreenPosition(camera, container) {
    const pos = this.endPos.clone();
    pos.project(camera);

    // Check if behind camera
    const visible = pos.z < 1;

    const rect = container.getBoundingClientRect();
    const x = (pos.x * 0.5 + 0.5) * rect.width;
    const y = (-pos.y * 0.5 + 0.5) * rect.height;

    return { x, y, visible };
  }

  /**
   * Phase 1+2: Anchor appears, line grows. Returns a timeline.
   */
  animateIn() {
    this.active = true;
    const tl = gsap.timeline();

    // Phase 1: Anchor fades in (1.0s)
    tl.to(this.anchor.material, {
      opacity: 1.0,
      duration: 1.0,
      ease: 'power2.out',
    });

    // Phase 2: Line grows (0.6s)
    tl.to(this, {
      progress: 1,
      duration: 0.6,
      ease: 'power2.out',
      onUpdate: () => {
        this._setLineLength(this.progress);
        this.lineMat.opacity = this.progress * 0.30;
      },
    }, '-=0.3');

    return tl;
  }

  /**
   * Phase 5: Shrink and disappear. Returns a timeline.
   */
  animateOut() {
    const tl = gsap.timeline();

    // Line shrinks
    tl.to(this, {
      progress: 0,
      duration: 0.5,
      ease: 'power2.in',
      onUpdate: () => {
        this._setLineLength(this.progress);
        this.lineMat.opacity = this.progress * 0.30;
      },
    });

    // Anchor fades
    tl.to(this.anchor.material, {
      opacity: 0,
      duration: 0.3,
      ease: 'power2.in',
    }, '-=0.2');

    tl.call(() => {
      this.active = false;
    });

    return tl;
  }

  dispose() {
    this.scene.remove(this.anchor);
    this.scene.remove(this.line);
    if (this.anchor._anchorTexture) this.anchor._anchorTexture.dispose();
    this.anchor.material.dispose();
    this.lineGeom.dispose();
    this.lineMat.dispose();
  }
}

// ---------------------------------------------------------------------------
// Markers manager
// ---------------------------------------------------------------------------
export function createMarkersManager(scene) {
  /** @type {Marker|null} */
  let currentMarker = null;

  function createMarker(item) {
    if (currentMarker) {
      currentMarker.dispose();
    }
    currentMarker = new Marker(item, scene);
    return currentMarker;
  }

  function getCurrentMarker() {
    return currentMarker;
  }

  function cleanup() {
    if (currentMarker) {
      currentMarker.dispose();
      currentMarker = null;
    }
  }

  return { createMarker, getCurrentMarker, cleanup };
}
