import { useRef, useState } from 'react'
import Panel from './Panel.jsx'
import NumStepper from './NumStepper.jsx'
import { fmtTime } from '../utils/format.js'
import { extractFrame } from '../utils/frameExtract.js'
import { useToast } from './Toast.jsx'
import { useI18n } from '../i18n/index.jsx'

export default function StepSegment({ stepNum, done, locked, state, update }) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [hasExtracted, setHasExtracted] = useState(false)
  const cancelRef = useRef(false)
  const toast = useToast()

  const dur = state.videoDuration || 1
  const start = state.segStart ?? 0
  const end = state.segEnd ?? dur
  const segLen = end - start
  const fps = state.fps || 8

  // 预计帧数
  const estimatedFrames = Math.max(1, Math.round(segLen * fps))

  // 提取全部帧
  async function extractFrames() {
    if (!state.videoUrl) return
    setLoading(true)
    setProgress(0)
    cancelRef.current = false

    try {
      const video = document.createElement('video')
      video.src = state.videoUrl
      video.muted = true
      video.preload = 'auto'
      await new Promise((res, rej) => {
        video.onloadeddata = res
        video.onerror = rej
        video.load()
      })

      const crop = state.cropRect
      const outW = crop?.w || state.videoWidth
      const outH = crop?.h || state.videoHeight

      // 按 FPS 均匀抽帧
      const total = estimatedFrames
      const times = Array.from({ length: total }, (_, i) =>
        start + (i / Math.max(total - 1, 1)) * segLen
      )
      // 如果只有一帧，取片段起始时间
      if (total === 1) times[0] = start

      const frames = []
      for (let i = 0; i < total; i++) {
        if (cancelRef.current) break
        setProgress(Math.round(((i + 1) / total) * 100))
        try {
          const { imageData } = await extractFrame(video, times[i], crop, outW, outH)
          frames.push({ imageData, time: times[i] })
        } catch (e) {
          console.error('帧提取失败:', i, e)
        }
      }

      if (cancelRef.current) {
        setLoading(false)
        return
      }

      // 同时设置 refFrameTime 为片段起始时间
      update({
        frames,
        refFrameTime: start,
        refFrame: frames[0]?.imageData || null,
        sheetCanvas: null,
        sheetAlphaCanvas: null,
      })
      setHasExtracted(true)
    } catch (e) {
      toast.error(t('extract.failed') + e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Panel
      stepNum={stepNum}
      title={t('step.extract')}
      done={done}
      locked={locked}
      defaultOpen={!locked}
      metaText={done ? `${state.frames.length} ${t('common.frames')}` : ''}
    >
      {/* 主区：2 行 × 2 列 grid，确保左右列同行等高 */}
      <div className="seg-layout" style={{
        display: 'grid',
        gridAutoRows: 'minmax(0, auto)',
        gap: 10,
        alignItems: 'stretch',
      }}>
        {/* Row 1 / 左：FPS */}
        <div className="option-card">
          <label>{t('extract.fps')}</label>
          <NumStepper value={fps} min={1} max={60} onChange={v => update({ fps: v })} />
        </div>

        {/* Row 1 / 右：片段滑块 */}
        <div className="option-card">
          <label>{t('extract.segRange')}</label>
          <div style={{ padding: '0 10px' }}>
            <div className="range-dual" style={{ position: 'relative', height: 28, marginTop: 8 }}>
              <div style={{
                position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                left: 0, right: 0, height: 4, background: 'var(--border)', borderRadius: 2,
              }} />
              <div style={{
                position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                left: `${(start / dur) * 100}%`,
                width: `${((end - start) / dur) * 100}%`,
                height: 4, background: 'var(--accent)', borderRadius: 2,
              }} />
              <input type="range" min={0} max={dur} step={0.1} value={start}
                onChange={e => {
                  const v = Math.min(parseFloat(e.target.value), end - 0.1)
                  update({ segStart: v })
                }}
              />
              <input type="range" min={0} max={dur} step={0.1} value={end}
                onChange={e => {
                  const v = Math.max(parseFloat(e.target.value), start + 0.1)
                  update({ segEnd: v })
                }}
              />
            </div>
          </div>
        </div>

        {/* Row 2 / 左：预计结果 */}
        <div className="option-card option-card--metric">
          <label>{t('extract.estimated')}</label>
          <div className="metric-value" style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
            <span>{estimatedFrames} {t('common.frames')}</span>
            <span className="metric-sub" style={{ marginTop: 0 }}>· {segLen.toFixed(1)} {t('extract.segSec')}</span>
          </div>
        </div>

        {/* Row 2 / 右：开始 / 结束 / 片段长度 */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10,
        }}>
          <div className="option-card option-card--metric">
            <label>{t('extract.start')}</label>
            <div className="metric-value" style={{ fontSize: '0.95rem' }}>{fmtTime(start)}</div>
          </div>
          <div className="option-card option-card--metric">
            <label>{t('extract.end')}</label>
            <div className="metric-value" style={{ fontSize: '0.95rem' }}>{fmtTime(end)}</div>
          </div>
          <div className="option-card option-card--metric">
            <label>{t('extract.segLength')}</label>
            <div className="metric-value" style={{ fontSize: '0.95rem' }}>{fmtTime(segLen)}</div>
          </div>
        </div>
      </div>

      {/* 提取按钮 + 进度 */}
      <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={extractFrames} disabled={loading}>
          {loading ? `${t('extract.extracting')} ${progress}%` : (hasExtracted ? t('extract.btnReExtract') : t('extract.btnExtract'))}
        </button>
        {loading && (
          <button className="btn btn-ghost" onClick={() => { cancelRef.current = true }}>
            {t('common.cancel')}
          </button>
        )}
      </div>

      {/* 进度条 */}
      {loading && (
        <div className="progress-wrap" style={{ marginTop: 10 }}>
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: progress + '%' }} />
          </div>
        </div>
      )}

      {done && !loading && (
        <div className="status-msg success" style={{ marginTop: 10 }}>
          {t('extract.doneMsg').replace('{count}', state.frames.length)}
        </div>
      )}
    </Panel>
  )
}
