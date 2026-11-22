import { BarChart3, CalendarDays, CircleDot, Clock, Footprints, MapPin, Minus, RefreshCw, Shield, Star, TrendingDown, TrendingUp, Trophy, UserRound } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getMatchDetails, syncMatchDetails } from '../../api/matches'
import FavoriteButton from '../../components/common/FavoriteButton'
import AccordionSection from '../../components/ui/AccordionSection'
import ChoiceBox from '../../components/ui/ChoiceBox'
import { useLocalizedPath } from '../../hooks/useLocalizedPath'
import { useMatchLiveUpdates } from '../../hooks/useMatchLiveUpdates'
import { useAuth } from '../../hooks/useAuth'
import { resolveAssetUrl } from '../../utils/assets'
import { formatCompetitionSeason } from '../../utils/seasons'

function formatDate(value) {
  if (!value) return 'Date unavailable'
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

function formatTime(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatLastUpdated(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatOdd(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number.toFixed(2) : '-'
}

function formatLiveClock(status) {
  if (!status?.elapsed) {
    return status?.short || ''
  }

  return `${status.elapsed}${status.extra ? `+${status.extra}` : ''}'`
}

function isRunningStatus(status) {
  return ['1H', '2H', 'ET', 'BT', 'P', 'LIVE'].includes(String(status?.short || '').toUpperCase())
}

function isFinishedStatus(status) {
  return ['FT', 'AET', 'PEN'].includes(String(status?.short || '').toUpperCase())
}

function secondsSinceStatusUpdate(status, now) {
  const updatedAt = status?.updatedAt ? new Date(status.updatedAt).getTime() : null
  return updatedAt && !Number.isNaN(updatedAt) ? Math.max(0, Math.floor((now - updatedAt) / 1000)) : 0
}

function getEstimatedMatchSeconds(status, now) {
  const elapsed = Number(status?.elapsed)
  const short = String(status?.short || '').toUpperCase()
  const hasElapsed = Number.isFinite(elapsed) && elapsed > 0
  const secondsSinceUpdate = isRunningStatus(status) ? secondsSinceStatusUpdate(status, now) : 0

  if (short === 'NS') return null
  if (short === 'HT') return 45 * 60

  if (isFinishedStatus(status)) {
    if (Number.isFinite(elapsed) && elapsed > 0) return elapsed * 60
    return 90 * 60
  }

  if (short === '1H') {
    return (hasElapsed ? elapsed * 60 : 0) + secondsSinceUpdate
  }

  if (short === '2H') {
    const secondHalfBase = hasElapsed && elapsed >= 45 ? elapsed * 60 : 45 * 60
    return secondHalfBase + secondsSinceUpdate
  }

  if (short === 'LIVE') {
    const liveBase = hasElapsed ? elapsed * 60 : 45 * 60
    return liveBase + secondsSinceUpdate
  }

  if (short === 'ET' || short === 'BT' || short === 'P') {
    const extraTimeBase = hasElapsed ? elapsed * 60 : 90 * 60
    return Math.max(90 * 60, extraTimeBase + secondsSinceUpdate)
  }

  if (isRunningStatus(status)) {
    return null
  }

  return null
}

function formatMatchSeconds(totalSeconds, status) {
  const short = String(status?.short || '').toUpperCase()
  const safeSeconds = Math.max(0, totalSeconds)
  const minute = Math.floor(safeSeconds / 60)
  const second = String(safeSeconds % 60).padStart(2, '0')

  if (short === '1H' && safeSeconds > 45 * 60) {
    const addedSeconds = safeSeconds - (45 * 60)
    return `45+${Math.floor(addedSeconds / 60)}:${String(addedSeconds % 60).padStart(2, '0')}`
  }

  if ((short === '2H' || short === 'LIVE') && safeSeconds > 90 * 60) {
    const addedSeconds = safeSeconds - (90 * 60)
    return `90+${Math.floor(addedSeconds / 60)}:${String(addedSeconds % 60).padStart(2, '0')}`
  }

  return `${minute}:${second}`
}

function formatLiveClockWithSeconds(status, now) {
  if (!status?.elapsed && !isRunningStatus(status)) {
    return status?.short || ''
  }

  if (!isRunningStatus(status)) {
    return formatLiveClock(status)
  }

  const matchSeconds = getEstimatedMatchSeconds(status, now)
  return matchSeconds == null ? formatLiveClock(status) : formatMatchSeconds(matchSeconds, status)
}

function scoreText(score) {
  if (score?.home === null && score?.away === null) return 'vs'
  return `${score?.home ?? '-'} - ${score?.away ?? '-'}`
}

function timelineEventKey(event) {
  return [
    event?.elapsed,
    event?.extra,
    event?.team?.id,
    event?.player?.id,
    event?.player?.name,
    event?.assistPlayer?.id,
    event?.assistPlayer?.name,
    event?.type,
    event?.detail,
    event?.comments,
  ].join(':')
}

function timelineLooseEventKey(event) {
  return [
    event?.elapsed,
    event?.extra,
    event?.team?.id,
    event?.type,
    event?.detail,
  ].join(':')
}

function timelineHasPerson(event) {
  return Boolean(event?.player?.id || event?.player?.name || event?.assistPlayer?.id || event?.assistPlayer?.name)
}

function timelineEventKeys(event) {
  const keys = [event?.eventKey, event?.id, timelineEventKey(event)].filter(Boolean).map(String)
  if (!timelineHasPerson(event)) keys.push(timelineLooseEventKey(event))
  return keys
}

function timelineEventWeight(event) {
  return [
    event?.id,
    event?.eventKey,
    event?.player?.id,
    event?.player?.name,
    event?.assistPlayer?.id,
    event?.assistPlayer?.name,
    event?.comments,
  ].filter(Boolean).length
}

function timelineEventSortValue(event) {
  if (event?.timelineMarker === 'half-time') return 45.99
  return Number(event?.elapsed ?? 0) + Number(event?.extra ?? 0) / 100
}

function dedupeTimelineEvents(events = []) {
  const byKey = new Map()
  const aliases = new Map()

  events.forEach((event) => {
    const keys = timelineEventKeys(event)
    const lookupKeys = [...keys, timelineLooseEventKey(event)]
    const key = lookupKeys.map((item) => aliases.get(item) || item).find((item) => byKey.has(item)) || keys[0]
    const current = byKey.get(key)

    if (!current || timelineEventWeight(event) >= timelineEventWeight(current)) {
      byKey.set(key, { ...current, ...event })
    }

    keys.forEach((item) => aliases.set(item, key))
    if (!timelineHasPerson(event)) aliases.set(timelineLooseEventKey(event), key)
  })

  return Array.from(byKey.values()).sort((a, b) => timelineEventSortValue(a) - timelineEventSortValue(b))
}

function hasHalftimeEvent(events = []) {
  return events.some((event) => {
    const type = String(event?.type || '').toLowerCase()
    const detail = String(event?.detail || '').toLowerCase()
    return event?.timelineMarker === 'half-time' || type.includes('half') || detail.includes('half')
  })
}

function shouldShowHalftimeMarker(match, events = []) {
  if (hasHalftimeEvent(events)) return false

  const status = String(match?.status?.short || '').toUpperCase()
  if (['HT', '2H', 'ET', 'BT', 'P', 'FT', 'AET', 'PEN'].includes(status)) return true
  if (['LIVE', 'INT', 'SUSP'].includes(status) && Number(match?.status?.elapsed || 0) >= 46) return true

  return events.some((event) => Number(event?.elapsed || 0) > 45)
}

function buildTimelineEvents(events = [], match) {
  const deduped = dedupeTimelineEvents(events)
  if (!shouldShowHalftimeMarker(match, deduped)) return deduped

  return dedupeTimelineEvents([
    ...deduped,
    {
      id: 'timeline-half-time',
      eventKey: 'timeline-half-time',
      timelineMarker: 'half-time',
      elapsed: 45,
      extra: 99,
      type: 'Half-time',
      detail: 'End of 1st half',
    },
  ])
}

function TeamBadge({ team, align = 'left' }) {
  const toLocale = useLocalizedPath()

  return (
    <div className={`match-detail-team match-detail-team--${align}`}>
      <Link className="match-detail-team__link" to={team?.id ? toLocale(`/teams/${team.id}`) : '#'}>
        {team?.logo ? (
          <img className="match-detail-team__logo" src={resolveAssetUrl(team.logo)} alt="" loading="eager" decoding="async" />
        ) : (
          <span className="match-detail-team__logo match-detail-team__logo--empty">
            {team?.name?.charAt(0) || '?'}
          </span>
        )}
        <strong>{team?.name || 'Unknown team'}</strong>
      </Link>
      <FavoriteButton id={team?.id} type="team" />
    </div>
  )
}

function InfoPill({ icon: Icon, label }) {
  if (!label) return null
  return (
    <span className="match-info-pill">
      <Icon size={15} />
      {label}
    </span>
  )
}

function EventCard({ event }) {
  if (event?.timelineMarker === 'half-time') {
    return (
      <div className="match-event-card match-event-card--marker">
        <strong>{event.type}</strong>
        <span>{event.detail}</span>
      </div>
    )
  }

  return (
    <div className="match-event-card">
      <strong>{event.type || 'Event'}</strong>
      <span>{event.detail || event.comments || 'No detail'}</span>
      <small>
        {[event.player?.name, event.assistPlayer?.name && `Assist: ${event.assistPlayer.name}`]
          .filter(Boolean)
          .join(' - ')}
      </small>
    </div>
  )
}

function Timeline({ events, teams }) {
  if (!events?.length) {
    return <div className="match-empty">No timeline events stored for this match.</div>
  }

  const homeTeamId = teams?.home?.id == null ? '' : String(teams.home.id)
  const awayTeamId = teams?.away?.id == null ? '' : String(teams.away.id)
  return (
    <div className="match-timeline-layout">
      <div className="match-timeline-header match-timeline-header--home">{teams?.home?.name || 'Home'}</div>
      <div className="match-timeline-header match-timeline-header--time">Time</div>
      <div className="match-timeline-header match-timeline-header--away">{teams?.away?.name || 'Away'}</div>
      {events.map((event) => {
        if (event.timelineMarker === 'half-time') {
          return (
            <div className="match-timeline-row match-timeline-row--marker" key={timelineEventKey(event)}>
              <span className="match-event__minute">HT</span>
              <EventCard event={event} />
            </div>
          )
        }

        const teamId = event.team?.id == null ? '' : String(event.team.id)
        const isHome = teamId === homeTeamId
        const isAway = teamId === awayTeamId

        return (
          <div className="match-timeline-row" key={timelineEventKey(event)}>
            <div className="match-timeline-side match-timeline-side--home">
              {isHome ? <EventCard event={event} /> : null}
            </div>
            <span className="match-event__minute">
              {event.elapsed ?? '-'}
              {event.extra && event.extra !== 99 ? `+${event.extra}` : ''}'
            </span>
            <div className="match-timeline-side match-timeline-side--away">
              {isAway || (!isHome && !isAway) ? <EventCard event={event} /> : null}
            </div>
          </div>
        )
      })}
    </div>
  )

}

function StatRow({ label, home, away }) {
  const homeValue = formatStatValue(home)
  const awayValue = formatStatValue(away)
  return (
    <div className="match-stat-row">
      <span>{homeValue}</span>
      <strong>{label}</strong>
      <span>{awayValue}</span>
    </div>
  )
}

function labelFromKey(key) {
  return String(key || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase())
}

function formatStatValue(value) {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.length ? value.join(', ') : '-'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function isEmptyStatValue(value) {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
}

const TEAM_STAT_ENTRIES = [
  ['Ball possession', 'ballPossession', (value) => value == null ? value : `${value}%`],
  ['Expected goals', 'expectedGoals'],
  ['Total shots', 'totalShots'],
  ['Shots on goal', 'shotsOnGoal'],
  ['Shots off goal', 'shotsOffGoal'],
  ['Blocked shots', 'blockedShots'],
  ['Shots inside box', 'shotsInsideBox'],
  ['Shots outside box', 'shotsOutsideBox'],
  ['Goalkeeper saves', 'goalkeeperSaves'],
  ['Corner kicks', 'cornerKicks'],
  ['Offsides', 'offsides'],
  ['Fouls', 'fouls'],
  ['Yellow cards', 'yellowCards'],
  ['Red cards', 'redCards'],
  ['Total passes', 'totalPasses'],
  ['Passes accurate', 'passesAccurate'],
  ['Pass accuracy', 'passesPercentage', (value) => value == null ? value : `${value}%`],
]

const TEAM_PERIOD_STAT_ENTRIES = [
  ['Ball possession', 'ball_possession', (value) => value == null ? value : `${value}%`],
  ['Expected goals', 'expected_goals'],
  ['Total shots', 'total_shots'],
  ['Shots on goal', 'shots_on_goal'],
  ['Shots off goal', 'shots_off_goal'],
  ['Blocked shots', 'blocked_shots'],
  ['Shots inside box', 'shots_inside_box'],
  ['Shots outside box', 'shots_outside_box'],
  ['Goalkeeper saves', 'goalkeeper_saves'],
  ['Corner kicks', 'corner_kicks'],
  ['Offsides', 'offsides'],
  ['Fouls', 'fouls'],
  ['Yellow cards', 'yellow_cards'],
  ['Red cards', 'red_cards'],
  ['Total passes', 'total_passes'],
  ['Passes accurate', 'passes_accurate'],
  ['Pass accuracy', 'passes_percentage', (value) => value == null ? value : `${value}%`],
]

function buildTeamStatRows(home, away) {
  const rows = TEAM_STAT_ENTRIES
    .map(([label, key, formatter]) => {
      const homeValue = home?.[key]
      const awayValue = away?.[key]
      if (isEmptyStatValue(homeValue) && isEmptyStatValue(awayValue)) return null
      return {
        label,
        home: formatter ? formatter(homeValue) : homeValue,
        away: formatter ? formatter(awayValue) : awayValue,
      }
    })
    .filter(Boolean)

  const extraKeys = new Set([
    ...Object.keys(home?.extra || {}),
    ...Object.keys(away?.extra || {}),
  ])

  extraKeys.forEach((key) => {
    if (['first_half', 'second_half'].includes(key)) return
    rows.push({
      label: labelFromKey(key),
      home: home?.extra?.[key],
      away: away?.extra?.[key],
    })
  })

  return rows
}

function buildTeamPeriodStatRows(homePeriod, awayPeriod) {
  if (!homePeriod && !awayPeriod) return []

  const rows = TEAM_PERIOD_STAT_ENTRIES
    .map(([label, key, formatter]) => {
      const homeValue = homePeriod?.[key]
      const awayValue = awayPeriod?.[key]
      if (isEmptyStatValue(homeValue) && isEmptyStatValue(awayValue)) return null
      return {
        label,
        home: formatter ? formatter(homeValue) : homeValue,
        away: formatter ? formatter(awayValue) : awayValue,
      }
    })
    .filter(Boolean)

  const extraKeys = new Set([
    ...Object.keys(homePeriod?.extra_statistics || {}),
    ...Object.keys(awayPeriod?.extra_statistics || {}),
  ])

  extraKeys.forEach((key) => {
    rows.push({
      label: labelFromKey(key),
      home: homePeriod?.extra_statistics?.[key],
      away: awayPeriod?.extra_statistics?.[key],
    })
  })

  return rows
}

function TeamStatSection({ title, rows }) {
  if (!rows.length) return null

  return (
    <section className="match-stat-section">
      <h3>{title}</h3>
      <div className="match-stats">
        {rows.map((row) => (
          <StatRow key={row.label} label={row.label} home={row.home} away={row.away} />
        ))}
      </div>
    </section>
  )
}

function TeamStats({ statistics }) {
  const home = statistics?.home
  const away = statistics?.away
  const rows = buildTeamStatRows(home, away)
  const firstHalfRows = buildTeamPeriodStatRows(home?.extra?.first_half, away?.extra?.first_half)
  const secondHalfRows = buildTeamPeriodStatRows(home?.extra?.second_half, away?.extra?.second_half)

  if ((!home && !away) || (rows.length === 0 && firstHalfRows.length === 0 && secondHalfRows.length === 0)) {
    return <div className="match-empty">No team statistics stored for this match.</div>
  }

  return (
    <div className="match-stat-sections">
      <TeamStatSection title="Full match" rows={rows} />
      <TeamStatSection title="First half" rows={firstHalfRows} />
      <TeamStatSection title="Second half" rows={secondHalfRows} />
    </div>
  )
}

function percentText(value) {
  const number = Number(value)
  return Number.isFinite(number) ? `${Math.round(number)}%` : '-'
}

function numberText(value, digits = 0) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '-'
  return digits ? number.toFixed(digits) : String(number)
}

function formClass(result) {
  const value = String(result || '').toUpperCase()
  if (value === 'W') return 'prematch-form-dot prematch-form-dot--win'
  if (value === 'D') return 'prematch-form-dot prematch-form-dot--draw'
  if (value === 'L') return 'prematch-form-dot prematch-form-dot--loss'
  return 'prematch-form-dot'
}

function PreMatchMetric({ label, value }) {
  return (
    <div className="prematch-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function bestOddsScope(odds, liveOddsEnabled) {
  if (liveOddsEnabled && odds?.best?.live?.values) return { label: 'Live best odds', values: odds.best.live.values }
  if (odds?.best?.prematch?.values) return { label: 'Best odds', values: odds.best.prematch.values }
  return null
}

function OddsMovement({ value }) {
  const movement = value?.movement || 'same'
  const Icon = movement === 'up' ? TrendingUp : movement === 'down' ? TrendingDown : Minus
  const previous = value?.previousOdd == null ? '' : ` from ${formatOdd(value.previousOdd)}`

  return (
    <span className={`best-odds-move best-odds-move--${movement}`} title={`Odd ${movement}${previous}`}>
      <Icon size={13} />
    </span>
  )
}

function OddsValueDisplay({ value, className = '' }) {
  const movement = value?.movement || 'same'
  const previous = value?.previousOdd == null ? '' : `Previous ${formatOdd(value.previousOdd)}`
  const title = previous ? `${formatOdd(value?.odd)}. ${previous}` : formatOdd(value?.odd)

  return (
    <strong className={`odds-value odds-value--${movement}${className ? ` ${className}` : ''}`} title={title}>
      <span>{formatOdd(value?.odd)}</span>
      <OddsMovement value={value} />
    </strong>
  )
}

function BestOddsCard({ odds, teams, liveOddsEnabled }) {
  const scope = bestOddsScope(odds, liveOddsEnabled)
  if (!scope) return null

  const selections = [
    ['home', teams?.home?.name || 'Home'],
    ['draw', 'Draw'],
    ['away', teams?.away?.name || 'Away'],
  ]

  if (!selections.some(([key]) => scope.values?.[key])) return null

  return (
    <article className="best-odds-card">
      <div className="best-odds-card__header">
        <span>{scope.label}</span>
        <strong>Match winner</strong>
      </div>
      <div className="best-odds-grid">
        {selections.map(([key, label]) => {
          const value = scope.values?.[key]
          return (
            <div className="best-odds-cell" key={key}>
              <span>{label}</span>
              {value ? (
                <>
                  <OddsValueDisplay value={value} />
                  <small>{value.bookmaker?.name || 'Bookmaker'}</small>
                </>
              ) : (
                <>
                  <strong>-</strong>
                  <small>No quote</small>
                </>
              )}
            </div>
          )
        })}
      </div>
    </article>
  )
}

function PreMatchTeamPanel({ title, trend }) {
  const hasData = Number(trend?.played || 0) > 0

  return (
    <article className="prematch-panel">
      <div className="prematch-panel__header">
        <span>{title}</span>
        <strong>{trend?.team?.name || 'Team'}</strong>
      </div>

      {hasData ? (
        <>
          <div className="prematch-record">
            <strong>{trend.wins}</strong>
            <span>W</span>
            <strong>{trend.draws}</strong>
            <span>D</span>
            <strong>{trend.losses}</strong>
            <span>L</span>
          </div>
          <div className="prematch-form" aria-label={`${trend?.team?.name || title} recent form`}>
            {(trend.form || []).slice(0, 5).map((result, index) => (
              <span className={formClass(result)} key={`${result}-${index}`}>{result}</span>
            ))}
          </div>
          <div className="prematch-metrics">
            <PreMatchMetric label="Win rate" value={percentText(trend.rates?.win)} />
            <PreMatchMetric label="Goals scored" value={numberText(trend.goalsFor)} />
            <PreMatchMetric label="Goals conceded" value={numberText(trend.goalsAgainst)} />
            <PreMatchMetric label="Avg scored" value={numberText(trend.averages?.goalsFor, 2)} />
            <PreMatchMetric label="BTTS" value={percentText(trend.rates?.bothTeamsScored)} />
            <PreMatchMetric label="Over 2.5" value={percentText(trend.rates?.over25Goals)} />
            <PreMatchMetric label="Clean sheets" value={percentText(trend.rates?.cleanSheet)} />
            <PreMatchMetric label="Scored first" value={percentText(trend.rates?.scoredFirst)} />
          </div>
        </>
      ) : (
        <div className="match-empty">No previous matches stored for this team.</div>
      )}
    </article>
  )
}

function formatShortDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: '2-digit' }).format(date)
}

function H2hScoreRow({ match }) {
  const toLocale = useLocalizedPath()

  return (
    <Link className="h2h-score-row" to={toLocale(`/matches/${match.id}`)}>
      <small>{formatShortDate(match.kickoffAt)}</small>
      <span>{match.home?.name || 'Home'}</span>
      <strong>{match.home?.goals ?? '-'} - {match.away?.goals ?? '-'}</strong>
      <span>{match.away?.name || 'Away'}</span>
    </Link>
  )
}

function PreMatchH2hPanel({ stats, teams }) {
  const hasData = Number(stats?.played || 0) > 0

  return (
    <article className="prematch-panel prematch-panel--h2h">
      <div className="prematch-panel__header">
        <span>Head to head</span>
        <strong>{teams?.home?.name || 'Home'} vs {teams?.away?.name || 'Away'}</strong>
      </div>

      {hasData ? (
        <>
          <div className="prematch-record prematch-record--h2h">
            <strong>{stats.teamAWins}</strong>
            <span>{teams?.home?.shortName || 'A'} wins</span>
            <strong>{stats.draws}</strong>
            <span>Draws</span>
            <strong>{stats.teamBWins}</strong>
            <span>{teams?.away?.shortName || 'B'} wins</span>
          </div>
          <div className="prematch-metrics">
            <PreMatchMetric label="Home win rate" value={percentText(stats.rates?.teamAWin)} />
            <PreMatchMetric label="Draw rate" value={percentText(stats.rates?.draw)} />
            <PreMatchMetric label="Away win rate" value={percentText(stats.rates?.teamBWin)} />
            <PreMatchMetric label="BTTS" value={percentText(stats.rates?.bothTeamsScored)} />
            <PreMatchMetric label="Over 2.5" value={percentText(stats.rates?.over25Goals)} />
            <PreMatchMetric label="Goals" value={`${stats.teamAGoals ?? 0} - ${stats.teamBGoals ?? 0}`} />
            <PreMatchMetric label="Home scored first" value={numberText(stats.teamAScoredFirst)} />
            <PreMatchMetric label="Away scored first" value={numberText(stats.teamBScoredFirst)} />
          </div>
          <div className="h2h-score-list">
            {(stats.recentMatches || []).slice(0, 5).map((match) => (
              <H2hScoreRow match={match} key={match.id} />
            ))}
          </div>
        </>
      ) : (
        <div className="match-empty">No previous head-to-head matches stored.</div>
      )}
    </article>
  )
}

function PreMatchStatsSection({ stats, teams, odds, liveOddsEnabled, showOdds }) {
  if (!stats) return <div className="match-empty">No pre-match statistics available.</div>

  return (
    <>
      {showOdds ? <BestOddsCard odds={odds} teams={teams} liveOddsEnabled={liveOddsEnabled} /> : null}
      <div className="prematch-stats-layout">
        <PreMatchTeamPanel title="Home form" trend={stats.home} />
        <PreMatchTeamPanel title="Away form" trend={stats.away} />
        <PreMatchH2hPanel stats={stats.headToHead} teams={teams} />
      </div>
    </>
  )
}

function useGamblingContentPreference() {
  const [value, setValue] = useState(() => {
    try {
      const stored = window.localStorage.getItem('gamblingContentEnabled')
      return stored == null ? true : stored === 'true'
    } catch {
      return true
    }
  })

  useEffect(() => {
    function handlePreferenceChange(event) {
      setValue(Boolean(event.detail?.enabled))
    }

    function handleStorage(event) {
      if (event.key === 'gamblingContentEnabled') {
        setValue(event.newValue == null ? true : event.newValue === 'true')
      }
    }

    window.addEventListener('gambling-content-change', handlePreferenceChange)
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener('gambling-content-change', handlePreferenceChange)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  return value
}

function isMatchWinnerBetName(name) {
  const value = String(name || '').trim().toLowerCase()
  return value === 'match winner' || value === 'winner' || value === '1x2' || value.includes('match winner')
}

function classifyWinnerOddValue(valueName, teams) {
  const value = String(valueName || '').trim().toLowerCase()
  const home = String(teams?.home?.name || '').trim().toLowerCase()
  const away = String(teams?.away?.name || '').trim().toLowerCase()

  if (['home', '1'].includes(value) || (home && value === home)) return 'home'
  if (['draw', 'x'].includes(value)) return 'draw'
  if (['away', '2'].includes(value) || (away && value === away)) return 'away'
  return ''
}

function getBookmakerWinnerOdds(bookmaker, teams) {
  const bet = bookmaker?.bets?.find((item) => isMatchWinnerBetName(item?.name))
  if (!bet) return null

  const values = { home: null, draw: null, away: null }
  bet.values?.forEach((value) => {
    const slot = classifyWinnerOddValue(value?.name, teams)
    if (slot && values[slot] == null) values[slot] = value
  })

  return values.home || values.draw || values.away ? values : null
}

function getWinnerOddsCompanies(odds, teams, liveOddsEnabled) {
  const scopes = [
    liveOddsEnabled ? ['live', 'Live odds'] : null,
    ['prematch', 'Match odds'],
  ].filter(Boolean)

  for (const [scope, label] of scopes) {
    const companies = (odds?.groups?.[scope] || [])
      .map((bookmaker) => ({
        id: bookmaker.id,
        name: bookmaker.name,
        values: getBookmakerWinnerOdds(bookmaker, teams),
      }))
      .filter((bookmaker) => bookmaker.values)

    if (companies.length) return { scope, label, companies }
  }

  return null
}

function OddsCompanySlider({ companies, scope, label, teams }) {
  const sliderRef = useRef(null)

  useEffect(() => {
    const slider = sliderRef.current
    if (!slider || companies.length < 2) return undefined

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) return undefined

    const timer = window.setInterval(() => {
      const firstCard = slider.querySelector('.match-odds-company')
      const gap = Number.parseFloat(window.getComputedStyle(slider).columnGap) || 0
      const step = firstCard ? firstCard.getBoundingClientRect().width + gap : slider.clientWidth
      const isAtEnd = slider.scrollLeft + slider.clientWidth + step >= slider.scrollWidth

      slider.scrollTo({
        left: isAtEnd ? 0 : slider.scrollLeft + step,
        behavior: 'smooth',
      })
    }, 5000)

    return () => window.clearInterval(timer)
  }, [companies.length])

  return (
    <div className="match-odds-strip__slider" ref={sliderRef} role="list" aria-label={`${label} by company`}>
      {companies.map((bookmaker) => (
        <article className="match-odds-company" key={`${scope}-${bookmaker.id || bookmaker.name}`} role="listitem">
          <h3>{bookmaker.name}</h3>
          <div className="match-odds-strip__values">
            <span><small>{teams?.home?.name || 'Home'}</small><OddsValueDisplay value={bookmaker.values?.home} /></span>
            <span><small>Draw</small><OddsValueDisplay value={bookmaker.values?.draw} /></span>
            <span><small>{teams?.away?.name || 'Away'}</small><OddsValueDisplay value={bookmaker.values?.away} /></span>
          </div>
        </article>
      ))}
    </div>
  )
}

function MatchOddsStrip({ odds, teams, liveOddsEnabled }) {
  const winnerOdds = getWinnerOddsCompanies(odds, teams, liveOddsEnabled)

  if (!winnerOdds) return null

  return (
    <div className="match-odds-strip" aria-label="Match odds">
      <OddsCompanySlider companies={winnerOdds.companies} label={winnerOdds.label} scope={winnerOdds.scope} teams={teams} />
    </div>
  )
}

function OddsSection({ odds, liveOddsEnabled }) {
  const scopes = [
    liveOddsEnabled ? ['live', 'Live Odds'] : null,
    ['prematch', 'Pre-match Odds'],
  ].filter(Boolean)

  const hasOdds = scopes.some(([scope]) => odds?.groups?.[scope]?.length)
  if (!hasOdds) return <div className="match-empty">No odds stored for this match.</div>

  return (
    <div className="match-odds-detail">
      {scopes.map(([scope, title]) => {
        const bookmakers = odds?.groups?.[scope] || []
        if (!bookmakers.length) return null

        return (
            <div className="match-odds-scope" key={scope}>
              <h3>{title}</h3>
              {bookmakers.map((bookmaker, index) => (
                <AccordionSection
                  bodyClassName="match-odds-bookmaker-body"
                  className="match-odds-bookmaker"
                  count={`${bookmaker.bets.length} bets`}
                  defaultOpen={index === 0}
                  key={`${scope}-${bookmaker.id || bookmaker.name}`}
                  lazy
                  title={bookmaker.name}
                >
                  <div className="match-odds-bets">
                    {bookmaker.bets.map((bet) => (
                      <div className="match-odds-bet" key={`${scope}-${bookmaker.id || bookmaker.name}-${bet.id || bet.name}`}>
                        <span>{bet.name}</span>
                        <div>
                          {bet.values.map((value) => (
                            <em key={`${value.name}-${value.odd}`}>
                              <small>{value.name}</small>
                              <OddsValueDisplay value={value} />
                            </em>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </AccordionSection>
              ))}
            </div>
          )
      })}
    </div>
  )
}

function centeredColumns(count) {
  const layouts = {
    1: [3],
    2: [2, 4],
    3: [2, 3, 4],
    4: [1, 2, 4, 5],
    5: [1, 2, 3, 4, 5],
  }

  return layouts[Math.min(count, 5)] || layouts[5]
}

function toGridNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.round(number) : null
}

function pitchX(column, maxColumn) {
  return 100 - (column / (maxColumn + 1)) * 100
}

function buildLineupPlacements(players, formation) {
  const rowsFromGrid = players.some((player) => player.gridRow)

  if (rowsFromGrid) {
    const groups = players.reduce((map, player, index) => {
      const row = Number(player.gridRow || 1)
      const current = map.get(row) || []
      current.push({ player, index })
      map.set(row, current)
      return map
    }, new Map())

    return Object.fromEntries(
      Array.from(groups.entries()).flatMap(([row, rowPlayers]) => {
        const orderedPlayers = rowPlayers.sort((a, b) => Number(a.player.gridColumn || a.index) - Number(b.player.gridColumn || b.index))
        const maxColumn = Math.max(
          orderedPlayers.length,
          ...orderedPlayers.map(({ player }) => toGridNumber(player.gridColumn) || 0)
        )

        return orderedPlayers.map(({ player }, index) => {
          const column = toGridNumber(player.gridColumn) || index + 1
          return [
            player.id,
            {
              gridRow: row,
              gridColumn: column,
              x: pitchX(column, maxColumn),
            },
          ]
        })
      })
    )
  }

  const lineCounts = [
    1,
    ...String(formation || '')
      .split('-')
      .map((value) => Number(value))
      .filter(Boolean),
  ]

  const placements = {}
  let playerIndex = 0

  lineCounts.forEach((count, rowIndex) => {
    const rowPlayers = players.slice(playerIndex, playerIndex + count)
    const columns = centeredColumns(rowPlayers.length)

    rowPlayers.forEach((player, index) => {
      const column = columns[index] || columns[columns.length - 1]
      placements[player.id] = {
        gridRow: rowIndex + 1,
        gridColumn: column,
        x: pitchX(column, 5),
      }
    })

    playerIndex += count
  })

  players.slice(playerIndex).forEach((player, index) => {
    placements[player.id] = {
      gridRow: lineCounts.length + Math.floor(index / 5) + 1,
      gridColumn: (index % 5) + 1,
      x: pitchX((index % 5) + 1, 5),
    }
  })

  return placements
}

function toPositiveNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

function statByPlayer(statistics = []) {
  return new Map(
    statistics
      .filter((row) => row?.playerId)
      .map((row) => [String(row.playerId), row])
  )
}

function LineupPlayerBadges({ stat }) {
  if (!stat) return null

  const rating = Number(stat.rating)
  const goals = toPositiveNumber(stat.goals?.total)
  const assists = toPositiveNumber(stat.goals?.assists)
  const yellowCards = toPositiveNumber(stat.cards?.yellow)
  const redCards = toPositiveNumber(stat.cards?.red) + toPositiveNumber(stat.cards?.yellowRed)
  const hasRating = Number.isFinite(rating) && rating > 0

  if (!hasRating && !goals && !assists && !yellowCards && !redCards) return null

  return (
    <span className="lineup-player__badges">
      {hasRating ? (
        <span className="lineup-player__badge lineup-player__badge--rating" title="Rating">
          <Star size={11} />
          {rating.toFixed(1)}
        </span>
      ) : null}
      {goals ? (
        <span className="lineup-player__badge lineup-player__badge--goal" title="Goals">
          <CircleDot size={11} />
          {goals}
        </span>
      ) : null}
      {assists ? (
        <span className="lineup-player__badge lineup-player__badge--assist" title="Assists">
          <Footprints size={11} />
          {assists}
        </span>
      ) : null}
      {yellowCards ? (
        <span className="lineup-player__badge lineup-player__badge--yellow-card" title="Yellow cards">
          {yellowCards}
        </span>
      ) : null}
      {redCards ? (
        <span className="lineup-player__badge lineup-player__badge--red-card" title="Red cards">
          {redCards}
        </span>
      ) : null}
    </span>
  )
}

function PitchLineup({ title, lineup, statistics = [] }) {
  const toLocale = useLocalizedPath()
  const starting = lineup?.startingXI || []
  const substitutes = lineup?.substitutes || []
  const placements = buildLineupPlacements(starting, lineup?.formation)
  const statsByPlayer = statByPlayer(statistics)
  const maxRow = Math.max(1, ...Object.values(placements).map((placement) => Number(placement.gridRow) || 1))

  return (
    <div className="lineup-panel">
      <div className="lineup-panel__top">
        <div>
          <h3>{title}</h3>
          <span>{lineup?.formation || 'Formation unavailable'}</span>
        </div>
        {lineup?.coach ? (
          <span className="lineup-coach">
            <UserRound size={15} />
            {lineup.coach.name}
          </span>
        ) : null}
      </div>

      <div className="lineup-grid">
        {starting.length ? (
          starting.map((player) => (
            <Link
              className="lineup-player"
              to={player.playerId ? toLocale(`/players/${player.playerId}`) : '#'}
              key={player.id}
              style={{
                '--lineup-x': `${placements[player.id]?.x ?? 50}%`,
                '--lineup-y': `${((Number(placements[player.id]?.gridRow) || 1) / (maxRow + 1)) * 100}%`,
              }}
            >
              {player.photo ? (
                <img className="lineup-player__photo" src={resolveAssetUrl(player.photo)} alt="" loading="lazy" decoding="async" />
              ) : (
                <span className="lineup-player__photo lineup-player__photo--empty">
                  {player.name?.charAt(0) || '?'}
                </span>
              )}
              <span className="lineup-player__number">{player.shirtNumber ?? '-'}</span>
              <LineupPlayerBadges stat={statsByPlayer.get(String(player.playerId))} />
              <strong>{player.name || 'Unknown'}</strong>
            </Link>
          ))
        ) : (
          <div className="match-empty">No starting XI stored.</div>
        )}
      </div>

      <div className="sub-list">
        <strong>Substitutes</strong>
        <div>
          {substitutes.length ? (
            substitutes.map((player) => (
              <span key={player.id}>
                {player.shirtNumber ?? '-'} {player.name || 'Unknown'}
              </span>
            ))
          ) : (
            <span>No substitutes stored.</span>
          )}
        </div>
      </div>
    </div>
  )
}

function metric(label, value) {
  return isEmptyStatValue(value) ? null : { label, value }
}

function groupedPlayerMetrics(row) {
  const groups = [
    {
      title: 'Performance',
      items: [
        metric('Rating', row.rating),
        metric('Minutes', row.minutes),
        metric('Captain', row.captain),
        metric('Substitute', row.substitute),
        metric('Offsides', row.offsides),
      ],
    },
    {
      title: 'Shots',
      items: [
        metric('Total', row.shots?.total),
        metric('On target', row.shots?.on),
      ],
    },
    {
      title: 'Goals',
      items: [
        metric('Goals', row.goals?.total),
        metric('Conceded', row.goals?.conceded),
        metric('Assists', row.goals?.assists),
        metric('Saves', row.goals?.saves),
      ],
    },
    {
      title: 'Passes',
      items: [
        metric('Total', row.passes?.total),
        metric('Key', row.passes?.key),
        metric('Accuracy', row.passes?.accuracy),
      ],
    },
    {
      title: 'Tackles',
      items: [
        metric('Total', row.tackles?.total),
        metric('Blocks', row.tackles?.blocks),
        metric('Interceptions', row.tackles?.interceptions),
      ],
    },
    {
      title: 'Duels',
      items: [
        metric('Total', row.duels?.total),
        metric('Won', row.duels?.won),
      ],
    },
    {
      title: 'Dribbles',
      items: [
        metric('Attempts', row.dribbles?.attempts),
        metric('Success', row.dribbles?.success),
        metric('Past', row.dribbles?.past),
      ],
    },
    {
      title: 'Fouls',
      items: [
        metric('Drawn', row.fouls?.drawn),
        metric('Committed', row.fouls?.committed),
      ],
    },
    {
      title: 'Cards',
      items: [
        metric('Yellow', row.cards?.yellow),
        metric('Yellow red', row.cards?.yellowRed),
        metric('Red', row.cards?.red),
      ],
    },
    {
      title: 'Penalties',
      items: [
        metric('Won', row.penalties?.won),
        metric('Committed', row.penalties?.committed),
        metric('Scored', row.penalties?.scored),
        metric('Missed', row.penalties?.missed),
        metric('Saved', row.penalties?.saved),
      ],
    },
  ]
    .map((group) => ({
      ...group,
      items: group.items.filter(Boolean),
    }))
    .filter((group) => group.items.length > 0)

  const extraItems = Object.entries(row.extra || {})
    .filter(([, value]) => !isEmptyStatValue(value))
    .map(([key, value]) => metric(labelFromKey(key), value))
    .filter(Boolean)

  if (extraItems.length) {
    groups.push({ title: 'Extra', items: extraItems })
  }

  return groups
}

function PlayerMetricGroup({ group }) {
  return (
    <div className="player-stat-group">
      <span>{group.title}</span>
      <div>
        {group.items.map((item) => (
          <small key={`${group.title}-${item.label}`}>
            {item.label}
            <strong>{formatStatValue(item.value)}</strong>
          </small>
        ))}
      </div>
    </div>
  )
}

function playerStatHighlights(row) {
  const items = [
    metric('Min', row.minutes),
    metric('G', row.goals?.total),
    metric('A', row.goals?.assists),
    metric('Shots', row.shots?.total),
    metric('On target', row.shots?.on),
    metric('Key passes', row.passes?.key),
    metric('Pass', row.passes?.accuracy ? `${row.passes.accuracy}%` : null),
    metric('Duels won', row.duels?.won),
    metric('Saves', row.goals?.saves),
    metric('YC', row.cards?.yellow),
    metric('RC', row.cards?.red),
  ].filter((item) => {
    if (!item) return false
    const value = Number(item.value)
    return !Number.isFinite(value) || value > 0 || item.label === 'Min' || item.label === 'Pass'
  })

  return items.slice(0, 7)
}

function PlayerStatChips({ row }) {
  if (isUnusedSubstitute(row)) {
    return <span className="player-stat-row__empty player-stat-row__empty--sub">Sub</span>
  }

  const highlights = playerStatHighlights(row)

  if (!highlights.length) {
    return <span className="player-stat-row__empty">No key stats</span>
  }

  return (
    <div className="player-stat-chips">
      {highlights.map((item) => (
        <span className="player-stat-chip" key={`${row.id}-${item.label}`}>
          <small>{item.label}</small>
          <strong>{formatStatValue(item.value)}</strong>
        </span>
      ))}
    </div>
  )
}

const EMPTY_PLAYER_STAT_ROWS = []

function isUnusedSubstitute(row) {
  const minutes = Number(row?.minutes)
  return Boolean(row?.substitute) && (!Number.isFinite(minutes) || minutes <= 0)
}

function PlayerStatSelectedGroup({ row, activeMetricGroup }) {
  if (isUnusedSubstitute(row)) {
    return <span className="player-stat-row__empty player-stat-row__empty--sub">Sub</span>
  }

  const group = groupedPlayerMetrics(row).find((item) => item.title === activeMetricGroup)

  if (!group) {
    return <span className="player-stat-row__empty">No {activeMetricGroup.toLowerCase()} stats</span>
  }

  return (
    <div className="player-stat-row__selected-group">
      <PlayerMetricGroup group={group} />
    </div>
  )
}

function PlayerStatsTable({ activeMetricGroup = 'summary', title, rows }) {
  const toLocale = useLocalizedPath()
  const sortedRows = [...(rows || [])].sort((a, b) => {
    const unusedSubA = isUnusedSubstitute(a) ? 1 : 0
    const unusedSubB = isUnusedSubstitute(b) ? 1 : 0
    const ratingA = Number(a.rating)
    const ratingB = Number(b.rating)
    const safeA = Number.isFinite(ratingA) ? ratingA : -1
    const safeB = Number.isFinite(ratingB) ? ratingB : -1
    return unusedSubA - unusedSubB || safeB - safeA || Number(a.shirtNumber || 999) - Number(b.shirtNumber || 999)
  })

  if (!sortedRows.length) {
    return (
      <div className="player-stats-panel">
        <h3>{title}</h3>
        <div className="match-empty">No player statistics stored.</div>
      </div>
    )
  }

  return (
    <div className="player-stats-panel">
      <h3>{title}</h3>
      <div className="player-stats-list">
        {sortedRows.map((row) => {
          const photo = resolveAssetUrl(row.photo || row.photoPath || row.photo_path || row.playerPhoto || row.player_photo)
          const metricGroups = groupedPlayerMetrics(row)

          const unusedSubstitute = isUnusedSubstitute(row)

          return (
            <article className={`player-stat-row player-stat-row--expanded${unusedSubstitute ? ' player-stat-row--sub' : ''}`} key={row.id}>
              <div className="player-stat-row__top">
                <Link className="player-stat-row__summary" to={row.playerId ? toLocale(`/players/${row.playerId}`) : '#'}>
                  <span className="player-stat-row__player">
                    {photo ? (
                      <img src={photo} alt="" loading="lazy" decoding="async" />
                    ) : (
                      <span className="player-stat-row__photo-empty">{String(row.name || '?').charAt(0)}</span>
                    )}
                    <span>{row.shirtNumber ?? '-'}</span>
                  </span>
                  <span className="player-stat-row__identity">
                    <strong>{row.name || 'Unknown player'}</strong>
                    <small>{unusedSubstitute ? 'Did not play' : row.position || '-'}</small>
                  </span>
                  <em>
                    {unusedSubstitute ? (
                      'Sub'
                    ) : (
                      <>
                        <Star size={13} />
                        {row.rating ?? '-'}
                      </>
                    )}
                  </em>
                </Link>
                <FavoriteButton id={row.playerId} type="player" />
              </div>
              {!unusedSubstitute ? (
                <>
                  {activeMetricGroup === 'summary' ? (
                    <PlayerStatChips row={row} />
                  ) : (
                    <PlayerStatSelectedGroup activeMetricGroup={activeMetricGroup} row={row} />
                  )}
                  {activeMetricGroup === 'summary' && metricGroups.length ? (
                    <details className="player-stat-details">
                      <summary>All stats</summary>
                      <div className="player-stat-groups">
                        {metricGroups.map((group) => <PlayerMetricGroup group={group} key={group.title} />)}
                      </div>
                    </details>
                  ) : null}
                </>
              ) : null}
            </article>
          )
        })}
      </div>
    </div>
  )
}

function getAvailablePlayerMetricGroups(rows = []) {
  const titles = new Set()

  rows.forEach((row) => {
    groupedPlayerMetrics(row).forEach((group) => {
      titles.add(group.title)
    })
  })

  return ['summary', ...titles]
}

function PlayerStatsViewer({ teams, playerStatistics }) {
  const [activeTeam, setActiveTeam] = useState('home')
  const [activeMetricGroup, setActiveMetricGroup] = useState('summary')
  const homeRows = playerStatistics?.home || EMPTY_PLAYER_STAT_ROWS
  const awayRows = playerStatistics?.away || EMPTY_PLAYER_STAT_ROWS
  const rows = activeTeam === 'away' ? awayRows : homeRows
  const team = activeTeam === 'away' ? teams?.away : teams?.home
  const teamItems = [
    { value: 'home', label: teams?.home?.name || 'Home', count: homeRows.length },
    { value: 'away', label: teams?.away?.name || 'Away', count: awayRows.length },
  ]
  const metricGroupItems = useMemo(
    () => getAvailablePlayerMetricGroups(rows).map((value) => ({
      value,
      label: value === 'summary' ? 'Key Stats' : value,
    })),
    [rows],
  )

  useEffect(() => {
    if (activeMetricGroup !== 'summary' && !metricGroupItems.some((item) => item.value === activeMetricGroup)) {
      setActiveMetricGroup('summary')
    }
  }, [activeMetricGroup, metricGroupItems])

  return (
    <div className="player-stats-viewer">
      <div className="player-stats-switches">
        <ChoiceBox
          ariaLabel="Player statistics team"
          className="choice-box--compact player-stats-team-switch"
          items={teamItems}
          onChange={setActiveTeam}
          value={activeTeam}
        />
        <ChoiceBox
          ariaLabel="Player statistics card"
          className="choice-box--compact player-stats-card-switch"
          items={metricGroupItems}
          onChange={setActiveMetricGroup}
          value={activeMetricGroup}
        />
      </div>
      <PlayerStatsTable activeMetricGroup={activeMetricGroup} title={team?.name || (activeTeam === 'away' ? 'Away' : 'Home')} rows={rows} />
    </div>
  )
}

function Match() {
  const { id } = useParams()
  const [details, setDetails] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const { connectionStatus, lastUpdatedAt } = useMatchLiveUpdates(status === 'ready' ? id : null, setDetails)
  const [clockNow, setClockNow] = useState(Date.now())
  const [isSyncingDetails, setIsSyncingDetails] = useState(false)
  const gamblingContentEnabled = useGamblingContentPreference()
  const { user } = useAuth()
  const matchStatus = details?.match?.status
  const matchStatusShort = matchStatus?.short
  const liveOddsEnabled = isRunningStatus(matchStatus)
  const [activeView, setActiveView] = useState('priority')

  useEffect(() => {
    let active = true
    setStatus('loading')
    getMatchDetails(id)
      .then((response) => {
        if (!active) return
        setDetails(response.data)
        setStatus('ready')
      })
      .catch((requestError) => {
        if (!active) return
        setError(requestError?.response?.data?.error || 'Could not load match details.')
        setStatus('error')
      })
    return () => {
      active = false
    }
  }, [id])

  useEffect(() => {
    setClockNow(Date.now())

    if (!isRunningStatus({ short: matchStatusShort })) {
      return undefined
    }

    const timer = window.setInterval(() => {
      setClockNow(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [matchStatusShort])

  const matchState = useMemo(() => {
    const short = details?.match?.status?.short
    if (!short) return ''
    if (['FT', 'AET', 'PEN'].includes(short)) return 'Full time'
    if (short === 'NS') return 'Not started'
    return short
  }, [details])

  async function handleSyncDetails() {
    setIsSyncingDetails(true)
    try {
      const response = await syncMatchDetails(id)
      setDetails(response.data.details)
      setStatus('ready')
    } catch (requestError) {
      setError(requestError?.response?.data?.error || 'Could not sync match details.')
      setStatus('error')
    } finally {
      setIsSyncingDetails(false)
    }
  }

  if (status === 'loading') {
    return <div className="state-message match-page">Loading match details...</div>
  }

  if (status === 'error') {
    return <div className="state-message state-message--error match-page">{error}</div>
  }

  const { match, competition, venue, teams, score, events, statistics, lineups, playerStatistics, odds, preMatchStats } = details
  const timelineEvents = buildTimelineEvents(events, match)
  const isPreMatch = String(match?.status?.short || '').toUpperCase() === 'NS'
  const oddsCount = odds?.groups ? Object.values(odds.groups).flat().length : 0
  const playerRatingCount = (playerStatistics?.home?.length || 0) + (playerStatistics?.away?.length || 0)
  const viewItems = [
    { value: 'priority', label: isPreMatch ? 'Preview' : 'Live Center', count: isPreMatch ? 'H2H' : timelineEvents.length },
    { value: 'lineups', label: 'Lineups', count: (lineups?.home?.startingXI?.length || 0) + (lineups?.away?.startingXI?.length || 0) },
    { value: 'ratings', label: 'Player Stats', count: playerRatingCount },
    gamblingContentEnabled ? { value: 'odds', label: 'Odds', count: oddsCount } : null,
  ].filter(Boolean)

  return (
    <div className="match-page">
      <header className="match-hero">
        <div className="match-hero__competition">
          <Trophy size={16} />
          <span>{competition?.name || 'Competition unavailable'}</span>
          {competition?.season?.year ? <small>{formatCompetitionSeason(competition.season, competition)}</small> : null}
          <FavoriteButton id={competition?.id} type="competition" />
        </div>

        <div className="match-scoreboard">
          <TeamBadge team={teams?.home} />
          <div className="match-score">
            <span>{matchState}</span>
            <strong>{scoreText(score)}</strong>
            <small>
              {formatLiveClockWithSeconds(match?.status, clockNow)}
            </small>
          </div>
          <TeamBadge team={teams?.away} align="right" />
        </div>

        <div className="match-meta-row">
          <InfoPill icon={CalendarDays} label={formatDate(match?.kickoffAt)} />
          <InfoPill icon={Clock} label={formatTime(match?.kickoffAt)} />
          <InfoPill icon={MapPin} label={venue?.name || venue?.city} />
          <InfoPill icon={Shield} label={match?.refereeName} />
          {connectionStatus === 'reconnecting' ? (
            <span className="match-info-pill match-info-pill--live">Live connection interrupted. Reconnecting...</span>
          ) : null}
          {connectionStatus === 'fallback' ? (
            <span className="match-info-pill match-info-pill--live">Live fallback active</span>
          ) : null}
          {lastUpdatedAt ? (
            <span className="match-info-pill">Updated {formatLastUpdated(lastUpdatedAt)}</span>
          ) : null}
          {user?.role === 'ADMIN' ? (
            <button className="match-sync-button" disabled={isSyncingDetails} onClick={handleSyncDetails} type="button">
              <RefreshCw size={15} />
              {isSyncingDetails ? 'Syncing...' : 'Sync API Stats'}
            </button>
          ) : null}
          <FavoriteButton id={match?.id} type="match" />
        </div>

        {gamblingContentEnabled ? (
          <MatchOddsStrip odds={odds} teams={teams} liveOddsEnabled={liveOddsEnabled} />
        ) : null}
      </header>

      <ChoiceBox
        ariaLabel="Match detail view"
        className="choice-box--match-view"
        items={viewItems}
        onChange={setActiveView}
        value={activeView}
      />

      {activeView === 'priority' ? (
        <div className="match-detail-layout match-detail-layout--focused">
          {isPreMatch ? (
            <AccordionSection
              className="match-section match-section--wide"
              title="Pre-match Stats"
              count={<><BarChart3 size={14} /> form & H2H</>}
              defaultOpen
            >
              <PreMatchStatsSection
                stats={preMatchStats}
                teams={teams}
                odds={odds}
                liveOddsEnabled={liveOddsEnabled}
                showOdds={gamblingContentEnabled}
              />
            </AccordionSection>
          ) : (
            <div className="match-detail-main match-detail-main--wide">
              <AccordionSection className="match-section" title="Timeline" count={`${timelineEvents.length} events`} defaultOpen>
                <Timeline events={timelineEvents} teams={teams} />
              </AccordionSection>

              <AccordionSection className="match-section" title="Team Statistics" defaultOpen>
                <TeamStats statistics={statistics} />
              </AccordionSection>
            </div>
          )}
        </div>
      ) : null}

      {activeView === 'lineups' ? (
        <AccordionSection className="match-section match-section--lineups match-section--standalone" title="Lineups" defaultOpen lazy>
          <div className="lineups-layout">
            <PitchLineup title={teams?.home?.name || 'Home'} lineup={lineups?.home} statistics={playerStatistics?.home} />
            <PitchLineup title={teams?.away?.name || 'Away'} lineup={lineups?.away} statistics={playerStatistics?.away} />
          </div>
        </AccordionSection>
      ) : null}

      {activeView === 'ratings' ? (
        <AccordionSection className="match-section match-section--standalone" title="Player Stats" defaultOpen lazy>
          <PlayerStatsViewer playerStatistics={playerStatistics} teams={teams} />
        </AccordionSection>
      ) : null}

      {activeView === 'odds' && gamblingContentEnabled ? (
        <AccordionSection className="match-section match-section--standalone" title="Odds" count={oddsCount} defaultOpen>
          <OddsSection odds={odds} liveOddsEnabled={liveOddsEnabled} />
        </AccordionSection>
      ) : null}
    </div>
  )
}

export default Match
