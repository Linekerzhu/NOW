/**
 * Centralized configuration for the Earth globe project.
 * All visual and physical parameters in one place for easy tuning.
 */

export const CONFIG = {
  earth: {
    radius: 10,
    segments: [96, 48],
    oblateness: 0.9966,
    ambientDim: 0.12,
    normalStrength: 4.0,
  },

  clouds: {
    opacity: 0.35,
    heightFactor: 1.005,
    driftSpeed: 0.00002,
    segments: [96, 48],
  },

  atmosphere: {
    heightFactor: 1.035,
    segments: [96, 48],
  },

  aurora: {
    heightFactor: 1.025,
    segments: [96, 48],
  },

  stars: {
    skyRadius: 400,
    skySegments: [64, 32],
    skyOpacity: 0.6,
    layers: [
      { count: 2000, radiusMin: 180, radiusMax: 350, sizeBase: 0.5, brightness: 0.5 },
      { count: 150, radiusMin: 150, radiusMax: 300, sizeBase: 1.2, brightness: 0.9 },
      { count: 4000, radiusMin: 160, radiusMax: 380, sizeBase: 0.3, brightness: 0.18 },
    ],
  },

  sun: {
    distance: 200,
    intensity: 5.0,
    scale: 18,
    occlusionMargin: 0.05,
  },

  moon: {
    distanceFactor: 8,
    radiusFactor: 0.27,
    segments: [32, 16],
  },

  camera: {
    distance: 28,
    fov: 45,
    orbitSpeed: 0.0001,
    driftAmplitude: 0.3,
    driftSpeed: 0.001,
    initialHeight: 6,
    distanceScale: 0.96,
    sunAngleOffset: Math.PI * 0.39,
  },

  bloom: {
    strength: 0.55,
    radius: 0.45,
    threshold: 0.65,
  },

  lighting: {
    sunColor: 0xffeedd,
    sunIntensityFactor: 1.5,
    sunLightDistance: 100,
    ambientColor: 0xffffff,
    ambientIntensity: 0.03,
  },

  renderer: {
    toneMappingExposure: 1.15,
  },

  animation: {
    timeModulo: 20000,
    sunUpdateInterval: 60000,
  },

  loading: {
    fallbackTimeout: 15000,
    fadeOutDuration: 1600,
  },
};
