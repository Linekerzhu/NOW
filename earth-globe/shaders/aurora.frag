#include common/fresnel.glsl
#include common/noise.glsl

uniform vec3 sunDirection;
uniform float time;
uniform vec3 cameraPos;

varying vec3 vNormal;
varying vec3 vWorldPosition;
varying vec2 vUv;
varying float vLatitude;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 sunDir = normalize(sunDirection);
  vec3 viewDir = normalize(cameraPos - vWorldPosition);

  // --- Aurora latitude band ---
  float absLat = abs(vLatitude);
  float longitude = vUv.x * 6.283185;  // 0 to 2π

  // Wobble the band edge with noise for organic shape
  float bandWobble = noise(longitude * 4.0 + time * 0.2) * 0.03;

  // Aurora band mask: strongest at ~70° (sin 70° = 0.94)
  float bandCenter = 0.94;
  float bandWidth = 0.10;
  float latMask = exp(-pow((absLat - bandCenter + bandWobble) / bandWidth, 2.0));

  // Weaker aurora down to ~60° during "storms"
  float outerBand = exp(-pow((absLat - 0.88 + bandWobble) / 0.08, 2.0)) * 0.2;
  latMask = max(latMask, outerBand);

  // --- Night-side only ---
  float sunDot = dot(normal, sunDir);
  float nightMask = smoothstep(0.0, -0.15, sunDot);

  // --- Aurora curtain animation ---
  float latNoise = absLat * 25.0;
  float curtain1 = noise2D(longitude * 3.0 + time * 0.5, latNoise) * 0.5 + 0.5;
  float curtain2 = noise2D(longitude * 5.0 - time * 0.3 + 100.0, latNoise * 1.3) * 0.5 + 0.5;
  float curtain3 = noise2D(longitude * 8.0 + time * 0.7 + 200.0, latNoise * 0.7) * 0.5 + 0.5;

  float curtainPattern = curtain1 * 0.5 + curtain2 * 0.3 + curtain3 * 0.2;
  curtainPattern = smoothstep(0.15, 0.85, curtainPattern);

  // --- Color: green dominant with purple/red upper fringes ---
  vec3 auroraGreen = vec3(0.1, 0.9, 0.3);
  vec3 auroraCyan = vec3(0.1, 0.6, 0.5);
  vec3 auroraPurple = vec3(0.5, 0.1, 0.7);
  vec3 auroraRed = vec3(0.8, 0.12, 0.15);

  float heightFade = smoothstep(0.88, 0.98, absLat);
  // Mix: green → cyan → purple → red at increasing altitude
  vec3 auroraColor = mix(auroraGreen, auroraCyan, heightFade * 0.3);
  auroraColor = mix(auroraColor, auroraPurple, heightFade * 0.6);
  auroraColor = mix(auroraColor, auroraRed, pow(heightFade, 2.0) * 0.4);

  // --- Fresnel for edge visibility ---
  float fresnel = fresnelFactor(viewDir, normal);
  fresnel = pow(fresnel, 1.5);
  float edgeBoost = mix(0.4, 1.0, fresnel);

  // --- Composite ---
  float alpha = latMask * nightMask * curtainPattern * edgeBoost * 0.35;

  if (alpha < 0.005) discard;

  gl_FragColor = vec4(auroraColor * (0.8 + curtainPattern * 0.4), alpha);
}
