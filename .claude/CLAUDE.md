# NOW Dashboard 项目

## 技术栈
- 前端：原生 Three.js 0.170 + GSAP 3.14 + Vite
- 后端：FastAPI + SQLite（暂未在 repo）
- 前端代码在 `earth-globe/` 目录下

## 开发命令
```bash
cd earth-globe && npm run dev   # Vite dev server at localhost:3000
cd earth-globe && npm test      # Vitest
```

## 架构概要
- `main.js` — 入口，WebGL 渲染器 + 后处理 Bloom + 7 个组件统一协议 {object3D, update(ctx), dispose()}
- `camera.js` — 三级轨道相机（L1 国网 / L2 上海 / L3 金山），球坐标插值
- `levelLoop.js` — 无限状态机 L1→L2→L3→L1
- `cardLifecycle.js` — 7 阶段 GSAP 时间线（锚点→茎杆→卡片→停留→收回）
- `earth.js` — 多层纹理地球（16K 瓦片 + 区域 LOD 叠加）
- `hud.js` — 像素终端风格 HUD
- `markers.js` — 3D 锚点 + 茎杆
- `boundaries.js` — GeoJSON → 球面线段
- `overlay.js` — DOM 信息卡片管理
- `geo.js` / `sun.js` — WGS84↔Three.js 坐标转换，天文日照
- `config.js` — 全局配置参数
- `style.css` — 所有 UI 样式

## 当前待修复的 UI 审计问题

### Critical
1. **C1: 3D Marker 不随缩放等比缩放** — `markers.js:5-8` STALK_HEIGHT=1.2 和 ANCHOR_SIZE=0.06 是常量，L3(焦距250mm)下屏幕投影是L1(37mm)的~45倍
2. **C2: Info Card 固定尺寸** — `style.css:101-137` max-width:320px, font-size:24px/20px 固定，L3下占满屏幕
3. **C3: XSS 漏洞** — `overlay.js:36-40` innerHTML 直接拼接未转义数据

### High
4. **H1: HUD 字号固定** — `style.css:164-197` 全部硬编码 px，无响应式
5. **H2: Level 按钮无键盘可访问性** — `hud.js:66-77` 无 aria-label/aria-pressed/focus-visible
6. **H3: 无 CSS design tokens** — `style.css` 12+ 颜色值硬编码散布
7. **H4: 卡片定位用 left/top** — `overlay.js:66-68` 每帧触发 layout thrashing

### Medium
8. **M1: 无移动端 viewport 适配** — 零个 @media 查询
9. **M2: Touch Target 过小** — `.level-btn { padding: 8px 16px }` 约 36×20px
10. **M3: display:none 造成布局跳动** — `overlay.js:58-59`
11. **M4: Marker 颜色不跟随优先级** — `markers.js:12` 固定绿色
12. **M5: Loading overlay 无 ARIA** — 无 role="progressbar"

### Low
13. **L1: 字体 font-display:swap 闪烁** — `style.css:78-87`
14. **L2: HTML lang="en" 应为 zh-CN** — `index.html:2`
15. **L3: Vignette 不可配置** — `style.css:12-23` 硬编码 rgba(0,0,0,0.35)
