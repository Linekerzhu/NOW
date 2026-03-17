import { CONFIG } from './config.js';

/**
 * Loading overlay module.
 * Manages the loading screen with progress indicator.
 */

const overlay = document.createElement('div');
overlay.id = 'loading-overlay';
overlay.innerHTML = `
  <div class="loading-text" style="text-align:center; display:flex; flex-direction:column; gap:8px;">
    <span>Loading Earth…</span>
    <span id="loading-progress" style="font-size:0.8em; opacity:0.7; font-variant-numeric:tabular-nums;">0%</span>
  </div>`;
Object.assign(overlay.style, {
  position: 'fixed', inset: '0', zIndex: '1000',
  background: '#000', display: 'flex',
  alignItems: 'center', justifyContent: 'center',
  transition: 'opacity 1.5s ease',
  fontFamily: 'system-ui, sans-serif',
  color: '#556', fontSize: '14px', letterSpacing: '3px',
});

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
    <div style="text-align:center; display:flex; flex-direction:column; gap:12px; max-width:400px; padding:20px;">
      <span style="font-size:1.2em;">⚠️ WebGL Not Available</span>
      <span style="opacity:0.6; line-height:1.6;">
        Your browser or device does not support WebGL, which is required to render the 3D Earth.
        Please try a modern browser (Chrome, Firefox, Safari, Edge).
      </span>
    </div>`;
  document.body.appendChild(overlay);
}
