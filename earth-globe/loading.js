import { CONFIG } from './config.js';

/**
 * Loading overlay module.
 * Modern glass morphism loading screen with SVG progress ring.
 */

const CIRCUMFERENCE = 2 * Math.PI * 42; // r=42

const overlay = document.createElement('div');
overlay.id = 'loading-overlay';
overlay.setAttribute('role', 'status');
overlay.setAttribute('aria-live', 'polite');
overlay.setAttribute('aria-label', '加载中');
overlay.innerHTML = `
  <div class="loading-widget">
    <div class="loading-ring" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
      <svg viewBox="0 0 100 100">
        <circle class="loading-ring__track" cx="50" cy="50" r="42" />
        <circle class="loading-ring__fill" cx="50" cy="50" r="42" />
      </svg>
      <span class="loading-ring__text" id="loading-progress">0%</span>
    </div>
    <div class="loading-brand">NOW</div>
    <div class="loading-subtitle">电力调度全景</div>
  </div>`;

/** Show the loading overlay (adds to DOM). */
export function showLoading() {
  document.body.appendChild(overlay);
}

/** Fade out and remove the loading overlay. */
export function hideLoading() {
  if (!overlay.parentNode) return;
  overlay.style.opacity = '0';
  overlay.style.transform = 'scale(1.05)';
  overlay.style.filter = 'blur(8px)';
  setTimeout(() => overlay.remove(), CONFIG.loading.fadeOutDuration);
}

/** Update the progress percentage display. */
export function setProgress(percent) {
  const pct = Math.round(percent);
  const el = document.getElementById('loading-progress');
  if (el) el.textContent = `${pct}%`;

  // Update SVG ring
  const fill = overlay.querySelector('.loading-ring__fill');
  if (fill) {
    const offset = CIRCUMFERENCE * (1 - pct / 100);
    fill.style.strokeDashoffset = String(offset);
  }

  // Update ARIA
  const ring = overlay.querySelector('.loading-ring');
  if (ring) ring.setAttribute('aria-valuenow', String(pct));
}

/**
 * Show a WebGL-not-supported error message instead of the loading screen.
 */
export function showWebGLError() {
  overlay.innerHTML = `
    <div class="error-text">
      <span class="error-title">WebGL Not Available</span>
      <span class="error-message">
        Your browser or device does not support WebGL, which is required to render the 3D Earth.
        Please try a modern browser (Chrome, Firefox, Safari, Edge).
      </span>
    </div>`;
  document.body.appendChild(overlay);
}
