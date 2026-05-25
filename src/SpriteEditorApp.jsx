import { useState, useCallback, useEffect } from 'react'
import SpriteUploadStep from './components/SpriteUploadStep.jsx'
import SpriteEditStep from './components/SpriteEditStep.jsx'
import SpritePreviewExportStep from './components/SpritePreviewExportStep.jsx'
import { useI18n } from './i18n/index.jsx'

const INITIAL = {
  // Step 1：上传与分割
  sourceFile: null,
  sourceUrl: null,
  sourceImageData: null,
  sourceW: 0,
  sourceH: 0,
  splitCols: 8,
  heightRatio: 1,   // 行高比例：frameH = frameW * heightRatio，默认1（方形）
  frameW: 0,
  frameH: 0,

  // Step 2：帧编辑
  frames: [],          // { imageData: ImageData }[]
  selectedIndex: 0,
  history: [],         // { imageData }[][] 每项是 frames 的完整快照，用于撤销

  // Step 3：预览与导出
  previewFps: 12,
  exportCols: 8,
  exportGap: 0,
  exportSizePreset: 'original',
}

export default function SpriteEditorApp({ onBack }) {
  const { t } = useI18n()
  const [state, setState] = useState(INITIAL)
  const update = useCallback(patch => setState(s => ({ ...s, ...patch })), [])

  // 卸载时释放精灵图 ObjectURL（切回首页时触发）
  useEffect(() => () => { if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl) }, [state.sourceUrl])

  const step1Done = state.frames.length > 0

  return (
    <div className="app">
      <header className="app-toolbar">
        {onBack && (
          <button className="btn btn-ghost" onClick={onBack}>
            <i className="ri-arrow-left-s-line" /> {t('common.home')}
          </button>
        )}
        <h1 className="toolbar-title">{t('tool04.title')}</h1>
        <span className="toolbar-badge">{t('common.free')}</span>
      </header>

      <SpriteUploadStep
        stepNum={1}
        done={step1Done}
        state={state}
        update={update}
      />
      <SpriteEditStep
        stepNum={2}
        locked={!step1Done}
        state={state}
        update={update}
      />
      <SpritePreviewExportStep
        stepNum={3}
        locked={!step1Done}
        state={state}
        update={update}
      />
    </div>
  )
}
