import { Link } from 'react-router-dom'
import { memo } from 'react'
import FavoriteButton from '../common/FavoriteButton'
import { resolveAssetUrl } from '../../utils/assets'
import { useLocalizedPath } from '../../hooks/useLocalizedPath'

function TeamCard({ team }) {
  const toLocale = useLocalizedPath()
  const logoSrc = resolveAssetUrl(team.logo || team.logo_path)
  const country = typeof team.country === 'object' ? team.country?.name : team.country
  const marketValue = team.marketValueLabel || team.market_value_label

  return (
    <Link className="entity-card" to={toLocale(`/teams/${team.id}`)}>
      {logoSrc ? (
        <img className="entity-card__image" src={logoSrc} alt="" loading="lazy" decoding="async" />
      ) : (
        <span className="entity-card__image entity-card__image--empty">
          {String(team.name).charAt(0).toUpperCase()}
        </span>
      )}
      <span className="entity-card__content">
        <strong>{team.name}</strong>
        <small>{marketValue ? `${marketValue} squad value` : country || team.country_name_snapshot || team.code || 'Team'}</small>
      </span>
      <FavoriteButton id={team.id} type="team" />
    </Link>
  )
}

export default memo(TeamCard)
