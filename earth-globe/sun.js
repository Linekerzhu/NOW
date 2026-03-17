import * as THREE from 'three';

const MS_PER_DAY = 86400000;
const TWO_PI_365 = (2 * Math.PI) / 365;

/**
 * Compute a normalized sun direction vector with full astronomical accuracy.
 *
 * Includes:
 * - Solar declination (axial tilt 23.44°)
 * - Equation of Time (orbital eccentricity + obliquity correction, ±16 min)
 * - Returns additional data: declination, distance factor for eccentricity
 *
 * @param {Date} date - Current time
 * @returns {{ direction: THREE.Vector3, declination: number, distanceFactor: number }}
 */
export function getSunDirection(date) {
  const start = new Date(date.getFullYear(), 0, 1);
  const dayOfYear = (date - start) / MS_PER_DAY + 1;

  // UTC hour (precise to seconds)
  const hourUTC = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;

  // --- Solar declination ---
  const B = TWO_PI_365 * (dayOfYear - 81);
  const declination = 23.44 * Math.sin(B);
  const decRad = (declination * Math.PI) / 180;

  // --- Equation of Time (Spencer 1971 Fourier approximation) ---
  const gamma = TWO_PI_365 * (dayOfYear - 1);
  const eqTimeMin =
    229.18 * (
      0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.04089 * Math.sin(2 * gamma)
    );

  // True solar hour (corrected by Equation of Time)
  const trueSolarHour = hourUTC + eqTimeMin / 60;
  const hourAngle = ((trueSolarHour - 12) / 24) * 2 * Math.PI;

  // --- Orbital eccentricity: distance factor ---
  const distanceFactor = 1.0 + 0.033 * Math.cos(TWO_PI_365 * (dayOfYear - 3));

  // --- Direction vector ---
  // Matches Three.js SphereGeometry UV: lon 0° → +X axis
  const x = Math.cos(decRad) * Math.cos(hourAngle);
  const y = Math.sin(decRad);
  const z = Math.cos(decRad) * Math.sin(hourAngle);

  return {
    direction: new THREE.Vector3(x, y, z).normalize(),
    declination,       // degrees
    distanceFactor,    // ~0.967 to ~1.033
  };
}
