/**
 * data.js — 数据加载模块
 * 从本地 JSON 文件加载新闻数据。
 * 后续接 API 时只需替换 fetch URL。
 */

/**
 * 从本地 JSON 加载三级新闻数据。
 * @returns {Promise<{ L1: Array, L2: Array, L3: Array }>}
 */
export async function loadNewsData() {
  const response = await fetch('/data/news.json');
  if (!response.ok) {
    console.error('[Data] Failed to load news.json:', response.status);
    return { L1: [], L2: [], L3: [] };
  }
  const json = await response.json();
  return json.data;
}
