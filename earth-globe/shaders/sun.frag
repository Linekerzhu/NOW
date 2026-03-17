varying vec2 vUv;
uniform float intensity;

void main() {
  vec2 center = vUv - 0.5;
  float dist = length(center) * 2.0;

  if (dist > 1.0) discard;

  // === Photosphere: bright disk with limb darkening ===
  float coreBrightness = 1.0 - smoothstep(0.0, 0.35, dist);

  // Limb darkening (Eddington approximation)
  float limbAngle = asin(min(dist / 0.35, 1.0));
  float limbDarkening = 0.4 + 0.6 * cos(limbAngle);

  // === Corona: exponential decay halo ===
  float corona1 = exp(-dist * 4.5) * 0.5;
  float corona2 = exp(-dist * 2.0) * 0.12;
  float corona3 = exp(-dist * 9.0) * 0.3;

  // === Color: white-hot center → warm yellow → deep orange ===
  vec3 coreColor = vec3(1.0, 1.0, 0.98);
  vec3 midColor = vec3(1.0, 0.95, 0.8);
  vec3 edgeColor = vec3(1.0, 0.7, 0.3);
  vec3 coronaColor = vec3(1.0, 0.85, 0.5);

  vec3 diskColor = mix(coreColor, midColor, smoothstep(0.0, 0.2, dist));
  diskColor = mix(diskColor, edgeColor, smoothstep(0.15, 0.35, dist));

  vec3 color = diskColor * coreBrightness * limbDarkening;
  color += coronaColor * (corona1 + corona2 + corona3);

  color *= intensity;

  float alpha = max(coreBrightness, corona1 + corona2 * 2.0 + corona3);
  alpha *= 1.0 - smoothstep(0.85, 1.0, dist);
  alpha = clamp(alpha, 0.0, 1.0);

  if (alpha < 0.001) discard;

  gl_FragColor = vec4(color, alpha);
}
