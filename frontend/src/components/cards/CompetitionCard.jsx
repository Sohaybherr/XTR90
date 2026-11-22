import { Link } from 'react-router-dom'
import { memo } from 'react'
import FavoriteButton from '../common/FavoriteButton'
import { resolveAssetUrl } from '../../utils/assets'
import { useLocalizedPath } from '../../hooks/useLocalizedPath'

function CompetitionCard({ competition }) {
  const toLocale = useLocalizedPath()
  const logoSrc = resolveAssetUrl(competition.logo)
  const marketValue = competition.marketValueLabel || competition.market_value_label

  return (
    <Link className="entity-card" to={toLocale(`/competitions/${competition.id}`)}>
      {logoSrc ? (
        <img className="entity-card__image" src={logoSrc} alt="" loading="lazy" decoding="async" />
      ) : (
        <span className="entity-card__image entity-card__image--empty">
          {String(competition.name).charAt(0).toUpperCase()}
        </span>
      )}
      <span className="entity-card__content">
        <strong>{competition.name}</strong>
        <small>{marketValue ? `${marketValue} squad value` : competition.country?.name || competition.country || competition.type || 'Competition'}</small>
      </span>
      <FavoriteButton id={competition.id} type="competition" />
    </Link>
  )
}

export default memo(CompetitionCard)
