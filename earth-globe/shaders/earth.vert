#include common/normal_transform.glsl

varying vec3 vNormal;
varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec3 vTangent;
varying vec3 vBitangent;

void main() {
  vNormal = worldNormal(normal);
  vUv = uv;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;

  // TBN frame for normal mapping (safe at poles)
  vec3 rawT = cross(vec3(0.0, 1.0, 0.0), normal);
  if (dot(rawT, rawT) < 0.0001) rawT = cross(vec3(0.0, 0.0, 1.0), normal);
  vec3 T = normalize(rawT);
  vec3 B = normalize(cross(normal, T));
  vTangent = normalize((modelMatrix * vec4(T, 0.0)).xyz);
  vBitangent = normalize((modelMatrix * vec4(B, 0.0)).xyz);

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
