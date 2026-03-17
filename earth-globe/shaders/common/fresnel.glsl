// Fresnel rim factor: 0 at center, 1 at edge.
// Used by: earth (airglow, rim), atmosphere, aurora
float fresnelFactor(vec3 viewDir, vec3 normal) {
  return 1.0 - max(dot(viewDir, normal), 0.0);
}
