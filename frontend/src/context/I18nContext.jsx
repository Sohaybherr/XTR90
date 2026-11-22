import { useCallback, useMemo, useState } from 'react'
import { I18nextProvider } from 'react-i18next'
import { I18nContext } from './i18n-context'
import i18n, { initializeI18n } from '../i18n/config'
import { applyDocumentLocale, resolveInitialLanguage } from '../i18n/bootstrap'
import { getLanguage, LANGUAGES, normalizeLanguage } from '../i18n/languages'

export function I18nProvider({ children }) {
  const [language, setLanguageState] = useState(() => resolveInitialLanguage())
  const languageMeta = getLanguage(language)

  const setLanguage = useCallback(async (nextLanguage, namespaces) => {
    const normalizedLanguage = normalizeLanguage(nextLanguage)
    await initializeI18n(normalizedLanguage, namespaces)
    applyDocumentLocale(normalizedLanguage)

    try {
      localStorage.setItem('language', normalizedLanguage)
      localStorage.setItem('i18nextLng', normalizedLanguage)
    } catch {
      // Ignore storage failures; the active tab still keeps the selected language.
    }

    setLanguageState((current) => (
      current === normalizedLanguage ? current : normalizedLanguage
    ))
  }, [])

  const t = useCallback((key, options) => i18n.t(key, options), [])

  const value = useMemo(() => {
    return {
      dir: languageMeta.dir,
      language,
      languages: LANGUAGES,
      setLanguage,
      t,
    }
  }, [language, languageMeta.dir, setLanguage, t])

  return (
    <I18nextProvider i18n={i18n}>
      <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
    </I18nextProvider>
  )
}
