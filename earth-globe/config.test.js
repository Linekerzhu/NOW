import { describe, it, expect } from 'vitest';
import { CONFIG } from './config.js';

describe('CONFIG', () => {
  describe('structure', () => {
    it('has all required top-level sections', () => {
      const requiredSections = [
        'earth', 'clouds', 'atmosphere', 'aurora', 'stars',
        'sun', 'moon', 'camera', 'bloom', 'lighting',
        'renderer', 'animation', 'loading', 'textures',
        'earthSurface', 'presets',
      ];
      for (const section of requiredSections) {
        expect(CONFIG).toHaveProperty(section);
      }
    });
  });

  describe('earth', () => {
    it('has valid radius', () => {
      expect(CONFIG.earth.radius).toBeGreaterThan(0);
    });

    it('has valid segments tuple', () => {
      expect(CONFIG.earth.segments).toHaveLength(2);
      expect(CONFIG.earth.segments[0]).toBeGreaterThanOrEqual(16);
      expect(CONFIG.earth.segments[1]).toBeGreaterThanOrEqual(8);
    });

    it('oblateness is between 0.99 and 1', () => {
      expect(CONFIG.earth.oblateness).toBeGreaterThan(0.99);
      expect(CONFIG.earth.oblateness).toBeLessThanOrEqual(1);
    });
  });

  describe('bloom', () => {
    it('has valid strength, radius, threshold', () => {
      expect(CONFIG.bloom.strength).toBeGreaterThanOrEqual(0);
      expect(CONFIG.bloom.radius).toBeGreaterThanOrEqual(0);
      expect(CONFIG.bloom.threshold).toBeGreaterThanOrEqual(0);
      expect(CONFIG.bloom.threshold).toBeLessThanOrEqual(1);
    });
  });

  describe('presets', () => {
    it('has animationDuration > 0', () => {
      expect(CONFIG.presets.animationDuration).toBeGreaterThan(0);
    });

    const presetNames = ['oneWorld', 'chinaGrid', 'shanghai'];
    for (const name of presetNames) {
      it(`preset "${name}" has required fields`, () => {
        const p = CONFIG.presets[name];
        expect(p).toHaveProperty('label');
        expect(p).toHaveProperty('elevation');
        expect(p).toHaveProperty('distance');
        expect(p).toHaveProperty('latitudeOffset');
        expect(p).toHaveProperty('autoRotate');
        expect(p).toHaveProperty('autoRotateSpeed');
        expect(typeof p.elevation).toBe('number');
        expect(typeof p.distance).toBe('number');
      });
    }

    it('distances are within reasonable range', () => {
      for (const name of presetNames) {
        const d = CONFIG.presets[name].distance;
        expect(d).toBeGreaterThan(CONFIG.earth.radius);
        expect(d).toBeLessThan(CONFIG.earth.radius * 10);
      }
    });
  });

  describe('textures', () => {
    it('dayTiles has valid tile config', () => {
      const t = CONFIG.textures.dayTiles;
      expect(t.cols).toBeGreaterThan(0);
      expect(t.rows).toBeGreaterThan(0);
      expect(t.tileWidth).toBeGreaterThan(0);
      expect(t.tileHeight).toBeGreaterThan(0);
      expect(t.basePath).toBeTruthy();
      expect(t.placeholder).toBeTruthy();
    });

    it('night and normal texture paths are defined', () => {
      expect(CONFIG.textures.night).toBeTruthy();
      expect(CONFIG.textures.normal).toBeTruthy();
    });
  });
});
