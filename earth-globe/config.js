/**
 * Centralized configuration for the Earth globe project.
 * All visual and physical parameters in one place for easy tuning.
 */

export const CONFIG = {
  earth: {
    radius: 10,
    segments: [512, 256],
    oblateness: 0.9966,
    ambientDim: 0.08,
    normalStrength: 2.3,
    displacementScale: 0.015,
  },

  clouds: {
    opacity: 0.1,
    nightCloudOpacity: 0.88,
    heightFactor: 1.012,
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
    toneMappingExposure: 1.0,
  },

  animation: {
    timeModulo: 20000,
    sunUpdateInterval: 60000,
  },

  loading: {
    fallbackTimeout: 15000,
    fadeOutDuration: 1600,
  },

  weather: {
    enabled: false,              // manual-only: use GUI '☁️ Weather Data → enabled' or 'refresh now'
    refreshInterval: 30 * 60000,  // 30 minutes
    gridResolution: 30,           // degrees between sample points
    textureWidth: 512,
    textureHeight: 256,
    blurRadius: 12,
    contrast: 1.2,
    noiseStrength: 0.15,
    noiseScale: 4.0,
  },

  textures: {
    dayTiles: {
      basePath: '/textures/tiles/earth-day-16k',
      cols: 4,
      rows: 2,
      tileWidth: 5400,
      tileHeight: 5400,
      placeholder: '/textures/earth-day-8k.jpg',
    },
    night: '/textures/earth-night-8k.jpg',
    normal: '/textures/earth-normal-2k.jpg',
    clouds: '/textures/earth-clouds-2k.jpg',
    heightmap: '/textures/earth-topo-5400x2700.jpg',
  },

  earthSurface: {
    twilightIntensity: 0.42,
    blueHourIntensity: 0.16,
    nightBrightness: 0.53,
    cityLightBoost: 0.75,
  },


  presets: {
    animationDuration: 2000,          // ms for camera transition

    oneWorld: {
      label: '🌍 寰宇一家',
      longitude: null,                // null = follow sun position
      elevation: 12.6,
      distance: 27.5,
      focalLength: null,              // null = use default (from camera.fov)
      latitudeOffset: 0,
      autoRotate: true,
      autoRotateSpeed: 0.3,
    },
    chinaGrid: {
      label: '⚡ 今日国网',
      longitude: 105,                 // °E — central China
      elevation: -23.4,
      distance: 14.8,
      focalLength: 37,
      latitudeOffset: 8.5,
      autoRotate: false,
      autoRotateSpeed: 0.3,
    },
    shanghai: {
      label: '🏙️ 今日上海',
      longitude: 121.5,              // °E — Shanghai
      elevation: 46.7,
      distance: 14.3,
      focalLength: 200,
      latitudeOffset: -3.9,
      autoRotate: false,
      autoRotateSpeed: 0.3,
    },
  },
};
