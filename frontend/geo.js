/**
 * geo.js — Geographic utilities: coordinate conversion + GeoJSON boundary lines
 */

import * as THREE from 'three';
import { EARTH_RADIUS } from './earth.js';

/**
 * Convert geographic coordinates to 3D sphere position.
 * ⚠️ GeoJSON uses [lon, lat] order!
 */
export function geoToSphere(lat, lon, radius = EARTH_RADIUS) {
  const phi = (lat * Math.PI) / 180;
  const lambda = (lon * Math.PI) / 180;
  return new THREE.Vector3(
    radius * Math.cos(phi) * Math.sin(lambda),
    radius * Math.sin(phi),
    radius * Math.cos(phi) * Math.cos(lambda)
  );
}

/**
 * Get surface normal at a geographic coordinate.
 */
export function geoToNormal(lat, lon) {
  return geoToSphere(lat, lon, 1.0).normalize();
}

/**
 * Create boundary lines from a GeoJSON FeatureCollection.
 * Returns a THREE.Group of green line segments.
 */
export function createBoundaryLines(geojson, radius = EARTH_RADIUS + 0.02) {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({
    color: 0x00ff00,
    opacity: 0.12,
    transparent: true,
    depthWrite: false,
  });

  if (!geojson || !geojson.features) return group;

  for (const feature of geojson.features) {
    const geom = feature.geometry;
    if (!geom) continue;

    let rings = [];
    if (geom.type === 'Polygon') {
      rings = geom.coordinates;
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates) {
        rings.push(...poly);
      }
    } else if (geom.type === 'LineString') {
      rings = [geom.coordinates];
    } else if (geom.type === 'MultiLineString') {
      rings = geom.coordinates;
    }

    for (const ring of rings) {
      if (ring.length < 2) continue;
      const points = ring.map(([lon, lat]) => geoToSphere(lat, lon, radius));
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      group.add(new THREE.Line(geometry, material));
    }
  }

  return group;
}

/**
 * Load a GeoJSON file and create boundary lines.
 */
export async function loadBoundaryLines(url, radius) {
  try {
    const response = await fetch(url);
    const geojson = await response.json();
    return createBoundaryLines(geojson, radius);
  } catch (e) {
    console.warn('Failed to load GeoJSON:', url, e);
    return new THREE.Group();
  }
}
