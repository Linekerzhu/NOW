import * as THREE from 'three';
import { CONFIG } from './config.js';

const EARTH_RADIUS = CONFIG.earth.radius; // 10

/**
 * WGS84 经纬度 → Three.js 球面 Vector3
 *
 * 坐标约定（与 Three.js SphereGeometry 顶点位置一致）：
 *   lon  0°  → +X 轴 (本初子午线)
 *   lat 90°  → +Y 轴 (北极)
 *   lon 90°E → -Z 轴 (Three.js SphereGeometry 约定)
 *   lon 90°W → +Z 轴
 *
 * 注意：Three.js SphereGeometry 的 phi 方向与地理经度方向相反，
 * 因此 Z 分量需要取负号。
 *
 * @param {number} lat - 纬度 (度)，北正南负
 * @param {number} lon - 经度 (度)，东正西负
 * @param {number} [radius=EARTH_RADIUS] - 球体半径
 * @returns {THREE.Vector3}
 */
export function geoToSphere(lat, lon, radius = EARTH_RADIUS) {
  const phi = (lat * Math.PI) / 180;
  const lambda = (lon * Math.PI) / 180;
  return new THREE.Vector3(
    radius * Math.cos(phi) * Math.cos(lambda), // X: lon 0° → +X
    radius * Math.sin(phi), // Y: 北极
    -radius * Math.cos(phi) * Math.sin(lambda), // Z: 取负号匹配 SphereGeometry
  );
}

/**
 * 球面法线（归一化方向）
 * @param {number} lat
 * @param {number} lon
 * @returns {THREE.Vector3}
 */
export function getSurfaceNormal(lat, lon) {
  return geoToSphere(lat, lon, 1.0);
}

/**
 * 判断球面点是否面向摄像机
 * @param {THREE.Vector3} worldPos - 世界坐标
 * @param {THREE.Camera} camera
 * @returns {boolean}
 */
export function isPointFacingCamera(worldPos, camera) {
  const normal = worldPos.clone().normalize();
  const toCamera = camera.position.clone().sub(worldPos).normalize();
  return normal.dot(toCamera) > 0.15;
}

/**
 * 3D 世界坐标 → 屏幕像素坐标
 * @param {THREE.Vector3} worldPos
 * @param {THREE.Camera} camera
 * @param {HTMLCanvasElement} canvas
 * @returns {{ x: number, y: number }}
 */
export function worldToScreen(worldPos, camera, canvas) {
  const projected = worldPos.clone().project(camera);
  return {
    x: (projected.x * 0.5 + 0.5) * canvas.clientWidth,
    y: (-projected.y * 0.5 + 0.5) * canvas.clientHeight,
  };
}

export { EARTH_RADIUS };
