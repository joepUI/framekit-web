import { createContext, useContext, useState, useCallback } from 'react'
import zh from './zh.js'
import en from './en.js'

const LANGS = { zh, en }
const STORAGE_KEY = 'framekit-lang'

const I18nCtx = createContext(null)

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || 'zh' } catch { return 'zh' }
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
  return useContext(I18nCtx)
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
