uniform sampler2D moonTexture;
uniform vec3 sunDirection;
uniform vec3 earthPosition;
uniform float sunIntensity;

varying vec3 vNormal;
varying vec2 vUv;
varying vec3 vWorldPosition;

void main() {
  vec3 N = normalize(vNormal);
  vec3 sunDir = normalize(sunDirection);

  // Sample lunar surface texture
  vec3 surfaceColor = texture2D(moonTexture, vUv).rgb;

  // === OREN-NAYAR DIFFUSE ===
  // Lunar regolith is very rough (σ ≈ 25°) — much rougher than Lambertian
  float roughness = 0.45; // σ in radians (~25°)
  float sigma2 = roughness * roughness;
  float A = 1.0 - 0.5 * sigma2 / (sigma2 + 0.33);
  float B_coeff = 0.45 * sigma2 / (sigma2 + 0.09);

  vec3 viewDir = normalize(-vWorldPosition); // approximate: from origin
  float NdotL = max(dot(N, sunDir), 0.0);
  float NdotV = max(dot(N, viewDir), 0.0);

  float thetaI = acos(NdotL);
  float thetaR = acos(NdotV);
  float alpha = max(thetaI, thetaR);
  float beta = min(thetaI, thetaR);

  // Project view and light dirs onto tangent plane
  vec3 projL = normalize(sunDir - N * NdotL);
  vec3 projV = normalize(viewDir - N * NdotV);
  float cosPhiDiff = max(dot(projL, projV), 0.0);

  float orenNayar = NdotL * (A + B_coeff * cosPhiDiff * sin(alpha) * tan(beta));

  // === OPPOSITION SURGE ===
  // Moon brightens noticeably at zero phase angle (sun behind observer)
  float phaseAngle = acos(clamp(dot(sunDir, viewDir), -1.0, 1.0));
  float oppositionSurge = 1.0 + 0.4 * exp(-phaseAngle * phaseAngle * 25.0);

  // === MAIN LIGHTING ===
  vec3 color = surfaceColor * orenNayar * sunIntensity * oppositionSurge;

  // === EARTHSHINE ===
  // Faint bluish illumination from Earth reflecting sunlight
  vec3 toEarth = normalize(earthPosition - vWorldPosition);
  float earthDot = max(dot(N, toEarth), 0.0);
  // Earthshine only visible on unlit portion
  float unlitMask = smoothstep(0.1, -0.1, NdotL);
  vec3 earthshineColor = vec3(0.15, 0.2, 0.35); // bluish Earth light
  color += surfaceColor * earthshineColor * earthDot * unlitMask * 0.08;

  // Slight base ambient to avoid pure black
  color += surfaceColor * vec3(0.010, 0.012, 0.015);

  gl_FragColor = vec4(color, 1.0);
}
