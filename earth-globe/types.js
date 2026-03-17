/**
 * JSDoc type definitions for the Earth globe project.
 * Import these types in other files for IDE autocompletion.
 *
 * Usage:       @type {import('./types.js').Component}
 * Or in param: @param {import('./types.js').FrameContext} ctx
 */

/**
 * Per-frame context passed to every component's update() method.
 *
 * @typedef {Object} FrameContext
 * @property {import('three').Vector3} sunDirection - Normalized sun direction vector
 * @property {number} sunIntensity - Orbital eccentricity distance factor (~0.967–1.033)
 * @property {import('three').PerspectiveCamera} camera - Active camera
 * @property {number} time - Accumulated animation time (modular, wraps at CONFIG.animation.timeModulo)
 * @property {number} delta - Raw frame delta in seconds
 * @property {number} dtNorm - Frame delta normalized to 60fps (delta × 60)
 * @property {number} cloudUVOffset - Cloud rotation as UV offset (set by clouds component)
 */

/**
 * Unified component protocol. Every scene component must implement this.
 *
 * @typedef {Object} Component
 * @property {import('three').Object3D} object3D - The Three.js scene object
 * @property {(ctx: FrameContext) => void} update - Called every frame
 * @property {() => void} dispose - Frees GPU resources (geometry, material, textures)
 */

export {};
