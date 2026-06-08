# FrameKit

**AI-generated video to production-ready motion assets, in your browser.**

A browser-based frame processing toolkit for game developers, animators, and AI motion workflows. Everything runs locally — no uploads, no server, no account.

[中文](#中文) | [Live Demo](https://fk.designtt.cc)

---

## Why FrameKit?

AI video tools (Runway, Pika, Seedance, Kling, etc.) produce amazing video — but game engines and web projects need **sprite sheets, frame sequences, transparent PNGs, and Spine animations**. FrameKit bridges the gap between AI video output and final motion delivery.

**Typical Workflow:**
1. Generate character animation video with AI tools (green screen / solid background)
2. FrameKit: crop → extract frames → chroma key → export sprite sheet / Spine / GIF
3. Import directly into game engine or embed in web

---

## Tools (6)

| # | Tool | Description |
|---|------|-------------|
| 01 | **Video to Sprite Sheet** | Extract frames, crop, chroma key, export sprite sheet / Spine 4.2 / GIF |
| 02 | **Sprite Editor** | Split existing sprite sheets, reorder/mirror/copy frames, export PNG/GIF/APNG/ZIP |
| 03 | **Video to GIF** | Convert video clips to animated GIF with speed/size/chroma controls |
| 04 | **Animated Image Converter** | Convert between PNG sequence, APNG, GIF & Animated WebP |
| 05 | **GIF to Sprite Sheet** | Decode GIF → sample frames → optional chroma key → export sprite sheet |
| 06 | **Remove Background** | Pick color to remove solid background, export transparent PNG |

---

## Format Guide

### Animated Image Formats

| Format | Transparency | Colors | File Size | Compatibility | Best For |
|--------|-------------|--------|-----------|---------------|----------|
| **GIF** | 1-bit | 256 | Small | Universal | Social sharing, stickers, simple animations |
| **APNG** | 8-bit | Full | Medium | Major browsers | High-quality transparent animations |
| **Animated WebP** | 8-bit | Full | Smallest | Chrome/Edge/Safari | Web performance |
| **PNG Sequence** | 8-bit | Full | Large (multi-file) | Universal | Game engines, video editing |

### Game Animation Formats

| Format | Description | Target Engines |
|--------|-------------|----------------|
| **Sprite Sheet** | All frames composited into one image, UV-sliced at runtime | Unity / Cocos / Phaser / Web |
| **Spine 4.2** | skeleton.json + per-frame PNGs, industry-standard skeletal animation | Spine / Unity / Cocos |
| **PNG Sequence ZIP** | Individual frame PNGs packed, ready for post-processing or engine import | After Effects / Unity / Any |

---

## Tech Stack

- **React 18 + Vite** — Pure frontend static site, zero backend, zero accounts
- **Chroma Key** — Custom Euclidean distance algorithm with tolerance, feathering, edge smoothing & despill
- **GIF Codec** — Custom encoder (color binning quantization + LZW) & decoder, no third-party GIF dependencies
- **APNG Codec** — Based on upng-js
- **Animated WebP** — Based on wasm-webp (WASM encode/decode)
- **Spine Export** — Generates Spine 4.2 skeleton.json + images/*.png ZIP
- **i18n** — Built-in Chinese/English, auto-detects browser language

---

## Run Locally

```bash
npm install
npm run dev
```

Visit `http://localhost:5173`

## Build

```bash
npm run build
```

Output in `dist/` — deploy to GitHub Pages, Netlify, Vercel, or any static host.

---

## GitHub Topics

```
ai-video, ai-tools, sprite-sheet, game-dev, animation, gif, apng, webp,
spine, chroma-key, frame-extraction, motion-graphics, vite, react,
browser-tool, local-processing, no-upload, free
```

---

## License

MIT © [joepUI](https://github.com/joepUI)

---

## 中文

**FrameKit** — AI 生成视频，用 FrameKit 轻松交付动效。

浏览器内的帧处理工具箱，专为游戏开发者、动画设计师和 AI 动效工作流打造。**全程本地处理，文件不上传任何服务器。**

### 工具列表（6 个）

| # | 工具 | 说明 |
|---|------|------|
| 01 | 视频转精灵图 | 视频均匀抽帧 → 裁剪 → 色键去背景 → 拼合精灵图。支持 PNG、透明 PNG、逐帧 ZIP、GIF、Spine 4.2 |
| 02 | 精灵图编辑器 | 上传精灵图 → 自动分割 → 拖拽排序、镜像、复制/删除帧、撤销 → 导出 PNG / GIF / APNG / ZIP |
| 03 | 视频转 GIF | 视频片段 → GIF，支持帧率、速度、尺寸调节，可选色键去背景 |
| 04 | 动图格式转换 | PNG 序列 ↔ APNG ↔ GIF ↔ Animated WebP 格式互转，质量/尺寸可控 |
| 05 | GIF 转精灵图 | GIF → 拆帧 → 抽帧 → 可选去背景 → 拼合精灵图 / PNG 序列 ZIP |
| 06 | 移除图片背景 | 点击取色去除纯色背景，实时预览，导出透明 PNG |

### 本地运行

```bash
npm install
npm run dev
```
