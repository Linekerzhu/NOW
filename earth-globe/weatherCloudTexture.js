import * as THREE from 'three';

/**
 * Generate a stylised cloud-density Canvas texture from a cloud-cover grid.
 *
 * Pipeline:
 *   1. Bilinear-interpolate the sparse grid → full-resolution image
 *   2. Apply contrast curve
 *   3. Apply multi-pass box blur (approximates Gaussian)
 *   4. Overlay Perlin-like value noise for organic detail
 *   5. Return as THREE.CanvasTexture
 *
 * The texture is equirectangular (matches spherical UV) and is consumed
 * by the existing clouds.frag shader as a drop-in replacement for the
 * static cloud JPEG.
 */

// =========================================================================
//  Simple 2D value noise (hash-based, no dependencies)
// =========================================================================

function _hash(x, y) {
  let h = (x * 374761393 + y * 668265263 + 1013904223) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296; // [0, 1)
}

function _smoothstep(t) {
  return t * t * (3 - 2 * t);
}

/**
 * Bicubic-smoothed value noise in [0, 1].
 */
function valueNoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = _smoothstep(x - ix);
  const fy = _smoothstep(y - iy);

  const n00 = _hash(ix, iy);
  const n10 = _hash(ix + 1, iy);
  const n01 = _hash(ix, iy + 1);
  const n11 = _hash(ix + 1, iy + 1);

  const nx0 = n00 + (n10 - n00) * fx;
  const nx1 = n01 + (n11 - n01) * fx;
  return nx0 + (nx1 - nx0) * fy;
}

/**
 * Fractal Brownian Motion (fBm) for richer noise.
 */
function fbm(x, y, octaves = 4) {
  let val = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    val += amp * valueNoise(x * freq, y * freq);
    amp *= 0.5;
    freq *= 2;
  }
  return val;
}

// =========================================================================
//  Bilinear interpolation of the sparse grid
// =========================================================================

/**
 * @param {Float32Array} grid  row-major cloud values [0..1]
 * @param {number} rows
 * @param {number} cols
 * @param {number} u  normalised x [0..1]  (longitude)
 * @param {number} v  normalised y [0..1]  (latitude, top=0)
 */
function sampleGrid(grid, rows, cols, u, v) {
  // Map to grid cell coordinates (with wrapping on u for longitude)
  const gx = u * cols;
  const gy = v * (rows - 1); // rows map from +90 to −90

  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;

  const ix0 = ((ix % cols) + cols) % cols;
  const ix1 = ((ix + 1) % cols + cols) % cols;
  const iy0 = Math.min(iy, rows - 1);
  const iy1 = Math.min(iy + 1, rows - 1);

  const n00 = grid[iy0 * cols + ix0];
  const n10 = grid[iy0 * cols + ix1];
  const n01 = grid[iy1 * cols + ix0];
  const n11 = grid[iy1 * cols + ix1];

  const nx0 = n00 + (n10 - n00) * fx;
  const nx1 = n01 + (n11 - n01) * fx;
  return nx0 + (nx1 - nx0) * fy;
}

// =========================================================================
//  Box blur (horizontal + vertical pass — approximates Gaussian)
// =========================================================================

function boxBlurH(src, dst, w, h, r) {
  const iarr = 1 / (r + r + 1);
  for (let y = 0; y < h; y++) {
    let ti = y * w;
    let li = ti;
    let ri = ti + r;
    const fv = src[ti];
    const lv = src[ti + w - 1];
    let val = (r + 1) * fv;
    for (let j = 0; j < r; j++) val += src[ti + j];
    for (let j = 0; j <= r; j++) {
      val += src[ri++] - fv;
      dst[ti++] = val * iarr;
    }
    for (let j = r + 1; j < w - r; j++) {
      val += src[ri++] - src[li++];
      dst[ti++] = val * iarr;
    }
    for (let j = w - r; j < w; j++) {
      val += lv - src[li++];
      dst[ti++] = val * iarr;
    }
  }
}

function boxBlurV(src, dst, w, h, r) {
  const iarr = 1 / (r + r + 1);
  for (let x = 0; x < w; x++) {
    let ti = x;
    let li = ti;
    let ri = ti + r * w;
    const fv = src[ti];
    const lv = src[ti + w * (h - 1)];
    let val = (r + 1) * fv;
    for (let j = 0; j < r; j++) val += src[ti + j * w];
    for (let j = 0; j <= r; j++) {
      val += src[ri] - fv;
      dst[ti] = val * iarr;
      ri += w;
      ti += w;
    }
    for (let j = r + 1; j < h - r; j++) {
      val += src[ri] - src[li];
      dst[ti] = val * iarr;
      ri += w;
      li += w;
      ti += w;
    }
    for (let j = h - r; j < h; j++) {
      val += lv - src[li];
      dst[ti] = val * iarr;
      li += w;
      ti += w;
    }
  }
}

function gaussianBlur(data, w, h, radius) {
  if (radius < 1) return;
  const tmp = new Float32Array(data.length);
  // 3-pass box blur approximates Gaussian well
  const r = Math.max(1, Math.round(radius));
  for (let pass = 0; pass < 3; pass++) {
    boxBlurH(data, tmp, w, h, r);
    boxBlurV(tmp, data, w, h, r);
  }
}

// =========================================================================
//  Public API
// =========================================================================

/**
 * Generate a stylised equirectangular cloud texture from weather grid data.
 *
 * @param {object} gridData        - { grid: Float32Array, rows, cols }
 * @param {object} opts
 * @param {number} opts.width      - output texture width  (default 512)
 * @param {number} opts.height     - output texture height (default 256)
 * @param {number} opts.blurRadius - Gaussian blur radius  (default 8)
 * @param {number} opts.contrast   - density contrast      (default 1.2)
 * @param {number} opts.noiseStrength - noise overlay strength (default 0.15)
 * @param {number} opts.noiseScale - noise frequency scale  (default 4)
 * @param {THREE.CanvasTexture} [existingTexture] - reuse canvas if provided
 * @returns {THREE.CanvasTexture}
 */
export function generateCloudTexture(
  gridData,
  {
    width = 512,
    height = 256,
    blurRadius = 8,
    contrast = 1.2,
    noiseStrength = 0.15,
    noiseScale = 4,
  } = {},
  existingTexture = null,
) {
  const { grid, rows, cols } = gridData;
  const pixels = width * height;
  const density = new Float32Array(pixels);

  // Step 1: bilinear interpolation of sparse grid → full resolution
  for (let py = 0; py < height; py++) {
    const v = py / height;
    for (let px = 0; px < width; px++) {
      const u = px / width;
      density[py * width + px] = sampleGrid(grid, rows, cols, u, v);
    }
  }

  // Step 2: apply contrast curve (power curve centred at 0.5)
  if (contrast !== 1) {
    for (let i = 0; i < pixels; i++) {
      density[i] = Math.pow(density[i], 1 / contrast);
    }
  }

  // Step 3: Gaussian blur
  gaussianBlur(density, width, height, blurRadius);

  // Step 4: overlay fBm noise for organic detail
  if (noiseStrength > 0) {
    // Use a time-based seed so noise varies each refresh
    const seed = (Date.now() * 0.0001) % 1000;
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const nu = (px / width) * noiseScale + seed;
        const nv = (py / height) * noiseScale;
        const n = fbm(nu, nv) * 2 - 1; // range [−1, 1]
        const idx = py * width + px;
        density[idx] = Math.max(0, Math.min(1, density[idx] + n * noiseStrength));
      }
    }
  }

  // Step 5: paint to Canvas
  let canvas;
  if (existingTexture) {
    canvas = existingTexture.image;
    // Resize if needed
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  } else {
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  for (let i = 0; i < pixels; i++) {
    const v = Math.round(density[i] * 255);
    const idx = i * 4;
    data[idx] = v;     // R
    data[idx + 1] = v; // G
    data[idx + 2] = v; // B
    data[idx + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);

  if (existingTexture) {
    existingTexture.needsUpdate = true;
    return existingTexture;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}
