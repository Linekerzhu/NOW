#include common/fresnel.glsl
#include common/noise.glsl

uniform vec3 sunDirection;
uniform vec3 cameraPos;
uniform float sunIntensity;
uniform float time;

uniform sampler2D specularMap;
uniform sampler2D heightMap;
uniform float seaLevel;
uniform float maxDepth;
uniform vec3 deepColor;
uniform vec3 shallowColor;
uniform float maxOpacity;

varying vec3 vNormal;
varying vec3 vWorldPosition;
varying vec2 vUv;

void main() {
  // --- Ocean mask: discard land fragments ---
  float oceanMask = texture2D(specularMap, vUv).r;
  if (oceanMask < 0.1) discard;

  vec3 N = normalize(vNormal);
  vec3 sunDir = normalize(sunDirection);
  vec3 viewDir = normalize(cameraPos - vWorldPosition);

  // --- Day/night terminator ---
  float sunDot = dot(N, sunDir);
  float terminator = smoothstep(-0.175, 0.175, sunDot);

  // --- Water depth from heightmap ---
  float terrainHeight = texture2D(heightMap, vUv).r;
  float depth = max(seaLevel - terrainHeight, 0.0);
  float depthFactor = clamp(depth / maxDepth, 0.0, 1.0);

  // --- Beer-Lambert color absorption ---
  vec3 waterColor = mix(shallowColor, deepColor, depthFactor);

  // --- Day-side lighting ---
  float diffuse = max(sunDot, 0.0);
  vec3 dayWater = waterColor * (0.6 + 0.4 * diffuse) * sunIntensity;

  // --- Night-side: very dark water ---
  vec3 nightWater = waterColor * 0.02;

  vec3 color = mix(nightWater, dayWater, terminator);

  // --- Animated wave normals ---
  float ripple1 = noise(vUv.x * 800.0 + time * 2.0) * 0.5 + 0.5;
  float ripple2 = noise(vUv.y * 600.0 - time * 1.5 + 100.0) * 0.5 + 0.5;
  vec3 waveNormal = normalize(N + vec3(ripple1 - 0.5, ripple2 - 0.5, 0.0) * 0.02);

  // --- GGX sun glint ---
  vec3 halfDir = normalize(sunDir + viewDir);
  float NdotH = max(dot(waveNormal, halfDir), 0.0);
  float VdotH = max(dot(viewDir, halfDir), 0.0);
  float NdotH2 = NdotH * NdotH;

  float a2_sharp = 0.12 * 0.12;
  float d_sharp = a2_sharp / (3.14159 * pow(NdotH2 * (a2_sharp - 1.0) + 1.0, 2.0));

  float a2_wide = 0.4 * 0.4;
  float d_wide = a2_wide / (3.14159 * pow(NdotH2 * (a2_wide - 1.0) + 1.0, 2.0));

  float F = 0.02 + 0.98 * pow(1.0 - VdotH, 5.0);

  vec3 glintColor = vec3(1.0, 0.95, 0.85);
  color += glintColor * (d_sharp * 1.8 + d_wide * 0.3) * F * terminator;

  // --- Fresnel sky reflection ---
  float viewFresnel = fresnelFactor(viewDir, N);
  float fresnel = pow(viewFresnel, 4.0);
  vec3 skyColor = vec3(0.15, 0.25, 0.45);
  color += skyColor * fresnel * terminator * 0.3;

  // --- Opacity: transparent in shallows, opaque in deep water ---
  float alpha = mix(0.3, maxOpacity, depthFactor) * oceanMask;

  gl_FragColor = vec4(color, alpha);
}
