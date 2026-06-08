import { useState, useCallback, useEffect, useRef } from 'react'
import StepUpload from './components/StepUpload.jsx'
import StepCrop from './components/StepCrop.jsx'
import StepSegment from './components/StepSegment.jsx'
import StepRefPreview from './components/StepRefPreview.jsx'
import StepPreviewExport from './components/StepPreviewExport.jsx'
import { useI18n } from './i18n/index.jsx'

const INITIAL = {
  // Step 1 – upload
  videoFile: null,
  videoUrl: null,
  videoDuration: 0,
  videoWidth: 0,
  videoHeight: 0,

  // Step 2 – crop
  cropRect: null, // { x, y, w, h } in pixels on video

  // Step 3 – extract frames
  segStart: 0,
  segEnd: 0,
  fps: 8,
  frames: [],           // Array<{ imageData, time }>

  // Step 4 – ref preview & chroma
  refFrameTime: 0,
  refFrame: null,        // ImageData
  chromaColor: null,     // hex string or null
  chromaEnabled: false,
  tolerance: 28,
  smooth: 14,
  edgeSmooth: true,
  despill: true,
  previewMode: 'result', // 'result' | 'alpha' | 'solid'

  // Generation results
  sheetCanvas: null,
  sheetAlphaCanvas: null,

  // Step 6 – export config
  exportCols: 4,
  exportGap: 0,
  exportSizePreset: 'original',
}

export default function App({ onBack }) {
  const { t } = useI18n()
  const [state, setState] = useState(INITIAL)
  const update = useCallback(patch => setState(s => ({ ...s, ...patch })), [])

  // 卸载时释放视频 ObjectURL（切回首页时触发）
  useEffect(() => () => { if (state.videoUrl) URL.revokeObjectURL(state.videoUrl) }, [state.videoUrl])

  // 裁剪变化时，下游帧数据和序列图失效，自动清除 → 后续步骤收起
  const prevCropRef = useRef(state.cropRect)
  useEffect(() => {
    const prev = prevCropRef.current
    prevCropRef.current = state.cropRect
    // 跳过初次设置（prev 为 null）或引用未变
    if (!prev || prev === state.cropRect) return
    // 裁剪改了，只清除序列图数据 → 步骤4需要重新生成，步骤5收起
    update({ sheetCanvas: null, sheetAlphaCanvas: null })
  }, [state.cropRect, update])

  // 步骤4参数变化时，已生成的序列图失效 → 步骤5收起
  const step4Key = `${state.chromaColor}-${state.tolerance}-${state.smooth}-${state.despill}-${state.edgeSmooth}`
  const prevStep4Key = useRef(step4Key)
  useEffect(() => {
    const prev = prevStep4Key.current
    prevStep4Key.current = step4Key
    if (prev === step4Key) return
    if (state.sheetCanvas) {
      update({ sheetCanvas: null, sheetAlphaCanvas: null })
    }
  }, [step4Key, update])

  // 步骤完成状态
  const step1Done = !!state.videoFile
  const step2Done = !!state.cropRect
  const step3Done = state.frames.length > 0
  const step4Done = !!state.sheetCanvas
  const step5Done = !!state.sheetCanvas

  return (
    <>
      <nav className="tut-nav">
        <button className="tut-back-btn" onClick={onBack}>
          <i className="ri-arrow-left-line" /> {t('common.home')}
        </button>
        <span className="tut-nav-title">{t('tool01.title')}</span>
      </nav>
      <div className="app">
      <StepUpload stepNum={1} done={step1Done} state={state} update={update} />
      <StepCrop stepNum={2} done={step2Done} locked={!step1Done} state={state} update={update} />
      <StepSegment stepNum={3} done={step3Done} locked={!step2Done} state={state} update={update} />
      <StepRefPreview stepNum={4} done={step4Done} locked={!step3Done} state={state} update={update} />
      <StepPreviewExport stepNum={5} done={step5Done} locked={!step4Done} state={state} update={update} />
    </div>
    </>
  )
}
