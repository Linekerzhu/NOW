attribute float aPhase;
attribute float aSpeed;
attribute float aSize;
attribute vec3 aColor;
uniform float time;

varying float vAlpha;
varying vec3 vColor;

void main() {
  float twinkle = 0.65 + 0.35 * sin(time * aSpeed + aPhase);
  vAlpha = twinkle;
  vColor = aColor;

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (300.0 / -mvPosition.z) * twinkle;
  gl_Position = projectionMatrix * mvPosition;
}
