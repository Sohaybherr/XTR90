import { useCallback } from 'react'
import { useI18n } from './useI18n'

export function localizedPath(language, path = '/') {
  if (!path || path === '#') {
    return path || '/'
  }

  if (/^(https?:)?\/\//.test(path) || path.startsWith('mailto:') || path.startsWith('tel:')) {
    return path
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `/${language}${normalizedPath === '/' ? '' : normalizedPath}`
}

export function useLocalizedPath() {
  const { language } = useI18n()

  return useCallback((path) => localizedPath(language, path), [language])
}
