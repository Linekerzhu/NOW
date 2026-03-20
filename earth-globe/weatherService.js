/**
 * Fetch cloud-cover data from the Open-Meteo API on a global lat/lon grid.
 *
 * The grid uses an equirectangular layout so it can be painted directly onto
 * a Canvas texture suitable for spherical UV mapping.
 *
 * Rate-limit considerations (Open-Meteo free tier):
 *   - 600 locations/minute, 5000/hour, 10000/day
 *   - Each coordinate in a multi-location request counts separately
 *   - A 30° grid = ~78 coords total, which needs only 2 small requests
 *     comfortably within the 600/min quota.
 *   - The bilinear interpolation + gaussian blur in weatherCloudTexture.js
 *     produces smooth results even from this coarse grid.
 */

/**
 * Build the list of sample coordinates for a given angular resolution.
 * Latitude runs from +90 → −90 (top → bottom of equirectangular texture).
 * Longitude runs from −180 → +180.
 *
 * @param {number} step - degrees between samples (default 30)
 * @returns {{ lats: number[], lons: number[], rows: number, cols: number }}
 */
export function buildGrid(step = 30) {
  const lats = [];
  const lons = [];

  for (let lat = 90; lat >= -90; lat -= step) lats.push(lat);
  for (let lon = -180; lon < 180; lon += step) lons.push(lon);

  return { lats, lons, rows: lats.length, cols: lons.length };
}

/**
 * Fetch current cloud_cover for every grid point.
 *
 * @param {{ lats: number[], lons: number[], rows: number, cols: number }} grid
 * @returns {Promise<{ grid: Float32Array, rows: number, cols: number } | null>}
 *          null on failure (caller should fall back to static texture)
 */
export async function fetchCloudCover(grid) {
  const { lats, lons, rows, cols } = grid;

  // Flatten grid into coordinate pairs (row-major)
  const coords = [];
  for (const lat of lats) {
    for (const lon of lons) {
      coords.push({ lat, lon });
    }
  }

  // A 30° grid has ~78 coords total → 2 batches of 40.
  // At 5s delay this takes ~5s and uses only 78 of the 600/min quota.
  const BATCH = 40;
  const DELAY_MS = 5000;
  const MAX_RETRIES = 2;
  const RETRY_DELAY_MS = 5000;
  const results = new Float32Array(rows * cols); // defaults to 0 (clear sky)

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  let successCount = 0;
  const totalBatches = Math.ceil(coords.length / BATCH);

  try {
    for (let i = 0; i < coords.length; i += BATCH) {
      // Throttle: wait before every batch except the first
      if (i > 0) await delay(DELAY_MS);

      const batch = coords.slice(i, i + BATCH);
      const latStr = batch.map((c) => c.lat).join(',');
      const lonStr = batch.map((c) => c.lon).join(',');

      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latStr}&longitude=${lonStr}&current=cloud_cover`;

      let resp = null;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          resp = await fetch(url);
        } catch (fetchErr) {
          console.warn(`[Weather] Network error on batch ${i}:`, fetchErr.message);
          resp = null;
        }
        if (resp?.ok) break;
        if (attempt < MAX_RETRIES) {
          const backoff = RETRY_DELAY_MS * (attempt + 1);
          console.warn(
            `[Weather] Batch ${i} failed (${resp?.status ?? 'network error'}), retry ${attempt + 1}/${MAX_RETRIES} in ${backoff}ms`,
          );
          await delay(backoff);
          resp = null;
        }
      }

      if (!resp || !resp.ok) {
        console.warn(`[Weather] Skipping batch at index ${i} (HTTP ${resp?.status ?? 'timeout'})`);
        continue; // partial failure — use default 0 (clear sky) for these cells
      }

      const json = await resp.json();
      const items = Array.isArray(json) ? json : [json];

      for (let j = 0; j < items.length; j++) {
        const cc = items[j]?.current?.cloud_cover;
        results[i + j] = typeof cc === 'number' ? cc / 100 : 0;
      }
      successCount++;
    }

    console.info(`[Weather] Fetched ${successCount}/${totalBatches} batches (${coords.length} points)`);

    if (successCount === 0) {
      console.warn('[Weather] All batches failed');
      return null;
    }

    return { grid: results, rows, cols };
  } catch (err) {
    console.warn('[Weather] Failed to fetch cloud cover:', err);
    return null;
  }
}

