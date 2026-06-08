import { createContext, useContext, useState, useCallback } from 'react'

const ToastCtx = createContext(null)

export function useToast() {
  return useContext(ToastCtx)
}

let _id = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const add = useCallback((message, type) => {
    const id = ++_id
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2000)
  }, [])

  const toast = {
    success: msg => add(msg, 'success'),
    error:   msg => add(msg, 'error'),
    warning: msg => add(msg, 'warning'),
    info:    msg => add(msg, 'info'),
  }

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div style={{
        position: 'fixed', bottom: 24, right: 24,
        display: 'flex', flexDirection: 'column', gap: 8,
        zIndex: 9999, pointerEvents: 'none',
      }}>
        {toasts.map(t => (
          <ToastItem
            key={t.id}
            t={t}
            onClose={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
          />
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

const ICONS = {
  success: 'ri-checkbox-circle-fill',
  error:   'ri-close-circle-fill',
  warning: 'ri-alert-fill',
  info:    'ri-information-fill',
}

function ToastItem({ t, onClose }) {
  return (
    <div className={`toast toast-${t.type}`} style={{ pointerEvents: 'auto' }} onClick={onClose}>
      <i className={ICONS[t.type]} />
      <span>{t.message}</span>
    </div>
  )
}
