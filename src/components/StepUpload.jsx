import { useRef, useState } from 'react'
import Panel from './Panel.jsx'
import { fmtTime, fmtSize } from '../utils/format.js'
import { useI18n } from '../i18n/index.jsx'

export default function StepUpload({ stepNum, done, state, update }) {
  const { t } = useI18n()
  const [drag, setDrag] = useState(false)
  const inputRef = useRef()
  const videoRef = useRef()

  function handleFile(file) {
    if (!file || !file.type.startsWith('video/')) {
      alert(t('upload.invalidVideo'))
      return
    }
    if (state.videoUrl) URL.revokeObjectURL(state.videoUrl)
    const url = URL.createObjectURL(file)
    update({
      videoFile: file,
      videoUrl: url,
      videoDuration: 0,
      videoWidth: 0,
      videoHeight: 0,
      cropRect: null,
      refFrame: null,
      frames: [],
      sheetCanvas: null,
      sheetAlphaCanvas: null,
    })
  }

  function onMetadata(e) {
    const v = e.target
    update({
      videoDuration: v.duration,
      videoWidth: v.videoWidth,
      videoHeight: v.videoHeight,
      segStart: 0,
      segEnd: v.duration,
    })
  }

  return (
    <Panel
      stepNum={stepNum}
      title={t('step.upload')}
      done={done}
      defaultOpen={true}
      metaText={done ? state.videoFile?.name : ''}
    >
      {!done ? (
        <>
          <div
            className={`dropzone ${drag ? 'drag' : ''}`}
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]) }}
            onClick={() => inputRef.current.click()}
            role="button"
            aria-label={t('upload.dropVideo')}
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && inputRef.current.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept="video/*"
              onChange={e => handleFile(e.target.files[0])}
              style={{ display: 'none' }}
            />
            <div className="dropzone-icon"><i className="ri-film-line" /></div>
            <div className="dropzone-text">
              <strong>{t('upload.dropVideo')}</strong>{t('upload.orClick')}
            </div>
          </div>
          <p className="upload-hint">{t('upload.hint')}</p>
        </>
      ) : (
        <div className="video-preview-card">
          <video
            ref={videoRef}
            src={state.videoUrl}
            controls
            muted
            onLoadedMetadata={onMetadata}
            className="upload-video-preview"
          />
          <div className="video-info">
            <h3>{state.videoFile.name}</h3>
            <div className="video-info-row">
              <div className="video-info-item">{t('common.duration')} <span>{fmtTime(state.videoDuration)}</span></div>
              <div className="video-info-item">{t('common.resolution')} <span>{state.videoWidth}×{state.videoHeight}</span></div>
              <div className="video-info-item">{t('common.size')} <span>{fmtSize(state.videoFile.size)}</span></div>
            </div>
            <button
              className="btn btn-ghost"
              style={{ marginTop: 10 }}
              onClick={() => {
                URL.revokeObjectURL(state.videoUrl)
                update({ videoFile: null, videoUrl: null, cropRect: null, refFrame: null, frames: [], sheetCanvas: null, sheetAlphaCanvas: null })
              }}
            >
              {t('common.reselect')}
            </button>
          </div>
        </div>
      )}
    </Panel>
  )
}
