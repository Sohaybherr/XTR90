import { CalendarDays, MapPin, Shield } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getTeamForm, getTeamSummary } from '../../api/statistics'
import { getTeamDetails } from '../../api/teams'
import FavoriteButton from '../../components/common/FavoriteButton'
import { TeamStatsPanel } from '../../components/statistics/StatisticsPanels'
import AccordionSection from '../../components/ui/AccordionSection'
import ChoiceBox from '../../components/ui/ChoiceBox'
import { useLocalizedPath } from '../../hooks/useLocalizedPath'
import { resolveAssetUrl } from '../../utils/assets'
import { formatSeason } from '../../utils/seasons'

function TeamLogo({ team }) {
  const logo = resolveAssetUrl(team?.logo)
  return logo ? (
    <img className="detail-hero__image" src={logo} alt="" loading="eager" decoding="async" />
  ) : (
    <span className="detail-hero__image detail-hero__image--empty">{team?.name?.charAt(0) || '?'}</span>
  )
}

function formatMatchDate(value) {
  if (!value) return 'TBD'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'TBD'

  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function MiniTeam({ team, fallback = 'Team' }) {
  const name = team?.name || fallback
  const logo = resolveAssetUrl(team?.logo)

  return (
    <span className="team-match-row__team">
      {logo ? (
        <img src={logo} alt="" loading="lazy" decoding="async" />
      ) : (
        <span className="team-match-row__logo-empty">{name.charAt(0)}</span>
      )}
      <span>{name}</span>
    </span>
  )
}

function TeamMatchRow({ match }) {
  const toLocale = useLocalizedPath()
  const score = match.homeGoals == null && match.awayGoals == null
    ? 'vs'
    : `${match.homeGoals ?? '-'} - ${match.awayGoals ?? '-'}`

  return (
    <article className="team-match-row">
      <Link className="team-match-row__link" to={toLocale(`/matches/${match.id}`)}>
        <MiniTeam team={match.homeTeam} fallback="Home" />
        <span className="team-match-row__score">
          <strong>{score}</strong>
          <small>{formatMatchDate(match.kickoffAt)}</small>
        </span>
        <MiniTeam team={match.awayTeam} fallback="Away" />
        <span className="team-match-row__status">{match.status || 'Match'}</span>
      </Link>
      <FavoriteButton id={match.id} type="match" />
    </article>
  )
}

function groupCompetitionsBySeason(competitions) {
  const groups = competitions.reduce((map, competition) => {
    const seasonLabel = formatSeason(competition.season?.name || competition.season?.year || 'Unknown season')
    const current = map.get(seasonLabel) || []
    current.push(competition)
    map.set(seasonLabel, current)
    return map
  }, new Map())

  return Array.from(groups.entries()).map(([season, items]) => ({ season, items }))
}

function Team() {
  const { id } = useParams()
  const toLocale = useLocalizedPath()
  const [details, setDetails] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [activeView, setActiveView] = useState('overview')
  const [statistics, setStatistics] = useState({ form: null, summary: null, status: 'idle' })

  useEffect(() => {
    let active = true
    setStatus('loading')
    setStatistics({ form: null, summary: null, status: 'loading' })
    getTeamDetails(id)
      .then((response) => {
        if (!active) return
        setDetails(response.data)
        setStatus('ready')
      })
      .catch((requestError) => {
        if (!active) return
        setError(requestError?.response?.data?.error || 'Could not load team details.')
        setStatus('error')
      })

    Promise.allSettled([
      getTeamForm(id, { last: 8 }),
      getTeamSummary(id),
    ]).then((results) => {
      if (!active) return
      setStatistics({
        form: results[0].status === 'fulfilled' ? results[0].value.data : null,
        summary: results[1].status === 'fulfilled' ? results[1].value.data : null,
        status: results.some((result) => result.status === 'fulfilled') ? 'ready' : 'error',
      })
    })

    return () => {
      active = false
    }
  }, [id])

  if (status === 'loading') return <div className="state-message detail-page">Loading team...</div>
  if (status === 'error') return <div className="state-message state-message--error detail-page">{error}</div>

  const { team, venue, currentSquad = [], competitions = [], matches = {}, currentCoach } = details
  const matchCount = (matches.next?.length || 0) + (matches.previous?.length || 0)
  const competitionGroups = groupCompetitionsBySeason(competitions)
  const nextMatch = matches.next?.[0]
  const previousMatch = matches.previous?.[0]
  const viewItems = [
    { value: 'overview', label: 'Overview', count: 'Now' },
    { value: 'stats', label: 'Stats', count: statistics.form?.matchesPlayed ?? statistics.summary?.overall?.played ?? 0 },
    { value: 'squad', label: 'Squad', count: currentSquad.length },
    { value: 'matches', label: 'Matches', count: matchCount },
    { value: 'competitions', label: 'Competitions', count: competitions.length },
  ]

  return (
    <div className="detail-page">
      <header className="detail-hero">
        <TeamLogo team={team} />
        <div>
          <p className="eyebrow">{team?.country?.name || 'Club'}</p>
          <h1>{team?.name || 'Unknown team'}</h1>
          <div className="detail-meta">
            {team?.founded ? <span><CalendarDays size={15} /> Founded {team.founded}</span> : null}
            {venue?.name ? <span><MapPin size={15} /> {venue.name}</span> : null}
            {currentCoach?.name ? <span><Shield size={15} /> {currentCoach.name}</span> : null}
          </div>
        </div>
      </header>

      <ChoiceBox ariaLabel="Team detail view" items={viewItems} onChange={setActiveView} value={activeView} />

      {activeView === 'overview' ? (
        <div className="detail-focus-grid">
          <section className="insight-card">
            <span>Squad</span>
            <strong>{currentSquad.length}</strong>
            <small>current players</small>
          </section>
          <section className="insight-card">
            <span>Competitions</span>
            <strong>{competitions.length}</strong>
            <small>{competitionGroups[0]?.season || 'season data'}</small>
          </section>
          <section className="insight-card insight-card--wide">
            <span>Next match</span>
            {nextMatch ? <TeamMatchRow match={nextMatch} /> : <p className="match-empty">No upcoming match stored.</p>}
          </section>
          <section className="insight-card insight-card--wide">
            <span>Latest result</span>
            {previousMatch ? <TeamMatchRow match={previousMatch} /> : <p className="match-empty">No previous match stored.</p>}
          </section>
          <section className="insight-card">
            <span>Coach</span>
            <strong>{currentCoach?.name || '-'}</strong>
            <small>current staff</small>
          </section>
          <section className="insight-card">
            <span>Venue</span>
            <strong>{venue?.name || '-'}</strong>
            <small>{venue?.city || team?.country?.name || 'home ground'}</small>
          </section>
          <section className="insight-card insight-card--stats insight-card--wide">
            <TeamStatsPanel form={statistics.form} summary={statistics.summary} loading={statistics.status === 'loading'} compact />
          </section>
        </div>
      ) : null}

      <div className="detail-grid detail-grid--single-view">
        {activeView === 'squad' ? (
        <AccordionSection className="detail-section" title="Current Squad" count={currentSquad.length} defaultOpen lazy>
          <div className="compact-list">
            {currentSquad.length ? currentSquad.map((player) => {
              const photo = resolveAssetUrl(player.photo || player.photoPath || player.photo_path)

              return (
                <Link className="compact-row compact-row--player" to={toLocale(`/players/${player.id}`)} key={player.id}>
                  <span className="compact-row__player">
                    {photo ? (
                      <img src={photo} alt="" loading="lazy" decoding="async" />
                    ) : (
                      <span className="compact-row__photo-empty">{String(player.name || '?').charAt(0)}</span>
                    )}
                    <span>{player.shirtNumber || '-'}</span>
                  </span>
                  <strong>{player.name}</strong>
                  <small>{player.position || player.nationality}</small>
                  <FavoriteButton id={player.id} type="player" />
                </Link>
              )
            }) : <p className="match-empty">No squad stored.</p>}
          </div>
        </AccordionSection>
        ) : null}

        {activeView === 'competitions' ? (
        <AccordionSection className="detail-section" title="Competitions" count={competitions.length} defaultOpen>
          {competitionGroups.length ? competitionGroups.map((group, index) => (
            <AccordionSection
              count={group.items.length}
              defaultOpen={index === 0}
              key={group.season}
              lazy
              title={group.season}
            >
              <div className="compact-list">
                {group.items.map((competition) => (
                  <Link className="compact-row" to={toLocale(competition.season?.id ? `/teams/${team.id}/competitions/${competition.season.id}` : `/competitions/${competition.id}`)} key={`${competition.id}-${competition.season?.id}`}>
                    <span>{competition.season?.current ? 'Now' : competition.type || '-'}</span>
                    <strong>{competition.name}</strong>
                    <small>{competition.season?.current ? 'Current' : competition.type}</small>
                    <FavoriteButton id={competition.id} type="competition" />
                  </Link>
                ))}
              </div>
            </AccordionSection>
          )) : <p className="match-empty">No competitions stored.</p>}
        </AccordionSection>
        ) : null}

        {activeView === 'matches' ? (
        <AccordionSection className="detail-section" title="Matches" count={matchCount} lazy>
          <div className="team-match-list">
            {[...(matches.next || []), ...(matches.previous || [])].map((match) => (
              <TeamMatchRow key={match.id} match={match} />
            ))}
            {!(matches.next?.length || matches.previous?.length) ? <p className="match-empty">No matches stored.</p> : null}
          </div>
        </AccordionSection>
        ) : null}

        {activeView === 'stats' ? (
        <AccordionSection className="detail-section detail-section--wide" title="Team Statistics" count={statistics.form?.matchesPlayed ?? statistics.summary?.overall?.played ?? 0} defaultOpen>
          <TeamStatsPanel form={statistics.form} summary={statistics.summary} loading={statistics.status === 'loading'} />
        </AccordionSection>
        ) : null}
      </div>
    </div>
  )
}

export default Team
