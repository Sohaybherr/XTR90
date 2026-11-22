import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const blockedLabels = [
  'All Matches',
  'My Matches',
  'Today matches',
  'No match today',
  'Loading favorite matches',
  'Football Dashboard',
  'Search teams, players, competitions',
  'Search teams, competitions, or matches',
  'Suggestions',
  'No matching results',
  'Unable to search right now',
  'Round of 32',
]

const roots = [
  'src/pages/Home',
  'src/pages/Search',
  'src/components/home',
  'src/components/search',
  'src/components/cards/MatchCard.jsx',
  'src/components/cards/NewsCard.jsx',
]

let failed = false

function collectFiles(path) {
  const fullPath = join(process.cwd(), path)
  const stat = statSync(fullPath)
  if (stat.isFile()) return path.endsWith('.jsx') || path.endsWith('.js') ? [path] : []

  return readdirSync(fullPath).flatMap((entry) => collectFiles(join(path, entry)))
}

for (const root of roots) {
  for (const file of collectFiles(root)) {
    const content = readFileSync(join(process.cwd(), file), 'utf8')
    for (const label of blockedLabels) {
      const quoted = [`'${label}'`, `"${label}"`, `\`${label}`]
      const jsxText = new RegExp(`>\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*<`)
      if (quoted.some((item) => content.includes(item)) || jsxText.test(content)) {
        console.error(`Blocked hardcoded UI label "${label}" found in ${file}`)
        failed = true
      }
    }
  }
}

if (failed) process.exit(1)

console.log('known English UI label guard passed')
