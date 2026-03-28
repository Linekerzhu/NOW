/**
 * pixelMode.js — 像素化后处理模式
 *
 * 三层像素艺术效果：
 *   1. RenderPixelatedPass — 固定低分辨率 + nearest-neighbor 放大 + 边缘描线
 *   2. QuantizeDitherPass — 色彩量化 + 4×4 Bayer 有序抖动
 *   3. Bloom 保持在像素化之后 — 产生 CRT 荧光溢出效果
 *
 * 渲染管线：
 *   正常模式: RenderPass → BloomPass → OutputPass
 *   像素模式: RenderPixelatedPass → QuantizeDitherPass → BloomPass → OutputPass
 */

import { Vector2 } from 'three';
import { RenderPixelatedPass } from 'three/examples/jsm/postprocessing/RenderPixelatedPass.js';
import { createQuantizeDitherPass } from './quantizeDitherPass.js';

/**
 * @param {import('three/examples/jsm/postprocessing/EffectComposer.js').EffectComposer} composer
 * @param {THREE.Scene} scene
 * @param {THREE.PerspectiveCamera} camera
 * @param {object} [options]
 * @param {number} [options.pixelSize=6]
 * @param {number} [options.colorNum=5] - 每通道色阶数 (3=8色, 4=64色, 5=125色)
 * @param {number} [options.ditherStrength=0.8]
 * @param {number} [options.normalEdgeStrength=0.15]
 * @param {number} [options.depthEdgeStrength=0.15]
 */
export function createPixelMode(composer, scene, camera, options = {}) {
  const pixelPass = new RenderPixelatedPass(
    options.pixelSize ?? 6,
    scene,
    camera,
    {
      normalEdgeStrength: options.normalEdgeStrength ?? 0.15,
      depthEdgeStrength: options.depthEdgeStrength ?? 0.15,
    },
  );

  const quantizePass = createQuantizeDitherPass({
    colorNum: options.colorNum ?? 5,
    ditherStrength: options.ditherStrength ?? 0.8,
  });

  // References to original passes
  // Normal pipeline:  [0]=RenderPass  [1]=BloomPass  [2]=OutputPass
  // Pixel pipeline:   [0]=PixelPass   [1]=QuantizePass  [2]=BloomPass  [3]=OutputPass
  const renderPass = composer.passes[0];

  let enabled = false;

  function syncSize() {
    const size = composer.renderer.getSize(new Vector2());
    const pr = composer.renderer.getPixelRatio();
    const w = size.x * pr;
    const h = size.y * pr;
    pixelPass.setSize(w, h);
    // Quantize resolution should match the pixelated resolution (not screen)
    const pixelW = Math.floor(w / pixelPass.pixelSize);
    const pixelH = Math.floor(h / pixelPass.pixelSize);
    quantizePass.setResolution(pixelW, pixelH);
  }

  function setEnabled(v) {
    if (enabled === v) return;
    enabled = v;

    if (enabled) {
      // Replace RenderPass with PixelPass, insert QuantizePass after it
      composer.passes[0] = pixelPass;
      composer.passes.splice(1, 0, quantizePass);
    } else {
      // Restore RenderPass, remove QuantizePass
      composer.passes[0] = renderPass;
      const idx = composer.passes.indexOf(quantizePass);
      if (idx !== -1) composer.passes.splice(idx, 1);
    }

    syncSize();
  }

  function toggle() {
    setEnabled(!enabled);
    return enabled;
  }

  function setPixelSize(n) {
    pixelPass.setPixelSize(Math.max(2, Math.round(n)));
    syncSize();
  }

  function setColorNum(n) {
    quantizePass.uniforms.colorNum.value = Math.max(2, Math.round(n));
  }

  function setDitherStrength(v) {
    quantizePass.uniforms.ditherStrength.value = v;
  }

  return {
    get enabled() { return enabled; },
    get pixelSize() { return pixelPass.pixelSize; },
    toggle,
    setEnabled,
    setPixelSize,
    setColorNum,
    setDitherStrength,
    dispose() {
      pixelPass.dispose();
      quantizePass.material.dispose();
    },
  };
}
