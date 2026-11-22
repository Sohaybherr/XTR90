import { Link } from 'react-router-dom'
import { memo } from 'react'
import FavoriteButton from '../common/FavoriteButton'
import { resolveAssetUrl } from '../../utils/assets'
import { useLocalizedPath } from '../../hooks/useLocalizedPath'

function PlayerCard({ player }) {
  const toLocale = useLocalizedPath()
  const photoSrc = resolveAssetUrl(player.photo || player.photo_path)
  const name = player.name || player.full_name || `${player.firstname ?? player.first_name ?? ''} ${player.lastname ?? player.last_name ?? ''}`.trim()
  const marketValue = player.marketValueLabel || player.market_value_label

  return (
    <Link className="entity-card" to={toLocale(`/players/${player.id}`)}>
      {photoSrc ? (
        <img className="entity-card__image" src={photoSrc} alt="" loading="lazy" decoding="async" />
      ) : (
        <span className="entity-card__image entity-card__image--empty">
          {String(name || '?').charAt(0).toUpperCase()}
        </span>
      )}
      <span className="entity-card__content">
        <strong>{name || 'Unknown player'}</strong>
        <small>{marketValue ? `${marketValue} market value` : player.position || player.squad_position || player.nationality || 'Player'}</small>
      </span>
      <FavoriteButton id={player.id} type="player" />
    </Link>
  )
}

export default memo(PlayerCard)
