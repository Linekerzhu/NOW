// 1D and 2D pseudo-noise for procedural effects.
// Used by: aurora (curtain shimmer)

float hash(float n) {
  return fract(sin(n) * 43758.5453);
}

float noise(float x) {
  float i = floor(x);
  float f = fract(x);
  return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f));
}

// 2D noise via two offset 1D samples
float noise2D(float x, float y) {
  return noise(x + hash(floor(y)) * 127.1) * 0.5
       + noise(y + hash(floor(x)) * 311.7) * 0.5;
}
