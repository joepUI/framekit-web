# FrameKit

浏览器内的图像 / 视频帧处理工具箱，专为游戏开发者和动画设计师打造。**全程本地处理，文件不上传任何服务器。**

[English](#english) | [在线体验](https://fk.designtt.cc)

---

## 工具列表

### 01 视频转序列帧表
将视频均匀抽帧，裁剪画面，可选色键去背景，拼合为游戏可用的精灵图。支持导出普通 PNG、透明 PNG、逐帧 ZIP 和 Spine 4.2 骨骼动画包。

### 02 移除图片背景
点击图片背景区域取色，一键去除纯色背景，实时预览（结果 / Alpha 蒙版 / 纯色底），导出透明 PNG。

### 03 视频转 GIF
将视频片段转为动画 GIF。支持设置帧率、速度倍率、输出尺寸，可选色键去背景。

### 04 精灵图编辑器
上传现有精灵图，自动按列数分割识别帧。支持拖拽排序、水平镜像、复制 / 删除帧、撤销（最多 50 步），导出 PNG 或动画 GIF。

---

## 技术栈

- **React 18 + Vite** — 纯前端静态站，零后端，零账号
- **色键去背景** — 自研欧氏距离算法，支持容差、羽化、边缘平滑、去溢色
- **GIF 编码** — 自研编码器（颜色分箱量化 + LZW），无第三方 GIF 依赖
- **Spine 导出** — 生成 Spine 4.2 格式 skeleton.json + images/*.png ZIP
- **中英文国际化** — 内置 i18n，支持语言切换

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

构建产物在 `dist/` 目录，可直接部署到 GitHub Pages、Netlify 等静态托管服务。

---

## License

MIT © [joepUI](https://github.com/joepUI)

---

## English

**FrameKit** is a browser-based frame processing toolkit for game developers and animators. Everything runs locally — no uploads, no server.

### Tools

| # | Tool | Description |
|---|------|-------------|
| 01 | Video to Sprite Sheet | Extract frames, crop, optional chroma key, export sprite sheet or Spine 4.2 package |
| 02 | Remove Background | Pick color to remove solid background, export transparent PNG |
| 03 | Video to GIF | Convert video clip to animated GIF with speed / size controls |
| 04 | Sprite Editor | Split existing sprite sheets, reorder frames, export PNG or GIF |

### Run locally

```bash
npm install
npm run dev
```

### License

MIT
