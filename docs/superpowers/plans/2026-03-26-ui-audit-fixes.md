# UI Audit Full Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 15 UI audit issues (C1–C3, H1–H4, M1–M5, L1–L3) from CLAUDE.md in the earth-globe project.

**Architecture:** Layered approach — CSS design tokens first (foundation for other fixes), then critical security/scaling, performance, accessibility, responsive, and visual enhancements. Each task is independently committable.

**Tech Stack:** Vanilla CSS custom properties, Three.js 0.170, GSAP 3.14, Vite

---

## File Map

| File | Changes | Issues |
|------|---------|--------|
| `style.css` | Extract all colors/sizes to `:root` vars, add responsive breakpoints, focus-visible styles, increase touch targets | H3, L3, H1, M1, M2, L1 |
| `overlay.js` | XSS fix (textContent), transform positioning, visibility toggle, level-aware card sizing | C3, H4, M3, C2 |
| `markers.js` | Dynamic scaling by focalLength, priority-based color | C1, M4 |
| `hud.js` | ARIA attributes on buttons, focus styles | H2 |
| `loading.js` | ARIA attributes on loading overlay | M5 |
| `index.html` | lang="zh-CN" | L2 |
| `cardLifecycle.js` | Pass focalLength to createMarker, update overlay level class | C1, C2 |
| `levelLoop.js` | Set CSS level class on overlay container when level changes | C2 |

---

### Task 1: CSS Design Tokens Foundation (H3 + L3)

**Files:**
- Modify: `earth-globe/style.css`

- [ ] **Step 1: Add `:root` custom properties block at top of style.css**

Replace the opening of `style.css` (before the `*` reset) with a `:root` block, then update all selectors to reference the variables. The full replacement for the file:

```css
/* ===== Design Tokens ===== */
:root {
  /* -- Colors -- */
  --color-primary: #00dd00;
  --color-secondary: #00bb00;
  --color-muted: #00aa00;
  --color-dim: #008800;
  --color-subtle: #006600;
  --color-surface: rgba(0, 8, 0, 0.82);
  --color-border: rgba(0, 255, 0, 0.15);
  --color-border-hover: rgba(0, 255, 0, 0.3);
  --color-danger: #ff3300;
  --color-danger-muted: #991100;
  --color-danger-border: rgba(255, 51, 0, 0.4);
  --color-danger-glow: rgba(255, 51, 0, 0.1);

  /* -- Typography -- */
  --font-display: 'Fusion Pixel 12', monospace;
  --font-body: 'Fusion Pixel 10', monospace;
  --font-size-xl: 36px;
  --font-size-lg: 24px;
  --font-size-md: 20px;

  /* -- Spacing -- */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-lg: 16px;
  --space-xl: 24px;
  --space-2xl: 32px;

  /* -- Effects -- */
  --vignette-opacity: 0.35;

  /* -- Card sizing (overridden per level) -- */
  --card-max-width: 320px;
  --card-title-size: 24px;
  --card-body-size: 20px;
  --card-padding-v: 12px;
  --card-padding-h: 16px;
}
```

- [ ] **Step 2: Replace all hardcoded values in selectors with CSS variable references**

Every selector in `style.css` that uses a hardcoded color, font-family, font-size, or spacing value must be updated to reference the corresponding `--var`. Specific replacements:

| Selector | Property | Old Value | New Value |
|----------|----------|-----------|-----------|
| `body::after` | background | `rgba(0,0,0,0.35)` | `rgba(0,0,0,var(--vignette-opacity))` |
| `.info-card` | background | `rgba(0, 8, 0, 0.82)` | `var(--color-surface)` |
| `.info-card` | border | `rgba(0, 255, 0, 0.15)` | `var(--color-border)` |
| `.info-card` | padding | `12px 16px` | `var(--card-padding-v) var(--card-padding-h)` |
| `.info-card` | max-width | `320px` | `var(--card-max-width)` |
| `.info-card` | font-family | literal | `var(--font-display)` |
| `.info-card__title` | color | `#00dd00` | `var(--color-primary)` |
| `.info-card__title` | font-size | `24px` | `var(--card-title-size)` |
| `.info-card__title::before` | color | `#006600` | `var(--color-subtle)` |
| `.info-card__summary` | color | `#008800` | `var(--color-dim)` |
| `.info-card__summary` | font-family | literal | `var(--font-body)` |
| `.info-card__summary` | font-size | `20px` | `var(--card-body-size)` |
| `.info-card__meta` | color | `#006600` | `var(--color-subtle)` |
| `.info-card__meta` | font-family | literal | `var(--font-body)` |
| `.info-card__meta` | font-size | `20px` | `var(--card-body-size)` |
| `.info-card--high` | border-color | `rgba(255, 51, 0, 0.4)` | `var(--color-danger-border)` |
| `.info-card--high` | box-shadow | `rgba(255, 51, 0, 0.1)` | `var(--color-danger-glow)` |
| `.info-card--high .info-card__title` | color | `#ff3300` | `var(--color-danger)` |
| `.info-card--high .info-card__title::before` | color | `#991100` | `var(--color-danger-muted)` |
| `#hud` | font-family | literal | `var(--font-display)` |
| `#hud` | padding | `24px 32px` | `var(--space-xl) var(--space-2xl)` |
| `#hud-level-name` | color | `#00dd00` | `var(--color-primary)` |
| `#hud-level-name` | font-size | `36px` | `var(--font-size-xl)` |
| `#hud-level-en` | color | `#006600` | `var(--color-subtle)` |
| `#hud-level-en` | font-family | literal | `var(--font-body)` |
| `#hud-level-en` | font-size | `20px` | `var(--font-size-md)` |
| `#hud-date` | color | `#006600` | `var(--color-subtle)` |
| `#hud-date` | font-family | literal | `var(--font-body)` |
| `#hud-date` | font-size | `20px` | `var(--font-size-md)` |
| `#hud-time` | color | `#00bb00` | `var(--color-secondary)` |
| `#hud-time` | font-size | `24px` | `var(--font-size-lg)` |
| `#hud-indicators` | color | `#00aa00` | `var(--color-muted)` |
| `#hud-indicators` | font-size | `24px` | `var(--font-size-lg)` |
| `#level-switcher` | bottom | `24px` | `var(--space-xl)` |
| `#level-switcher` | gap | `12px` | `var(--space-md)` |
| `.level-btn` | background | `rgba(0, 8, 0, 0.75)` | `var(--color-surface)` |
| `.level-btn` | border | `rgba(0, 255, 0, 0.12)` | `var(--color-border)` |
| `.level-btn` | color | `#006600` | `var(--color-subtle)` |
| `.level-btn` | font-family | literal | `var(--font-body)` |
| `.level-btn` | font-size | `20px` | `var(--font-size-md)` |
| `.level-btn` | padding | `8px 16px` | `var(--space-sm) var(--space-lg)` |
| `.level-btn:hover` | border-color | `rgba(0, 255, 0, 0.3)` | `var(--color-border-hover)` |
| `.level-btn:hover` | color | `#00aa00` | `var(--color-muted)` |
| `.level-btn--active` | border-color | `rgba(0, 255, 0, 0.3)` | `var(--color-border-hover)` |
| `.level-btn--active` | color | `#00dd00` | `var(--color-primary)` |

- [ ] **Step 3: Verify dev server compiles without errors**

Run: `cd earth-globe && npm run dev -- --host 2>&1 | head -5`
Expected: Vite dev server starts, no CSS parse errors.

- [ ] **Step 4: Commit**

```bash
git add earth-globe/style.css
git commit -m "refactor(css): extract design tokens to CSS custom properties (H3+L3)"
```

---

### Task 2: XSS Fix (C3)

**Files:**
- Modify: `earth-globe/overlay.js:27-46`

- [ ] **Step 1: Replace innerHTML with safe DOM construction in `createInfoCard`**

Replace lines 30–46 of `overlay.js` with:

```javascript
export function createInfoCard(data) {
  const container = createOverlayContainer();

  const card = document.createElement('div');
  card.className = 'info-card';
  if (data.priority === 'high') {
    card.classList.add('info-card--high');
  }

  const title = document.createElement('div');
  title.className = 'info-card__title';
  title.textContent = data.title;

  const summary = document.createElement('div');
  summary.className = 'info-card__summary';
  summary.textContent = data.summary;

  const meta = document.createElement('div');
  meta.className = 'info-card__meta';
  meta.textContent = `[${data.source}]  ${data.time}`;

  card.appendChild(title);
  card.appendChild(summary);
  card.appendChild(meta);

  card.style.opacity = '0';
  card.style.pointerEvents = 'none';

  container.appendChild(card);
  return card;
}
```

- [ ] **Step 2: Verify the app still loads and cards render**

Run: `cd earth-globe && npm run dev`
Expected: Cards display text correctly (no HTML interpretation in content)

- [ ] **Step 3: Commit**

```bash
git add earth-globe/overlay.js
git commit -m "fix(security): replace innerHTML with textContent to prevent XSS (C3)"
```

---

### Task 3: Performance — Card Positioning (H4 + M3)

**Files:**
- Modify: `earth-globe/overlay.js:56-68`
- Modify: `earth-globe/style.css` (add `.info-card` positioning base styles)

- [ ] **Step 1: Update `.info-card` base styles in `style.css`**

Add to the `.info-card` rule:

```css
.info-card {
  position: absolute;
  left: 0;
  top: 0;
  will-change: transform;
  /* ... existing properties ... */
}
```

- [ ] **Step 2: Replace `updateCardPosition` in `overlay.js`**

Replace the entire `updateCardPosition` function (lines 56-68) with:

```javascript
export function updateCardPosition(card, screenPos, visible) {
  if (!visible) {
    card.style.visibility = 'hidden';
    return;
  }

  card.style.visibility = '';
  const offsetX = 12;
  const offsetY = -8;
  card.style.transform = `translate3d(${screenPos.x + offsetX}px, ${screenPos.y + offsetY}px, 0) translateY(-100%)`;
}
```

Key changes:
- `display: none` → `visibility: hidden` (no layout reflow, M3)
- `left`/`top` per frame → `transform: translate3d()` (GPU composited, no layout thrashing, H4)
- Single transform combines position + the original `translateY(-100%)`

- [ ] **Step 3: Verify card positioning still works correctly**

Run: `cd earth-globe && npm run dev`
Expected: Cards appear at correct positions next to stalk tops, disappear when markers face away.

- [ ] **Step 4: Commit**

```bash
git add earth-globe/overlay.js earth-globe/style.css
git commit -m "perf: use transform3d for card positioning, visibility for toggle (H4+M3)"
```

---

### Task 4: Marker Scaling by Focal Length (C1)

**Files:**
- Modify: `earth-globe/markers.js`
- Modify: `earth-globe/cardLifecycle.js:53`

- [ ] **Step 1: Make `createMarker` accept focalLength and scale accordingly**

Replace the constants and `createMarker` function in `markers.js`:

```javascript
import * as THREE from 'three';
import { geoToSphere, getSurfaceNormal } from './geo.js';

/** Base reference focal length (L1 level) */
const BASE_FOCAL_LENGTH = 37;

/** Base stalk height at reference focal length */
const BASE_STALK_HEIGHT = 1.2;

/** Base anchor size at reference focal length */
const BASE_ANCHOR_SIZE = 0.06;

/** Default marker color (normal priority) */
const COLOR_NORMAL = 0x00dd00;

/** High priority marker color */
const COLOR_HIGH = 0xff3300;

/**
 * 创建球面锚点 + 标注杆，加为 earthGroup 的子对象。
 *
 * @param {number} lat - 纬度
 * @param {number} lon - 经度
 * @param {THREE.Group} earthGroup - M1 地球 Group
 * @param {{ focalLength?: number, priority?: string }} [options]
 * @returns {{
 *   anchor: THREE.Mesh,
 *   stalk: THREE.Line,
 *   surfacePos: THREE.Vector3,
 *   topPosition: THREE.Vector3,
 *   normal: THREE.Vector3,
 *   dispose: () => void,
 * }}
 */
export function createMarker(lat, lon, earthGroup, options = {}) {
  const focalLength = options.focalLength ?? BASE_FOCAL_LENGTH;
  const priority = options.priority ?? 'normal';

  // Scale inversely with focal length so markers stay visually consistent
  const scale = BASE_FOCAL_LENGTH / focalLength;
  const stalkHeight = BASE_STALK_HEIGHT * scale;
  const anchorSize = BASE_ANCHOR_SIZE * scale;
  const markerColor = priority === 'high' ? COLOR_HIGH : COLOR_NORMAL;

  const surfacePos = geoToSphere(lat, lon);
  const normal = getSurfaceNormal(lat, lon);
  const topPosition = surfacePos
    .clone()
    .add(normal.clone().multiplyScalar(stalkHeight));

  // --- 锚点 ---
  const anchorGeo = new THREE.BoxGeometry(anchorSize, anchorSize, anchorSize);
  const anchorMat = new THREE.MeshBasicMaterial({
    color: markerColor,
    transparent: true,
    opacity: 0,
    depthTest: false,
  });
  const anchor = new THREE.Mesh(anchorGeo, anchorMat);
  anchor.position.copy(surfacePos);
  anchor.lookAt(surfacePos.clone().add(normal));
  anchor.renderOrder = 999;

  // --- 标注杆 ---
  const stalkGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(6);
  positions[0] = surfacePos.x;
  positions[1] = surfacePos.y;
  positions[2] = surfacePos.z;
  positions[3] = surfacePos.x;
  positions[4] = surfacePos.y;
  positions[5] = surfacePos.z;
  stalkGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const stalkMat = new THREE.LineBasicMaterial({
    color: markerColor,
    transparent: true,
    opacity: 0.6,
    depthTest: false,
  });
  const stalk = new THREE.Line(stalkGeo, stalkMat);
  stalk.renderOrder = 998;
  stalk.visible = false;

  earthGroup.add(anchor);
  earthGroup.add(stalk);

  return {
    anchor,
    stalk,
    surfacePos,
    topPosition,
    normal,
    dispose() {
      earthGroup.remove(anchor);
      earthGroup.remove(stalk);
      anchorGeo.dispose();
      anchorMat.dispose();
      stalkGeo.dispose();
      stalkMat.dispose();
    },
  };
}

/**
 * 更新标注杆生长进度。
 */
export function updateStalkGrowth(stalk, surfacePos, topPos, progress) {
  const positions = stalk.geometry.attributes.position.array;
  positions[0] = surfacePos.x;
  positions[1] = surfacePos.y;
  positions[2] = surfacePos.z;
  positions[3] = surfacePos.x + (topPos.x - surfacePos.x) * progress;
  positions[4] = surfacePos.y + (topPos.y - surfacePos.y) * progress;
  positions[5] = surfacePos.z + (topPos.z - surfacePos.z) * progress;
  stalk.geometry.attributes.position.needsUpdate = true;
}

export { BASE_STALK_HEIGHT as STALK_HEIGHT };
```

- [ ] **Step 2: Update `cardLifecycle.js` to pass focalLength and priority to `createMarker`**

In `cardLifecycle.js`, change the `showNewsItem` function signature to accept `focalLength` and pass it through:

Replace line 42:
```javascript
export function showNewsItem(newsItem, earthGroup, camera, canvas) {
```
With:
```javascript
export function showNewsItem(newsItem, earthGroup, camera, canvas, options = {}) {
```

Replace line 53:
```javascript
    const marker = createMarker(lat, lon, earthGroup);
```
With:
```javascript
    const marker = createMarker(lat, lon, earthGroup, {
      focalLength: options.focalLength,
      priority: newsItem.priority,
    });
```

Also update `showNewsSequence` (line 159) to accept and pass `focalLength`:

Replace lines 159-166:
```javascript
export async function showNewsSequence(
  newsItems,
  earthGroup,
  camera,
  canvas,
  options = {},
) {
  const breathInterval = options.breathInterval ?? 1.5;
```

Replace line 169:
```javascript
    await showNewsItem(item, earthGroup, camera, canvas);
```
With:
```javascript
    await showNewsItem(item, earthGroup, camera, canvas, {
      focalLength: options.focalLength,
    });
```

- [ ] **Step 3: Pass focalLength from `levelLoop.js`**

In `levelLoop.js`, update the `showNewsSequence` call (line 128) to pass the current level's focalLength:

Replace:
```javascript
        await showNewsSequence(items, earthGroup, camera, canvas);
```
With:
```javascript
        await showNewsSequence(items, earthGroup, camera, canvas, {
          focalLength: config.focalLength,
        });
```

- [ ] **Step 4: Verify markers scale correctly at different levels**

Run: `cd earth-globe && npm run dev`
Expected: At L1 (37mm), markers appear at current size. At L2 (200mm), markers are ~5.4× smaller. At L3 (250mm), markers are ~6.8× smaller. All look proportionally consistent on screen.

- [ ] **Step 5: Commit**

```bash
git add earth-globe/markers.js earth-globe/cardLifecycle.js earth-globe/levelLoop.js
git commit -m "fix: scale markers inversely with focal length, add priority colors (C1+M4)"
```

---

### Task 5: Level-Aware Card Sizing (C2)

**Files:**
- Modify: `earth-globe/style.css`
- Modify: `earth-globe/levelLoop.js`

- [ ] **Step 1: Add level-specific CSS variable overrides in `style.css`**

Add after the `:root` block:

```css
/* Level-specific card sizing */
.level-L2 {
  --card-max-width: 240px;
  --card-title-size: 18px;
  --card-body-size: 15px;
  --card-padding-v: 8px;
  --card-padding-h: 12px;
}

.level-L3 {
  --card-max-width: 180px;
  --card-title-size: 14px;
  --card-body-size: 12px;
  --card-padding-v: 6px;
  --card-padding-h: 10px;
}
```

- [ ] **Step 2: Set level class on overlay container in `levelLoop.js`**

In `levelLoop.js`, after the `updateHUDLevel(level, config)` call (line 93), add:

```javascript
      // Update overlay container level class for card sizing
      const overlayEl = document.getElementById('overlay');
      if (overlayEl) {
        overlayEl.className = `level-${level}`;
        overlayEl.id = 'overlay';  // preserve id after className reset
      }
```

- [ ] **Step 3: Verify cards are smaller at L2/L3**

Run: `cd earth-globe && npm run dev`
Expected: Cards visually shrink at L2 and L3, remaining readable but proportional to the zoom level.

- [ ] **Step 4: Commit**

```bash
git add earth-globe/style.css earth-globe/levelLoop.js
git commit -m "fix: scale info cards per zoom level via CSS custom properties (C2)"
```

---

### Task 6: Accessibility (H2 + M5 + L2)

**Files:**
- Modify: `earth-globe/hud.js:62-77`
- Modify: `earth-globe/loading.js:8-14`
- Modify: `earth-globe/index.html:2`
- Modify: `earth-globe/style.css`

- [ ] **Step 1: Fix HTML lang attribute (L2)**

In `index.html`, change line 2:

```html
<html lang="zh-CN">
```

- [ ] **Step 2: Add ARIA attributes to level buttons (H2)**

In `hud.js`, replace the button creation loop (lines 66-76) with:

```javascript
  for (const level of LEVEL_ORDER) {
    const config = levelConfigs[level];
    const btn = document.createElement('button');
    btn.className = 'level-btn';
    btn.dataset.level = level;
    btn.textContent = `> ${config.label}`;
    btn.setAttribute('aria-label', `切换到${config.label}`);
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => {
      onSwitch(level);
    });
    elSwitcher.appendChild(btn);
  }
```

In `updateHUDLevel`, update the button active state section (lines 114-119) to also update `aria-pressed`:

Replace:
```javascript
    btns.forEach((btn) => {
      btn.classList.toggle('level-btn--active', btn.dataset.level === level);
    });
```
With:
```javascript
    btns.forEach((btn) => {
      const isActive = btn.dataset.level === level;
      btn.classList.toggle('level-btn--active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
```

- [ ] **Step 3: Add focus-visible styles in `style.css`**

Add after the `.level-btn--active` rule:

```css
.level-btn:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
```

- [ ] **Step 4: Add ARIA attributes to loading overlay (M5)**

In `loading.js`, replace lines 8-14:

```javascript
const overlay = document.createElement('div');
overlay.id = 'loading-overlay';
overlay.setAttribute('role', 'status');
overlay.setAttribute('aria-live', 'polite');
overlay.setAttribute('aria-label', '加载中');
overlay.innerHTML = `
  <div class="loading-text">
    <span>Loading Earth…</span>
    <span id="loading-progress" aria-live="polite">0%</span>
  </div>`;
```

- [ ] **Step 5: Verify accessibility attributes are present in DOM**

Run: `cd earth-globe && npm run dev`
Open DevTools → Elements tab:
- `<html lang="zh-CN">` ✓
- `<button class="level-btn" aria-label="..." aria-pressed="false">` ✓
- `<div id="loading-overlay" role="status" aria-live="polite">` ✓
- Tab to level buttons → focus ring visible ✓

- [ ] **Step 6: Commit**

```bash
git add earth-globe/index.html earth-globe/hud.js earth-globe/loading.js earth-globe/style.css
git commit -m "fix(a11y): add ARIA attrs to buttons/loading, fix lang, focus styles (H2+M5+L2)"
```

---

### Task 7: Responsive & Mobile Adaptation (H1 + M1 + M2)

**Files:**
- Modify: `earth-globe/style.css`

- [ ] **Step 1: Add responsive breakpoints at the end of `style.css`**

Add before the kiosk rule (before `body.kiosk`):

```css
/* ===== Responsive ===== */
@media (max-width: 768px) {
  :root {
    --font-size-xl: 24px;
    --font-size-lg: 18px;
    --font-size-md: 16px;
    --space-xl: 16px;
    --space-2xl: 20px;
    --card-max-width: 260px;
    --card-title-size: 20px;
    --card-body-size: 16px;
  }

  .level-btn {
    padding: var(--space-md) var(--space-xl);
    min-height: 48px;
    min-width: 48px;
  }
}

@media (max-width: 480px) {
  :root {
    --font-size-xl: 20px;
    --font-size-lg: 16px;
    --font-size-md: 14px;
    --space-xl: 12px;
    --space-2xl: 16px;
    --card-max-width: 200px;
    --card-title-size: 16px;
    --card-body-size: 14px;
  }

  #level-switcher {
    flex-direction: column;
    bottom: var(--space-md);
    right: var(--space-md);
    left: auto;
    transform: none;
  }
}
```

- [ ] **Step 2: Increase default touch target for level buttons**

In the base `.level-btn` rule, add:

```css
.level-btn {
  /* existing properties... */
  min-height: 44px;
}
```

This ensures 44px minimum height even on desktop (Apple HIG minimum), with 48px on mobile via the media query.

- [ ] **Step 3: Verify responsive behavior**

Run: `cd earth-globe && npm run dev`
Open DevTools responsive mode → test at 768px and 480px widths.
Expected: HUD text scales down, level buttons are tappable, cards don't overflow viewport.

- [ ] **Step 4: Commit**

```bash
git add earth-globe/style.css
git commit -m "feat(responsive): add breakpoints for HUD/cards/buttons (H1+M1+M2)"
```

---

### Task 8: Font Display Fix (L1)

**Files:**
- Modify: `earth-globe/style.css:78-87`

- [ ] **Step 1: Change `font-display` from `swap` to `optional`**

Replace both `@font-face` rules:

```css
@font-face {
  font-family: 'Fusion Pixel 12';
  src: url('/fonts/fusion-pixel-12px-monospaced-zh_hans.woff2') format('woff2');
  font-display: optional;
}
@font-face {
  font-family: 'Fusion Pixel 10';
  src: url('/fonts/fusion-pixel-10px-monospaced-zh_hans.woff2') format('woff2');
  font-display: optional;
}
```

With `optional`, the browser uses the font if it loads within ~100ms (typically from cache), otherwise uses the fallback for the entire page lifecycle — no flash.

- [ ] **Step 2: Commit**

```bash
git add earth-globe/style.css
git commit -m "fix: use font-display:optional to prevent FOUT (L1)"
```

---

### Task 9: Final Integration Verification

- [ ] **Step 1: Run linter**

Run: `cd earth-globe && npx eslint main.js overlay.js markers.js hud.js loading.js cardLifecycle.js levelLoop.js`
Expected: No errors (warnings are acceptable).

- [ ] **Step 2: Run tests**

Run: `cd earth-globe && npm test`
Expected: All existing tests pass (config.test.js, geo.test.js, sun.test.js, tiledTexture.test.js).

- [ ] **Step 3: Manual visual verification checklist**

Run: `cd earth-globe && npm run dev`

Verify each fix:
- [ ] C1: Markers shrink proportionally at L2/L3 — stalks are not towering
- [ ] C2: Info cards shrink at L2/L3 — don't fill viewport
- [ ] C3: Insert `<script>alert(1)</script>` in news.json title → text renders as literal string
- [ ] H1: Resize browser window → HUD text stays proportional
- [ ] H2: Tab to level buttons → focus ring visible, screen reader reads aria-label
- [ ] H3: Inspect `:root` in DevTools → all custom properties present
- [ ] H4: Performance tab → no layout thrashing during card animation
- [ ] M1: DevTools responsive 480px → UI is usable
- [ ] M2: Level buttons ≥ 44px tall on desktop, ≥ 48px on mobile
- [ ] M3: Card hide/show → no layout shift (visibility not display)
- [ ] M4: High-priority news items → orange marker stalk and anchor
- [ ] M5: Loading overlay → `role="status"` in DOM
- [ ] L1: Hard refresh → no flash of fallback font (or graceful degradation)
- [ ] L2: `<html lang="zh-CN">` in DOM
- [ ] L3: Vignette opacity → controlled by `--vignette-opacity` CSS variable

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: UI audit complete — all 15 issues fixed (C1-C3, H1-H4, M1-M5, L1-L3)"
```
