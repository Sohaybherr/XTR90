import { dictionaries } from '../src/i18n/dictionaries.js'
import { DEFAULT_LANGUAGE, LANGUAGES } from '../src/i18n/languages.js'

const expectedLocales = LANGUAGES.map((language) => language.code)
const baseKeys = Object.keys(dictionaries[DEFAULT_LANGUAGE] || {}).sort()
let hasError = false

for (const locale of expectedLocales) {
  const dictionary = dictionaries[locale]

  if (!dictionary) {
    console.error(`Missing dictionary for locale "${locale}"`)
    hasError = true
    continue
  }

  const keys = Object.keys(dictionary).sort()
  const missing = baseKeys.filter((key) => !keys.includes(key))
  const extra = keys.filter((key) => !baseKeys.includes(key))

  if (missing.length > 0 || extra.length > 0) {
    console.error(`Locale "${locale}" has mismatched translation keys.`)
    if (missing.length > 0) console.error(`  Missing: ${missing.join(', ')}`)
    if (extra.length > 0) console.error(`  Extra: ${extra.join(', ')}`)
    hasError = true
  }
}

if (hasError) {
  process.exit(1)
}

console.log(`i18n key validation passed for ${expectedLocales.join(', ')}`)
