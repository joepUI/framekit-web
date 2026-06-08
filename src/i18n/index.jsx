import { createContext, useContext, useState, useCallback } from 'react'
import zh from './zh.js'
import en from './en.js'

const LANGS = { zh, en }
const STORAGE_KEY = 'framekit-lang'

const I18nCtx = createContext(null)

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) return saved
      // 浏览器语言含 zh 则中文，否则英文
      const browserLang = (navigator.language || '').toLowerCase()
      return browserLang.startsWith('zh') ? 'zh' : 'en'
    } catch { return 'en' }
  })

  const toggle = useCallback(() => {
    setLang(prev => {
      const next = prev === 'zh' ? 'en' : 'zh'
      try { localStorage.setItem(STORAGE_KEY, next) } catch {}
      return next
    })
  }, [])

  const t = useCallback((key) => {
    const dict = LANGS[lang] || LANGS.zh
    return dict[key] ?? key
  }, [lang])

  return (
    <I18nCtx.Provider value={{ lang, t, toggle }}>
      {children}
    </I18nCtx.Provider>
  )
}

export function useI18n() {
  const ctx = useContext(I18nCtx)
  // 防止在 I18nProvider 外部使用时崩溃
  if (!ctx) return { lang: 'zh', t: (key) => key, toggle: () => {} }
  return ctx
}

export function LangToggle({ className }) {
  const { lang, toggle } = useContext(I18nCtx)
  return (
    <button
      className={`lang-toggle ${className || ''}`}
      onClick={toggle}
      title={lang === 'zh' ? 'Switch to English' : '切换到中文'}
    >
      {lang === 'zh' ? 'EN' : '中'}
    </button>
  )
}
