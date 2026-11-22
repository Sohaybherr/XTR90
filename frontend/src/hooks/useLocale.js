import { useI18n } from './useI18n'
import { matchStatusKey } from '../i18n/matchStatus'

export function useLocale() {
  const { dir, language, languages, setLanguage, t } = useI18n()

  return {
    locale: language,
    direction: dir,
    isRTL: dir === 'rtl',
    supportedLocales: languages,
    changeLocale: setLanguage,
    translateMatchStatus: (statusCode) => {
      const key = matchStatusKey(statusCode)
      return key ? t(key) : ''
    },
  }
}
