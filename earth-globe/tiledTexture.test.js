import { describe, it, expect, vi } from 'vitest';

// Mock Three.js and browser APIs before importing tiledTexture
vi.mock('three', () => {
  class MockCanvasTexture {
    constructor(canvas) {
      this.source = { data: canvas };
      this.colorSpace = '';
      this.generateMipmaps = true;
      this.minFilter = 0;
      this.magFilter = 0;
      this.wrapS = 0;
      this.wrapT = 0;
      this.needsUpdate = false;
    }
  }
  return {
    CanvasTexture: MockCanvasTexture,
    SRGBColorSpace: 'srgb',
    LinearFilter: 1006,
    LinearMipmapLinearFilter: 1008,
    RepeatWrapping: 1000,
    ClampToEdgeWrapping: 1001,
  };
});

// Minimal canvas mock
const mockCtx = {
  fillStyle: '',
  fillRect: vi.fn(),
  drawImage: vi.fn(),
};

// Mock document.createElement to return a canvas-like object
vi.stubGlobal('document', {
  createElement: vi.fn((tag) => {
    if (tag === 'canvas') {
      return {
        width: 0,
        height: 0,
        getContext: () => mockCtx,
      };
    }
    return {};
  }),
});

// Mock Image constructor
class MockImage {
  constructor() {
    this._src = '';
    this.onload = null;
    this.onerror = null;
    this.crossOrigin = '';
  }
  set src(val) {
    this._src = val;
    // Simulate async load success
    if (this.onload) setTimeout(() => this.onload(), 0);
  }
  get src() { return this._src; }
}
vi.stubGlobal('Image', MockImage);

const { createTiledTexture } = await import('./tiledTexture.js');

describe('createTiledTexture', () => {
  it('returns a texture and cancel function', () => {
    const result = createTiledTexture({
      basePath: '/textures/tiles/test',
      cols: 2,
      rows: 1,
      tileWidth: 100,
      tileHeight: 100,
      placeholder: '/textures/placeholder.jpg',
    });

    expect(result).toHaveProperty('texture');
    expect(result).toHaveProperty('cancel');
    expect(typeof result.cancel).toBe('function');
    result.cancel();
  });

  it('creates canvas with correct dimensions (no scaling)', () => {
    const result = createTiledTexture({
      basePath: '/textures/tiles/test',
      cols: 2,
      rows: 1,
      tileWidth: 1000,
      tileHeight: 1000,
      placeholder: '/textures/placeholder.jpg',
    });

    const canvas = result.texture.source.data;
    expect(canvas.width).toBe(2000);
    expect(canvas.height).toBe(1000);
    result.cancel();
  });

  it('caps canvas dimensions at 16384', () => {
    const result = createTiledTexture({
      basePath: '/textures/tiles/test',
      cols: 4,
      rows: 2,
      tileWidth: 5400,
      tileHeight: 5400,
      placeholder: '/textures/placeholder.jpg',
    });

    const canvas = result.texture.source.data;
    // 4 × 5400 = 21600 → scaled by 16384/21600 ≈ 0.759
    expect(canvas.width).toBeLessThanOrEqual(16384);
    expect(canvas.height).toBeLessThanOrEqual(16384);
    result.cancel();
  });

  it('texture starts with mipmaps disabled', () => {
    const result = createTiledTexture({
      basePath: '/textures/tiles/test',
      cols: 2,
      rows: 1,
      tileWidth: 100,
      tileHeight: 100,
      placeholder: '/textures/placeholder.jpg',
    });

    expect(result.texture.generateMipmaps).toBe(false);
    result.cancel();
  });

  it('fills canvas with black initially', () => {
    createTiledTexture({
      basePath: '/textures/tiles/test',
      cols: 2,
      rows: 1,
      tileWidth: 100,
      tileHeight: 100,
      placeholder: '/textures/placeholder.jpg',
    }).cancel();

    expect(mockCtx.fillStyle).toBe('#000');
    expect(mockCtx.fillRect).toHaveBeenCalled();
  });
});
