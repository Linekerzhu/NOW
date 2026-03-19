import { CONFIG } from './config.js';

/**
 * Loading overlay module.
 * Manages the loading screen with progress indicator.
 */

const overlay = document.createElement('div');
overlay.id = 'loading-overlay';
overlay.innerHTML = `
  <div class="loading-text">
    <span>Loading Earth…</span>
    <span id="loading-progress">0%</span>
  </div>`;

/** Show the loading overlay (adds to DOM). */
export function showLoading() {
  document.body.appendChild(overlay);
}

/** Fade out and remove the loading overlay. */
export function hideLoading() {
  if (!overlay.parentNode) return;
  overlay.style.opacity = '0';
  setTimeout(() => overlay.remove(), CONFIG.loading.fadeOutDuration);
}

/** Update the progress percentage display. */
export function setProgress(percent) {
  const el = document.getElementById('loading-progress');
  if (el) el.textContent = `${Math.round(percent)}%`;
}

/**
 * Show a WebGL-not-supported error message instead of the loading screen.
 */
export function showWebGLError() {
  overlay.innerHTML = `
    <div class="error-text">
      <span class="error-title">⚠️ WebGL Not Available</span>
      <span class="error-message">
        Your browser or device does not support WebGL, which is required to render the 3D Earth.
        Please try a modern browser (Chrome, Firefox, Safari, Edge).
      </span>
    </div>`;
  document.body.appendChild(overlay);
}
