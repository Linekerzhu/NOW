# Planet Terrain Simulator (Phase 1-2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the textured sphere into a physical terrain globe with distance-adaptive displacement, independent ocean mesh with depth-based coloring, and proper water/land separation.

**Architecture:** Phase 1 fixes displacement parameters (adaptive exaggeration, texelSize uniform). Phase 2 creates a new `ocean.js` component following the existing `{object3D, update(ctx), dispose()}` protocol, with its own vertex+fragment shaders. Ocean rendering code is moved OUT of `earth.frag` into the dedicated ocean shader. The ocean mesh is a smooth sphere at `earthRadius` (sea level), masked by the existing specular map.

**Tech Stack:** Three.js 0.170, GLSL ES, existing component protocol

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `earth-globe/config.js` | Modify | Add `ocean` config section |
| `earth-globe/earth.js` | Modify | Fix duplicate uniforms, add `heightMapSize` uniform, expose `displacementScale` for external update |
| `earth-globe/shaders/earth.vert` | Modify | Replace hardcoded texelSize with uniform |
| `earth-globe/shaders/earth.frag` | Modify | Remove ocean code (lines 211-254), keep fresnel rim |
| `earth-globe/ocean.js` | Create | Ocean component with Beer-Lambert depth coloring |
| `earth-globe/shaders/ocean.vert` | Create | Simple sphere vertex shader |
| `earth-globe/shaders/ocean.frag` | Create | Water rendering: depth absorption, GGX glint, Fresnel |
| `earth-globe/main.js` | Modify | Create ocean component, add to earthGroup, adaptive displacement in render loop |
| `earth-globe/levelLoop.js` | Modify | Update displacement exaggeration during level transitions |

---

### Task 1: Fix earth.js Duplicate Uniforms + Add heightMapSize

**Files:**
- Modify: `earth-globe/earth.js:111-140`
- Modify: `earth-globe/shaders/earth.vert:21`

- [ ] **Step 1: Fix duplicate uniforms in earth.js**

In `earth-globe/earth.js`, the uniforms object has `heightMap` and `displacementScale` defined TWICE (lines 123-124 and 138-139). Remove the first pair (lines 123-124) and keep only the second pair (138-139). Also add a `heightMapSize` uniform.

Replace the uniforms block (lines 111-141) — remove these TWO lines:
```javascript
      heightMap: { value: heightTex },
      displacementScale: { value: (config.displacementScale ?? 0.15) * earthRadius },
```

And after the existing `displacementScale` at line 139, add:
```javascript
      heightMapSize: { value: new THREE.Vector2(5400, 2700) },
```

Note: if the heightmap image is loaded, query its actual dimensions. For now hardcode to match the current file. This will be updated when ETOPO data is loaded later.

- [ ] **Step 2: Replace hardcoded texelSize in earth.vert**

In `earth-globe/shaders/earth.vert`, add the uniform declaration after `uniform float displacementScale;`:

```glsl
uniform vec2 heightMapSize;
```

Replace line 21:
```glsl
  vec2 texelSize = vec2(1.0 / 5400.0, 1.0 / 2700.0);
```
With:
```glsl
  vec2 texelSize = 1.0 / heightMapSize;
```

- [ ] **Step 3: Verify and commit**

```bash
cd earth-globe && npm test
git add earth.js shaders/earth.vert
git commit -m "fix: remove duplicate uniforms, replace hardcoded texelSize with uniform"
```

---

### Task 2: Distance-Adaptive Displacement Exaggeration

**Files:**
- Modify: `earth-globe/main.js` (render loop)
- Modify: `earth-globe/earth.js` (expose material for external uniform update)

- [ ] **Step 1: Expose earth material for displacement updates**

In `earth-globe/earth.js`, the returned object already exposes `material`. Verify that `material.uniforms.displacementScale` is accessible from main.js via `earth.material.uniforms.displacementScale.value`. No code change needed — just confirming the interface.

- [ ] **Step 2: Add adaptive displacement to the render loop**

In `earth-globe/main.js`, inside the `animate()` function, after `ctx.cloudUVOffset = clouds.cloudUVOffset;` (around line 275), add:

```javascript
    // --- Distance-adaptive terrain exaggeration ---
    // Far away: exaggerate terrain so mountains visible from space
    // Close up: reduce toward realistic proportions
    const camDist = camera.position.length();
    const distRatio = camDist / earthRadius;
    const exaggeration = THREE.MathUtils.lerp(2.0, 15.0,
      THREE.MathUtils.smoothstep(distRatio, 1.2, 3.0));
    earth.material.uniforms.displacementScale.value = exaggeration * earthRadius * 0.001389;
```

The magic number `0.001389` = `8848m / 6371000m` = Everest height as fraction of Earth radius. So the displacement at exaggeration=1 gives real-world scale.

- [ ] **Step 3: Verify terrain changes with zoom**

```bash
cd earth-globe && npm run dev
```

Open browser, zoom in/out. At L1 (far), mountains should be prominently visible. At L3 (close), mountains should be more subtle. Check GUI `displacement scale` slider reflects the dynamic value.

- [ ] **Step 4: Commit**

```bash
git add main.js
git commit -m "feat: distance-adaptive terrain exaggeration (15x far, 2x close)"
```

---

### Task 3: Add Ocean Config

**Files:**
- Modify: `earth-globe/config.js`

- [ ] **Step 1: Add ocean configuration section**

In `earth-globe/config.js`, after the `atmosphere` section (around line 27), add:

```javascript
  ocean: {
    segments: [256, 128],
    seaLevel: 0.07,          // heightmap value at sea level (calibrate visually)
    deepColor: [0.0, 0.01, 0.03],
    shallowColor: [0.0, 0.15, 0.12],
    maxDepth: 0.3,           // heightmap units — deeper than this is "maximum deep"
    opacity: 0.92,           // max opacity for deep water
  },
```

- [ ] **Step 2: Commit**

```bash
git add config.js
git commit -m "config: add ocean rendering parameters"
```

---

### Task 4: Create Ocean Shaders

**Files:**
- Create: `earth-globe/shaders/ocean.vert`
- Create: `earth-globe/shaders/ocean.frag`

- [ ] **Step 1: Create ocean vertex shader**

Create `earth-globe/shaders/ocean.vert`:

```glsl
#include common/normal_transform.glsl

varying vec3 vNormal;
varying vec3 vWorldPosition;
varying vec2 vUv;

void main() {
  vNormal = worldNormal(normal);
  vUv = uv;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
```

- [ ] **Step 2: Create ocean fragment shader**

Create `earth-globe/shaders/ocean.frag`:

```glsl
#include common/fresnel.glsl
#include common/noise.glsl

uniform vec3 sunDirection;
uniform vec3 cameraPos;
uniform float sunIntensity;
uniform float time;

uniform sampler2D specularMap;
uniform sampler2D heightMap;
uniform float seaLevel;
uniform float maxDepth;
uniform vec3 deepColor;
uniform vec3 shallowColor;
uniform float maxOpacity;

varying vec3 vNormal;
varying vec3 vWorldPosition;
varying vec2 vUv;

void main() {
  // --- Ocean mask: discard land fragments ---
  float oceanMask = texture2D(specularMap, vUv).r;
  if (oceanMask < 0.1) discard;

  vec3 N = normalize(vNormal);
  vec3 sunDir = normalize(sunDirection);
  vec3 viewDir = normalize(cameraPos - vWorldPosition);

  // --- Day/night terminator ---
  float sunDot = dot(N, sunDir);
  float terminator = smoothstep(-0.175, 0.175, sunDot);

  // --- Water depth from heightmap ---
  float terrainHeight = texture2D(heightMap, vUv).r;
  float depth = max(seaLevel - terrainHeight, 0.0);
  float depthFactor = clamp(depth / maxDepth, 0.0, 1.0);

  // --- Beer-Lambert color absorption ---
  // Shallow water: light penetrates, shows turquoise
  // Deep water: light absorbed, shows dark blue
  vec3 waterColor = mix(shallowColor, deepColor, depthFactor);

  // --- Day-side lighting ---
  float diffuse = max(sunDot, 0.0);
  vec3 dayWater = waterColor * (0.6 + 0.4 * diffuse) * sunIntensity;

  // --- Night-side: very dark water with faint moonlight ---
  vec3 nightWater = waterColor * 0.02;

  vec3 color = mix(nightWater, dayWater, terminator);

  // --- Animated wave normals ---
  float ripple1 = noise(vUv.x * 800.0 + time * 2.0) * 0.5 + 0.5;
  float ripple2 = noise(vUv.y * 600.0 - time * 1.5 + 100.0) * 0.5 + 0.5;
  vec3 waveNormal = normalize(N + vec3(ripple1 - 0.5, ripple2 - 0.5, 0.0) * 0.02);

  // --- GGX sun glint (same dual-roughness as previous earth.frag) ---
  vec3 halfDir = normalize(sunDir + viewDir);
  float NdotH = max(dot(waveNormal, halfDir), 0.0);
  float VdotH = max(dot(viewDir, halfDir), 0.0);
  float NdotH2 = NdotH * NdotH;

  float a2_sharp = 0.12 * 0.12;
  float d_sharp = a2_sharp / (3.14159 * pow(NdotH2 * (a2_sharp - 1.0) + 1.0, 2.0));

  float a2_wide = 0.4 * 0.4;
  float d_wide = a2_wide / (3.14159 * pow(NdotH2 * (a2_wide - 1.0) + 1.0, 2.0));

  float F = 0.02 + 0.98 * pow(1.0 - VdotH, 5.0);

  vec3 glintColor = vec3(1.0, 0.95, 0.85);
  color += glintColor * (d_sharp * 1.8 + d_wide * 0.3) * F * terminator;

  // --- Fresnel sky reflection ---
  float viewFresnel = fresnelFactor(viewDir, N);
  float fresnel = pow(viewFresnel, 4.0);
  vec3 skyColor = vec3(0.15, 0.25, 0.45);
  color += skyColor * fresnel * terminator * 0.3;

  // --- Opacity: transparent in shallows, opaque in deep water ---
  float alpha = mix(0.3, maxOpacity, depthFactor) * oceanMask;

  gl_FragColor = vec4(color, alpha);
}
```

- [ ] **Step 3: Commit**

```bash
git add shaders/ocean.vert shaders/ocean.frag
git commit -m "feat: ocean shaders with Beer-Lambert depth + GGX glint"
```

---

### Task 5: Create Ocean Component

**Files:**
- Create: `earth-globe/ocean.js`

- [ ] **Step 1: Create ocean.js following component protocol**

Create `earth-globe/ocean.js`:

```javascript
import * as THREE from 'three';
import vertexShader from './shaders/ocean.vert';
import fragmentShader from './shaders/ocean.frag';

/**
 * Create the ocean component.
 *
 * A smooth sphere at earthRadius (sea level) with Beer-Lambert
 * depth coloring and GGX sun glint. Uses the specular map to
 * mask land areas (discard in fragment shader).
 *
 * @param {object} deps
 * @param {object} deps.config - CONFIG.ocean
 * @param {number} deps.earthRadius
 * @param {THREE.Vector3} deps.cameraPosition - live reference
 * @param {THREE.Texture} deps.specularTex - ocean mask (white=water)
 * @param {THREE.Texture} deps.heightTex - terrain heights for depth calc
 * @returns {import('./types.js').Component}
 */
export function createOcean({ config, earthRadius, cameraPosition, specularTex, heightTex }) {
  const [segW, segH] = config.segments;
  const geometry = new THREE.SphereGeometry(earthRadius, segW, segH);

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
      cameraPos: { value: cameraPosition },
      sunIntensity: { value: 1.0 },
      time: { value: 0.0 },
      specularMap: { value: specularTex },
      heightMap: { value: heightTex },
      seaLevel: { value: config.seaLevel },
      maxDepth: { value: config.maxDepth },
      deepColor: { value: new THREE.Color(...config.deepColor) },
      shallowColor: { value: new THREE.Color(...config.shallowColor) },
      maxOpacity: { value: config.opacity },
    },
    transparent: true,
    depthWrite: true,
    side: THREE.FrontSide,
    // Push ocean slightly behind terrain at coastlines to prevent z-fighting
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });

  const object3D = new THREE.Mesh(geometry, material);

  return {
    object3D,

    update(ctx) {
      material.uniforms.sunDirection.value.copy(ctx.sunDirection);
      material.uniforms.sunIntensity.value = ctx.sunIntensity;
      material.uniforms.time.value = ctx.time;
    },

    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add ocean.js
git commit -m "feat: ocean component with depth coloring and GGX specular"
```

---

### Task 6: Integrate Ocean into Main Scene

**Files:**
- Modify: `earth-globe/main.js`

- [ ] **Step 1: Import ocean module**

At the top of `main.js`, after the existing imports, add:

```javascript
import { createOcean } from './ocean.js';
```

- [ ] **Step 2: Create ocean component after earth**

After `const sun = createSun(...)` (around line 133), add:

```javascript
const ocean = createOcean({
  config: CONFIG.ocean,
  earthRadius,
  cameraPosition: camera.position,
  specularTex: earth.material.uniforms.specularMap.value,
  heightTex: earth.material.uniforms.heightMap.value,
});
```

- [ ] **Step 3: Add ocean to scene graph and component list**

After `earthGroup.add(earth.object3D);` (line 141), add:

```javascript
earthGroup.add(ocean.object3D);
```

Update the components array to include ocean (after earth, before atmosphere):

```javascript
const components = [clouds, earth, ocean, atmosphere, aurora, stars, moon, sun];
```

- [ ] **Step 4: Add ocean disposal**

In the `destroy()` function, ocean is already covered by the `for (const component of components)` loop since it follows the component protocol.

- [ ] **Step 5: Commit**

```bash
git add main.js
git commit -m "feat: integrate ocean mesh into scene graph"
```

---

### Task 7: Remove Ocean Code from Earth Shader

**Files:**
- Modify: `earth-globe/shaders/earth.frag`

- [ ] **Step 1: Remove ocean-specific code blocks**

In `earth-globe/shaders/earth.frag`, remove the entire ocean section (lines 211-254). This includes:
- `// === OCEAN SUN GLINT ===` block (oceanMask detection)
- Ocean darkening (`color *= mix(1.0, 0.92, ...)`)
- Animated micro-ripple
- GGX dual-roughness calculation
- Schlick Fresnel
- Fresnel-boosted ocean sky reflection

Keep the `// --- Fresnel rim ---` line (line 256) as it applies to the whole globe, not just ocean.

The result: the earth shader handles LAND only. Ocean is handled by the dedicated `ocean.frag`.

- [ ] **Step 2: Remove now-unused uniforms from earth.frag**

Remove these uniform declarations (they're now only used by ocean.frag):
```glsl
uniform sampler2D specularMap;
uniform float hasSpecularMap;
```

Also remove the specularMap keepAlive line:
```glsl
  _keepAlive += texture2D(specularMap, vec2(0.5)).r * 0.0001;
```

- [ ] **Step 3: Remove specularMap uniform from earth.js**

In `earth-globe/earth.js`, remove these two lines from the uniforms object:
```javascript
      specularMap: { value: specularTex },
      hasSpecularMap: { value: specularTex ? 1.0 : 0.0 },
```

But keep loading the specular texture — it's still needed by `ocean.js` (passed via `main.js`).

- [ ] **Step 4: Verify no shader compilation errors**

```bash
cd earth-globe && npm run dev
```

Open browser, check console for no GLSL errors. Verify:
- Land renders with terrain detail but no ocean specular
- Ocean renders as a separate blue layer on top
- Coastlines look clean (no z-fighting)
- Sun glint appears on the ocean, not on land

- [ ] **Step 5: Run tests and commit**

```bash
npm test
git add shaders/earth.frag earth.js
git commit -m "refactor: move ocean rendering to dedicated ocean shader"
```

---

### Task 8: Final Verification

- [ ] **Step 1: Run tests**

```bash
cd earth-globe && npm test
```

Expected: All 37+ tests pass.

- [ ] **Step 2: Visual verification checklist**

Open `http://localhost:5173/`:

- [ ] Zoom far (L1): terrain is prominently exaggerated (~15x), mountains clearly visible
- [ ] Zoom close (L3): terrain exaggeration reduced (~2x), more realistic
- [ ] Zoom transition: displacement smoothly interpolates during camera flight
- [ ] Ocean: deep ocean is dark blue/black
- [ ] Ocean: continental shelves (e.g., around Indonesia, East China Sea) are turquoise/lighter
- [ ] Ocean: sun glint appears on water surface, NOT on land
- [ ] Ocean: coastlines are clean (no flickering/z-fighting)
- [ ] Ocean: night-side water is very dark
- [ ] Land: terrain detail visible (normal map + displacement)
- [ ] Land: NO ocean specular artifacts on deserts/ice caps
- [ ] No WebGL errors in console
- [ ] Performance: stable 30+ fps

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: Phase 1-2 terrain simulator complete"
```
