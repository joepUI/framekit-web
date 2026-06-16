# FrameKit

**Turn AI-generated videos into production-ready motion assets, entirely in the browser.**

FrameKit is a local-first frame processing toolkit for game developers, UI motion designers, pixel artists, and AI animation workflows. It helps convert videos, GIFs, and animated images into sprite sheets, transparent PNG sequences, GIFs, APNG, Animated WebP, and Spine-ready exports.

[中文](#中文) · [Repository](https://github.com/joepUI/framekit-web)

---

## Why FrameKit

AI video tools are great at creating motion, but production pipelines usually need structured assets: sprite sheets, frame sequences, transparent PNGs, optimized GIFs, or engine-ready animation files.

FrameKit bridges that last mile:

1. Generate motion with AI video tools or any video source.
2. Crop, extract frames, remove solid backgrounds, and clean edges in FrameKit.
3. Export assets ready for games, websites, stickers, prototypes, and animation handoff.

Everything runs in your browser. Files stay on your device.

---

## Highlights

- **Local processing**: no uploads, no server, no account.
- **6 focused tools**: video, GIF, sprite sheet, image background removal, and animated format conversion.
- **Smart chroma key**: connected-background removal helps avoid deleting same-colored details inside the subject.
- **Edge cleanup**: fringe trimming and edge color cleaning reduce green-screen halos and light-colored artifacts.
- **PNG compression**: optional lossless compression with `@jsquash/oxipng`.
- **Game-friendly exports**: sprite sheets, PNG sequence ZIPs, GIF, APNG, Animated WebP, and Spine-style packages.
- **Bilingual UI**: English and Chinese interface.

---

## What's New in v2.5

- Added intelligent connected-background chroma key mode.
- Added edge cleanup controls for fringe trimming and edge color cleaning.
- Added optional PNG lossless compression across PNG export tools.
- Added shared compression UI and reusable PNG optimization utilities.
- Improved export consistency across video, GIF, sprite, and background-removal workflows.

---

## Tools

| # | Tool | What it does | Exports |
|---|------|--------------|---------|
| 01 | Video to Sprite Sheet | Crop video, extract frames, remove background, preview animation | Sprite sheet PNG, transparent PNG, PNG ZIP, GIF, Spine package |
| 02 | Sprite Editor | Split sprite sheets, reorder frames, mirror/copy/delete frames, preview animation | Sprite sheet PNG, GIF, APNG, PNG ZIP |
| 03 | Video to GIF | Convert video clips to GIF with crop, FPS, speed, size, and chroma controls | GIF |
| 04 | Animated Image Converter | Convert between PNG sequence, APNG, GIF, and Animated WebP | PNG ZIP, APNG, GIF, Animated WebP |
| 05 | GIF to Sprite Sheet | Decode GIF, sample frames, optionally remove background, rebuild sprite sheets | Sprite sheet PNG, PNG ZIP |
| 06 | Remove Image Background | Pick a solid background color, preview transparency, clean edges | Transparent PNG |

---

## Format Guide

| Format | Transparency | Best for |
|--------|--------------|----------|
| **Sprite Sheet** | Yes | Game engines, web animation, runtime frame slicing |
| **PNG Sequence** | Yes | Game engines, compositing, video tools, handoff files |
| **GIF** | Limited | Stickers, previews, chat, social sharing |
| **APNG** | Yes | High-quality transparent browser animation |
| **Animated WebP** | Yes | Smaller web animation files |
| **Spine Package** | Yes | Spine-style animation import and engine pipelines |

---

## Tech Stack

- **React 18 + Vite** for a static frontend application.
- **Canvas APIs** for frame extraction, cropping, previewing, and pixel processing.
- **Custom chroma key pipeline** with tolerance, feathering, smoothing, despill, connected-background detection, and edge cleanup.
- **Custom GIF codec** for browser-side GIF encode/decode.
- **upng-js** for APNG encoding/decoding.
- **wasm-webp** for Animated WebP support.
- **@jsquash/oxipng** for optional lossless PNG compression.
- **JSZip** for downloadable asset packages.

---

## Run Locally

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

## Build

```bash
npm run build
```

The static output is generated in `dist/`.

---

## Privacy

FrameKit is designed as a browser-only tool:

- No file uploads.
- No user accounts.
- No server-side processing.
- No telemetry in the open-source version.

---

## License

MIT © [joepUI](https://github.com/joepUI)

---

## 中文

**FrameKit 是一个在浏览器里运行的帧处理工具箱，用来把 AI 视频和动图素材变成可以直接落地的动效资产。**

它适合游戏开发者、UI 动效设计师、独立开发者、像素/动画创作者使用。你可以把视频、GIF、APNG、Animated WebP 等素材转换成精灵图、PNG 序列、透明 PNG、GIF、APNG、Animated WebP 或 Spine 风格资源包。

所有处理都在浏览器本地完成，文件不会上传到服务器。

---

## 为什么做 FrameKit

AI 视频工具很擅长生成动作，但真正放进游戏、网页或产品里时，通常还需要精灵图、逐帧 PNG、透明背景、动图格式转换、压缩和导出。

FrameKit 解决的是最后一步：

1. 用 AI 视频工具或普通视频生成动作素材。
2. 在 FrameKit 里裁剪、抽帧、去背景、清理边缘。
3. 导出能直接用于游戏、网页、贴纸、原型和动效交付的文件。

---

## 特色

- **本地处理**：不上传文件，不需要账号，不依赖后端。
- **6 个工具**：覆盖视频、GIF、精灵图、图片去背景和动图格式转换。
- **智能连通背景去除**：减少误删主体内部同色区域的问题。
- **边缘清理**：减少绿幕残边、浅色毛边和背景污染。
- **PNG 无损压缩**：可选开启，减小导出文件体积。
- **适合游戏交付**：支持精灵图、PNG 序列 ZIP、GIF、APNG、Animated WebP、Spine 风格资源包。
- **中英文界面**：内置 English / 中文切换。

---

## v2.5 更新

- 新增智能连通背景去背景模式。
- 新增去毛边和边缘净色参数。
- 新增 PNG 无损压缩开关。
- 新增共享 PNG 压缩组件和压缩工具模块。
- 优化多个工具的导出一致性。

---

## 工具列表

| # | 工具 | 功能 | 导出 |
|---|------|------|------|
| 01 | 视频转精灵图 | 裁剪视频、抽帧、去背景、预览动画 | 精灵图 PNG、透明 PNG、PNG 序列 ZIP、GIF、Spine 风格资源包 |
| 02 | 精灵图编辑器 | 分割精灵图、排序、镜像、复制、删除帧 | 精灵图 PNG、GIF、APNG、PNG 序列 ZIP |
| 03 | 视频转 GIF | 视频片段转 GIF，支持裁剪、帧率、速度、尺寸和去背景 | GIF |
| 04 | 动图格式转换 | PNG 序列、APNG、GIF、Animated WebP 互转 | PNG ZIP、APNG、GIF、Animated WebP |
| 05 | GIF 转精灵图 | GIF 拆帧、抽帧、可选去背景、重新拼合 | 精灵图 PNG、PNG 序列 ZIP |
| 06 | 移除图片背景 | 点击取色去除纯色背景，实时预览透明效果 | 透明 PNG |

---

## 本地运行

```bash
npm install
npm run dev
```

打开：

```text
http://localhost:5173
```

## 构建

```bash
npm run build
```

构建产物在 `dist/` 目录。
