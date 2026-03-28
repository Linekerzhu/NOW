/**
 * Physically-based atmospheric scattering via ray marching.
 *
 * Replaces the previous fresnel-based approximation with proper
 * Rayleigh + Mie single-scattering, producing natural blue limb,
 * sunset/sunrise colors, and correct horizon glow from physics.
 *
 * Based on Nishita's model, adapted from wwwtyro/glsl-atmosphere.
 * Uses 16 primary + 6 light steps — affordable for real-time.
 */

uniform vec3 cameraPos;
uniform vec3 sunDirection;
uniform float earthRadius;
uniform float atmosphereRadius;
uniform float sunIntensity;

varying vec3 vWorldPosition;

#define PI 3.14159265
#define PRIMARY_STEPS 16
#define LIGHT_STEPS 6

// Ray-sphere intersection: returns (near, far) distances along ray.
// Sphere centered at origin. Returns vec2(-1) if no intersection.
vec2 raySphere(vec3 origin, vec3 dir, float radius) {
  float b = dot(origin, dir);
  float c = dot(origin, origin) - radius * radius;
  float d = b * b - c;
  if (d < 0.0) return vec2(-1.0);
  float sqrtD = sqrt(d);
  return vec2(-b - sqrtD, -b + sqrtD);
}

void main() {
  vec3 rayOrigin = cameraPos;
  vec3 rayDir = normalize(vWorldPosition - cameraPos);
  vec3 sunDir = normalize(sunDirection);

  // Find atmosphere shell intersection
  vec2 atmosHit = raySphere(rayOrigin, rayDir, atmosphereRadius);
  if (atmosHit.x > atmosHit.y) {
    gl_FragColor = vec4(0.0);
    return;
  }

  // Clip ray to planet surface (atmosphere doesn't scatter below ground)
  vec2 planetHit = raySphere(rayOrigin, rayDir, earthRadius);
  float pathStart = max(atmosHit.x, 0.0);
  float pathEnd = (planetHit.x > 0.0) ? planetHit.x : atmosHit.y;

  if (pathEnd <= pathStart) {
    gl_FragColor = vec4(0.0);
    return;
  }

  // --- Scattering coefficients (physically derived, scaled to scene units) ---
  // Real Earth: β_Rayleigh = (5.5, 13.0, 22.4) × 10⁻⁶ /m at sea level
  // Scene: 1 unit = earthRadius/10 mapped to 6371 km → 637.1 km/unit
  // β_scene = β_real × 637100 m/unit
  vec3 betaR = vec3(3.5, 8.3, 14.3);      // Rayleigh scattering
  float betaM = 4.0;                       // Mie scattering

  // Scale heights (scene units): how fast density drops with altitude
  float scaleHeightR = 0.0126;             // Rayleigh: 8 km
  float scaleHeightM = 0.004;              // Mie: 1.2 km

  // Mie anisotropy: forward-scattering preference (sun glow)
  float g = 0.76;

  // --- Phase functions ---
  float cosTheta = dot(rayDir, sunDir);

  // Rayleigh phase: symmetric, wavelength-independent
  float phaseR = 0.75 * (1.0 + cosTheta * cosTheta);

  // Henyey-Greenstein phase for Mie: strong forward lobe
  float g2 = g * g;
  float phaseM = (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5));

  // --- Ray march through atmosphere ---
  float stepSize = (pathEnd - pathStart) / float(PRIMARY_STEPS);

  vec3 totalR = vec3(0.0);   // accumulated Rayleigh in-scatter
  vec3 totalM = vec3(0.0);   // accumulated Mie in-scatter
  float optDepthR = 0.0;     // optical depth along primary ray
  float optDepthM = 0.0;

  for (int i = 0; i < PRIMARY_STEPS; i++) {
    vec3 samplePos = rayOrigin + rayDir * (pathStart + (float(i) + 0.5) * stepSize);
    float height = length(samplePos) - earthRadius;

    // Density at this altitude
    float densityR = exp(-height / scaleHeightR) * stepSize;
    float densityM = exp(-height / scaleHeightM) * stepSize;
    optDepthR += densityR;
    optDepthM += densityM;

    // Secondary ray toward sun: accumulate optical depth to check
    // how much light reaches this point through the atmosphere
    vec2 lightHit = raySphere(samplePos, sunDir, atmosphereRadius);
    float lightStepSize = lightHit.y / float(LIGHT_STEPS);
    float lightOptDepthR = 0.0;
    float lightOptDepthM = 0.0;

    for (int j = 0; j < LIGHT_STEPS; j++) {
      vec3 lPos = samplePos + sunDir * (float(j) + 0.5) * lightStepSize;
      float lHeight = length(lPos) - earthRadius;
      lightOptDepthR += exp(-lHeight / scaleHeightR) * lightStepSize;
      lightOptDepthM += exp(-lHeight / scaleHeightM) * lightStepSize;
    }

    // Combined extinction along primary + light paths
    vec3 attenuation = exp(
      -(betaR * (optDepthR + lightOptDepthR)
      + betaM * (optDepthM + lightOptDepthM))
    );

    totalR += densityR * attenuation;
    totalM += densityM * attenuation;
  }

  // Final scattered light = sun illumination × accumulated scattering
  vec3 scatter = (totalR * betaR * phaseR + totalM * betaM * phaseM) * sunIntensity;

  // Suppress scatter over the surface, keep at the limb.
  // Short paths (center view, ~0.6 units) produce visible haze;
  // long paths (limb, ~7 units) produce the desired glow.
  if (planetHit.x > 0.0) {
    float pathLength = pathEnd - pathStart;
    float maxPath = 2.0 * sqrt(atmosphereRadius * atmosphereRadius - earthRadius * earthRadius);
    float limbness = smoothstep(0.0, 0.6, pathLength / maxPath);
    scatter *= limbness;
  }

  gl_FragColor = vec4(scatter, 1.0);
}
