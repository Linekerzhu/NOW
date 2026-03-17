import * as THREE from 'three';
import sunVertexShader from './shaders/sun.vert';
import sunFragmentShader from './shaders/sun.frag';

/**
 * Photorealistic sun using a GPU shader.
 *
 * Strategy: render a VERY bright (HDR) core and let the UnrealBloomPass
 * create the natural glow/halo organically — exactly like a real camera
 * capturing an overexposed star.
 *
 * Key design:
 * - depthTest: TRUE so the earth's geometry naturally occludes the halo
 * - Circular discard to avoid square-plane artifacts
 * - Billboard rotation every frame to always face camera
 */

/**
 * Create a photorealistic sun component.
 *
 * @param {object} deps
 * @param {object} deps.config - CONFIG.sun
 * @param {number} deps.earthRadius - for occlusion calculation
 * @returns {import('./types.js').Component}
 */
export function createSun({ config, earthRadius }) {
  const group = new THREE.Group();
  const sunDist = config.distance;
  const baseIntensity = config.intensity;
  const occlusionMargin = config.occlusionMargin;

  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.ShaderMaterial({
    vertexShader: sunVertexShader,
    fragmentShader: sunFragmentShader,
    uniforms: {
      intensity: { value: baseIntensity },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,   // Earth occludes the halo naturally via depth buffer
    side: THREE.DoubleSide,
  });

  const sunMesh = new THREE.Mesh(geometry, material);
  sunMesh.scale.set(config.scale, config.scale, 1);
  // Render after earth/clouds/atmosphere so depth is already written
  sunMesh.renderOrder = 10;
  group.add(sunMesh);

  // Pre-allocated temp vectors — avoids per-frame garbage
  const _tmpSunPos = new THREE.Vector3();
  const _tmpCamToOrigin = new THREE.Vector3();
  const _tmpCamToSun = new THREE.Vector3();

  const object3D = group;

  return {
    object3D,

    /**
     * Per-frame update: billboard + position + occlusion fade.
     */
    update(ctx) {
      // Move sun
      _tmpSunPos.copy(ctx.sunDirection).multiplyScalar(sunDist);
      group.position.copy(_tmpSunPos);

      // Billboard: face camera
      sunMesh.lookAt(ctx.camera.position);

      // --- Visibility: fade when behind earth ---
      const cameraPos = ctx.camera.position;
      _tmpCamToOrigin.copy(cameraPos).negate().normalize();
      _tmpCamToSun.copy(group.position).sub(cameraPos).normalize();

      const distToEarth = cameraPos.length();
      const angularRadius = Math.asin(Math.min(earthRadius / distToEarth, 1.0));
      const angle = Math.acos(THREE.MathUtils.clamp(_tmpCamToOrigin.dot(_tmpCamToSun), -1, 1));

      // Smooth fade near earth's limb
      const visibility = THREE.MathUtils.smoothstep(
        angle,
        angularRadius - occlusionMargin,
        angularRadius + occlusionMargin * 2,
      );

      material.uniforms.intensity.value = baseIntensity * visibility;
      group.visible = visibility > 0.001;
    },

    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
