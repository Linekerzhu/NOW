#include common/normal_transform.glsl

uniform sampler2D heightMap;
uniform float displacementScale;

varying vec3 vNormal;
varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec3 vTangent;
varying vec3 vBitangent;

void main() {
  vUv = uv;

  // --- Vertex displacement from heightmap ---
  float height = texture2D(heightMap, uv).r;
  vec3 displaced = position + normal * height * displacementScale;

  // --- Compute displaced normal via finite differences ---
  // Sample neighboring heights to derive tangent-space slope
  vec2 texelSize = vec2(1.0 / 5400.0, 1.0 / 2700.0);
  float hL = texture2D(heightMap, uv - vec2(texelSize.x, 0.0)).r;
  float hR = texture2D(heightMap, uv + vec2(texelSize.x, 0.0)).r;
  float hD = texture2D(heightMap, uv - vec2(0.0, texelSize.y)).r;
  float hU = texture2D(heightMap, uv + vec2(0.0, texelSize.y)).r;

  // Gradient in UV space, scaled by displacement
  vec3 dU = vec3(1.0, 0.0, (hR - hL) * displacementScale * 0.5);
  vec3 dV = vec3(0.0, 1.0, (hU - hD) * displacementScale * 0.5);
  vec3 perturbedNormalTS = normalize(cross(dU, dV));

  // Transform object-space normal to world space
  vec3 N = normalize(normal);

  // TBN frame for normal mapping (safe at poles)
  vec3 rawT = cross(vec3(0.0, 1.0, 0.0), N);
  if (dot(rawT, rawT) < 0.0001) rawT = cross(vec3(0.0, 0.0, 1.0), N);
  vec3 T = normalize(rawT);
  vec3 B = normalize(cross(N, T));

  // Blend displacement-derived normal with object normal
  vec3 displacedNormal = normalize(
    T * perturbedNormalTS.x +
    B * perturbedNormalTS.y +
    N * perturbedNormalTS.z
  );

  vNormal = normalize((modelMatrix * vec4(displacedNormal, 0.0)).xyz);

  vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
  vWorldPosition = worldPos.xyz;

  // Pass TBN to fragment shader for normal map (using displaced geometry normal)
  vTangent = normalize((modelMatrix * vec4(T, 0.0)).xyz);
  vBitangent = normalize((modelMatrix * vec4(B, 0.0)).xyz);

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
