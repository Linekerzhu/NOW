/**
 * overlay.js — DOM overlay: info cards + HUD
 *
 * Pixel terminal aesthetic: green on black, sharp edges, monospace.
 */

import gsap from 'gsap';

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

/**
 * Update HUD display.
 * @param {string} level - current level code
 * @param {object} levelConfig - { name, codeName }
 * @param {string} currentLevel - active level for indicators
 */
export function updateHUD(level, levelConfig) {
  const nameEl = document.getElementById('hud-level-name');
  const codeEl = document.getElementById('hud-level-code');
  const indicatorsEl = document.getElementById('hud-indicators');

  if (nameEl) nameEl.textContent = `> ${levelConfig.name}`;
  if (codeEl) codeEl.textContent = levelConfig.codeName;

  if (indicatorsEl) {
    const levels = ['L1', 'L2', 'L3'];
    indicatorsEl.textContent = levels.map(l => l === level ? '[■]' : '[□]').join('');
  }
}

/**
 * Update HUD clock.
 */
export function updateClock() {
  const dateEl = document.getElementById('hud-date');
  const timeEl = document.getElementById('hud-time');
  const now = new Date();

  if (dateEl) {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    dateEl.textContent = `${y}.${m}.${d}`;
  }
  if (timeEl) {
    const h = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    timeEl.textContent = `${h}:${min}:${s}`;
  }
}

/**
 * Set up level switcher buttons.
 * @param {function} onSwitch - callback(level)
 */
export function setupLevelSwitcher(onSwitch) {
  const buttons = document.querySelectorAll('.level-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const level = btn.dataset.level;
      if (level) onSwitch(level);
    });
  });
}

/**
 * Update which level button is active.
 */
export function setActiveLevelButton(level) {
  const buttons = document.querySelectorAll('.level-btn');
  buttons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.level === level);
  });
}

// ---------------------------------------------------------------------------
// HUD fade
// ---------------------------------------------------------------------------
export function fadeOutHUD() {
  return gsap.to('#hud', { opacity: 0, duration: 0.5 });
}

export function fadeInHUD() {
  return gsap.to('#hud', { opacity: 1, duration: 0.5 });
}

// ---------------------------------------------------------------------------
// Info card
// ---------------------------------------------------------------------------

/**
 * Create and display an info card.
 * @param {object} item - news item
 * @param {number} x - screen x
 * @param {number} y - screen y
 * @param {boolean} visible - whether the anchor is in front of camera
 * @returns {HTMLElement} the card element
 */
export function createInfoCard(item, x, y, visible) {
  // Remove existing card
  removeInfoCard();

  const card = document.createElement('div');
  card.id = 'info-card';
  card.className = 'info-card' + (item.priority === 'high' ? ' info-card--high-priority' : '');

  // Category tag
  const categoryTag = item.category ? `<span class="info-card__category">[${item.category}]</span> ` : '';

  card.innerHTML = `
    <div class="info-card__title">${categoryTag}${item.title}</div>
    ${item.summary ? `<div class="info-card__summary">${item.summary}</div>` : ''}
    <div class="info-card__meta">
      ${item.source ? `<span class="info-card__source">[${item.source}]</span>` : ''}
      <span class="info-card__time">${formatTime(item.timestamp)}</span>
    </div>
  `;

  card.style.left = `${x}px`;
  card.style.top = `${y}px`;
  card.style.opacity = '0';

  if (!visible) {
    card.style.display = 'none';
  }

  document.getElementById('overlay').appendChild(card);
  return card;
}

/**
 * Animate card in (Phase 3).
 */
export function animateCardIn(card) {
  if (!card) return gsap.timeline();

  const tl = gsap.timeline();
  tl.to(card, {
    opacity: 1,
    duration: 0.5,
    ease: 'power2.out',
  });
  return tl;
}

/**
 * Animate card out (Phase 5).
 */
export function animateCardOut(card) {
  if (!card) return gsap.timeline();

  const tl = gsap.timeline();
  tl.to(card, {
    opacity: 0,
    duration: 0.5,
    ease: 'power2.in',
  });
  return tl;
}

/**
 * Remove the current info card from DOM.
 */
export function removeInfoCard() {
  const existing = document.getElementById('info-card');
  if (existing) existing.remove();
}

/**
 * Update card position (called each frame while card is visible).
 */
export function updateCardPosition(card, x, y, visible) {
  if (!card) return;
  card.style.left = `${x}px`;
  card.style.top = `${y}px`;
  card.style.display = visible ? '' : 'none';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(isoString) {
  try {
    const d = new Date(isoString);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  } catch {
    return '';
  }
}

/**
 * Compute reading duration for a news item.
 * clamp(3 + ceil(titleLen/8)*0.5 + ceil(summaryLen/8)*0.5, 4, 8)
 */
export function computeReadDuration(item) {
  const titleLen = (item.title || '').length;
  const summaryLen = (item.summary || '').length;
  const dur = 3 + Math.ceil(titleLen / 8) * 0.5 + Math.ceil(summaryLen / 8) * 0.5;
  return Math.max(4, Math.min(8, dur));
}
