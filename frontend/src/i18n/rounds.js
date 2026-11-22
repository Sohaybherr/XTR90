export function formatRoundLabel(round, t) {
  const value = String(round || '').trim()
  if (!value) return ''

  const regularSeason = value.match(/^Regular Season\s*-\s*(\d+)$/i)
  if (regularSeason) {
    return t('matches.round.regularSeason', { number: regularSeason[1] })
  }

  const roundOf = value.match(/^Round of\s+(\d+)$/i)
  if (roundOf) {
    return t(`matches.round.roundOf.${roundOf[1]}`, {
      defaultValue: t('matches.round.roundOf.generic', { number: roundOf[1] }),
      number: roundOf[1],
    })
  }

  const normalized = value.toLowerCase()
  if (normalized === 'quarter-finals' || normalized === 'quarter finals') return t('matches.round.quarterFinals')
  if (normalized === 'semi-finals' || normalized === 'semi finals') return t('matches.round.semiFinals')
  if (normalized === 'final') return t('matches.round.final')

  return value
}
