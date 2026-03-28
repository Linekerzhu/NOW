/**
 * boundaries.js — GeoJSON 行政边界线渲染
 * 从 GeoJSON 生成球面贴合的 LineSegments，作为 earthGroup 子对象。
 */

import * as THREE from 'three';
import gsap from 'gsap';
import { geoToSphere, EARTH_RADIUS } from './geo.js';

const BOUNDARY_OFFSET = 0.005; // 微抬高避免 Z-fighting

/**
 * 从 GeoJSON 生成球面边界线
 * @param {string} url - GeoJSON 文件路径
 * @param {THREE.Group} earthGroup - 添加为子对象
 * @param {{ color?: number, initialOpacity?: number }} [options]
 * @returns {Promise<THREE.LineSegments>}
 */
export async function loadBoundaries(url, earthGroup, options = {}) {
  const response = await fetch(url);
  const geoJson = await response.json();

  const positions = [];

  for (const feature of geoJson.features) {
    if (!feature.geometry) continue; // skip features without geometry
    const geomType = feature.geometry.type;
    const coords = feature.geometry.coordinates;

    // Normalize to array of rings
    let rings = [];
    if (geomType === 'Polygon') {
      rings = coords;
    } else if (geomType === 'MultiPolygon') {
      rings = coords.flat();
    } else if (geomType === 'LineString') {
      // Nine-dash line comes as LineString
      rings = [coords];
    } else if (geomType === 'MultiLineString') {
      rings = coords;
    }

    for (const ring of rings) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [lon1, lat1] = ring[i];
        const [lon2, lat2] = ring[i + 1];

        const p1 = geoToSphere(lat1, lon1, EARTH_RADIUS + BOUNDARY_OFFSET);
        const p2 = geoToSphere(lat2, lon2, EARTH_RADIUS + BOUNDARY_OFFSET);

        positions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

  const material = new THREE.LineBasicMaterial({
    color: options.color ?? 0x00ff00,
    transparent: true,
    opacity: options.initialOpacity ?? 0,
    depthWrite: false,
    depthTest: false,
  });

  const lines = new THREE.LineSegments(geometry, material);
  lines.renderOrder = 998;
  earthGroup.add(lines);

  console.info(`[Boundaries] Loaded ${url}: ${positions.length / 6} segments`);
  return lines;
}

/**
 * 淡入边界线
 * @param {THREE.LineSegments} lines
 * @param {number} duration
 */
export function showBoundaries(lines, duration = 1.0) {
  if (!lines) return;
  gsap.to(lines.material, { opacity: 0.15, duration, ease: 'power2.out' });
}

/**
 * 淡出边界线
 * @param {THREE.LineSegments} lines
 * @param {number} duration
 */
export function hideBoundaries(lines, duration = 0.5) {
  if (!lines) return;
  gsap.to(lines.material, { opacity: 0, duration, ease: 'power2.in' });
}
