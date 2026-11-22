export function formatSeason(value, options = {}) {
  if (value == null || value === '') return '-'

  const raw = String(value).trim()
  const yearMatch = raw.match(/\b(19|20)\d{2}\b/)

  if (options.edition && yearMatch) {
    return yearMatch[0]
  }

  const slashMatch = raw.match(/^(\d{4})\s*\/\s*(\d{2,4})$/)

  if (slashMatch) {
    const start = slashMatch[1]
    const end = slashMatch[2].length === 2 ? `${start.slice(0, 2)}${slashMatch[2]}` : slashMatch[2]
    return `${start}/${end}`
  }

  if (!yearMatch) {
    return raw
  }

  const startYear = Number(yearMatch[0])
  return `${startYear}/${startYear + 1}`
}

export function isShortEditionSeason(season) {
  if (!season?.start_date && !season?.startDate) return false

  const start = new Date(season.start_date || season.startDate)
  const end = new Date(season.end_date || season.endDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false

  const days = Math.abs(end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)
  return days <= 120
}

export function formatCompetitionSeason(season, competition) {
  const value = season?.name || season?.season_year || season?.year
  const isCup = String(competition?.type || '').toLowerCase() === 'cup'
  return formatSeason(value, { edition: isCup && isShortEditionSeason(season) })
}
