/**
 * hud.js — 像素终端风格 HUD
 * 显示层级名、时间、指示灯，以及桌面模式层级切换按钮。
 */

import gsap from 'gsap';

const LEVEL_ORDER = ['L1', 'L2', 'L3'];

// DOM element references (set in initHUD)
let elLevelName = null;
let elLevelEn = null;
let elDate = null;
let elTime = null;
let elIndicators = null;
let elSwitcher = null;
let clockInterval = null;

/**
 * 初始化 HUD：创建所有 DOM 元素并插入 body。
 */
export function initHUD() {
  // ---- HUD bar (top) ----
  const hud = document.createElement('div');
  hud.id = 'hud';
  hud.innerHTML = `
    <div id="hud-left">
      <div id="hud-level-name">&gt; 初始化中...</div>
      <div id="hud-level-en">LOADING</div>
    </div>
    <div id="hud-right">
      <div id="hud-date"></div>
      <div id="hud-time"></div>
      <div id="hud-indicators">[□][□][□]</div>
    </div>
  `;
  document.body.appendChild(hud);

  // ---- Level switcher (bottom, desktop mode) ----
  const switcher = document.createElement('div');
  switcher.id = 'level-switcher';
  document.body.appendChild(switcher);

  // Store refs
  elLevelName = document.getElementById('hud-level-name');
  elLevelEn = document.getElementById('hud-level-en');
  elDate = document.getElementById('hud-date');
  elTime = document.getElementById('hud-time');
  elIndicators = document.getElementById('hud-indicators');
  elSwitcher = switcher;

  // Start clock
  updateClock();
  clockInterval = setInterval(updateClock, 1000);
}

/**
 * 设置层级切换按钮
 * @param {Object} levelConfigs - { L1: { label }, L2: { label }, L3: { label } }
 * @param {Function} onSwitch - callback(level)
 */
export function setupLevelButtons(levelConfigs, onSwitch) {
  if (!elSwitcher) return;
  elSwitcher.innerHTML = '';

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
}

/**
 * 更新 HUD 层级显示
 * @param {string} level - 'L1' | 'L2' | 'L3'
 * @param {object} config - { label, labelEn }
 */
export function updateHUDLevel(level, config) {
  if (!elLevelName) return;

  // Fade out → update → fade in
  const tl = gsap.timeline();
  tl.to([elLevelName, elLevelEn], {
    opacity: 0,
    duration: 0.25,
    ease: 'power2.in',
    onComplete() {
      elLevelName.textContent = `> ${config.label}`;
      elLevelEn.textContent = config.labelEn;
    },
  });
  tl.to([elLevelName, elLevelEn], {
    opacity: 1,
    duration: 0.25,
    ease: 'power2.out',
  });

  // Update indicators  [■][□][□]
  const idx = LEVEL_ORDER.indexOf(level);
  if (elIndicators && idx >= 0) {
    const indicators = LEVEL_ORDER.map((_, i) =>
      i === idx ? '[■]' : '[□]'
    ).join('');
    elIndicators.textContent = indicators;
  }

  // Update button active state
  if (elSwitcher) {
    const btns = elSwitcher.querySelectorAll('.level-btn');
    btns.forEach((btn) => {
      const isActive = btn.dataset.level === level;
      btn.classList.toggle('level-btn--active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
  }
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
