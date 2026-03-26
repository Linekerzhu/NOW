/**
 * cardLifecycle.js — 单条信息展示生命周期编排
 *
 * 使用 GSAP timeline 编排：锚点渐亮 → 标注杆生长 → 卡片淡入 → 停留 → 卡片淡出 → 杆缩回 → 锚点熄灭
 */

import gsap from 'gsap';
import { createMarker, updateStalkGrowth } from './markers.js';
import { createInfoCard, updateCardPosition, removeInfoCard } from './overlay.js';
import { isPointFacingCamera, worldToScreen } from './geo.js';
import * as THREE from 'three';

/**
 * 计算停留时长（秒）
 * @param {string} title
 * @param {string} summary
 * @returns {number}
 */
function calcDwellTime(title, summary) {
  const base = 3;
  const titleContrib = Math.ceil(title.length / 8) * 0.5;
  const summaryContrib = Math.ceil(summary.length / 8) * 0.5;
  return Math.max(4, Math.min(8, base + titleContrib + summaryContrib));
}

// Reusable temp vector to avoid GC pressure in per-frame updates
const _tmpWorldPos = new THREE.Vector3();

/**
 * 展示单条信息的完整生命周期。
 *
 * 兼容两种字段格式：
 *   M2: { lat, lon, title, summary, source, time, priority }
 *   M3: { latitude, longitude, title, summary, source, timestamp, priority }
 *
 * @param {object} newsItem
 * @param {THREE.Group} earthGroup
 * @param {THREE.Camera} camera
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<void>} 动画完成后 resolve
 */
export function showNewsItem(newsItem, earthGroup, camera, canvas) {
  return new Promise((resolve) => {
    // --- 字段兼容 ---
    const lat = newsItem.lat ?? newsItem.latitude;
    const lon = newsItem.lon ?? newsItem.longitude;
    const time = newsItem.time ?? (newsItem.timestamp
      ? new Date(newsItem.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      : '');
    const normalizedItem = { ...newsItem, lat, lon, time };

    // --- 创建 3D 标注物 ---
    const marker = createMarker(lat, lon, earthGroup);
    const { anchor, stalk, surfacePos, topPosition } = marker;

    // --- 创建 DOM 卡片 ---
    const card = createInfoCard(normalizedItem);

    // --- 每帧位置更新 ---
    const stalkProgress = { value: 0 };

    function onTick() {
      // 将标注杆顶端从 earthGroup 局部空间转到世界空间
      _tmpWorldPos.copy(topPosition);
      // 根据当前 stalk 进度插值顶部位置
      _tmpWorldPos.lerpVectors(surfacePos, topPosition, stalkProgress.value);
      earthGroup.localToWorld(_tmpWorldPos);

      const visible = isPointFacingCamera(_tmpWorldPos, camera);
      const screenPos = worldToScreen(_tmpWorldPos, camera, canvas);
      updateCardPosition(card, screenPos, visible);

      // 同步控制锚点和杆的可见性
      anchor.visible = visible;
      stalk.visible = visible && stalkProgress.value > 0;
    }

    // 注册 GSAP ticker
    gsap.ticker.add(onTick);

    // --- GSAP Timeline ---
    const dwellTime = calcDwellTime(newsItem.title, newsItem.summary);
    const tl = gsap.timeline({
      onComplete() {
        // 清理
        gsap.ticker.remove(onTick);
        removeInfoCard(card);
        marker.dispose();
        resolve();
      },
    });

    // Phase 1: 锚点渐亮 (1.0s)
    tl.to(anchor.material, {
      opacity: 0.8,
      duration: 1.0,
      ease: 'power2.out',
    });

    // Phase 2: 标注杆生长 (0.6s)
    tl.add(() => {
      stalk.visible = true;
    });
    tl.to(stalkProgress, {
      value: 1,
      duration: 0.6,
      ease: 'none',
      onUpdate() {
        updateStalkGrowth(stalk, surfacePos, topPosition, stalkProgress.value);
      },
    });

    // Phase 3: 卡片淡入 (0.5s)
    tl.to(card.style, {
      opacity: 1,
      duration: 0.5,
      ease: 'power2.out',
    });

    // Phase 4: 停留阅读
    tl.to({}, { duration: dwellTime });

    // Phase 5: 卡片淡出 (0.4s)
    tl.to(card.style, {
      opacity: 0,
      duration: 0.4,
      ease: 'power2.in',
    });

    // Phase 6: 标注杆缩回 (0.3s)
    tl.to(stalkProgress, {
      value: 0,
      duration: 0.3,
      ease: 'power2.in',
      onUpdate() {
        updateStalkGrowth(stalk, surfacePos, topPosition, stalkProgress.value);
      },
    });

    // Phase 7: 锚点熄灭 (0.3s)
    tl.to(anchor.material, {
      opacity: 0,
      duration: 0.3,
      ease: 'power2.in',
    });
  });
}

/**
 * 顺序展示多条信息，每条之间有呼吸间隔。
 *
 * @param {Array} newsItems
 * @param {THREE.Group} earthGroup
 * @param {THREE.Camera} camera
 * @param {HTMLCanvasElement} canvas
 * @param {{ breathInterval?: number }} [options]
 * @returns {Promise<void>}
 */
export async function showNewsSequence(
  newsItems,
  earthGroup,
  camera,
  canvas,
  options = {},
) {
  const breathInterval = options.breathInterval ?? 1.5;

  for (const item of newsItems) {
    await showNewsItem(item, earthGroup, camera, canvas);
    // 呼吸间隔
    await new Promise((r) => setTimeout(r, breathInterval * 1000));
  }
}
