import { describe, it, expect } from 'vitest';
import { getSunDirection } from './sun.js';

describe('getSunDirection', () => {
  it('returns a normalized direction vector', () => {
    const result = getSunDirection(new Date('2024-06-21T12:00:00Z'));
    const len = result.direction.length();
    expect(len).toBeCloseTo(1.0, 5);
  });

  it('has maximum positive declination near summer solstice', () => {
    const result = getSunDirection(new Date('2024-06-21T12:00:00Z'));
    // Summer solstice: declination ≈ +23.44°
    expect(result.declination).toBeGreaterThan(20);
    expect(result.declination).toBeLessThan(24);
  });

  it('has maximum negative declination near winter solstice', () => {
    const result = getSunDirection(new Date('2024-12-21T12:00:00Z'));
    // Winter solstice: declination ≈ -23.44°
    expect(result.declination).toBeLessThan(-20);
    expect(result.declination).toBeGreaterThan(-24);
  });

  it('has near-zero declination near equinox', () => {
    const result = getSunDirection(new Date('2024-03-20T12:00:00Z'));
    expect(Math.abs(result.declination)).toBeLessThan(3);
  });

  it('distance factor is near 1.0', () => {
    const result = getSunDirection(new Date('2024-07-04T12:00:00Z'));
    // Aphelion (~July 4): distance factor slightly < 1
    expect(result.distanceFactor).toBeGreaterThan(0.96);
    expect(result.distanceFactor).toBeLessThan(1.04);
  });

  it('perihelion has higher distance factor than aphelion', () => {
    const perihelionFactor = getSunDirection(new Date('2024-01-03T12:00:00Z')).distanceFactor;
    const aphelionFactor = getSunDirection(new Date('2024-07-04T12:00:00Z')).distanceFactor;
    expect(perihelionFactor).toBeGreaterThan(aphelionFactor);
  });

  it('sun is roughly in +X direction at noon UTC', () => {
    const result = getSunDirection(new Date('2024-03-20T12:00:00Z'));
    // At noon UTC near equinox, sun should be roughly at +X (lon 0°)
    expect(result.direction.x).toBeGreaterThan(0.8);
  });
});
