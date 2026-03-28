import * as THREE from 'three';
import { geoToSphere, getSurfaceNormal } from './geo.js';

/** Base reference focal length (L1 level) */
const BASE_FOCAL_LENGTH = 37;

/** Base stalk height at reference focal length */
const BASE_STALK_HEIGHT = 1.2;

/** Base anchor size at reference focal length */
const BASE_ANCHOR_SIZE = 0.06;

/** Default marker color (normal priority) */
const COLOR_NORMAL = 0x00dd00;

/** High priority marker color */
const COLOR_HIGH = 0xff3300;

/**
 * 创建球面锚点 + 标注杆，加为 earthGroup 的子对象。
 *
 * @param {number} lat - 纬度
 * @param {number} lon - 经度
 * @param {THREE.Group} earthGroup - M1 地球 Group
 * @param {{ focalLength?: number, priority?: string }} [options]
 * @returns {{
 *   anchor: THREE.Mesh,
 *   stalk: THREE.Line,
 *   surfacePos: THREE.Vector3,
 *   topPosition: THREE.Vector3,
 *   normal: THREE.Vector3,
 *   dispose: () => void,
 * }}
 */
export function createMarker(lat, lon, earthGroup, options = {}) {
  const focalLength = options.focalLength ?? BASE_FOCAL_LENGTH;
  const priority = options.priority ?? 'normal';

  // Scale inversely with focal length SQUARED to account for both
  // narrower FOV and closer camera distance at high zoom levels.
  // L1 (37mm): scale=1.0, L2 (200mm): scale=0.034, L3 (250mm): scale=0.022
  const ratio = BASE_FOCAL_LENGTH / focalLength;
  const scale = ratio * ratio;
  const stalkHeight = BASE_STALK_HEIGHT * scale;
  const anchorSize = BASE_ANCHOR_SIZE * scale;
  const markerColor = priority === 'high' ? COLOR_HIGH : COLOR_NORMAL;

  const surfacePos = geoToSphere(lat, lon);
  const normal = getSurfaceNormal(lat, lon);
  const topPosition = surfacePos
    .clone()
    .add(normal.clone().multiplyScalar(stalkHeight));

  // --- 锚点 ---
  const anchorGeo = new THREE.BoxGeometry(anchorSize, anchorSize, anchorSize);
  const anchorMat = new THREE.MeshBasicMaterial({
    color: markerColor,
    transparent: true,
    opacity: 0,
    depthTest: false,
  });
  const anchor = new THREE.Mesh(anchorGeo, anchorMat);
  anchor.position.copy(surfacePos);
  anchor.lookAt(surfacePos.clone().add(normal));
  anchor.renderOrder = 999;

  // --- 标注杆 ---
  const stalkGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(6);
  positions[0] = surfacePos.x;
  positions[1] = surfacePos.y;
  positions[2] = surfacePos.z;
  positions[3] = surfacePos.x;
  positions[4] = surfacePos.y;
  positions[5] = surfacePos.z;
  stalkGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const stalkMat = new THREE.LineBasicMaterial({
    color: markerColor,
    transparent: true,
    opacity: 0.6,
    depthTest: false,
  });
  const stalk = new THREE.Line(stalkGeo, stalkMat);
  stalk.renderOrder = 998;
  stalk.visible = false;

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
 */
export function updateStalkGrowth(stalk, surfacePos, topPos, progress) {
  const positions = stalk.geometry.attributes.position.array;
  positions[0] = surfacePos.x;
  positions[1] = surfacePos.y;
  positions[2] = surfacePos.z;
  positions[3] = surfacePos.x + (topPos.x - surfacePos.x) * progress;
  positions[4] = surfacePos.y + (topPos.y - surfacePos.y) * progress;
  positions[5] = surfacePos.z + (topPos.z - surfacePos.z) * progress;
  stalk.geometry.attributes.position.needsUpdate = true;
}

export { BASE_STALK_HEIGHT as STALK_HEIGHT };
