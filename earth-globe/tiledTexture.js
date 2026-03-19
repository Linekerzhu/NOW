import * as THREE from 'three';

/**
 * Create a tiled texture that loads progressively.
 *
 * Immediately returns a CanvasTexture backed by a placeholder image.
 * Then asynchronously fetches high-res tiles and paints them onto the
 * canvas, calling texture.needsUpdate after each tile.  This avoids
 * the massive GPU stall caused by uploading a single 16K+ texture.
 *
 * @param {object} opts
 * @param {string} opts.basePath  - path prefix for tiles (e.g. '/textures/tiles/earth-day-16k')
 * @param {number} opts.cols      - number of tile columns
 * @param {number} opts.rows      - number of tile rows
 * @param {number} opts.tileWidth - pixel width of each tile
 * @param {number} opts.tileHeight - pixel height of each tile
 * @param {string} opts.placeholder - path to the low-res placeholder image
 * @param {(loaded: number, total: number) => void} [opts.onProgress] - progress callback
 * @returns {{ texture: THREE.CanvasTexture, cancel: () => void }}
 */
export function createTiledTexture({
  basePath,
  cols,
  rows,
  tileWidth,
  tileHeight,
  placeholder,
  onProgress,
}) {
  const sourceWidth = cols * tileWidth;
  const sourceHeight = rows * tileHeight;
  const totalTiles = cols * rows;

  // Cap canvas to GPU max texture size (commonly 16384) to prevent
  // Three.js from silently downscaling the entire texture every frame.
  const MAX_TEX = 16384;
  const scale = Math.min(1, MAX_TEX / Math.max(sourceWidth, sourceHeight));
  const canvasW = Math.round(sourceWidth * scale);
  const canvasH = Math.round(sourceHeight * scale);
  const drawTileW = Math.round(tileWidth * scale);
  const drawTileH = Math.round(tileHeight * scale);

  // Offscreen canvas at GPU-safe resolution
  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx2d = canvas.getContext('2d');

  // Fill with black to prevent uninitialized regions showing as artifacts
  ctx2d.fillStyle = '#000';
  ctx2d.fillRect(0, 0, canvasW, canvasH);

  // THREE.CanvasTexture auto-reads from the canvas
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Disable mipmaps during loading to prevent partial mipmap states
  // which cause black rectangles when bloom reads intermediate levels
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  let cancelled = false;
  let tilesLoaded = 0;

  // Phase 1: draw placeholder at full canvas size, then start tile loading
  const placeholderImg = new Image();
  placeholderImg.crossOrigin = 'anonymous';
  placeholderImg.onload = () => {
    if (cancelled) return;
    ctx2d.drawImage(placeholderImg, 0, 0, canvasW, canvasH);
    texture.needsUpdate = true;

    // Phase 2: start loading tiles
    loadTiles();
  };
  placeholderImg.onerror = () => {
    // Even if placeholder fails, attempt tile loading
    console.warn('[TiledTexture] Placeholder failed to load:', placeholder);
    if (!cancelled) loadTiles();
  };
  placeholderImg.src = placeholder;

  /** Yield to the next animation frame so GPU uploads happen between renders */
  function waitFrame() {
    return new Promise(resolve => requestAnimationFrame(resolve));
  }

  async function loadTiles() {
    // Load tiles row by row, left to right — this gives a natural "reveal"
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (cancelled) return;

        const tileUrl = `${basePath}/col${col}_row${row}.jpg`;
        try {
          const bitmap = await loadTileBitmap(tileUrl);
          if (cancelled) return;

          const dx = col * drawTileW;
          const dy = row * drawTileH;
          // Draw 1px oversized to eliminate seam artifacts from rounding
          ctx2d.drawImage(bitmap, dx, dy, drawTileW + 1, drawTileH + 1);
          bitmap.close();

          // Yield to next frame before GPU upload to avoid mid-render artifacts
          await waitFrame();

          texture.needsUpdate = true;
          tilesLoaded++;

          if (onProgress) {
            onProgress(tilesLoaded, totalTiles);
          }
        } catch (err) {
          console.warn(`[TiledTexture] Failed to load tile ${tileUrl}:`, err);
          tilesLoaded++;
          if (onProgress) onProgress(tilesLoaded, totalTiles);
        }
      }
    }

    // All tiles loaded — enable mipmaps only if at least one tile succeeded
    if (tilesLoaded > 0) {
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.needsUpdate = true;
    }
  }

  return {
    texture,
    cancel() {
      cancelled = true;
    },
  };
}

/**
 * Load a single tile image asynchronously using fetch + createImageBitmap
 * (decodes off the main thread).
 */
async function loadTileBitmap(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  const blob = await resp.blob();
  return createImageBitmap(blob);
}
