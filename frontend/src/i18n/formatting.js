const LOCALE_TAGS = {
  en: 'en',
  fr: 'fr',
  ar: 'ar',
  de: 'de',
  es: 'es',
}

export function localeTag(locale) {
  return LOCALE_TAGS[locale] || LOCALE_TAGS.en
}

export function formatDate(value, locale, options = {}) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)

  const hasDateFields = ['weekday', 'era', 'year', 'month', 'day'].some((key) => options[key] !== undefined)
  const dateOptions = hasDateFields ? options : { dateStyle: 'medium', ...options }

  return new Intl.DateTimeFormat(localeTag(locale), dateOptions).format(date)
}

export function formatTime(value, locale, options = {}) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)

  return new Intl.DateTimeFormat(localeTag(locale), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...options,
  }).format(date)
}

export function formatNumber(value, locale, options = {}) {
  if (value == null || value === '') return ''
  return new Intl.NumberFormat(localeTag(locale), options).format(Number(value))
}

export function formatRelativeTime(value, locale) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)

  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000)
  const divisions = [
    { amount: 60, unit: 'second' },
    { amount: 60, unit: 'minute' },
    { amount: 24, unit: 'hour' },
    { amount: 7, unit: 'day' },
    { amount: 4.34524, unit: 'week' },
    { amount: 12, unit: 'month' },
    { amount: Number.POSITIVE_INFINITY, unit: 'year' },
  ]

  let duration = diffSeconds
  for (const division of divisions) {
    if (Math.abs(duration) < division.amount) {
      return new Intl.RelativeTimeFormat(localeTag(locale), { numeric: 'auto' }).format(Math.round(duration), division.unit)
    }
    duration /= division.amount
  }

  return ''
}
