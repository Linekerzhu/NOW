import { describe, it, expect } from 'vitest';
import { geoToSphere, getSurfaceNormal, isPointFacingCamera, EARTH_RADIUS } from './geo.js';
import * as THREE from 'three';

describe('geoToSphere', () => {
  it('maps lon 0° lat 0° to +X axis (matches sun.js convention)', () => {
    const v = geoToSphere(0, 0);
    expect(v.x).toBeCloseTo(EARTH_RADIUS, 5);
    expect(v.y).toBeCloseTo(0, 5);
    expect(v.z).toBeCloseTo(0, 5);
  });

  it('maps north pole (lat 90°) to +Y axis', () => {
    const v = geoToSphere(90, 0);
    expect(v.x).toBeCloseTo(0, 4);
    expect(v.y).toBeCloseTo(EARTH_RADIUS, 5);
    expect(v.z).toBeCloseTo(0, 4);
  });

  it('maps lon 90°E to -Z axis (Three.js SphereGeometry convention)', () => {
    const v = geoToSphere(0, 90);
    expect(v.x).toBeCloseTo(0, 4);
    expect(v.y).toBeCloseTo(0, 5);
    expect(v.z).toBeCloseTo(-EARTH_RADIUS, 5);
  });

  it('maps lon 180° to -X axis', () => {
    const v = geoToSphere(0, 180);
    expect(v.x).toBeCloseTo(-EARTH_RADIUS, 4);
    expect(v.y).toBeCloseTo(0, 5);
    expect(v.z).toBeCloseTo(0, 4);
  });

  it('returns vector with correct length', () => {
    const v = geoToSphere(39.9, 116.4);
    expect(v.length()).toBeCloseTo(EARTH_RADIUS, 5);
  });

  it('returns correct length with custom radius', () => {
    const r = 5;
    const v = geoToSphere(39.9, 116.4, r);
    expect(v.length()).toBeCloseTo(r, 5);
  });

  it('maps Beijing (39.9°N, 116.4°E) to correct quadrant (X<0, Y>0, Z<0)', () => {
    // Beijing: lon > 90° → X should be negative (cos(116.4°) < 0)
    // lat > 0° → Y should be positive
    // lon > 0° → Z should be negative (Three.js convention: east → -Z)
    const v = geoToSphere(39.9, 116.4);
    expect(v.x).toBeLessThan(0);
    expect(v.y).toBeGreaterThan(0);
    expect(v.z).toBeLessThan(0);
  });

  it('maps Shanghai (31.23°N, 121.47°E) to similar quadrant as Beijing but lower Y', () => {
    const beijing = geoToSphere(39.9, 116.4);
    const shanghai = geoToSphere(31.23, 121.47);
    // Shanghai is south of Beijing → lower Y
    expect(shanghai.y).toBeLessThan(beijing.y);
    // Both in same hemisphere quadrant (X<0, Z<0 for eastern Asia)
    expect(shanghai.x).toBeLessThan(0);
    expect(shanghai.z).toBeLessThan(0);
  });
});

describe('getSurfaceNormal', () => {
  it('returns a unit vector', () => {
    const n = getSurfaceNormal(39.9, 116.4);
    expect(n.length()).toBeCloseTo(1.0, 5);
  });

  it('points in same direction as geoToSphere', () => {
    const pos = geoToSphere(39.9, 116.4);
    const normal = getSurfaceNormal(39.9, 116.4);
    const posNormed = pos.clone().normalize();
    expect(normal.x).toBeCloseTo(posNormed.x, 5);
    expect(normal.y).toBeCloseTo(posNormed.y, 5);
    expect(normal.z).toBeCloseTo(posNormed.z, 5);
  });
});

describe('isPointFacingCamera', () => {
  it('returns true when point faces camera', () => {
    const worldPos = new THREE.Vector3(EARTH_RADIUS, 0, 0);
    const camera = { position: new THREE.Vector3(30, 0, 0) };
    expect(isPointFacingCamera(worldPos, camera)).toBe(true);
  });

  it('returns false when point is on far side from camera', () => {
    const worldPos = new THREE.Vector3(-EARTH_RADIUS, 0, 0);
    const camera = { position: new THREE.Vector3(30, 0, 0) };
    expect(isPointFacingCamera(worldPos, camera)).toBe(false);
  });

  it('returns false for points near the limb (dot < 0.15)', () => {
    // Point nearly perpendicular to camera direction
    const worldPos = new THREE.Vector3(0, EARTH_RADIUS, 0);
    const camera = { position: new THREE.Vector3(30, 0, 0) };
    expect(isPointFacingCamera(worldPos, camera)).toBe(false);
  });
});
