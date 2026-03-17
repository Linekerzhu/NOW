uniform vec3 cameraPos;
uniform vec3 sunDirection;

varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  vec3 viewDir = normalize(cameraPos - vWorldPosition);
  vec3 normal = normalize(vNormal);
  vec3 sunDir = normalize(sunDirection);

  // Fresnel for BackSide rendering:
  float rawFresnel = 1.0 - abs(dot(viewDir, normal));

  // Primary atmosphere glow: concentrated at the limb
  float fresnel = pow(rawFresnel, 2.0);

  // Soft outer edge to avoid hard cutoff
  float softEdge = 1.0 - pow(rawFresnel, 18.0);
  fresnel *= softEdge;

  float sunFacing = dot(normal, sunDir);

  // ===== Rayleigh scattering approximation =====
  // Wavelength-dependent: blue scatters ~5.5x more than red (1/λ⁴)
  // This creates natural blue at 90° and reddish at grazing angles
  vec3 rayleighCoeff = vec3(0.18, 0.42, 1.0); // proportional to 1/λ⁴ for RGB
  float scatterAngle = acos(clamp(dot(viewDir, sunDir), -1.0, 1.0));
  // Rayleigh phase function: (3/4)(1 + cos²θ)
  float rayleighPhase = 0.75 * (1.0 + cos(scatterAngle) * cos(scatterAngle));

  // ===== Day-side atmosphere =====
  float daySide = smoothstep(-0.15, 0.4, sunFacing);
  float dayIntensity = 0.55 + 0.35 * smoothstep(0.0, 0.8, sunFacing);
  vec3 dayAtmo = rayleighCoeff * fresnel * dayIntensity * daySide * rayleighPhase * 0.7;

  // ===== Horizon glow band =====
  // Concentrated bright white-blue line at the limb (ISS-photo signature)
  float horizonGlow = pow(rawFresnel, 7.0) * (1.0 - pow(rawFresnel, 12.0));
  vec3 horizonColor = vec3(0.5, 0.7, 1.0);
  vec3 horizonAtmo = horizonColor * horizonGlow * daySide * 0.45;

  // ===== Terminator: warm orange/red scattering =====
  // At sunset/sunrise, light travels through max atmosphere → red dominates
  float twilight = smoothstep(-0.35, 0.0, sunFacing) * smoothstep(0.45, 0.05, sunFacing);
  float twilightOuter = smoothstep(-0.5, -0.1, sunFacing) * smoothstep(0.6, 0.1, sunFacing);
  // Deeper color progression: gold → orange → deep red
  vec3 warmCore = mix(vec3(1.0, 0.3, 0.05), vec3(1.0, 0.55, 0.2), twilight);
  vec3 warmOuter = vec3(0.9, 0.3, 0.08);
  vec3 twilightAtmo = warmCore * fresnel * 0.6 * twilight;
  twilightAtmo += warmOuter * fresnel * 0.2 * twilightOuter;

  // ===== Night-side: faint cold blue glow =====
  // Blueshift from scattered light around the terminator + earthshine
  float nightSide = smoothstep(0.0, -0.5, sunFacing);
  float nightEdgeBright = smoothstep(-0.5, -0.1, sunFacing) * nightSide;
  vec3 nightAtmo = vec3(0.05, 0.08, 0.2) * fresnel * 0.08 * nightSide;
  // Slightly brighter near the terminator on the night side
  nightAtmo += vec3(0.04, 0.06, 0.15) * fresnel * 0.12 * nightEdgeBright;

  // ===== Composite =====
  vec3 finalColor = dayAtmo + horizonAtmo + twilightAtmo + nightAtmo;
  float finalAlpha = fresnel * max(
    daySide * dayIntensity * 0.85,
    max(twilight * 0.6, nightSide * 0.15)
  );

  gl_FragColor = vec4(finalColor, finalAlpha);
}
