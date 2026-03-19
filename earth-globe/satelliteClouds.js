import * as THREE from 'three';

/**
 * Fetch real-time satellite cloud imagery from NASA GIBS WMTS and stitch
 * tiles into a single equirectangular CanvasTexture.
 *
 * GIBS WMTS: free, no API key, CORS-enabled, public domain data.
 * Layer: VIIRS_SNPP_CorrectedReflectance_TrueColor
 * Projection: EPSG:4326 (equirectangular — matches SphereGeometry UV)
 *
 * At zoom level 3 the EPSG:4326 tile grid is 8 cols × 4 rows = 32 tiles,
 * each 512×512px, stitched to a 4096×2048 canvas.
 */

const GIBS_BASE = 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best';
const LAYER = 'VIIRS_SNPP_CorrectedReflectance_TrueColor';
const MATRIX_SET = '250m';
const ZOOM = 3;
const TILE_SIZE = 512;
const COLS = 8;
const ROWS = 4;
const CANVAS_W = COLS * TILE_SIZE; // 4096
const CANVAS_H = ROWS * TILE_SIZE; // 2048

/**
 * Format a Date as YYYY-MM-DD in UTC.
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Build the GIBS WMTS REST tile URL.
 * @param {string} dateStr - YYYY-MM-DD
 * @param {number} row
 * @param {number} col
 * @returns {string}
 */
function tileUrl(dateStr, row, col) {
  return `${GIBS_BASE}/${LAYER}/default/${dateStr}/${MATRIX_SET}/${ZOOM}/${row}/${col}.jpg`;
}

/**
 * Load a single tile image.
 * @param {string} url
 * @returns {Promise<HTMLImageElement>}
 */
function loadTileImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load tile: ${url}`));
    img.src = url;
  });
}

/**
 * Fetch satellite cloud imagery for a given date, stitch into a texture.
 *
 * @param {object} options
 * @param {string} [options.date] - YYYY-MM-DD, defaults to today UTC
 * @param {(loaded: number, total: number) => void} [options.onProgress]
 * @returns {{ texture: THREE.CanvasTexture, promise: Promise<void>, cancel: () => void }}
 */
export function fetchSatelliteClouds({ date, onProgress } = {}) {
  const dateStr = date || formatDate(new Date());
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx2d = canvas.getContext('2d');

  // Fill black initially
  ctx2d.fillStyle = '#000';
  ctx2d.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  let cancelled = false;
  const total = ROWS * COLS;
  let loaded = 0;

  const promise = (async () => {
    console.info(`[Clouds] Loading satellite tiles for ${dateStr}...`);

    // Load all tiles in parallel
    const tasks = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const url = tileUrl(dateStr, row, col);
        tasks.push(
          loadTileImage(url)
            .then(img => {
              if (cancelled) return;
              ctx2d.drawImage(img, col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
              loaded++;
              texture.needsUpdate = true;
              if (onProgress) onProgress(loaded, total);
            })
            .catch(err => {
              // Individual tile failure is non-fatal — leave black
              console.warn(`[Clouds] Tile ${row}/${col} failed:`, err.message);
              loaded++;
              if (onProgress) onProgress(loaded, total);
            }),
        );
      }
    }

    await Promise.all(tasks);

    if (!cancelled) {
      // Re-enable mipmaps now that all tiles are in
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.needsUpdate = true;
      console.info(`[Clouds] Satellite cloud texture ready (${loaded}/${total} tiles)`);
    }
  })();

  return {
    texture,
    promise,
    cancel() { cancelled = true; },
  };
}

/**
 * Get a formatted date string for N days ago (UTC).
 * @param {number} daysAgo
 * @returns {string} YYYY-MM-DD
 */
export function getDateDaysAgo(daysAgo) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return formatDate(d);
}
