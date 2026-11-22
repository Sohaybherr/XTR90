import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { DEFAULT_LANGUAGE, LANGUAGES } from './languages'

export const I18N_NAMESPACES = ['common', 'home', 'search', 'news', 'auth']
export const COMMON_NAMESPACES = ['common']

const namespaceLoaders = {
  en: {
    common: () => import('./locales/en/common.js'),
    home: () => import('./locales/en/home.js'),
    search: () => import('./locales/en/search.js'),
    news: () => import('./locales/en/news.js'),
    auth: () => import('./locales/en/auth.js'),
  },
  fr: {
    common: () => import('./locales/fr/common.js'),
    home: () => import('./locales/fr/home.js'),
    search: () => import('./locales/fr/search.js'),
    news: () => import('./locales/fr/news.js'),
    auth: () => import('./locales/fr/auth.js'),
  },
  ar: {
    common: () => import('./locales/ar/common.js'),
    home: () => import('./locales/ar/home.js'),
    search: () => import('./locales/ar/search.js'),
    news: () => import('./locales/ar/news.js'),
    auth: () => import('./locales/ar/auth.js'),
  },
  de: {
    common: () => import('./locales/de/common.js'),
    home: () => import('./locales/de/home.js'),
    search: () => import('./locales/de/search.js'),
    news: () => import('./locales/de/news.js'),
    auth: () => import('./locales/de/auth.js'),
  },
  es: {
    common: () => import('./locales/es/common.js'),
    home: () => import('./locales/es/home.js'),
    search: () => import('./locales/es/search.js'),
    news: () => import('./locales/es/news.js'),
    auth: () => import('./locales/es/auth.js'),
  },
}

export async function loadLocaleNamespaces(language, namespaces = COMMON_NAMESPACES) {
  const locale = namespaceLoaders[language] ? language : DEFAULT_LANGUAGE
  const uniqueNamespaces = [...new Set([...COMMON_NAMESPACES, ...namespaces])]

  await Promise.all(uniqueNamespaces.map(async (namespace) => {
    if (i18n.hasResourceBundle(locale, namespace)) return

    const loader = namespaceLoaders[locale]?.[namespace]
    if (!loader) return

    const translations = await loader()
    i18n.addResourceBundle(locale, namespace, translations.default, true, true)
  }))
}

export async function initializeI18n(language, namespaces = COMMON_NAMESPACES) {
  const lng = namespaceLoaders[language] ? language : DEFAULT_LANGUAGE

  if (!i18n.isInitialized) {
    i18n.use(initReactI18next).init({
      lng,
      fallbackLng: false,
      supportedLngs: LANGUAGES.map((supportedLanguage) => supportedLanguage.code),
      ns: I18N_NAMESPACES,
      defaultNS: I18N_NAMESPACES,
      fallbackNS: false,
      partialBundledLanguages: true,
      resources: {},
      initImmediate: false,
      interpolation: {
        escapeValue: false,
      },
      missingKeyHandler: (locale, namespace, key) => {
        if (import.meta.env.DEV) {
          console.warn(`Missing translation key: locale=${locale} namespace=${namespace} key=${key}`)
        }
      },
      parseMissingKeyHandler: () => '',
      returnEmptyString: true,
      saveMissing: import.meta.env.DEV,
    })
  }

  await loadLocaleNamespaces(lng, namespaces)

  if (i18n.language !== lng) {
    await i18n.changeLanguage(lng)
  }
}

export default i18n
