# Tier 1 Visual Quality Upgrades

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the earth globe from "good" to "near-photorealistic" through texture quality improvements, proper ocean masking, and better tone mapping.

**Architecture:** Four independent upgrades — each produces a visible, testable improvement. Task 1-3 are texture downloads + config changes. Task 4 adds a new shader uniform (specular map) and replaces the blue-ratio ocean heuristic. Task 5 is a one-line tone mapping switch.

**Tech Stack:** Three.js 0.170, GLSL ES, curl for texture downloads

---

## Verification Criteria

After all tasks complete, verify against these acceptance standards:

| Check | Method | Pass Criteria |
|-------|--------|---------------|
| Normal map detail | Zoom to L3 (Jinshan), look at terrain | Mountain ridges and valleys visible, not flat blobs |
| Ocean specular accuracy | Rotate globe to show ice caps and deserts | No false ocean glint on Antarctica, Sahara, or Greenland |
| Ocean specular on water | Rotate to show sun reflection on Pacific | Bright sun glint trail on water, no glint on adjacent land |
| Cloud detail at L2 | Fly to L2 (Shanghai), examine clouds | Cloud edges defined, not blocky/pixelated |
| Tone mapping highlights | Look at sun glint and city lights | Bright areas retain color (not clipped to orange/white) |
| Night side city lights | View night side | City lights glow naturally, not over-saturated |
| No regressions | Full L1→L2→L3 cycle | All levels display correctly, no WebGL errors |
| Performance | Check GPU stats in GUI | Draw calls ≤ 2, frame rate ≥ 30fps |

---

### Task 1: Download High-Resolution Textures

**Files:**
- Download to: `earth-globe/public/textures/earth-normal-8k.jpg`
- Download to: `earth-globe/public/textures/earth-specular-8k.jpg`
- Download to: `earth-globe/public/textures/earth-clouds-4k.jpg`

- [ ] **Step 1: Download 8K normal map from Solar System Scope**

```bash
cd earth-globe/public/textures
curl -L -o earth-normal-8k.jpg "https://upload.wikimedia.org/wikipedia/commons/1/15/Solarsystemscope_texture_8k_earth_normal_map.jpg"
```

Verify: `file earth-normal-8k.jpg` should show JPEG image, dimensions ~8192×4096. File size should be 5-15MB.

If the URL fails, use the alternate source:
```bash
curl -L -o earth-normal-8k.jpg "https://www.solarsystemscope.com/textures/download/8k_earth_normal_map.jpg"
```

- [ ] **Step 2: Download 8K specular/ocean mask from Solar System Scope**

```bash
curl -L -o earth-specular-8k.jpg "https://upload.wikimedia.org/wikipedia/commons/7/72/Solarsystemscope_texture_8k_earth_specular_map.jpg"
```

Verify: `file earth-specular-8k.jpg` should show JPEG image. White = water, black = land.

If the URL fails:
```bash
curl -L -o earth-specular-8k.jpg "https://www.solarsystemscope.com/textures/download/8k_earth_specular_map.jpg"
```

- [ ] **Step 3: Download 4K cloud texture**

```bash
curl -L -o earth-clouds-4k.jpg "https://upload.wikimedia.org/wikipedia/commons/9/9e/Solarsystemscope_texture_2k_earth_clouds.jpg"
```

Note: Solar System Scope's "2K" clouds are actually higher quality than our current clouds. If a true 4K source is available, prefer it. Otherwise use NASA Visible Earth cloud composite.

Alternatively, use the existing specular map from the project if 8K download fails:
```bash
# Fallback: upscale existing 2K specular if download fails
ls -la earth-specular-2k.jpg  # 107KB already exists in the project
```

- [ ] **Step 4: Verify all downloaded textures**

```bash
file earth-normal-8k.jpg earth-specular-8k.jpg earth-clouds-4k.jpg
ls -lh earth-normal-8k.jpg earth-specular-8k.jpg earth-clouds-4k.jpg
```

Expected: All are valid JPEG files, normal map > 5MB, specular > 2MB.

- [ ] **Step 5: Commit texture files**

```bash
git add public/textures/earth-normal-8k.jpg public/textures/earth-specular-8k.jpg public/textures/earth-clouds-4k.jpg
git commit -m "assets: add 8K normal map, 8K specular map, 4K cloud texture"
```

---

### Task 2: Update Config to Use New Textures

**Files:**
- Modify: `earth-globe/config.js:109-122`

- [ ] **Step 1: Update texture paths in config.js**

In the `textures` object, change:

```javascript
  textures: {
    dayTiles: {
      basePath: '/textures/tiles/earth-day-16k',
      cols: 4,
      rows: 2,
      tileWidth: 5400,
      tileHeight: 5400,
      placeholder: '/textures/earth-day-8k.jpg',
    },
    night: '/textures/earth-night-8k.jpg',
    normal: '/textures/earth-normal-8k.jpg',       // was earth-normal-2k.jpg
    clouds: '/textures/earth-clouds-4k.jpg',       // was earth-clouds-2k.jpg
    heightmap: '/textures/earth-topo-5400x2700.jpg',
    specular: '/textures/earth-specular-8k.jpg',   // NEW
  },
```

Changes:
- `normal`: `earth-normal-2k.jpg` → `earth-normal-8k.jpg`
- `clouds`: `earth-clouds-2k.jpg` → `earth-clouds-4k.jpg`
- `specular`: NEW entry `earth-specular-8k.jpg`

- [ ] **Step 2: Verify dev server starts**

```bash
cd earth-globe && npm run dev -- --host 2>&1 | head -5
```

Expected: Vite starts without errors.

- [ ] **Step 3: Commit**

```bash
git add earth-globe/config.js
git commit -m "config: point to 8K normal, 4K clouds, add specular map path"
```

---

### Task 3: Load Specular Map in Earth Component

**Files:**
- Modify: `earth-globe/earth.js:36-54` (texture loading section)
- Modify: `earth-globe/earth.js:98-127` (uniforms section)

- [ ] **Step 1: Load the specular texture in earth.js**

After the existing texture loads (after `const heightTex = ...`), add:

```javascript
  const specularTex = textureConfig.specular
    ? textureLoader.load(textureConfig.specular)
    : null;
```

Set its color space (after the existing colorSpace assignments):

```javascript
  if (specularTex) {
    specularTex.colorSpace = THREE.LinearSRGBColorSpace;
    specularTex.anisotropy = maxAniso;
  }
```

- [ ] **Step 2: Add specular texture uniform to ShaderMaterial**

In the `uniforms` object inside `new THREE.ShaderMaterial({...})`, add after `regionOpacity2`:

```javascript
      specularMap: { value: specularTex },
      hasSpecularMap: { value: specularTex ? 1.0 : 0.0 },
```

- [ ] **Step 3: Commit**

```bash
git add earth-globe/earth.js
git commit -m "feat: load 8K specular map and pass to earth shader"
```

---

### Task 4: Integrate Specular Map into Earth Shader

**Files:**
- Modify: `earth-globe/shaders/earth.frag`

- [ ] **Step 1: Add specular map uniform declarations**

After the existing `uniform float cityLightBoost;` line (line 18), add:

```glsl
uniform sampler2D specularMap;
uniform float hasSpecularMap;
```

- [ ] **Step 2: Replace blue-ratio ocean detection with specular map**

Replace the ocean detection block (lines 165-168):

```glsl
  // === OCEAN SUN GLINT ===
  float luminance = dot(dayColor, vec3(0.299, 0.587, 0.114));
  float blueRatio = dayColor.b / (luminance + 0.01);
  float oceanMask = smoothstep(0.18, 0.08, luminance) * smoothstep(1.1, 1.5, blueRatio);
```

With:

```glsl
  // === OCEAN SUN GLINT ===
  float oceanMask;
  if (hasSpecularMap > 0.5) {
    // Use dedicated specular map: white = water, black = land
    oceanMask = texture2D(specularMap, vUv).r;
  } else {
    // Fallback: heuristic blue-ratio detection
    float luminance = dot(dayColor, vec3(0.299, 0.587, 0.114));
    float blueRatio = dayColor.b / (luminance + 0.01);
    oceanMask = smoothstep(0.18, 0.08, luminance) * smoothstep(1.1, 1.5, blueRatio);
  }
```

- [ ] **Step 3: Upgrade ocean specular from Blinn-Phong to GGX**

Replace the specular calculation block (lines 178-185):

```glsl
  vec3 halfDir = normalize(sunDir + viewDir);
  float specAngle = max(dot(rippleNormal, halfDir), 0.0);
  float specular = pow(specAngle, 150.0);
  float specularMid = pow(specAngle, 40.0);
  float specularWide = pow(specAngle, 12.0);

  vec3 glintColor = vec3(1.0, 0.95, 0.85);
  color += glintColor * (specular * 1.5 + specularMid * 0.35 + specularWide * 0.08) * oceanMask * terminator;
```

With GGX-based specular:

```glsl
  vec3 halfDir = normalize(sunDir + viewDir);
  float NdotH = max(dot(rippleNormal, halfDir), 0.0);
  float VdotH = max(dot(viewDir, halfDir), 0.0);

  // GGX (Trowbridge-Reitz) NDF — produces realistic long-tail sun glint
  float roughness = 0.15;
  float a2 = roughness * roughness;
  float denom = NdotH * NdotH * (a2 - 1.0) + 1.0;
  float D_GGX = a2 / (3.14159 * denom * denom);

  // Schlick Fresnel for water (IOR 1.33 → F0 = 0.02)
  float F = 0.02 + 0.98 * pow(1.0 - VdotH, 5.0);

  vec3 glintColor = vec3(1.0, 0.95, 0.85);
  color += glintColor * D_GGX * F * oceanMask * terminator;
```

- [ ] **Step 4: Add specularMap to _keepAlive to prevent dead-code elimination**

In the `_keepAlive` block (after the regionDayTex2 line), add:

```glsl
  _keepAlive += texture2D(specularMap, vec2(0.5)).r * 0.0001;
```

- [ ] **Step 5: Verify shader compiles**

```bash
cd earth-globe && npm run dev
```

Open browser, check console for no GLSL compilation errors.

- [ ] **Step 6: Commit**

```bash
git add earth-globe/shaders/earth.frag
git commit -m "feat: use specular map for ocean detection + GGX specular model"
```

---

### Task 5: Switch Tone Mapping to AgX

**Files:**
- Modify: `earth-globe/main.js:57`
- Modify: `earth-globe/config.js:83-85`

- [ ] **Step 1: Change tone mapping in main.js**

Replace:
```javascript
renderer.toneMapping = THREE.ACESFilmicToneMapping;
```
With:
```javascript
renderer.toneMapping = THREE.AgXToneMapping;
```

- [ ] **Step 2: Adjust exposure in config.js**

AgX needs slightly higher exposure than ACES. Change:
```javascript
  renderer: {
    toneMappingExposure: 1.2,    // was 1.0 — AgX needs slight boost
  },
```

- [ ] **Step 3: Verify visual appearance**

Open browser. Check:
- Sun glint on ocean retains warm color (not clipped to white)
- City lights glow naturally (not orange-shifted)
- Overall brightness is comparable to before

- [ ] **Step 4: Commit**

```bash
git add earth-globe/main.js earth-globe/config.js
git commit -m "feat: switch tone mapping from ACES to AgX for better HDR color fidelity"
```

---

### Task 6: Final Verification

- [ ] **Step 1: Run tests**

```bash
cd earth-globe && npm test
```

Expected: All existing tests pass.

- [ ] **Step 2: Run full visual verification**

Open `http://localhost:5173/` and verify each acceptance criterion:

- [ ] Normal map: zoom to L3 → terrain detail visible (ridges, valleys)
- [ ] Ocean mask: rotate to Antarctica → no false glint on ice
- [ ] Ocean mask: rotate to Sahara → no false glint on desert
- [ ] Ocean specular: rotate to show sun on Pacific → bright GGX glint trail
- [ ] Clouds: fly to L2 → cloud edges sharp, not pixelated
- [ ] Tone mapping: observe sun glint → color retained, not clipped
- [ ] Tone mapping: night side → city lights natural glow
- [ ] No WebGL errors in console
- [ ] Performance: GUI shows draw calls ≤ 2

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: Tier 1 visual quality upgrades complete"
```
