/**
 * pixelMode.js — 像素化后处理模式
 *
 * 只用 RenderPixelatedPass 做干净的低分辨率渲染 + nearest-neighbor 放大。
 * 不做色彩量化——真实纹理降分辨率本身就是最好的像素效果。
 *
 * 渲染管线：
 *   正常模式: RenderPass → BloomPass → OutputPass
 *   像素模式: RenderPixelatedPass → BloomPass → OutputPass
 */

import { Vector2 } from 'three';
import { RenderPixelatedPass } from 'three/examples/jsm/postprocessing/RenderPixelatedPass.js';

/**
 * @param {import('three/examples/jsm/postprocessing/EffectComposer.js').EffectComposer} composer
 * @param {THREE.Scene} scene
 * @param {THREE.PerspectiveCamera} camera
 * @param {object} [options]
 * @param {number} [options.pixelSize=6]
 * @param {number} [options.normalEdgeStrength=0]
 * @param {number} [options.depthEdgeStrength=0]
 */
export function createPixelMode(composer, scene, camera, options = {}) {
  const pixelPass = new RenderPixelatedPass(
    options.pixelSize ?? 6,
    scene,
    camera,
    {
      // 默认关闭边缘描线——地球曲面的描线效果不好
      normalEdgeStrength: options.normalEdgeStrength ?? 0,
      depthEdgeStrength: options.depthEdgeStrength ?? 0,
    },
  );

  const renderPass = composer.passes[0];
  let enabled = false;

  function syncSize() {
    const size = composer.renderer.getSize(new Vector2());
    const pr = composer.renderer.getPixelRatio();
    composer.passes[0].setSize(size.x * pr, size.y * pr);
  }

  function setEnabled(v) {
    if (enabled === v) return;
    enabled = v;
    composer.passes[0] = enabled ? pixelPass : renderPass;
    syncSize();
  }

  function setPixelSize(n) {
    pixelPass.setPixelSize(Math.max(2, Math.round(n)));
    syncSize();
  }

  function setEdgeStrength(n) {
    pixelPass.normalEdgeStrength = n;
    pixelPass.depthEdgeStrength = n;
  }

  return {
    get enabled() { return enabled; },
    get pixelSize() { return pixelPass.pixelSize; },
    toggle() { setEnabled(!enabled); return enabled; },
    setEnabled,
    setPixelSize,
    setEdgeStrength,
    dispose() { pixelPass.dispose(); },
  };
}
