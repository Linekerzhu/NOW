import * as THREE from 'three';
import { geoToSphere, getSurfaceNormal } from './geo.js';

/** 标注杆高度（球面法线方向延伸） */
const STALK_HEIGHT = 1.2;

/** 锚点尺寸 */
const ANCHOR_SIZE = 0.06;

/** 标注杆颜色 */
const MARKER_COLOR = 0x00dd00;

/**
 * 创建球面锚点 + 标注杆，加为 earthGroup 的子对象。
 *
 * @param {number} lat - 纬度
 * @param {number} lon - 经度
 * @param {THREE.Group} earthGroup - M1 地球 Group
 * @returns {{
 *   anchor: THREE.Mesh,
 *   stalk: THREE.Line,
 *   surfacePos: THREE.Vector3,
 *   topPosition: THREE.Vector3,
 *   normal: THREE.Vector3,
 *   dispose: () => void,
 * }}
 */
export function createMarker(lat, lon, earthGroup) {
  const surfacePos = geoToSphere(lat, lon);
  const normal = getSurfaceNormal(lat, lon);
  const topPosition = surfacePos
    .clone()
    .add(normal.clone().multiplyScalar(STALK_HEIGHT));

  // --- 锚点：绿色小方块 ---
  const anchorGeo = new THREE.BoxGeometry(ANCHOR_SIZE, ANCHOR_SIZE, ANCHOR_SIZE);
  const anchorMat = new THREE.MeshBasicMaterial({
    color: MARKER_COLOR,
    transparent: true,
    opacity: 0,
    depthTest: false,
  });
  const anchor = new THREE.Mesh(anchorGeo, anchorMat);
  anchor.position.copy(surfacePos);
  // 使方块面向球面外侧
  anchor.lookAt(surfacePos.clone().add(normal));
  anchor.renderOrder = 999;

  // --- 标注杆：绿色细线 ---
  const stalkGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(6); // 2 vertices × 3 components
  // 初始化两端重合在球面点（杆长度为 0）
  positions[0] = surfacePos.x;
  positions[1] = surfacePos.y;
  positions[2] = surfacePos.z;
  positions[3] = surfacePos.x;
  positions[4] = surfacePos.y;
  positions[5] = surfacePos.z;
  stalkGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const stalkMat = new THREE.LineBasicMaterial({
    color: MARKER_COLOR,
    transparent: true,
    opacity: 0.6,
    depthTest: false,
  });
  const stalk = new THREE.Line(stalkGeo, stalkMat);
  stalk.renderOrder = 998;
  stalk.visible = false;

  // 加入 earthGroup（随地球旋转）
  earthGroup.add(anchor);
  earthGroup.add(stalk);

  return {
    anchor,
    stalk,
    surfacePos,
    topPosition,
    normal,
    dispose() {
      earthGroup.remove(anchor);
      earthGroup.remove(stalk);
      anchorGeo.dispose();
      anchorMat.dispose();
      stalkGeo.dispose();
      stalkMat.dispose();
    },
  };
}

/**
 * 更新标注杆生长进度。
 *
 * @param {THREE.Line} stalk
 * @param {THREE.Vector3} surfacePos - 球面起点（局部坐标）
 * @param {THREE.Vector3} topPos - 标注杆终点（局部坐标）
 * @param {number} progress - 0~1
 */
export function updateStalkGrowth(stalk, surfacePos, topPos, progress) {
  const positions = stalk.geometry.attributes.position.array;
  // 起点不变
  positions[0] = surfacePos.x;
  positions[1] = surfacePos.y;
  positions[2] = surfacePos.z;
  // 终点沿法线方向插值
  positions[3] = surfacePos.x + (topPos.x - surfacePos.x) * progress;
  positions[4] = surfacePos.y + (topPos.y - surfacePos.y) * progress;
  positions[5] = surfacePos.z + (topPos.z - surfacePos.z) * progress;
  stalk.geometry.attributes.position.needsUpdate = true;
}

export { STALK_HEIGHT };
