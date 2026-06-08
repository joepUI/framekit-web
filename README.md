# FrameKit

**AI 生成视频，用 FrameKit 轻松交付动效。**

浏览器内的帧处理工具箱，专为游戏开发者、动画设计师和 AI 动效工作流打造。**全程本地处理，文件不上传任何服务器。**

[English](#english) | [在线体验](https://fk.designtt.cc)

---

## 为什么需要 FrameKit？

AI 视频生成工具（Runway、Pika、Seedance、Kling 等）能快速产出视频，但游戏引擎和前端需要的是**精灵图、序列帧、透明 PNG、Spine 动画**——FrameKit 就是连接 AI 视频和最终动效交付的桥梁。

**典型工作流：**
1. AI 工具生成角色动画视频（绿幕/纯色背景）
2. FrameKit 裁剪 → 抽帧 → 去背景 → 导出精灵图 / Spine / GIF
3. 直接导入游戏引擎或嵌入网页

---

## 工具列表（6 个）

| # | 工具 | 说明 |
|---|------|------|
| 01 | **视频转精灵图** | 视频均匀抽帧 → 裁剪 → 色键去背景 → 拼合精灵图。支持 PNG、透明 PNG、逐帧 ZIP、GIF、Spine 4.2 骨骼动画包 |
| 02 | **精灵图编辑器** | 上传精灵图 → 自动分割 → 拖拽排序、镜像、复制/删除帧、撤销 → 导出 PNG / GIF / APNG / ZIP |
| 03 | **视频转 GIF** | 视频片段 → GIF，支持帧率、速度、尺寸调节，可选色键去背景 |
| 04 | **动图格式转换** | PNG 序列 ↔ APNG ↔ GIF ↔ Animated WebP 格式互转，质量/尺寸可控 |
| 05 | **GIF 转精灵图** | GIF → 拆帧 → 抽帧 → 可选去背景 → 拼合精灵图 / PNG 序列 ZIP |
| 06 | **移除图片背景** | 点击取色去除纯色背景，实时预览，导出透明 PNG |

---

## 格式介绍

### 动图格式

| 格式 | 透明 | 颜色 | 文件大小 | 兼容性 | 适用场景 |
|------|------|------|----------|--------|----------|
| **GIF** | 1-bit | 256 色 | 小 | 全平台 | 社交分享、表情包、简单动效 |
| **APNG** | 8-bit | 全色 | 中 | 主流浏览器 | 需要透明的高质量动图 |
| **Animated WebP** | 8-bit | 全色 | 最小 | Chrome/Edge/Safari | 网页性能优先 |
| **PNG 序列** | 8-bit | 全色 | 大（多文件） | 通用 | 游戏引擎、视频编辑 |

### 游戏动效格式

| 格式 | 说明 | 适用引擎 |
|------|------|----------|
| **精灵图 (Sprite Sheet)** | 所有帧拼合到一张大图，配合引擎 UV 切割播放 | Unity / Cocos / Phaser / 网页 |
| **Spine 骨骼动画** | skeleton.json + 逐帧 PNG，支持 Spine 4.2 格式 | Spine / Unity / Cocos |
| **PNG 序列 ZIP** | 逐帧独立 PNG 打包，适合后处理或导入引擎 | After Effects / Unity / 任意 |

---

## 技术栈

- **React 18 + Vite** — 纯前端静态站，零后端，零账号
- **色键去背景** — 自研欧氏距离算法，支持容差、羽化、边缘平滑、去溢色
- **GIF 编解码** — 自研编码器（颜色分箱量化 + LZW）& 解码器，无第三方 GIF 依赖
- **APNG 编解码** — 基于 upng-js
- **Animated WebP** — 基于 wasm-webp（WASM 编解码）
- **Spine 导出** — 生成 Spine 4.2 格式 skeleton.json + images/*.png ZIP
- **中英文国际化** — 内置 i18n，自动检测浏览器语言

---

## 本地运行

```bash
npm install
npm run dev
```

访问 `http://localhost:5173`

## 构建

```bash
npm run build
```

构建产物在 `dist/` 目录，可直接部署到 GitHub Pages、Netlify、Vercel 等静态托管。

---

## GitHub Topics 建议

```
ai-video, ai-tools, sprite-sheet, game-dev, animation, gif, apng, webp,
spine, chroma-key, frame-extraction, motion-graphics, vite, react,
browser-tool, local-processing, no-upload, free
```

---

## English

**FrameKit** — AI-generated video to production-ready motion assets, in your browser.

A browser-based frame processing toolkit for game developers, animators, and AI motion workflows. Everything runs locally — no uploads, no server, no account.

### Why FrameKit?

AI video tools (Runway, Pika, Seedance, Kling, etc.) produce amazing video — but game engines and web projects need **sprite sheets, frame sequences, transparent PNGs, and Spine animations**. FrameKit bridges the gap between AI video output and final motion delivery.

### Tools

| # | Tool | Description |
|---|------|-------------|
| 01 | Video to Sprite Sheet | Extract frames, crop, chroma key, export sprite sheet / Spine 4.2 / GIF |
| 02 | Sprite Editor | Split existing sprite sheets, reorder/mirror/copy frames, export PNG/GIF/APNG/ZIP |
| 03 | Video to GIF | Convert video clips to animated GIF with speed/size/chroma controls |
| 04 | Animated Image Converter | Convert between PNG sequence, APNG, GIF & Animated WebP |
| 05 | GIF to Sprite Sheet | Decode GIF → sample frames → optional chroma key → export sprite sheet |
| 06 | Remove Background | Pick color to remove solid background, export transparent PNG |

### Format Guide

| Format | Transparency | Colors | Best For |
|--------|-------------|--------|----------|
| GIF | 1-bit | 256 | Social sharing, simple animations |
| APNG | 8-bit | Full | High-quality transparent animations |
| Animated WebP | 8-bit | Full | Web performance |
| PNG Sequence | 8-bit | Full | Game engines, video editing |
| Sprite Sheet | 8-bit | Full | Unity / Cocos / Phaser / Web |
| Spine 4.2 | 8-bit | Full | Spine / Unity / Cocos |

### Run Locally

```bash
npm install
npm run dev
```

### License

MIT © [joepUI](https://github.com/joepUI)
