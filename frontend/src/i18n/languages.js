export const LANGUAGES = [
  { code: 'en', label: 'English', nativeName: 'English', dir: 'ltr' },
  { code: 'fr', label: 'French', nativeName: 'Français', dir: 'ltr' },
  { code: 'ar', label: 'Arabic', nativeName: 'العربية', dir: 'rtl' },
  { code: 'de', label: 'German', nativeName: 'Deutsch', dir: 'ltr' },
  { code: 'es', label: 'Spanish', nativeName: 'Español', dir: 'ltr' },
]

export const DEFAULT_LANGUAGE = 'en'

export function normalizeLanguage(value) {
  const code = String(value || '').slice(0, 2).toLowerCase()
  return LANGUAGES.some((language) => language.code === code) ? code : DEFAULT_LANGUAGE
}

export function getLanguage(code) {
  return LANGUAGES.find((language) => language.code === code) || LANGUAGES[0]
}
