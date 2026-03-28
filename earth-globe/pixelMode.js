/**
 * pixelMode.js — 像素化后处理模式
 *
 * 使用 Three.js RenderPixelatedPass 将场景以固定低分辨率渲染后
 * nearest-neighbor 放大，实现像素艺术风格。像素块大小在屏幕空间固定，
 * 不随缩放改变。
 */

import { Vector2 } from 'three';
import { RenderPixelatedPass } from 'three/examples/jsm/postprocessing/RenderPixelatedPass.js';

/**
 * 创建像素模式控制器。
 *
 * @param {import('three/examples/jsm/postprocessing/EffectComposer.js').EffectComposer} composer
 * @param {THREE.Scene} scene
 * @param {THREE.PerspectiveCamera} camera
 * @param {{ pixelSize?: number, normalEdgeStrength?: number, depthEdgeStrength?: number }} [options]
 * @returns {{
 *   enabled: boolean,
 *   pixelSize: number,
 *   toggle: () => boolean,
 *   setEnabled: (v: boolean) => void,
 *   setPixelSize: (n: number) => void,
 *   dispose: () => void,
 * }}
 */
export function createPixelMode(composer, scene, camera, options = {}) {
  const initialPixelSize = options.pixelSize ?? 6;

  const pixelPass = new RenderPixelatedPass(initialPixelSize, scene, camera, {
    normalEdgeStrength: options.normalEdgeStrength ?? 0.15,
    depthEdgeStrength: options.depthEdgeStrength ?? 0.15,
  });

  // Keep a reference to the original RenderPass (first pass in the composer)
  const renderPass = composer.passes[0];

  let enabled = false;

  function setEnabled(v) {
    enabled = v;
    composer.passes[0] = enabled ? pixelPass : renderPass;
    // Sync size with current composer resolution
    const size = composer.renderer.getSize(new Vector2());
    const pixelRatio = composer.renderer.getPixelRatio();
    const w = size.x * pixelRatio;
    const h = size.y * pixelRatio;
    composer.passes[0].setSize(w, h);
  }

  function toggle() {
    setEnabled(!enabled);
    return enabled;
  }

  function setPixelSize(n) {
    pixelPass.setPixelSize(Math.max(1, Math.round(n)));
  }

  return {
    get enabled() { return enabled; },
    get pixelSize() { return pixelPass.pixelSize; },
    toggle,
    setEnabled,
    setPixelSize,
    dispose() {
      pixelPass.dispose();
    },
  };
}
