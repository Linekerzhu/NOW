import * as THREE from 'three';
import moonVertexShader from './shaders/moon.vert';
import moonFragmentShader from './shaders/moon.frag';

const J2000_EPOCH = new Date('2000-01-01T12:00:00Z').getTime();
const MS_PER_DAY = 86400000;
const DEG2RAD = Math.PI / 180;
const textureLoader = new THREE.TextureLoader();

/**
 * Simplified lunar position and rendering.
 *
 * Orbital model (J2000-based):
 * - Mean longitude from J2000 epoch
 * - Orbital inclination: 5.14° to ecliptic
 * - Ascending node precession: ~18.6 year period
 * - Distance: scaled to earthRadius × distanceFactor for visual
 */

/**
 * Compute the Moon's position relative to Earth.
 *
 * @param {Date} date - Current time
 * @param {number} earthRadius - Earth's radius in scene units
 * @param {number} distanceFactor - distance = earthRadius × this
 * @returns {{ position: THREE.Vector3 }}
 */
function getMoonPosition(date, earthRadius, distanceFactor) {
  const daysSinceJ2000 = (date.getTime() - J2000_EPOCH) / MS_PER_DAY;

  // Moon's mean longitude
  const moonLongitude = ((218.316 + 13.176396 * daysSinceJ2000) % 360 + 360) % 360;
  const moonLongRad = moonLongitude * DEG2RAD;

  // Ascending node precession
  const ascendingNode = ((125.045 - 0.052954 * daysSinceJ2000) % 360 + 360) % 360;
  const nodeRad = ascendingNode * DEG2RAD;
  const inclination = 5.14 * DEG2RAD;

  // Position in ecliptic coordinates
  const moonDist = earthRadius * distanceFactor;
  const latEcliptic = inclination * Math.sin(moonLongRad - nodeRad);

  // Ecliptic → equatorial (obliquity 23.44°)
  const obliquity = 23.44 * DEG2RAD;

  const xEcl = moonDist * Math.cos(latEcliptic) * Math.cos(moonLongRad);
  const yEcl = moonDist * Math.cos(latEcliptic) * Math.sin(moonLongRad);
  const zEcl = moonDist * Math.sin(latEcliptic);

  // Rotate ecliptic → equatorial (Three.js Y-up, obliquity 23.44°)
  const x = xEcl;
  const y = yEcl * Math.sin(obliquity) + zEcl * Math.cos(obliquity);
  const z = yEcl * Math.cos(obliquity) - zEcl * Math.sin(obliquity);

  return {
    position: new THREE.Vector3(x, y, z),
  };
}

/**
 * Create the Moon component with custom shader (Oren-Nayar + earthshine).
 *
 * @param {object} deps
 * @param {object} deps.config - CONFIG.moon
 * @param {number} deps.earthRadius - earth radius in scene units
 * @returns {{ object3D: THREE.Mesh, update: (ctx) => void, setPosition: (date: Date) => void, dispose: () => void }}
 */
export function createMoon({ config, earthRadius, cameraPosition }) {
  const moonRadius = earthRadius * config.radiusFactor;
  const [segW, segH] = config.segments;
  const geometry = new THREE.SphereGeometry(moonRadius, segW, segH);

  const moonTexture = textureLoader.load('/textures/moon-2k.jpg');
  moonTexture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.ShaderMaterial({
    vertexShader: moonVertexShader,
    fragmentShader: moonFragmentShader,
    uniforms: {
      moonTexture: { value: moonTexture },
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
      earthPosition: { value: new THREE.Vector3(0, 0, 0) },
      cameraPos: { value: cameraPosition || new THREE.Vector3(0, 0, 30) },
      sunIntensity: { value: 1.0 },
    },
    transparent: true,
    depthWrite: false,
  });

  const object3D = new THREE.Mesh(geometry, material);

  return {
    object3D,

    /** Per-frame update — sync lighting uniforms. */
    update(ctx) {
      material.uniforms.sunDirection.value.copy(ctx.sunDirection);
      material.uniforms.sunIntensity.value = ctx.sunIntensity;
      // cameraPos is a live reference — no per-frame copy needed
    },

    /** Update moon position from current date (called periodically). */
    setPosition(date) {
      const data = getMoonPosition(date, earthRadius, config.distanceFactor);
      object3D.position.copy(data.position);
    },

    dispose() {
      geometry.dispose();
      material.dispose();
      moonTexture.dispose();
    },
  };
}

