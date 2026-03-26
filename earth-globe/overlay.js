/**
 * DOM 信息卡片管理模块。
 * 卡片以绝对定位叠加在 Canvas 之上，每帧依据 3D 投影更新位置。
 */

let overlayContainer = null;

/**
 * 创建 overlay 容器并追加到 body。
 * 幂等——多次调用只创建一次。
 * @returns {HTMLDivElement}
 */
export function createOverlayContainer() {
  if (overlayContainer) return overlayContainer;
  overlayContainer = document.createElement('div');
  overlayContainer.id = 'overlay';
  document.body.appendChild(overlayContainer);
  return overlayContainer;
}

/**
 * 创建一张信息卡片 DOM 元素。
 *
 * @param {{ title: string, summary: string, source: string, time: string, priority?: string }} data
 * @returns {HTMLDivElement}
 */
export function createInfoCard(data) {
  const container = createOverlayContainer();

  const card = document.createElement('div');
  card.className = 'info-card';
  if (data.priority === 'high') {
    card.classList.add('info-card--high');
  }

  const title = document.createElement('div');
  title.className = 'info-card__title';
  title.textContent = data.title;

  const summary = document.createElement('div');
  summary.className = 'info-card__summary';
  summary.textContent = data.summary;

  const meta = document.createElement('div');
  meta.className = 'info-card__meta';
  meta.textContent = `[${data.source}]  ${data.time}`;

  card.appendChild(title);
  card.appendChild(summary);
  card.appendChild(meta);

  card.style.opacity = '0';
  card.style.pointerEvents = 'none';

  container.appendChild(card);
  return card;
}

/**
 * 每帧更新卡片位置。
 *
 * @param {HTMLDivElement} card
 * @param {{ x: number, y: number }} screenPos - 标注杆顶端屏幕坐标
 * @param {boolean} visible - 是否面向摄像机
 */
export function updateCardPosition(card, screenPos, visible) {
  if (!visible) {
    card.style.display = 'none';
    return;
  }

  card.style.display = '';
  // 卡片锚定在标注杆顶端的右上方
  const offsetX = 12;
  const offsetY = -8;
  card.style.left = `${screenPos.x + offsetX}px`;
  card.style.top = `${screenPos.y + offsetY}px`;
  card.style.transform = 'translateY(-100%)';
}

/**
 * 从 DOM 移除卡片。
 * @param {HTMLDivElement} card
 */
export function removeInfoCard(card) {
  if (card && card.parentNode) {
    card.parentNode.removeChild(card);
  }
}
