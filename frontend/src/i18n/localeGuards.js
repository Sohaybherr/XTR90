export function assertLocaleMatch({ expectedLocale, actualLocale, resource }) {
  if (!import.meta.env.DEV || !expectedLocale || !actualLocale || expectedLocale === actualLocale) {
    return
  }

  const message = [
    '[LOCALE_MISMATCH]',
    `Route locale: ${expectedLocale}`,
    `Response locale: ${actualLocale}`,
    `Resource: ${resource}`,
  ].join('\n')

  console.error(message)
  throw new Error(message)
}
