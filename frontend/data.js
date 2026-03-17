/**
 * data.js — API polling + FIFO cache + level switching logic
 */

const API_BASE = '/api/v1';
const POLL_INTERVAL = 15000; // 15 seconds

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  /** @type {{ L1: object[], L2: object[], L3: object[] }} */
  news: { L1: [], L2: [], L3: [] },
  lastEtag: '',
  pollTimer: null,
};

// ---------------------------------------------------------------------------
// Fetch news from API
// ---------------------------------------------------------------------------
async function fetchNews() {
  try {
    const headers = {};
    if (state.lastEtag) {
      headers['If-None-Match'] = state.lastEtag;
    }

    const res = await fetch(`${API_BASE}/news`, { headers });
    if (res.status === 304) return null; // No change
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const etag = res.headers.get('ETag');
    if (etag) state.lastEtag = etag;

    const data = await res.json();
    state.news.L1 = data.L1 || [];
    state.news.L2 = data.L2 || [];
    state.news.L3 = data.L3 || [];

    return state.news;
  } catch (e) {
    console.warn('Failed to fetch news:', e.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------------
function startPolling() {
  state.pollTimer = setInterval(fetchNews, POLL_INTERVAL);
}

function stopPolling() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Level data access
// ---------------------------------------------------------------------------
function getItems(level) {
  return state.news[level] || [];
}

/**
 * Seed development data (calls backend seed endpoint).
 */
async function seedData() {
  try {
    await fetch(`${API_BASE}/seed`, { method: 'POST' });
  } catch (e) {
    console.warn('Seed failed:', e.message);
  }
}

// ---------------------------------------------------------------------------
// Level cycling order
// ---------------------------------------------------------------------------
const LEVEL_ORDER = ['L1', 'L2', 'L3'];

function nextLevel(current) {
  const idx = LEVEL_ORDER.indexOf(current);
  return LEVEL_ORDER[(idx + 1) % LEVEL_ORDER.length];
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
export { startPolling, stopPolling, getItems, seedData, fetchNews, nextLevel, LEVEL_ORDER };
