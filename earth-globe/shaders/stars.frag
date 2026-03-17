uniform float brightness;

varying float vAlpha;
varying vec3 vColor;

void main() {
  float dist = length(gl_PointCoord - vec2(0.5));
  if (dist > 0.5) discard;

  // Gaussian 'airy disk' falloff — photographic star look
  float fade = exp(-dist * dist * 18.0);

  // Bloom-friendly: bright stars output > 1.0 so bloom pass creates halos
  float emissive = 1.0 + brightness * 0.6;

  gl_FragColor = vec4(vColor * emissive, brightness * vAlpha * fade);
}
