/**
 * hud.js — Glass Morphism HUD
 * 浮动玻璃顶栏 + 层级分段切换 + FAB按钮 + 数据侧面板
 */

import gsap from 'gsap';

const LEVEL_ORDER = ['L1', 'L2', 'L3'];

// DOM element references
let elLevelName = null;
let elLevelEn = null;
let elDate = null;
let elTime = null;
let elIndicatorDots = [];
let elToggleGroup = null;
let elSidePanel = null;
let elStatCount = null;
let elStatLevel = null;
let clockInterval = null;

/**
 * 初始化 HUD：顶栏 + FAB + 侧面板
 */
export function initHUD() {
  // ---- Glass Top Bar ----
  const hud = document.createElement('div');
  hud.id = 'hud';
  hud.innerHTML = `
    <div id="hud-left">
      <span class="hud-brand-dot"></span>
      <div class="hud-brand">
        <div id="hud-level-name">初始化中...</div>
        <div id="hud-level-en">LOADING</div>
      </div>
    </div>
    <div id="hud-center"></div>
    <div id="hud-right">
      <div class="hud-indicators" id="hud-indicators">
        <span class="hud-dot"></span>
        <span class="hud-dot"></span>
        <span class="hud-dot"></span>
      </div>
      <div class="status-pill">
        <span class="status-dot"></span>
        <span>实时</span>
      </div>
      <div class="hud-clock">
        <div id="hud-date"></div>
        <div id="hud-time"></div>
      </div>
    </div>
  `;
  document.body.appendChild(hud);

  // Store refs
  elLevelName = document.getElementById('hud-level-name');
  elLevelEn = document.getElementById('hud-level-en');
  elDate = document.getElementById('hud-date');
  elTime = document.getElementById('hud-time');
  elIndicatorDots = Array.from(document.querySelectorAll('.hud-dot'));

  // ---- FAB Cluster (bottom-right) ----
  const fabCluster = document.createElement('div');
  fabCluster.className = 'fab-cluster';
  fabCluster.innerHTML = `
    <button class="fab-btn fab-btn--panel" aria-label="数据面板" title="数据面板">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
      </svg>
    </button>
    <button class="fab-btn fab-btn--cinematic" aria-label="沉浸模式" title="沉浸模式">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
      </svg>
    </button>
  `;
  document.body.appendChild(fabCluster);

  // FAB: Toggle side panel
  fabCluster.querySelector('.fab-btn--panel').addEventListener('click', () => {
    toggleSidePanel();
  });

  // FAB: Toggle cinematic mode
  fabCluster.querySelector('.fab-btn--cinematic').addEventListener('click', (e) => {
    document.body.classList.toggle('cinematic');
    e.currentTarget.classList.toggle('fab-btn--active');
  });

  // ---- Side Panel ----
  const panel = document.createElement('aside');
  panel.className = 'side-panel side-panel--hidden';
  panel.setAttribute('aria-label', '数据面板');
  panel.innerHTML = `
    <div class="side-panel__header">
      <span class="side-panel__title">数据概览</span>
      <button class="side-panel__close" aria-label="关闭面板">&times;</button>
    </div>
    <div class="side-panel__section">
      <div class="side-panel__section-title">当前层级</div>
      <div class="stat-row">
        <span class="stat-label">层级</span>
        <span class="stat-value" id="stat-level">--</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">信息条目</span>
        <span class="stat-value" id="stat-count">--</span>
      </div>
    </div>
    <div class="side-panel__section">
      <div class="side-panel__section-title">图例</div>
      <div class="legend-item">
        <span class="legend-swatch" style="background: #00e5ff"></span>
        <span class="legend-label">常规信息</span>
      </div>
      <div class="legend-item">
        <span class="legend-swatch" style="background: #f87171"></span>
        <span class="legend-label">重要信息</span>
      </div>
      <div class="legend-item">
        <span class="legend-swatch" style="background: #38bdf8"></span>
        <span class="legend-label">行政边界</span>
      </div>
      <div class="legend-item">
        <span class="legend-swatch" style="background: #ffcc44"></span>
        <span class="legend-label">镇/街道边界</span>
      </div>
    </div>
  `;
  document.body.appendChild(panel);
  elSidePanel = panel;
  elStatCount = document.getElementById('stat-count');
  elStatLevel = document.getElementById('stat-level');

  // Side panel close button
  panel.querySelector('.side-panel__close').addEventListener('click', () => {
    toggleSidePanel(false);
  });

  // Start clock
  updateClock();
  clockInterval = setInterval(updateClock, 1000);
}

/**
 * 设置层级切换按钮（移入顶栏中央）
 */
export function setupLevelButtons(levelConfigs, onSwitch) {
  const center = document.getElementById('hud-center');
  if (!center) return;

  const group = document.createElement('div');
  group.className = 'hud-toggle-group';
  group.setAttribute('role', 'tablist');
  group.setAttribute('aria-label', '层级切换');

  for (const level of LEVEL_ORDER) {
    const config = levelConfigs[level];
    const btn = document.createElement('button');
    btn.className = 'hud-toggle-btn';
    btn.dataset.level = level;
    btn.textContent = config.label;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', 'false');
    btn.setAttribute('aria-label', `切换到${config.label}`);
    btn.addEventListener('click', () => {
      onSwitch(level);
    });
    group.appendChild(btn);
  }

  center.appendChild(group);
  elToggleGroup = group;
}

/**
 * 更新 HUD 层级显示
 */
export function updateHUDLevel(level, config) {
  if (!elLevelName) return;

  // Fade out → update → fade in
  const tl = gsap.timeline();
  tl.to([elLevelName, elLevelEn], {
    opacity: 0,
    duration: 0.2,
    ease: 'power2.in',
    onComplete() {
      elLevelName.textContent = config.label;
      elLevelEn.textContent = config.labelEn;
    },
  });
  tl.to([elLevelName, elLevelEn], {
    opacity: 1,
    duration: 0.25,
    ease: 'power2.out',
  });

  // Update indicator dots
  const idx = LEVEL_ORDER.indexOf(level);
  elIndicatorDots.forEach((dot, i) => {
    dot.classList.toggle('hud-dot--active', i === idx);
  });

  // Update toggle button active state
  if (elToggleGroup) {
    const btns = elToggleGroup.querySelectorAll('.hud-toggle-btn');
    btns.forEach((btn) => {
      const isActive = btn.dataset.level === level;
      btn.classList.toggle('hud-toggle-btn--active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
    });
  }
}

/**
 * 更新侧面板数据
 */
export function updateSidePanel(level, itemCount) {
  if (elStatLevel) elStatLevel.textContent = level;
  if (elStatCount) elStatCount.textContent = String(itemCount);
}

/**
 * 切换侧面板显示
 */
function toggleSidePanel(forceState) {
  if (!elSidePanel) return;
  const shouldShow = forceState !== undefined
    ? forceState
    : elSidePanel.classList.contains('side-panel--hidden');

  elSidePanel.classList.toggle('side-panel--hidden', !shouldShow);

  const panelBtn = document.querySelector('.fab-btn--panel');
  if (panelBtn) panelBtn.classList.toggle('fab-btn--active', shouldShow);
}

/**
 * 更新时钟显示
 */
function updateClock() {
  const now = new Date();
  if (elDate) {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    elDate.textContent = `${y}.${m}.${d}`;
  }
  if (elTime) {
    const h = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    elTime.textContent = `${h}:${min}:${s}`;
  }
}
