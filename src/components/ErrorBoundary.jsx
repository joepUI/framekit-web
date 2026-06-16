import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // 可接入日志服务，目前只打印
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    const { onBack } = this.props
    const msg = this.state.error?.message || String(this.state.error)

    return (
      <div className="app">
        <div style={{
          maxWidth: 480, margin: '80px auto', padding: '0 24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 16 }}>😵</div>
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
            页面出了点问题
          </h2>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.6 }}>
            渲染时发生了意外错误，请尝试刷新页面或返回首页。
          </p>
          {msg && (
            <pre style={{
              fontSize: 'var(--text-sm)', color: 'var(--error)', background: 'var(--error-soft)',
              border: '1px solid rgba(208,64,64,0.15)', padding: '10px 14px',
              textAlign: 'left', overflowX: 'auto', marginBottom: 24,
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>
              {msg}
            </pre>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            {onBack && (
              <button className="btn btn-ghost" onClick={onBack}>
                <i className="ri-arrow-left-s-line" /> 返回首页
              </button>
            )}
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              <i className="ri-refresh-line" /> 刷新页面
            </button>
          </div>
        </div>
      </div>
    )
  }
}
