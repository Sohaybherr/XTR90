import { initializeI18n } from './config'
import { getLanguage, normalizeLanguage } from './languages'

const LANGUAGE_PREFIX = /^\/(en|fr|ar|de|es)(?=\/|$)/

export function resolveInitialLanguage(pathname = window.location.pathname) {
  const urlLanguage = pathname.split('/').filter(Boolean)[0]
  if (urlLanguage) return normalizeLanguage(urlLanguage)

  try {
    return normalizeLanguage(window.localStorage.getItem('language') || window.navigator.language)
  } catch {
    return normalizeLanguage(window.navigator.language)
  }
}

export function namespacesForPath(pathname = window.location.pathname) {
  const pathWithoutLocale = pathname.replace(LANGUAGE_PREFIX, '') || '/'

  if (pathWithoutLocale.startsWith('/news')) return ['news']
  if (pathWithoutLocale.startsWith('/search')) return ['search']
  if (pathWithoutLocale.startsWith('/login') || pathWithoutLocale.startsWith('/register')) return ['auth']

  return ['home']
}

export function applyDocumentLocale(language) {
  const { dir } = getLanguage(language)
  document.documentElement.lang = language
  document.documentElement.dir = dir
}

export async function bootstrapI18n() {
  const language = resolveInitialLanguage()
  applyDocumentLocale(language)
  await initializeI18n(language, namespacesForPath())
  return language
}
