import { Link, useNavigate } from 'react-router-dom'
import { memo, useEffect, useState } from 'react'
import FavoriteButton from '../common/FavoriteButton'
import { resolveAssetUrl } from '../../utils/assets'
import { formatTime } from '../../i18n/formatting'
import { formatRoundLabel } from '../../i18n/rounds'
import { useLocalizedPath } from '../../hooks/useLocalizedPath'
import { useLocale } from '../../hooks/useLocale'
import { useI18n } from '../../hooks/useI18n'

const RUNNING_STATUSES = new Set(['1H', '2H', 'ET', 'BT', 'P', 'LIVE'])
const FINAL_STATUSES = new Set(['FT', 'HT', 'PEN', 'AET'])

function TeamIdentity({ team, unknownLabel, to }) {
  const name = team?.name || unknownLabel
  const logoSrc = resolveAssetUrl(team?.logo)
  const content = (
    <>
      {logoSrc ? (
        <img className="match-card__logo" src={logoSrc} alt="" loading="lazy" decoding="async" />
      ) : (
        <span className="match-card__logo match-card__logo--empty">
          {String(name).charAt(0).toUpperCase()}
        </span>
      )}
      <span className="match-card__team-name">{name}</span>
    </>
  )

  if (team?.id) {
    return (
      <Link className="match-card__team match-card__team--link" to={to}>
        {content}
      </Link>
    )
  }

  return (
    <div className="match-card__team">
      {content}
    </div>
  )
}

function formatMatchTime(value, locale) {
  if (!value) {
    return ''
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return formatTime(value, locale)
}

function getCenterLabel(match, t) {
  const status = String(match.statusShort || match.status || '').toLowerCase()

  if (status === 'scheduled' || status === 'ns') {
    return t('matches.vs')
  }

  return match.score || t('matches.vs')
}

function isLiveStatus(match) {
  return RUNNING_STATUSES.has(String(match.statusShort || match.status || '').toUpperCase().replace("'", ''))
}

function getSecondsSinceUpdate(match, now) {
  const updatedAt = match.updatedAt ? new Date(match.updatedAt).getTime() : null
  return updatedAt && !Number.isNaN(updatedAt) ? Math.max(0, Math.floor((now - updatedAt) / 1000)) : 0
}

function getLiveSeconds(match, now) {
  const status = String(match.statusShort || match.status || '').toUpperCase()
  const elapsed = Number(match.elapsed)
  const hasElapsed = Number.isFinite(elapsed) && elapsed > 0
  const secondsSinceUpdate = RUNNING_STATUSES.has(status) ? getSecondsSinceUpdate(match, now) : 0

  if (status === 'HT') return 45 * 60
  if (FINAL_STATUSES.has(status)) return hasElapsed ? elapsed * 60 : 90 * 60
  if (status === '1H') return (hasElapsed ? elapsed * 60 : 0) + secondsSinceUpdate
  if (status === '2H') return (hasElapsed && elapsed >= 45 ? elapsed * 60 : 45 * 60) + secondsSinceUpdate
  if (status === 'ET' || status === 'BT' || status === 'P') {
    return Math.max(90 * 60, (hasElapsed ? elapsed * 60 : 90 * 60) + secondsSinceUpdate)
  }
  if (status === 'LIVE') return (hasElapsed ? elapsed * 60 : 45 * 60) + secondsSinceUpdate
  return null
}

function formatLiveSeconds(totalSeconds, status) {
  const safeSeconds = Math.max(0, totalSeconds)
  const minute = Math.floor(safeSeconds / 60)
  const second = String(safeSeconds % 60).padStart(2, '0')

  if (status === '1H' && safeSeconds > 45 * 60) {
    const added = safeSeconds - 45 * 60
    return `45+${Math.floor(added / 60)}:${String(added % 60).padStart(2, '0')}`
  }

  if ((status === '2H' || status === 'LIVE') && safeSeconds > 90 * 60) {
    const added = safeSeconds - 90 * 60
    return `90+${Math.floor(added / 60)}:${String(added % 60).padStart(2, '0')}`
  }

  return `${minute}:${second}`
}

function getTimerLabel(match, now, locale, translateMatchStatus) {
  const status = String(match.statusShort || match.status || '').toUpperCase()
  const liveSeconds = getLiveSeconds(match, now)

  if (FINAL_STATUSES.has(status) && match.score) {
    return ''
  }

  if (liveSeconds != null && RUNNING_STATUSES.has(status)) {
    return formatLiveSeconds(liveSeconds, status)
  }

  if (match.isLive && match.status) {
    return translateMatchStatus(match.statusShort || match.status)
  }

  if (FINAL_STATUSES.has(status)) {
    return translateMatchStatus(status)
  }

  return formatMatchTime(match.time, locale) || translateMatchStatus('TBD')
}

function MatchCard({ disableMatchLink = false, match, className = '', id, isToday = false, showFavoriteButton = true }) {
  const toLocale = useLocalizedPath()
  const navigate = useNavigate()
  const { t } = useI18n()
  const { locale, translateMatchStatus } = useLocale()
  const live = Boolean(match.isLive) || isLiveStatus(match)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    setNow(Date.now())
    if (!live) return undefined

    const timer = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [live, match.statusShort, match.status])

  const timerLabel = getTimerLabel(match, now, locale, translateMatchStatus)
  const centerContent = (
    <>
      {timerLabel ? (
        <span className="match-card__timer">{timerLabel}</span>
      ) : null}
      <strong>{getCenterLabel(match, t)}</strong>
    </>
  )
  const homeTeamPath = match.homeTeam?.id ? toLocale(`/teams/${match.homeTeam.id}`) : null
  const awayTeamPath = match.awayTeam?.id ? toLocale(`/teams/${match.awayTeam.id}`) : null
  const matchPath = !disableMatchLink && match.id ? toLocale(`/matches/${match.id}`) : null

  function handleZoneClick(event) {
    if (event.target.closest('.match-card__favorite, .favorite-button')) return

    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = rect.width ? (event.clientX - rect.left) / rect.width : 0.5
    const nextPath = ratio <= 0.2
      ? homeTeamPath
      : ratio >= 0.8
        ? awayTeamPath
        : matchPath

    if (!nextPath) return
    event.preventDefault()
    event.stopPropagation()
    navigate(nextPath)
  }

  return (
    <article
      className={`match-card${disableMatchLink ? '' : ' match-card--link'}${live ? ' match-card--live' : ''}${className ? ` ${className}` : ''}`}
      data-today-match={isToday ? 'true' : undefined}
      id={id}
      onClickCapture={handleZoneClick}
    >
      <div className="match-card__meta">
        {live ? <span className="match-card__live-badge">{translateMatchStatus('LIVE')}</span> : null}
        {match.round ? <span>{formatRoundLabel(match.round, t)}</span> : null}
        {match.statusShort ? <span>{translateMatchStatus(match.statusShort)}</span> : null}
      </div>

      <div className="match-card__body">
        <TeamIdentity
          team={match.homeTeam}
          to={homeTeamPath || '#'}
          unknownLabel={t('matches.unknownTeam')}
        />
        {disableMatchLink ? (
          <div className={`match-card__center${live ? ' match-card__center--live' : ''}`}>
            {centerContent}
          </div>
        ) : (
          <Link
            aria-label={`${match.homeTeam?.name || t('matches.unknownTeam')} ${getCenterLabel(match, t)} ${match.awayTeam?.name || t('matches.unknownTeam')}`}
            className={`match-card__center match-card__center--link${live ? ' match-card__center--live' : ''}`}
            to={matchPath || '#'}
          >
            {centerContent}
          </Link>
        )}
        <TeamIdentity
          team={match.awayTeam}
          to={awayTeamPath || '#'}
          unknownLabel={t('matches.unknownTeam')}
        />
      </div>
      {match.lastEvent ? (
        <div className="match-card__event">
          {[match.lastEvent.elapsed && `${match.lastEvent.elapsed}'`, match.lastEvent.type, match.lastEvent.player?.name]
            .filter(Boolean)
            .join(' - ')}
        </div>
      ) : null}
      {showFavoriteButton ? (
        <div className="match-card__favorite">
          <FavoriteButton id={match.id} type="match" />
        </div>
      ) : null}
    </article>
  )
}

export default memo(MatchCard)
