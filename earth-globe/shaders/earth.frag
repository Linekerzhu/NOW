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

varying vec3 vNormal;
varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec3 vTangent;
varying vec3 vBitangent;

void main() {
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

  // --- Boost city lights with gradual transition ---
  float cityBrightness = max(nightColor.r, max(nightColor.g, nightColor.b));
  float glowFactor = smoothstep(0.05, 0.5, cityBrightness);
  nightColor *= 2.0;
  nightColor += vec3(1.0, 0.8, 0.4) * glowFactor * 0.4;

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
  color += vec3(0.04, 0.06, 0.14) * blueHourBand;

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
  color += vec3(0.003, 0.004, 0.008) * nightAmount;

  // Earthshine: faint bluish fill light on night-side (reflected sunlight from atmosphere)
  float earthshineFresnel = pow(fresnelFactor(viewDir, N), 3.0);
  color += vec3(0.008, 0.012, 0.025) * nightAmount * (0.4 + earthshineFresnel * 0.6);

  // === AIRGLOW ===
  float viewFresnel = fresnelFactor(viewDir, N);
  float airglowMask = pow(viewFresnel, 6.0);
  float nightEdge = smoothstep(0.05, -0.25, sunDot);
  vec3 airglowColor = vec3(0.03, 0.08, 0.03);
  color += airglowColor * airglowMask * nightEdge * 0.3;

  // --- Twilight warm atmospheric scattering ---
  float twilightBand = smoothstep(-0.2, 0.0, sunDot) * smoothstep(0.2, 0.0, sunDot);
  color += vec3(0.15, 0.08, 0.03) * twilightBand;

  // === OCEAN SUN GLINT ===
  float luminance = dot(dayColor, vec3(0.299, 0.587, 0.114));
  float blueRatio = dayColor.b / (luminance + 0.01);
  float oceanMask = smoothstep(0.18, 0.08, luminance) * smoothstep(1.1, 1.5, blueRatio);

  // Darken ocean base for contrast with specular
  color *= mix(1.0, 0.85, oceanMask * terminator);

  // Animated micro-ripple: subtle normal perturbation in ocean areas
  float ripple1 = noise(vUv.x * 800.0 + time * 2.0) * 0.5 + 0.5;
  float ripple2 = noise(vUv.y * 600.0 - time * 1.5 + 100.0) * 0.5 + 0.5;
  vec3 rippleNormal = normalize(perturbedNormal + vec3(ripple1 - 0.5, ripple2 - 0.5, 0.0) * 0.015 * oceanMask);

  vec3 halfDir = normalize(sunDir + viewDir);
  float specAngle = max(dot(rippleNormal, halfDir), 0.0);
  float specular = pow(specAngle, 150.0);
  float specularMid = pow(specAngle, 40.0);
  float specularWide = pow(specAngle, 12.0);

  vec3 glintColor = vec3(1.0, 0.95, 0.85);
  color += glintColor * (specular * 1.5 + specularMid * 0.35 + specularWide * 0.08) * oceanMask * terminator;

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

  gl_FragColor = vec4(color, 1.0);
}
