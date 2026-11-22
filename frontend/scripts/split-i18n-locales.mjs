import fs from 'node:fs'
import path from 'node:path'
import { dictionaries } from '../src/i18n/dictionaries.js'

const groups = {
  common: ['nav.', 'footer.', 'common.', 'match.status.'],
  home: ['dates.', 'matches.'],
  search: ['search.'],
  news: ['news.'],
  auth: ['auth.'],
}

const baseDir = path.join('src', 'i18n', 'locales')
fs.mkdirSync(baseDir, { recursive: true })

for (const [locale, dictionary] of Object.entries(dictionaries)) {
  const localeDir = path.join(baseDir, locale)
  fs.mkdirSync(localeDir, { recursive: true })

  const namespaces = Object.fromEntries(Object.keys(groups).map((namespace) => [namespace, {}]))

  for (const [key, value] of Object.entries(dictionary)) {
    const namespace = Object.entries(groups).find(([, prefixes]) => {
      return prefixes.some((prefix) => key.startsWith(prefix))
    })?.[0] || 'common'

    namespaces[namespace][key] = value
  }

  for (const [namespace, values] of Object.entries(namespaces)) {
    fs.writeFileSync(
      path.join(localeDir, `${namespace}.js`),
      `export default ${JSON.stringify(values, null, 2)}\n`,
    )
  }
}
