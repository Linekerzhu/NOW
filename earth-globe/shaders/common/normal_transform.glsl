// Shared world-space normal from object-space normal.
// Used by: earth, clouds, atmosphere, aurora
vec3 worldNormal(vec3 objectNormal) {
  return normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);
}
