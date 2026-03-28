#include common/fresnel.glsl
#include common/noise.glsl

uniform sampler2D dayTexture;
uniform sampler2D nightTexture;
uniform sampler2D normalMap;
uniform sampler2D cloudTexture;
uniform vec3 sunDirection;
uniform vec3 cameraPos;
uniform float ambientDim;
uniform float normalStrength;
uniform float sunIntensity;
uniform float cloudUVOffset;
uniform float time;
uniform float twilightIntensity;
uniform float blueHourIntensity;
uniform float nightBrightness;
uniform float cityLightBoost;
uniform sampler2D specularMap;
uniform float hasSpecularMap;

// --- Regional LOD overlays ---
uniform sampler2D regionDayTex1;       // Shanghai high-res day
uniform sampler2D regionDayTex2;       // Jinshan high-res day
uniform vec4 regionBounds1;            // Shanghai: vec4(u_min, v_min, u_max, v_max)
uniform vec4 regionBounds2;            // Jinshan: vec4(u_min, v_min, u_max, v_max)
uniform float regionOpacity1;          // 0.0 = disabled, 1.0 = full overlay
uniform float regionOpacity2;

varying vec3 vNormal;
varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec3 vTangent;
varying vec3 vBitangent;

/**
 * Sample a regional overlay texture with edge feathering.
 * Always performs the texture lookup (GPU requires uniform flow for samplers).
 * Returns vec4(color, blendWeight).
 */
vec4 sampleRegion(sampler2D regionTex, vec4 bounds, float opacity, vec2 uv) {
  // Remap UV to [0,1] within the regional bounds (always compute, even if outside)
  vec2 regionUV = clamp((uv - bounds.xy) / (bounds.zw - bounds.xy), 0.0, 1.0);

  // Always sample the texture (GPU requires this outside conditionals)
  vec3 color = texture2D(regionTex, regionUV).rgb;

  // Check if UV is within bounds
  float inU = step(bounds.x, uv.x) * step(uv.x, bounds.z);
  float inV = step(bounds.y, uv.y) * step(uv.y, bounds.w);
  float inside = inU * inV;

  // Edge feathering: 8% of each edge fades smoothly
  float feather = 0.08;
  float fadeL = smoothstep(0.0, feather, regionUV.x);
  float fadeR = smoothstep(0.0, feather, 1.0 - regionUV.x);
  float fadeT = smoothstep(0.0, feather, regionUV.y);
  float fadeB = smoothstep(0.0, feather, 1.0 - regionUV.y);
  float edgeFade = fadeL * fadeR * fadeT * fadeB;

  float weight = inside * edgeFade * opacity;
  return vec4(color, weight);
}

void main() {
  // Force ALL sampler2D uniforms to be "alive" to prevent GLSL dead-code
  // elimination, which would cause Three.js to not assign texture units.
  // The 0.0001 factor makes the contribution invisible but the compiler
  // cannot prove it's zero (it depends on texture content).
  float _keepAlive = 0.0;
  _keepAlive += texture2D(regionDayTex1, vec2(0.5)).r * 0.0001;
  _keepAlive += texture2D(regionDayTex2, vec2(0.5)).r * 0.0001;
  _keepAlive += texture2D(specularMap, vec2(0.5)).r * 0.0001;

  vec3 N = normalize(vNormal);
  vec3 T = normalize(vTangent);
  vec3 B = normalize(vBitangent);
  vec3 sunDir = normalize(sunDirection);
  vec3 viewDir = normalize(cameraPos - vWorldPosition);

  // --- Normal map perturbation ---
  vec3 normalSample = texture2D(normalMap, vUv).rgb * 2.0 - 1.0;
  normalSample.xy *= normalStrength;
  vec3 perturbedNormal = normalize(T * normalSample.x + B * normalSample.y + N * normalSample.z);

  float sunDot = dot(N, sunDir);
  float sunDotBumped = dot(perturbedNormal, sunDir);

  // --- Sample textures ---
  vec3 dayColor = texture2D(dayTexture, vUv).rgb;
  vec3 nightColor = texture2D(nightTexture, vUv).rgb;

  // --- Regional LOD overlay (day only) ---
  vec4 r1 = sampleRegion(regionDayTex1, regionBounds1, regionOpacity1, vUv);
  if (r1.a > 0.01) {
    dayColor = mix(dayColor, r1.rgb, r1.a);
  }
  vec4 r2 = sampleRegion(regionDayTex2, regionBounds2, regionOpacity2, vUv);
  if (r2.a > 0.01) {
    dayColor = mix(dayColor, r2.rgb, r2.a);
  }

  // --- Boost city lights with gradual transition ---
  float cityBrightness = max(nightColor.r, max(nightColor.g, nightColor.b));
  float glowFactor = smoothstep(0.05, 0.5, cityBrightness);
  nightColor *= 2.0 * cityLightBoost;
  nightColor += vec3(1.0, 0.8, 0.4) * glowFactor * 0.4 * cityLightBoost;

  // === ATMOSPHERIC REFRACTION ===
  float refractionOffset = 0.015;

  // === SUN ANGULAR DIAMETER ===
  float penumbraWidth = 0.01;

  // Terminator with refraction + penumbra
  float termLow  = -0.15 - refractionOffset - penumbraWidth;
  float termHigh =  0.15 + penumbraWidth;
  float terminator = smoothstep(termLow, termHigh, sunDot);

  // --- City light gradual transition ---
  float civilTwilight = smoothstep(-0.12, -0.02, sunDot);
  float cityDim = mix(1.0, 0.15, civilTwilight);
  vec3 color = mix(nightColor * cityDim, dayColor, terminator);

  // === BLUE HOUR BAND ===
  // The blue hour occurs between civil and nautical twilight (-6° to -12° solar altitude)
  float blueHourBand = smoothstep(-0.22, -0.10, sunDot) * smoothstep(-0.03, -0.10, sunDot);
  color += vec3(0.04, 0.06, 0.14) * blueHourBand * blueHourIntensity;

  // --- Day-side diffuse with normal map ---
  float diffuse = max(sunDotBumped, 0.0);
  color *= mix(1.0, 0.7 + 0.3 * diffuse, terminator);

  // Apply orbital eccentricity
  color *= mix(1.0, sunIntensity, terminator);

  // === CLOUD SHADOWS ===
  float cloudHeight = 0.003;

  float sunTangent = dot(sunDir, T);
  float sunBitangent = dot(sunDir, B);
  vec2 shadowOffset = vec2(-sunTangent, -sunBitangent) * cloudHeight;

  float cloudDensity = texture2D(cloudTexture, vec2(fract(vUv.x - cloudUVOffset), vUv.y) + shadowOffset).r;

  float shadowStrength = cloudDensity * 0.20 * terminator;
  color *= (1.0 - shadowStrength);

  // --- Night ambient illumination + earthshine ---
  float nightAmount = 1.0 - terminator;
  color += vec3(0.003, 0.004, 0.008) * nightAmount * nightBrightness;

  // Earthshine: faint bluish fill light on night-side (reflected sunlight from atmosphere)
  float earthshineFresnel = pow(fresnelFactor(viewDir, N), 3.0);
  color += vec3(0.008, 0.012, 0.025) * nightAmount * (0.4 + earthshineFresnel * 0.6) * nightBrightness;

  // === AIRGLOW ===
  float viewFresnel = fresnelFactor(viewDir, N);
  float airglowMask = pow(viewFresnel, 6.0);
  float nightEdge = smoothstep(0.05, -0.25, sunDot);
  // Airglow: subtle blue-green, less green-dominant to avoid green edge artifacts
  vec3 airglowColor = vec3(0.02, 0.05, 0.04);
  color += airglowColor * airglowMask * nightEdge * 0.25;

  // --- Twilight warm atmospheric scattering ---
  float twilightBand = smoothstep(-0.2, 0.0, sunDot) * smoothstep(0.2, 0.0, sunDot);
  color += vec3(0.15, 0.08, 0.03) * twilightBand * twilightIntensity;

  // === OCEAN SUN GLINT ===
  float oceanMask;
  if (hasSpecularMap > 0.5) {
    // Soften the binary specular map at coastlines to avoid harsh edges
    float rawSpec = texture2D(specularMap, vUv).r;
    oceanMask = smoothstep(0.1, 0.5, rawSpec);
  } else {
    float luminance = dot(dayColor, vec3(0.299, 0.587, 0.114));
    float blueRatio = dayColor.b / (luminance + 0.01);
    oceanMask = smoothstep(0.18, 0.08, luminance) * smoothstep(1.1, 1.5, blueRatio);
  }

  // Subtle ocean darkening for specular contrast (0.92 = gentle)
  color *= mix(1.0, 0.92, oceanMask * terminator);

  // Animated micro-ripple: subtle normal perturbation in ocean areas
  float ripple1 = noise(vUv.x * 800.0 + time * 2.0) * 0.5 + 0.5;
  float ripple2 = noise(vUv.y * 600.0 - time * 1.5 + 100.0) * 0.5 + 0.5;
  vec3 rippleNormal = normalize(perturbedNormal + vec3(ripple1 - 0.5, ripple2 - 0.5, 0.0) * 0.015 * oceanMask);

  vec3 halfDir = normalize(sunDir + viewDir);
  float NdotH = max(dot(rippleNormal, halfDir), 0.0);
  float VdotH = max(dot(viewDir, halfDir), 0.0);

  // GGX (Trowbridge-Reitz) NDF — two roughness layers for realistic sun glint
  // Sharp core (roughness 0.12) + wide haze (roughness 0.4) for natural falloff
  float NdotH2 = NdotH * NdotH;

  float a2_sharp = 0.12 * 0.12;
  float d_sharp = a2_sharp / (3.14159 * pow(NdotH2 * (a2_sharp - 1.0) + 1.0, 2.0));

  float a2_wide = 0.4 * 0.4;
  float d_wide = a2_wide / (3.14159 * pow(NdotH2 * (a2_wide - 1.0) + 1.0, 2.0));

  // Schlick Fresnel for water (IOR 1.33 → F0 = 0.02)
  float F = 0.02 + 0.98 * pow(1.0 - VdotH, 5.0);

  vec3 glintColor = vec3(1.0, 0.95, 0.85);
  color += glintColor * (d_sharp * 1.8 + d_wide * 0.3) * F * oceanMask * terminator;

  // Fresnel-boosted ocean sky reflection
  float oceanFresnel = pow(fresnelFactor(viewDir, N), 4.0);
  vec3 skyReflectColor = vec3(0.15, 0.25, 0.45);
  color += skyReflectColor * oceanFresnel * oceanMask * terminator * 0.25;

  // --- Fresnel rim ---
  color += vec3(0.12, 0.18, 0.28) * pow(viewFresnel, 4.0) * terminator * 0.3;

  // --- Day-side dimming + cool ---
  float dimFactor = mix(1.0, 1.0 - ambientDim, terminator);
  color *= dimFactor;
  color = mix(color, color * vec3(0.93, 0.96, 1.0), terminator * 0.2);

  gl_FragColor = vec4(color + _keepAlive, 1.0);
}
