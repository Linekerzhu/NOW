/**
 * earth.js — Earth rendering: sphere + shaders + clouds + atmosphere + stars
 *
 * Combines all visual earth components into a single module.
 * Shaders are inlined (no separate .glsl files) per spec.
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const EARTH_RADIUS = 10;
const MS_PER_DAY = 86400000;
const TWO_PI_365 = (2 * Math.PI) / 365;

// ---------------------------------------------------------------------------
// Sun direction (astronomical)
// ---------------------------------------------------------------------------
export function getSunDirection(date) {
  const start = new Date(date.getFullYear(), 0, 1);
  const dayOfYear = (date - start) / MS_PER_DAY + 1;
  const hourUTC = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;

  const B = TWO_PI_365 * (dayOfYear - 81);
  const declination = 23.44 * Math.sin(B);
  const decRad = (declination * Math.PI) / 180;

  const gamma = TWO_PI_365 * (dayOfYear - 1);
  const eqTimeMin = 229.18 * (
    0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) -
    0.014615 * Math.cos(2 * gamma) - 0.04089 * Math.sin(2 * gamma)
  );

  const trueSolarHour = hourUTC + eqTimeMin / 60;
  const hourAngle = ((trueSolarHour - 12) / 24) * 2 * Math.PI;

  const distanceFactor = 1.0 + 0.033 * Math.cos(TWO_PI_365 * (dayOfYear - 3));

  const x = Math.cos(decRad) * Math.cos(hourAngle);
  const y = Math.sin(decRad);
  const z = Math.cos(decRad) * Math.sin(hourAngle);

  return {
    direction: new THREE.Vector3(x, y, z).normalize(),
    declination,
    distanceFactor,
  };
}

// ---------------------------------------------------------------------------
// GLSL common functions (inlined)
// ---------------------------------------------------------------------------
const glslCommon = `
  float fresnelFactor(vec3 viewDir, vec3 normal) {
    return 1.0 - max(dot(viewDir, normal), 0.0);
  }
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  float noise(float x) {
    float i = floor(x); float f = fract(x);
    return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f));
  }
  vec3 worldNormal(vec3 objectNormal) {
    return normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);
  }
`;

// ---------------------------------------------------------------------------
// Earth surface shaders
// ---------------------------------------------------------------------------
const earthVert = `
  ${glslCommon}
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

    vec3 rawT = cross(vec3(0.0, 1.0, 0.0), normal);
    if (dot(rawT, rawT) < 0.0001) rawT = cross(vec3(0.0, 0.0, 1.0), normal);
    vec3 T = normalize(rawT);
    vec3 B = normalize(cross(normal, T));
    vTangent = normalize((modelMatrix * vec4(T, 0.0)).xyz);
    vBitangent = normalize((modelMatrix * vec4(B, 0.0)).xyz);

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const earthFrag = `
  ${glslCommon}
  uniform sampler2D dayTexture;
  uniform sampler2D nightTexture;
  uniform sampler2D normalMap;
  uniform sampler2D cloudTexture;
  uniform vec3 sunDirection;
  uniform vec3 cameraPos;
  uniform float ambientDim;
  uniform float normalStrength;
  uniform float sunIntensity;
  uniform float cloudUVOffset;
  uniform float time;

  varying vec3 vNormal;
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vTangent;
  varying vec3 vBitangent;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 T = normalize(vTangent);
    vec3 B = normalize(vBitangent);
    vec3 sunDir = normalize(sunDirection);
    vec3 viewDir = normalize(cameraPos - vWorldPosition);

    vec3 normalSample = texture2D(normalMap, vUv).rgb * 2.0 - 1.0;
    normalSample.xy *= normalStrength;
    vec3 perturbedNormal = normalize(T * normalSample.x + B * normalSample.y + N * normalSample.z);

    float sunDot = dot(N, sunDir);
    float sunDotBumped = dot(perturbedNormal, sunDir);

    vec3 dayColor = texture2D(dayTexture, vUv).rgb;
    vec3 nightColor = texture2D(nightTexture, vUv).rgb;

    float cityBrightness = max(nightColor.r, max(nightColor.g, nightColor.b));
    float glowFactor = smoothstep(0.05, 0.5, cityBrightness);
    nightColor *= 2.0;
    nightColor += vec3(1.0, 0.8, 0.4) * glowFactor * 0.4;

    float refractionOffset = 0.015;
    float penumbraWidth = 0.01;
    float termLow  = -0.15 - refractionOffset - penumbraWidth;
    float termHigh =  0.15 + penumbraWidth;
    float terminator = smoothstep(termLow, termHigh, sunDot);

    float civilTwilight = smoothstep(-0.12, -0.02, sunDot);
    float cityDim = mix(1.0, 0.15, civilTwilight);
    vec3 color = mix(nightColor * cityDim, dayColor, terminator);

    float blueHourBand = smoothstep(-0.22, -0.10, sunDot) * smoothstep(-0.03, -0.10, sunDot);
    color += vec3(0.04, 0.06, 0.14) * blueHourBand;

    float diffuse = max(sunDotBumped, 0.0);
    color *= mix(1.0, 0.7 + 0.3 * diffuse, terminator);
    color *= mix(1.0, sunIntensity, terminator);

    float cloudHeight = 0.003;
    float sunTangent = dot(sunDir, T);
    float sunBitangent = dot(sunDir, B);
    vec2 shadowOffset = vec2(-sunTangent, -sunBitangent) * cloudHeight;
    float cloudDensity = texture2D(cloudTexture, vec2(fract(vUv.x - cloudUVOffset), vUv.y) + shadowOffset).r;
    float shadowStrength = cloudDensity * 0.20 * terminator;
    color *= (1.0 - shadowStrength);

    float nightAmount = 1.0 - terminator;
    color += vec3(0.003, 0.004, 0.008) * nightAmount;

    float viewFresnel = fresnelFactor(viewDir, N);
    float earthshineFresnel = pow(viewFresnel, 3.0);
    color += vec3(0.008, 0.012, 0.025) * nightAmount * (0.4 + earthshineFresnel * 0.6);

    float airglowMask = pow(viewFresnel, 6.0);
    float nightEdge = smoothstep(0.05, -0.25, sunDot);
    color += vec3(0.03, 0.08, 0.03) * airglowMask * nightEdge * 0.3;

    float twilightBand = smoothstep(-0.2, 0.0, sunDot) * smoothstep(0.2, 0.0, sunDot);
    color += vec3(0.15, 0.08, 0.03) * twilightBand;

    float luminance = dot(dayColor, vec3(0.299, 0.587, 0.114));
    float blueRatio = dayColor.b / (luminance + 0.01);
    float oceanMask = smoothstep(0.18, 0.08, luminance) * smoothstep(1.1, 1.5, blueRatio);
    color *= mix(1.0, 0.85, oceanMask * terminator);

    float ripple1 = noise(vUv.x * 800.0 + time * 2.0) * 0.5 + 0.5;
    float ripple2 = noise(vUv.y * 600.0 - time * 1.5 + 100.0) * 0.5 + 0.5;
    vec3 rippleNormal = normalize(perturbedNormal + vec3(ripple1 - 0.5, ripple2 - 0.5, 0.0) * 0.015 * oceanMask);

    vec3 halfDir = normalize(sunDir + viewDir);
    float specAngle = max(dot(rippleNormal, halfDir), 0.0);
    float specular = pow(specAngle, 150.0);
    float specularMid = pow(specAngle, 40.0);
    float specularWide = pow(specAngle, 12.0);
    vec3 glintColor = vec3(1.0, 0.95, 0.85);
    color += glintColor * (specular * 1.5 + specularMid * 0.35 + specularWide * 0.08) * oceanMask * terminator;

    float oceanFresnel = pow(fresnelFactor(viewDir, N), 4.0);
    color += vec3(0.15, 0.25, 0.45) * oceanFresnel * oceanMask * terminator * 0.25;

    color += vec3(0.12, 0.18, 0.28) * pow(viewFresnel, 4.0) * terminator * 0.3;

    float dimFactor = mix(1.0, 1.0 - ambientDim, terminator);
    color *= dimFactor;
    color = mix(color, color * vec3(0.93, 0.96, 1.0), terminator * 0.2);

    gl_FragColor = vec4(color, 1.0);
  }
`;

// ---------------------------------------------------------------------------
// Atmosphere shaders
// ---------------------------------------------------------------------------
const atmosphereVert = `
  ${glslCommon}
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vNormal = worldNormal(normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const atmosphereFrag = `
  uniform vec3 cameraPos;
  uniform vec3 sunDirection;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 viewDir = normalize(cameraPos - vWorldPosition);
    vec3 normal = normalize(vNormal);
    vec3 sunDir = normalize(sunDirection);

    float rawFresnel = 1.0 - abs(dot(viewDir, normal));
    float fresnel = pow(rawFresnel, 2.0);
    float softEdge = 1.0 - pow(rawFresnel, 18.0);
    fresnel *= softEdge;

    float sunFacing = dot(normal, sunDir);

    vec3 rayleighCoeff = vec3(0.18, 0.42, 1.0);
    float scatterAngle = acos(clamp(dot(viewDir, sunDir), -1.0, 1.0));
    float rayleighPhase = 0.75 * (1.0 + cos(scatterAngle) * cos(scatterAngle));

    float daySide = smoothstep(-0.15, 0.4, sunFacing);
    float dayIntensity = 0.55 + 0.35 * smoothstep(0.0, 0.8, sunFacing);
    vec3 dayAtmo = rayleighCoeff * fresnel * dayIntensity * daySide * rayleighPhase * 0.7;

    float horizonGlow = pow(rawFresnel, 7.0) * (1.0 - pow(rawFresnel, 12.0));
    vec3 horizonColor = vec3(0.5, 0.7, 1.0);
    vec3 horizonAtmo = horizonColor * horizonGlow * daySide * 0.45;

    float twilight = smoothstep(-0.35, 0.0, sunFacing) * smoothstep(0.45, 0.05, sunFacing);
    float twilightOuter = smoothstep(-0.5, -0.1, sunFacing) * smoothstep(0.6, 0.1, sunFacing);
    vec3 warmCore = mix(vec3(1.0, 0.3, 0.05), vec3(1.0, 0.55, 0.2), twilight);
    vec3 warmOuter = vec3(0.9, 0.3, 0.08);
    vec3 twilightAtmo = warmCore * fresnel * 0.6 * twilight;
    twilightAtmo += warmOuter * fresnel * 0.2 * twilightOuter;

    float nightSide = smoothstep(0.0, -0.5, sunFacing);
    float nightEdgeBright = smoothstep(-0.5, -0.1, sunFacing) * nightSide;
    vec3 nightAtmo = vec3(0.05, 0.08, 0.2) * fresnel * 0.08 * nightSide;
    nightAtmo += vec3(0.04, 0.06, 0.15) * fresnel * 0.12 * nightEdgeBright;

    vec3 finalColor = dayAtmo + horizonAtmo + twilightAtmo + nightAtmo;
    float finalAlpha = fresnel * max(
      daySide * dayIntensity * 0.85,
      max(twilight * 0.6, nightSide * 0.15)
    );

    gl_FragColor = vec4(finalColor, finalAlpha);
  }
`;

// ---------------------------------------------------------------------------
// Cloud shaders
// ---------------------------------------------------------------------------
const cloudsVert = `
  ${glslCommon}
  varying vec3 vNormal;
  varying vec2 vUv;
  varying vec3 vWorldPosition;

  void main() {
    vNormal = worldNormal(normal);
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const cloudsFrag = `
  uniform sampler2D cloudTexture;
  uniform vec3 sunDirection;
  uniform vec3 cameraPos;
  uniform float opacity;

  varying vec3 vNormal;
  varying vec2 vUv;
  varying vec3 vWorldPosition;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 sunDir = normalize(sunDirection);
    vec3 viewDir = normalize(cameraPos - vWorldPosition);
    float sunDot = dot(normal, sunDir);

    float rawCloudAlpha = texture2D(cloudTexture, vUv).r;
    float cloudAlpha = smoothstep(0.05, 0.45, rawCloudAlpha);

    float daySide = smoothstep(-0.15, 0.15, sunDot);
    vec3 dayCloud = vec3(1.0) * (0.6 + 0.4 * max(sunDot, 0.0));
    vec3 nightCloud = vec3(0.08, 0.1, 0.14);

    float forwardScatter = dot(viewDir, -sunDir);
    float silverLining = pow(max(forwardScatter, 0.0), 6.0);
    float edgeMask = smoothstep(0.1, 0.3, rawCloudAlpha) * smoothstep(0.6, 0.3, rawCloudAlpha);
    vec3 silverColor = vec3(1.0, 0.95, 0.85) * silverLining * edgeMask * daySide * 0.8;

    float thinness = 1.0 - smoothstep(0.2, 0.7, rawCloudAlpha);
    float subsurface = max(sunDot, 0.0) * thinness;
    vec3 subsurfaceColor = vec3(1.0, 0.9, 0.7) * subsurface * 0.3 * daySide;

    float twilight = smoothstep(-0.25, 0.0, sunDot) * smoothstep(0.25, 0.0, sunDot);
    vec3 twilightCloud = vec3(0.55, 0.3, 0.12);
    float deepTwilight = smoothstep(-0.15, 0.0, sunDot) * smoothstep(0.15, 0.0, sunDot);
    vec3 deepTwilightColor = vec3(0.7, 0.25, 0.1);

    vec3 cloudColor = mix(nightCloud, dayCloud, daySide);
    cloudColor += twilightCloud * twilight * 1.2;
    cloudColor += deepTwilightColor * deepTwilight * 0.4;
    cloudColor += silverColor;
    cloudColor += subsurfaceColor;

    float finalOpacity = cloudAlpha * opacity * mix(0.08, 1.0, daySide);
    finalOpacity += silverLining * edgeMask * daySide * 0.15;
    finalOpacity = clamp(finalOpacity, 0.0, 1.0);

    gl_FragColor = vec4(cloudColor, finalOpacity);
  }
`;

// ---------------------------------------------------------------------------
// Stars shader (simplified: ~500 dim static points)
// ---------------------------------------------------------------------------
const starsVert = `
  attribute float aPhase;
  attribute float aSize;
  attribute float aBrightness;

  varying float vBrightness;

  void main() {
    vBrightness = aBrightness;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (300.0 / -mvPos.z);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const starsFrag = `
  varying float vBrightness;

  void main() {
    float dist = length(gl_PointCoord - vec2(0.5));
    if (dist > 0.5) discard;
    float alpha = exp(-dist * dist * 18.0) * vBrightness;
    gl_FragColor = vec4(vec3(1.0), alpha);
  }
`;

// ---------------------------------------------------------------------------
// Create stars (~500, dim, static)
// ---------------------------------------------------------------------------
function createStars() {
  const count = 500;
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const sizes = new Float32Array(count);
  const brightness = new Float32Array(count);
  const radius = 300;

  for (let i = 0; i < count; i++) {
    const theta = Math.acos(2 * Math.random() - 1);
    const phi = Math.random() * Math.PI * 2;
    const r = radius + (Math.random() - 0.5) * 100;
    positions[i * 3] = r * Math.sin(theta) * Math.cos(phi);
    positions[i * 3 + 1] = r * Math.sin(theta) * Math.sin(phi);
    positions[i * 3 + 2] = r * Math.cos(theta);
    phases[i] = Math.random() * Math.PI * 2;
    sizes[i] = 0.5 + Math.random() * 1.0;
    brightness[i] = 0.15 + Math.random() * 0.20;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aBrightness', new THREE.BufferAttribute(brightness, 1));

  const material = new THREE.ShaderMaterial({
    vertexShader: starsVert,
    fragmentShader: starsFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return new THREE.Points(geometry, material);
}

// ---------------------------------------------------------------------------
// Create earth surface
// ---------------------------------------------------------------------------
function createEarthSurface(renderer, cameraPosition) {
  const loader = new THREE.TextureLoader();
  const dayTex = loader.load('/textures/earth-day-8k.jpg');
  const nightTex = loader.load('/textures/earth-night-2k.jpg');
  const normalTex = loader.load('/textures/earth-normal-2k.jpg');
  const cloudTex = loader.load('/textures/earth-clouds-2k.jpg');

  dayTex.colorSpace = THREE.SRGBColorSpace;
  nightTex.colorSpace = THREE.SRGBColorSpace;
  normalTex.colorSpace = THREE.LinearSRGBColorSpace;
  cloudTex.colorSpace = THREE.LinearSRGBColorSpace;

  const maxAniso = renderer ? renderer.capabilities.getMaxAnisotropy() : 16;
  dayTex.anisotropy = maxAniso;
  nightTex.anisotropy = maxAniso;
  normalTex.anisotropy = maxAniso;

  const geometry = new THREE.SphereGeometry(EARTH_RADIUS, 96, 48);
  const material = new THREE.ShaderMaterial({
    vertexShader: earthVert,
    fragmentShader: earthFrag,
    uniforms: {
      dayTexture: { value: dayTex },
      nightTexture: { value: nightTex },
      normalMap: { value: normalTex },
      cloudTexture: { value: cloudTex },
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
      cameraPos: { value: cameraPosition },
      ambientDim: { value: 0.12 },
      normalStrength: { value: 4.0 },
      sunIntensity: { value: 1.0 },
      cloudUVOffset: { value: 0.0 },
      time: { value: 0.0 },
    },
  });

  return { mesh: new THREE.Mesh(geometry, material), material, geometry, textures: [dayTex, nightTex, normalTex] };
}

// ---------------------------------------------------------------------------
// Create clouds
// ---------------------------------------------------------------------------
function createCloudLayer(cameraPosition) {
  const texture = new THREE.TextureLoader().load('/textures/earth-clouds-2k.jpg');
  texture.colorSpace = THREE.LinearSRGBColorSpace;

  const geometry = new THREE.SphereGeometry(EARTH_RADIUS * 1.005, 96, 48);
  const material = new THREE.ShaderMaterial({
    vertexShader: cloudsVert,
    fragmentShader: cloudsFrag,
    uniforms: {
      cloudTexture: { value: texture },
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
      cameraPos: { value: cameraPosition },
      opacity: { value: 0.28 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  return { mesh, material, geometry, texture };
}

// ---------------------------------------------------------------------------
// Create atmosphere
// ---------------------------------------------------------------------------
function createAtmosphereGlow(cameraPosition) {
  const geometry = new THREE.SphereGeometry(EARTH_RADIUS * 1.035, 96, 48);
  const material = new THREE.ShaderMaterial({
    vertexShader: atmosphereVert,
    fragmentShader: atmosphereFrag,
    uniforms: {
      cameraPos: { value: cameraPosition },
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
    },
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });

  return { mesh: new THREE.Mesh(geometry, material), material, geometry };
}

// ---------------------------------------------------------------------------
// Public API: createEarthScene
// ---------------------------------------------------------------------------
export function createEarthScene(renderer, camera) {
  const cameraPosition = camera.position;

  const earthGroup = new THREE.Group();
  earthGroup.scale.set(1, 0.9966, 1); // oblateness

  const earth = createEarthSurface(renderer, cameraPosition);
  const clouds = createCloudLayer(cameraPosition);
  const atmosphere = createAtmosphereGlow(cameraPosition);
  const stars = createStars();

  earthGroup.add(clouds.mesh);
  earthGroup.add(earth.mesh);
  earthGroup.add(atmosphere.mesh);

  // Ambient + directional light
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.03);
  const sunLight = new THREE.DirectionalLight(0xffeedd, 1.5);
  sunLight.position.set(100, 0, 0);

  // State
  let cloudRotation = 0;
  let sunDir = new THREE.Vector3(1, 0, 0);
  let sunIntensityVal = 1.0;

  function updateSun(date) {
    const result = getSunDirection(date);
    sunDir.copy(result.direction);
    sunIntensityVal = result.distanceFactor;
    sunLight.position.copy(sunDir).multiplyScalar(100);
  }

  // Initial sun
  updateSun(new Date());

  function update(delta, time) {
    // Cloud drift
    cloudRotation = (cloudRotation + 0.00002 * delta * 60) % (Math.PI * 2);
    clouds.mesh.rotation.y = cloudRotation;
    const cloudUVOffset = cloudRotation / (Math.PI * 2);

    // Update earth uniforms
    earth.material.uniforms.sunDirection.value.copy(sunDir);
    earth.material.uniforms.sunIntensity.value = sunIntensityVal;
    earth.material.uniforms.cloudUVOffset.value = cloudUVOffset;
    earth.material.uniforms.time.value = time;

    // Update cloud uniforms
    clouds.material.uniforms.sunDirection.value.copy(sunDir);

    // Update atmosphere uniforms
    atmosphere.material.uniforms.sunDirection.value.copy(sunDir);
  }

  function dispose() {
    earth.geometry.dispose();
    earth.material.dispose();
    earth.textures.forEach(t => t.dispose());
    clouds.geometry.dispose();
    clouds.material.dispose();
    clouds.texture.dispose();
    atmosphere.geometry.dispose();
    atmosphere.material.dispose();
  }

  return {
    earthGroup,
    stars,
    ambientLight,
    sunLight,
    update,
    updateSun,
    dispose,
    EARTH_RADIUS,
  };
}

export { EARTH_RADIUS };
