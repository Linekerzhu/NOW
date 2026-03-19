import * as THREE from 'three';
import starsVertexShader from './shaders/stars.vert';
import starsFragmentShader from './shaders/stars.frag';

const textureLoader = new THREE.TextureLoader();

/**
 * Creates a rich space background:
 * - A textured sky sphere with NASA Tycho star map (real Milky Way)
 * - Twinkling star points using a custom shader
 *
 * @param {object} deps
 * @param {object} deps.config - CONFIG.stars
 * @returns {{ object3D: THREE.Group, update: (ctx) => void, dispose: () => void }}
 */
export function createStars({ config }) {
  const group = new THREE.Group();

  // --- Layer 1: Milky Way sky sphere ---
  const skyGeometry = new THREE.SphereGeometry(config.skyRadius, ...config.skySegments);
  const skyTexture = textureLoader.load('/textures/milkyway-4k.jpg');
  skyTexture.colorSpace = THREE.SRGBColorSpace;

  const skyMaterial = new THREE.MeshBasicMaterial({
    map: skyTexture,
    side: THREE.BackSide,
    transparent: true,
    opacity: config.skyOpacity,
    depthWrite: false,
  });

  const skySphere = new THREE.Mesh(skyGeometry, skyMaterial);
  skySphere.rotation.x = Math.PI * 0.15;
  skySphere.rotation.z = Math.PI * 0.1;
  group.add(skySphere);

  // --- Star layers from config ---
  for (const layer of config.layers) {
    group.add(createTwinklingStars(layer));
  }

  return {
    object3D: group,

    update(ctx) {
      // children[0] = skySphere (MeshBasicMaterial, no uniforms)
      // children[1..N] = twinkling star layers (ShaderMaterial with time uniform)
      for (let i = 1; i < group.children.length; i++) {
        group.children[i].material.uniforms.time.value = ctx.time;
      }
    },

    dispose() {
      skyGeometry.dispose();
      skyMaterial.dispose();
      skyTexture.dispose();
      for (let i = 1; i < group.children.length; i++) {
        group.children[i].geometry.dispose();
        group.children[i].material.dispose();
      }
    },
  };
}

/**
 * Create twinkling star points using a custom shader.
 * Each star has a unique phase offset for organic-feeling animation.
 */
function createTwinklingStars({ count, radiusMin, radiusMax, sizeBase, brightness }) {
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);      // unique phase offset per star
  const speeds = new Float32Array(count);      // twinkle speed per star
  const baseSizes = new Float32Array(count);   // size variation per star
  const colors = new Float32Array(count * 3);  // per-star color temperature

  // Color temperature palette: cool blue → white → warm yellow/orange
  const starColors = [
    [0.7, 0.8, 1.0],   // O/B class: blue-white
    [0.85, 0.9, 1.0],  // A class: blue-white
    [1.0, 1.0, 1.0],   // F class: white
    [1.0, 0.95, 0.85],  // G class: yellow (sun-like)
    [1.0, 0.85, 0.6],  // K class: orange
    [1.0, 0.7, 0.4],   // M class: red-orange
  ];

  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = radiusMin + Math.random() * (radiusMax - radiusMin);

    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    phases[i] = Math.random() * Math.PI * 2;
    speeds[i] = 0.3 + Math.random() * 1.2;
    baseSizes[i] = sizeBase * (0.6 + Math.random() * 0.8);

    // Random spectral class — weighted toward white/yellow (realistic distribution)
    const rnd = Math.random();
    let c;
    if (rnd < 0.08) c = starColors[0];       // 8% blue
    else if (rnd < 0.18) c = starColors[1];  // 10% blue-white
    else if (rnd < 0.40) c = starColors[2];  // 22% white
    else if (rnd < 0.65) c = starColors[3];  // 25% yellow
    else if (rnd < 0.85) c = starColors[4];  // 20% orange
    else c = starColors[5];                   // 15% red-orange

    colors[i * 3]     = c[0];
    colors[i * 3 + 1] = c[1];
    colors[i * 3 + 2] = c[2];
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(baseSizes, 1));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      brightness: { value: brightness },
    },
    vertexShader: starsVertexShader,
    fragmentShader: starsFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return new THREE.Points(geometry, material);
}
