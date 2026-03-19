uniform sampler2D cloudTexture;
uniform vec3 sunDirection;
uniform vec3 cameraPos;
uniform float opacity;
uniform float nightCloudOpacity;

varying vec3 vNormal;
varying vec2 vUv;
varying vec3 vWorldPosition;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 sunDir = normalize(sunDirection);
  vec3 viewDir = normalize(cameraPos - vWorldPosition);
  float sunDot = dot(normal, sunDir);

  float rawCloudAlpha = texture2D(cloudTexture, vUv).r;

  // Softer edge blending — less binary on/off
  float cloudAlpha = smoothstep(0.05, 0.45, rawCloudAlpha);

  float daySide = smoothstep(-0.15, 0.15, sunDot);
  vec3 dayCloud = vec3(1.0) * (0.6 + 0.4 * max(sunDot, 0.0));
  // Night-side clouds: moonlit blue-gray glow (faintly visible but continuous)
  vec3 nightCloud = vec3(0.06, 0.08, 0.12);

  // === FORWARD SCATTERING (Silver Lining) ===
  // When sun is behind the cloud from viewer's perspective
  float forwardScatter = dot(viewDir, -sunDir);
  float silverLining = pow(max(forwardScatter, 0.0), 6.0);
  // Only on cloud edges (where alpha is thin)
  float edgeMask = smoothstep(0.1, 0.3, rawCloudAlpha) * smoothstep(0.6, 0.3, rawCloudAlpha);
  vec3 silverColor = vec3(1.0, 0.95, 0.85) * silverLining * edgeMask * daySide * 0.8;

  // === SUBSURFACE SCATTERING ===
  // Thin clouds glow warm when sun-facing (light passes through)
  float thinness = 1.0 - smoothstep(0.2, 0.7, rawCloudAlpha);
  float subsurface = max(sunDot, 0.0) * thinness;
  vec3 subsurfaceColor = vec3(1.0, 0.9, 0.7) * subsurface * 0.3 * daySide;

  // === TWILIGHT — richer golden hour ===
  float twilight = smoothstep(-0.25, 0.0, sunDot) * smoothstep(0.25, 0.0, sunDot);
  vec3 twilightCloud = vec3(0.55, 0.3, 0.12);
  // Deep terminator glow — more saturated orange/pink
  float deepTwilight = smoothstep(-0.15, 0.0, sunDot) * smoothstep(0.15, 0.0, sunDot);
  vec3 deepTwilightColor = vec3(0.7, 0.25, 0.1);

  vec3 cloudColor = mix(nightCloud, dayCloud, daySide);
  cloudColor += twilightCloud * twilight * 1.2;
  cloudColor += deepTwilightColor * deepTwilight * 0.4;
  cloudColor += silverColor;
  cloudColor += subsurfaceColor;

  // Night-side clouds remain visible (moonlit) — smooth transition across terminator
  float finalOpacity = cloudAlpha * opacity * mix(nightCloudOpacity, 1.0, daySide);
  // Silver lining adds opacity at edges
  finalOpacity += silverLining * edgeMask * daySide * 0.15;
  finalOpacity = clamp(finalOpacity, 0.0, 1.0);

  gl_FragColor = vec4(cloudColor, finalOpacity);
}
