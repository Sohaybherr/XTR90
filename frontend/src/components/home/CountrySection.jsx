import { useEffect, useMemo, useState } from 'react'
import AccordionSection from '../ui/AccordionSection'
import CompetitionSection from './CompetitionSection'
import { resolveAssetUrl } from '../../utils/assets'

function CountrySection({ country, disableMatchLinks = false, showFavorites = true, todayMatchId }) {
  const countryCode = String(country.code || '').trim().toLowerCase()
  const rawFlag = String(country.flag || '').trim()
  const usableFlag = rawFlag.startsWith('/') || rawFlag.startsWith('http') || rawFlag.startsWith('data:')
  const flagCandidates = useMemo(() => {
    const candidates = []
    if (usableFlag) candidates.push(rawFlag)
    if (countryCode) {
      candidates.push(`/assets/flags/flag_${countryCode}.svg`)
      candidates.push(`/assets/flags/flag_${countryCode}.png`)
    }
    return [...new Set(candidates)].map(resolveAssetUrl).filter(Boolean)
  }, [countryCode, rawFlag, usableFlag])
  const [flagIndex, setFlagIndex] = useState(0)
  const flagSrc = flagCandidates[flagIndex] || ''
  const fallbackLabel = countryCode ? countryCode.toUpperCase() : String(country.name || '?').slice(0, 2).toUpperCase()

  useEffect(() => {
    setFlagIndex(0)
  }, [flagCandidates])

  function handleFlagError() {
    setFlagIndex((currentIndex) => currentIndex + 1)
  }

  const title = (
    <span className="country-section__title">
      {flagSrc ? (
        <img
          className="country-section__flag"
          src={flagSrc}
          alt=""
          loading="lazy"
          decoding="async"
          onError={handleFlagError}
        />
      ) : (
        <span className="country-section__flag country-section__flag--empty" aria-hidden="true">{fallbackLabel}</span>
      )}
      <span>{country.name}</span>
    </span>
  )

  return (
    <AccordionSection
      bodyClassName="country-section__body"
      className="country-section country-section--accordion"
      defaultOpen
      lazy
      title={title}
    >
      <div className="competition-list">
        {country.competitions.map((competition) => (
          <CompetitionSection
            key={competition.id ?? competition.name}
            competition={competition}
            disableMatchLinks={disableMatchLinks}
            showFavorites={showFavorites}
            todayMatchId={todayMatchId}
          />
        ))}
      </div>
    </AccordionSection>
  )
}

export default CountrySection
