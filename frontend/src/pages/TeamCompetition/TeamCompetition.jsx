import { BarChart3, CalendarDays, Goal, Shield, Star, Trophy } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getTeamCompetitionDetails } from '../../api/teams'
import FavoriteButton from '../../components/common/FavoriteButton'
import AccordionSection from '../../components/ui/AccordionSection'
import ChoiceBox from '../../components/ui/ChoiceBox'
import { useLocalizedPath } from '../../hooks/useLocalizedPath'
import { resolveAssetUrl } from '../../utils/assets'

function formatSeason(season) {
  if (!season) return 'Season'
  if (season.startDate && season.endDate) {
    const startYear = new Date(season.startDate).getFullYear()
    const endYear = new Date(season.endDate).getFullYear()
    if (Number.isFinite(startYear) && Number.isFinite(endYear)) {
      return startYear === endYear ? String(startYear) : `${startYear}/${endYear}`
    }
  }
  if (season.year) {
    const year = Number(season.year)
    return Number.isFinite(year) ? `${year}/${year + 1}` : String(season.year)
  }
  return 'Season'
}

function formatDate(value) {
  if (!value) return 'TBD'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'TBD'
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatVenue(match, teamId) {
  if (!match) return ''
  return String(match.homeTeamId) === String(teamId) ? 'Home' : 'Away'
}

function statValue(value, fallback = '-') {
  return value == null || value === '' ? fallback : value
}

function numberValue(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function percentValue(value, total) {
  const safeValue = numberValue(value)
  const safeTotal = numberValue(total)
  if (!safeTotal) return '0%'
  return `${Math.round((safeValue / safeTotal) * 100)}%`
}

function resultForTeam(match, teamId) {
  if (match.homeGoals == null || match.awayGoals == null) return 'NS'
  const isHome = String(match.homeTeamId) === String(teamId)
  const goalsFor = isHome ? match.homeGoals : match.awayGoals
  const goalsAgainst = isHome ? match.awayGoals : match.homeGoals
  if (goalsFor > goalsAgainst) return 'W'
  if (goalsFor < goalsAgainst) return 'L'
  return 'D'
}

function getGoalsFor(match, teamId) {
  const isHome = String(match.homeTeamId) === String(teamId)
  return isHome ? match.homeGoals : match.awayGoals
}

function getGoalsAgainst(match, teamId) {
  const isHome = String(match.homeTeamId) === String(teamId)
  return isHome ? match.awayGoals : match.homeGoals
}

function getOpponent(match, teamId) {
  const isHome = String(match.homeTeamId) === String(teamId)
  return isHome ? match.awayTeam : match.homeTeam
}

function TeamLogo({ team }) {
  const logo = resolveAssetUrl(team?.logo)
  return logo ? <img className="detail-hero__image" src={logo} alt="" loading="eager" decoding="async" /> : <span className="detail-hero__image detail-hero__image--empty">{team?.name?.charAt(0) || '?'}</span>
}

function CompetitionBadge({ competition }) {
  const toLocale = useLocalizedPath()
  const logo = resolveAssetUrl(competition?.logo)
  return (
    <Link className="team-comp-competition" to={toLocale(`/competitions/${competition?.id}${competition?.season?.id ? `?seasonId=${competition.season.id}` : ''}`)}>
      {logo ? <img src={logo} alt="" loading="lazy" decoding="async" /> : <Trophy size={18} />}
      <span>{competition?.name || 'Competition'}</span>
    </Link>
  )
}

function TeamCompetitionMatchRow({ match, teamId }) {
  const toLocale = useLocalizedPath()
  const homeLogo = resolveAssetUrl(match.homeTeam?.logo)
  const awayLogo = resolveAssetUrl(match.awayTeam?.logo)
  const score = match.homeGoals == null && match.awayGoals == null ? 'vs' : `${match.homeGoals ?? '-'} - ${match.awayGoals ?? '-'}`
  const result = resultForTeam(match, teamId)
  const opponent = getOpponent(match, teamId)
  const teamGoals = match.homeGoals == null && match.awayGoals == null ? null : getGoalsFor(match, teamId)
  const opponentGoals = match.homeGoals == null && match.awayGoals == null ? null : getGoalsAgainst(match, teamId)

  return (
    <Link className="team-comp-match-card" to={toLocale(`/matches/${match.id}`)}>
      <div className="team-comp-match-card__top">
        <span className={`team-comp-match__result team-comp-match__result--${result.toLowerCase()}`}>{result}</span>
        <div>
          <strong>{match.round || match.status || 'Match'}</strong>
          <small>{formatDate(match.kickoffAt)} - {formatVenue(match, teamId)} vs {opponent?.name || 'Opponent'}</small>
        </div>
      </div>
      <div className="team-comp-match-card__scoreboard">
        <span className="team-comp-match__team">
          {homeLogo ? <img src={homeLogo} alt="" loading="lazy" decoding="async" /> : <i>{match.homeTeam?.name?.charAt(0) || 'H'}</i>}
          <strong>{match.homeTeam?.name || 'Home'}</strong>
        </span>
        <span className="team-comp-match__score">
          <strong>{score}</strong>
          <small>{teamGoals == null ? 'Scheduled' : `${teamGoals}-${opponentGoals} team view`}</small>
        </span>
        <span className="team-comp-match__team team-comp-match__team--right">
          {awayLogo ? <img src={awayLogo} alt="" loading="lazy" decoding="async" /> : <i>{match.awayTeam?.name?.charAt(0) || 'A'}</i>}
          <strong>{match.awayTeam?.name || 'Away'}</strong>
        </span>
      </div>
    </Link>
  )
}

function PlayerStatRow({ player }) {
  const toLocale = useLocalizedPath()
  const photo = resolveAssetUrl(player.photo)
  return (
    <Link className="team-comp-player-row" to={toLocale(`/players/${player.id}`)}>
      <span className="team-comp-player-row__identity">
        {photo ? <img src={photo} alt="" loading="lazy" decoding="async" /> : <i>{player.name?.charAt(0) || '?'}</i>}
        <strong>{player.name}</strong>
        <small>{player.position || player.nationality || 'Player'}</small>
      </span>
      <span>{statValue(player.appearances, 0)}</span>
      <span>{statValue(player.goals, 0)}</span>
      <span>{statValue(player.assists, 0)}</span>
      <span>{statValue(player.yellowCards, 0)}</span>
      <span>{statValue(player.redCards, 0)}</span>
      <span>{statValue(player.rating)}</span>
    </Link>
  )
}

function FormPills({ matches, teamId }) {
  const toLocale = useLocalizedPath()
  const recent = [...(matches || [])]
    .filter((match) => match.homeGoals != null && match.awayGoals != null)
    .slice(-5)

  if (!recent.length) return <span className="team-comp-form-empty">No recent results</span>

  return (
    <div className="team-comp-form-pills">
      {recent.map((match) => {
        const result = resultForTeam(match, teamId)
        return (
          <Link className={`team-comp-form-pill team-comp-form-pill--${result.toLowerCase()}`} to={toLocale(`/matches/${match.id}`)} key={match.id}>
            {result}
          </Link>
        )
      })}
    </div>
  )
}

function FocusMatch({ title, match, teamId }) {
  const toLocale = useLocalizedPath()
  if (!match) {
    return (
      <section className="team-comp-focus-card">
        <span>{title}</span>
        <strong>-</strong>
        <small>No match stored</small>
      </section>
    )
  }

  const opponent = getOpponent(match, teamId)
  const opponentLogo = resolveAssetUrl(opponent?.logo)
  const result = resultForTeam(match, teamId)
  const score = match.homeGoals == null && match.awayGoals == null
    ? 'vs'
    : `${getGoalsFor(match, teamId)}-${getGoalsAgainst(match, teamId)}`

  return (
    <Link className="team-comp-focus-card team-comp-focus-card--match" to={toLocale(`/matches/${match.id}`)}>
      <span>{title}</span>
      <div>
        {opponentLogo ? <img src={opponentLogo} alt="" loading="lazy" decoding="async" /> : <i>{opponent?.name?.charAt(0) || '?'}</i>}
        <strong>{score}</strong>
      </div>
      <small>{opponent?.name || 'Opponent'} - {match.round || formatDate(match.kickoffAt)}</small>
      <em className={`team-comp-focus-card__result team-comp-focus-card__result--${result.toLowerCase()}`}>{result}</em>
    </Link>
  )
}

function TopPerformer({ title, player, metric, icon }) {
  if (!player) {
    return (
      <section className="team-comp-performer">
        {icon}
        <span>{title}</span>
        <strong>-</strong>
        <small>No player stats</small>
      </section>
    )
  }

  const photo = resolveAssetUrl(player.photo)
  return (
    <section className="team-comp-performer">
      {photo ? <img src={photo} alt="" loading="lazy" decoding="async" /> : icon}
      <span>{title}</span>
      <strong>{player.name}</strong>
      <small>{metric}</small>
    </section>
  )
}

function TeamCompetition() {
  const { teamId, competitionSeasonId } = useParams()
  const toLocale = useLocalizedPath()
  const [details, setDetails] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [activeView, setActiveView] = useState('overview')

  useEffect(() => {
    let active = true
    setStatus('loading')
    getTeamCompetitionDetails(teamId, competitionSeasonId)
      .then((response) => {
        if (!active) return
        setDetails(response.data)
        setStatus('ready')
      })
      .catch((requestError) => {
        if (!active) return
        setError(requestError?.response?.data?.error || 'Could not load team competition details.')
        setStatus('error')
      })
    return () => {
      active = false
    }
  }, [teamId, competitionSeasonId])

  const summary = useMemo(() => {
    const stats = details?.seasonStatistics || {}
    const standing = details?.standing || {}
    const played = statValue(stats.fixtures_played_total, details?.matches?.played?.length || 0)
    const goalsFor = statValue(stats.goals_for_total, 0)
    const goalsAgainst = statValue(stats.goals_against_total, 0)
    const cleanSheets = statValue(stats.clean_sheets_total, 0)
    return [
      { label: 'Table position', value: standing.rank ? `#${standing.rank}` : '-', detail: standing.points != null ? `${standing.points} points in this competition` : 'No standing stored' },
      { label: 'Match record', value: `${statValue(stats.wins_total, 0)}W ${statValue(stats.draws_total, 0)}D ${statValue(stats.losses_total, 0)}L`, detail: `${played} matches played` },
      { label: 'Goals scored / conceded', value: `${goalsFor} / ${goalsAgainst}`, detail: `${cleanSheets} clean sheet${String(cleanSheets) === '1' ? '' : 's'}` },
      { label: 'Recent form', value: stats.form || standing.form || '-', detail: details?.stage || details?.groupName || 'Last stored results' },
    ]
  }, [details])

  if (status === 'loading') return <div className="state-message detail-page">Loading team competition...</div>
  if (status === 'error') return <div className="state-message state-message--error detail-page">{error}</div>

  const { team, competition, matches = {}, playerStatistics = [], formations = [] } = details
  const latestMatch = matches.played?.[matches.played.length - 1] || null
  const nextMatch = matches.upcoming?.[0] || null
  const playedCount = matches.played?.length || 0
  const totalCount = matches.all?.length || 0
  const topScorer = [...playerStatistics].sort((a, b) => numberValue(b.goals) - numberValue(a.goals))[0]
  const topAssister = [...playerStatistics].sort((a, b) => numberValue(b.assists) - numberValue(a.assists))[0]
  const topRated = [...playerStatistics]
    .filter((player) => player.rating != null)
    .sort((a, b) => numberValue(b.rating) - numberValue(a.rating))[0]
  const viewItems = [
    { value: 'overview', label: 'Overview', count: formatSeason(competition?.season) },
    { value: 'matches', label: 'Matches', count: matches.all?.length || 0 },
    { value: 'squad', label: 'Squad', count: playerStatistics.length },
    { value: 'stats', label: 'Stats', count: details.seasonStatistics ? 'Team' : 0 },
  ]

  return (
    <div className="detail-page team-comp-page">
      <header className="detail-hero team-comp-hero">
        <TeamLogo team={team} />
        <div className="detail-hero__content">
          <p className="eyebrow">{formatSeason(competition?.season)} campaign</p>
          <h1>{team?.name || 'Team'}</h1>
          <div className="detail-meta">
            <CompetitionBadge competition={competition} />
            {details.groupName ? <span><Shield size={15} /> {details.groupName}</span> : null}
            {details.stage ? <span><BarChart3 size={15} /> {details.stage}</span> : null}
            <span><CalendarDays size={15} /> {matches.all?.length || 0} matches</span>
          </div>
          <FavoriteButton id={team.id} type="team" />
        </div>
      </header>

      <ChoiceBox ariaLabel="Team competition view" items={viewItems} onChange={setActiveView} value={activeView} />

      {activeView === 'overview' ? (
        <>
          <section className="team-comp-story">
            <div>
              <span>Campaign snapshot</span>
              <h2>{competition?.name || 'Competition'} - {formatSeason(competition?.season)}</h2>
              <p>
                {team?.name || 'This team'} have played {playedCount} of {totalCount || playedCount} stored matches
                {details.standing?.rank ? ` and currently sit #${details.standing.rank}` : ''}
                {details.standing?.points != null ? ` on ${details.standing.points} points` : ''}.
              </p>
            </div>
            <div className="team-comp-progress" aria-label="Campaign progress">
              <span style={{ width: percentValue(playedCount, totalCount || playedCount) }} />
            </div>
            <FormPills matches={matches.all} teamId={team.id} />
          </section>

          <div className="team-comp-summary">
            {summary.map((item) => (
              <section className="insight-card" key={item.label}>
                <span>{item.label}</span>
                {item.label === 'Recent form' ? (
                  <FormPills matches={matches.all} teamId={team.id} />
                ) : (
                  <strong>{item.value}</strong>
                )}
                <small>{item.detail}</small>
              </section>
            ))}
          </div>

          <div className="team-comp-focus-grid">
            <FocusMatch title="Latest result" match={latestMatch} teamId={team.id} />
            <FocusMatch title="Next match" match={nextMatch} teamId={team.id} />
            <TopPerformer title="Top scorer" player={topScorer} metric={`${statValue(topScorer?.goals, 0)} goals`} icon={<Goal size={22} />} />
            <TopPerformer title="Most assists" player={topAssister} metric={`${statValue(topAssister?.assists, 0)} assists`} icon={<Star size={22} />} />
          </div>
        </>
      ) : null}

      <div className="detail-grid detail-grid--single-view">
        {activeView === 'matches' ? (
          <AccordionSection className="detail-section" title="Competition Matches" count={matches.all?.length || 0} defaultOpen lazy>
            <div className="team-comp-match-list">
              {(matches.all || []).map((match) => <TeamCompetitionMatchRow key={match.id} match={match} teamId={team.id} />)}
              {!matches.all?.length ? <p className="match-empty">No matches stored for this competition.</p> : null}
            </div>
          </AccordionSection>
        ) : null}

        {activeView === 'squad' ? (
          <AccordionSection className="detail-section" title="Competition Squad Stats" count={playerStatistics.length} defaultOpen lazy>
            <div className="team-comp-player-table">
              <div className="team-comp-player-table__head"><span>Player</span><span>Apps</span><span>G</span><span>A</span><span>YC</span><span>RC</span><span>Rating</span></div>
              {playerStatistics.map((player) => <PlayerStatRow key={player.id} player={player} />)}
              {!playerStatistics.length ? <p className="match-empty">No player stats stored for this competition.</p> : null}
            </div>
          </AccordionSection>
        ) : null}

        {activeView === 'stats' ? (
          <AccordionSection className="detail-section" title="Team Stats" defaultOpen>
            <div className="team-comp-stat-grid">
              <section><span>Played</span><strong>{statValue(details.seasonStatistics?.fixtures_played_total, matches.played?.length || 0)}</strong></section>
              <section><span>Wins</span><strong>{statValue(details.seasonStatistics?.wins_total, 0)}</strong></section>
              <section><span>Draws</span><strong>{statValue(details.seasonStatistics?.draws_total, 0)}</strong></section>
              <section><span>Losses</span><strong>{statValue(details.seasonStatistics?.losses_total, 0)}</strong></section>
              <section><span>Goals For</span><strong>{statValue(details.seasonStatistics?.goals_for_total, 0)}</strong></section>
              <section><span>Goals Against</span><strong>{statValue(details.seasonStatistics?.goals_against_total, 0)}</strong></section>
              <section><span>Clean Sheets</span><strong>{statValue(details.seasonStatistics?.clean_sheets_total, 0)}</strong></section>
              <section><span>Failed To Score</span><strong>{statValue(details.seasonStatistics?.failed_to_score_total, 0)}</strong></section>
            </div>
            <div className="team-comp-split-grid">
              <section>
                <span>Home</span>
                <strong>{statValue(details.seasonStatistics?.wins_home, 0)}W {statValue(details.seasonStatistics?.draws_home, 0)}D {statValue(details.seasonStatistics?.losses_home, 0)}L</strong>
                <small>{statValue(details.seasonStatistics?.goals_for_home, 0)}:{statValue(details.seasonStatistics?.goals_against_home, 0)} goals</small>
              </section>
              <section>
                <span>Away</span>
                <strong>{statValue(details.seasonStatistics?.wins_away, 0)}W {statValue(details.seasonStatistics?.draws_away, 0)}D {statValue(details.seasonStatistics?.losses_away, 0)}L</strong>
                <small>{statValue(details.seasonStatistics?.goals_for_away, 0)}:{statValue(details.seasonStatistics?.goals_against_away, 0)} goals</small>
              </section>
              <section>
                <span>Best result</span>
                <strong>{details.seasonStatistics?.biggest_win_home || details.seasonStatistics?.biggest_win_away || '-'}</strong>
                <small>Biggest stored win</small>
              </section>
              <section>
                <span>Top rating</span>
                <strong>{statValue(topRated?.rating)}</strong>
                <small>{topRated?.name || 'No player ratings'}</small>
              </section>
            </div>
            <div className="team-comp-formations">
              <strong>Common formations</strong>
              {formations.length ? formations.slice(0, 5).map((formation) => (
                <span key={formation.id || formation.formation}>{formation.formation} <small>{formation.played || 0}x</small></span>
              )) : <p className="match-empty">No formation stats stored.</p>}
            </div>
          </AccordionSection>
        ) : null}
      </div>

      <Link className="admin-back-link" to={toLocale(`/teams/${team.id}`)}>Back to team</Link>
    </div>
  )
}

export default TeamCompetition
