#include common/normal_transform.glsl

varying vec3 vNormal;
varying vec3 vWorldPosition;
varying vec2 vUv;
varying float vLatitude;

void main() {
  vNormal = worldNormal(normal);
  vUv = uv;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;

  // Compute GEOMAGNETIC latitude (not geographic)
  // The geomagnetic north pole is at ~80.65°N, 72.68°W (IGRF model).
  // In Three.js coordinates (+X = lon 0°, +Y = north, +Z = lon 90°E):
  //   axis = (cos(80.65°)·cos(-72.68°), sin(80.65°), cos(80.65°)·sin(-72.68°))
  //        ≈ (0.049, 0.987, -0.155)
  // dot(normalize(position), axis) = sin(geomagnetic latitude)
  vec3 geomagAxis = normalize(vec3(0.049, 0.987, -0.155));
  vLatitude = dot(normalize(position.xyz), geomagAxis);

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
