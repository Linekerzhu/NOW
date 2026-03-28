/**
 * quantizeDitherPass.js — 色彩量化 + Bayer 有序抖动后处理
 *
 * 将连续色彩压缩到有限调色板，用 4×4 Bayer 矩阵模拟过渡，
 * 产生经典像素艺术的 stipple 纹理效果。
 */

import { Vector2 } from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

const QuantizeDitherShader = {
  name: 'QuantizeDitherShader',

  uniforms: {
    tDiffuse: { value: null },
    colorNum: { value: 5.0 },
    ditherStrength: { value: 0.8 },
    resolution: { value: new Vector2(320, 180) },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float colorNum;
    uniform float ditherStrength;
    uniform vec2 resolution;

    varying vec2 vUv;

    float bayer4x4(vec2 pos) {
      ivec2 p = ivec2(mod(pos, 4.0));
      int index = p.x + p.y * 4;

      // 4x4 Bayer matrix flattened
      float m[16];
      m[0]  =  0.0; m[1]  =  8.0; m[2]  =  2.0; m[3]  = 10.0;
      m[4]  = 12.0; m[5]  =  4.0; m[6]  = 14.0; m[7]  =  6.0;
      m[8]  =  3.0; m[9]  = 11.0; m[10] =  1.0; m[11] =  9.0;
      m[12] = 15.0; m[13] =  7.0; m[14] = 13.0; m[15] =  5.0;

      return m[index] / 16.0 - 0.5;
    }

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 pixelPos = vUv * resolution;

      // Add Bayer dither noise before quantizing
      float dither = bayer4x4(pixelPos) * ditherStrength;
      vec3 c = texel.rgb + dither / max(colorNum - 1.0, 1.0);

      // Quantize to N levels per channel
      c = floor(c * (colorNum - 1.0) + 0.5) / (colorNum - 1.0);
      c = clamp(c, 0.0, 1.0);

      gl_FragColor = vec4(c, texel.a);
    }
  `,
};

/**
 * 创建量化抖动后处理 pass。
 *
 * @param {{ colorNum?: number, ditherStrength?: number }} [options]
 * @returns {ShaderPass & { setResolution(w: number, h: number): void }}
 */
export function createQuantizeDitherPass(options = {}) {
  const pass = new ShaderPass(QuantizeDitherShader);
  pass.uniforms.colorNum.value = options.colorNum ?? 5.0;
  pass.uniforms.ditherStrength.value = options.ditherStrength ?? 0.8;

  // Extend with resolution setter for pixel mode integration
  pass.setResolution = (w, h) => {
    pass.uniforms.resolution.value.set(w, h);
  };

  return pass;
}
