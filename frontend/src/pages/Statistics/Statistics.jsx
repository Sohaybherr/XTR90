import { BarChart3, GitCompare, Search, Shield, Trophy, UserRound } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCompetitionDetails } from '../../api/competitions'
import { getSearchResults } from '../../api/search'
import {
  getCompetitionTable,
  getHeadToHead,
  getPlayerSummary,
  getTeamForm,
  getTeamSummary,
} from '../../api/statistics'
import { CompetitionVisualTable, PlayerStatsPanel, TeamStatsPanel } from '../../components/statistics/StatisticsPanels'
import ChoiceBox from '../../components/ui/ChoiceBox'
import { useLocalizedPath } from '../../hooks/useLocalizedPath'
import { resolveAssetUrl } from '../../utils/assets'
import { formatCompetitionSeason } from '../../utils/seasons'

const DEFAULT_STATE = { data: null, status: 'idle', error: '' }

function idOf(entity) {
  return entity?.id || entity?.teamId || entity?.playerId || entity?.competitionId || ''
}

function EntitySearchBox({ label, type, selected, onSelect, placeholder }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [status, setStatus] = useState('idle')

  useEffect(() => {
    const value = query.trim()
    if (value.length < 2) {
      setResults([])
      setStatus('idle')
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      setStatus('loading')
      getSearchResults(value, controller.signal)
        .then((response) => {
          const items = response.data?.[`${type}s`] || []
          setResults(items.slice(0, 6))
          setStatus('ready')
        })
        .catch((error) => {
          if (error.name !== 'CanceledError' && error.name !== 'AbortError') {
            setStatus('error')
          }
        })
    }, 250)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [query, type])

  return (
    <div className="stats-search-box">
      <label>{label}</label>
      <div className="stats-search-box__control">
        <Search size={16} />
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          value={query}
        />
      </div>
      {selected ? (
        <SelectedEntity entity={selected} onClear={() => onSelect(null)} type={type} />
      ) : null}
      {query.trim().length >= 2 ? (
        <div className="stats-search-box__results">
          {status === 'loading' ? <span>Searching...</span> : null}
          {status === 'error' ? <span>Search failed.</span> : null}
          {status === 'ready' && !results.length ? <span>No results.</span> : null}
          {results.map((item) => (
            <button
              key={`${type}-${idOf(item)}`}
              onClick={() => {
                onSelect(item)
                setQuery('')
                setResults([])
              }}
              type="button"
            >
              <EntityAvatar entity={item} type={type} />
              <strong>{item.name}</strong>
              <small>{item.country?.name || item.type || item.position || type}</small>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function EntityAvatar({ entity, type }) {
  const image = resolveAssetUrl(entity?.logo || entity?.photo)
  const fallback = String(entity?.name || type || '?').charAt(0).toUpperCase()
  if (image) return <img src={image} alt="" loading="lazy" decoding="async" />
  return <i>{fallback}</i>
}

function SelectedEntity({ entity, type, onClear }) {
  const toLocale = useLocalizedPath()
  const path = type === 'team' ? `/teams/${idOf(entity)}` : type === 'player' ? `/players/${idOf(entity)}` : `/competitions/${idOf(entity)}`

  return (
    <div className="stats-selected-entity">
      <EntityAvatar entity={entity} type={type} />
      <Link to={toLocale(path)}>{entity?.name || `${type} ${idOf(entity)}`}</Link>
      <button onClick={onClear} type="button">Clear</button>
    </div>
  )
}

function StatBlock({ label, value, detail }) {
  return (
    <span className="stats-big-block">
      <small>{label}</small>
      <strong>{value ?? '-'}</strong>
      {detail ? <em>{detail}</em> : null}
    </span>
  )
}

function numberValue(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function percentValue(value) {
  return `${numberValue(value).toFixed(numberValue(value) % 1 === 0 ? 0 : 1)}%`
}

function signalTone(value, high = 65, medium = 45) {
  const score = numberValue(value)
  if (score >= high) return 'strong'
  if (score >= medium) return 'medium'
  return 'low'
}

function InsightCard({ label, value, why, tone = 'medium', detail }) {
  return (
    <article className={`stats-insight-card stats-insight-card--${tone}`}>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
      {detail ? <span>{detail}</span> : null}
      <p>{why}</p>
    </article>
  )
}

function TeamMarketInsights({ summary, form }) {
  const overall = summary?.overall
  if (!overall) return null
  const shots = overall.shotStats || {}
  const home = summary?.home || {}
  const away = summary?.away || {}
  const recent = form?.record || overall
  const homeAwayEdge = Math.abs(numberValue(home.pointsPerGame) - numberValue(away.pointsPerGame))
  const strongerVenue = numberValue(home.pointsPerGame) >= numberValue(away.pointsPerGame) ? 'home' : 'away'

  const items = [
    {
      label: 'Over 2.5 goals',
      value: percentValue(overall.over25Rate),
      tone: signalTone(overall.over25Rate, 62, 42),
      detail: `${overall.over25 || 0} of ${overall.played || 0}`,
      why: 'Useful for goal-line markets because it shows how often this team plays open, high-scoring matches.',
    },
    {
      label: 'BTTS',
      value: percentValue(overall.bothTeamsScoredRate),
      tone: signalTone(overall.bothTeamsScoredRate, 58, 40),
      detail: `${overall.bothTeamsScored || 0} shared-score games`,
      why: 'Combines attacking output with defensive leakage, so it is often more informative than goals for alone.',
    },
    {
      label: 'Clean sheet rate',
      value: percentValue(overall.cleanSheetRate),
      tone: signalTone(overall.cleanSheetRate, 40, 25),
      detail: `${overall.cleanSheets || 0} clean sheets`,
      why: 'A high number supports defensive confidence; a low number warns against backing shutouts.',
    },
    {
      label: 'Failed to score',
      value: percentValue(overall.failedToScoreRate),
      tone: signalTone(100 - numberValue(overall.failedToScoreRate), 75, 58),
      detail: `${overall.failedToScore || 0} blanks`,
      why: 'Shows attacking reliability. Frequent blanks weaken BTTS and team-goal confidence.',
    },
    {
      label: 'Shot pressure',
      value: `${shots.averageShotsFor || 0} / ${shots.averageShotsOnTargetFor || 0}`,
      tone: signalTone(numberValue(shots.averageShotsOnTargetFor), 5, 3),
      detail: 'Shots / shots on target',
      why: 'Shots on target describe threat quality better than possession because they force goalkeeper action.',
    },
    {
      label: 'xG balance',
      value: `${shots.averageExpectedGoalsFor || 0} : ${shots.averageExpectedGoalsAgainst || 0}`,
      tone: signalTone(numberValue(shots.averageExpectedGoalsFor) - numberValue(shots.averageExpectedGoalsAgainst) + 50, 51, 49),
      detail: 'For : against',
      why: 'Expected goals helps separate repeatable chance quality from finishing streaks.',
    },
    {
      label: 'Corners',
      value: `${shots.averageCornersFor || 0} + ${shots.averageCornersAgainst || 0}`,
      tone: signalTone(numberValue(shots.averageCornersFor) + numberValue(shots.averageCornersAgainst), 10, 8),
      detail: 'Average total corner flow',
      why: 'Corner volume is a separate market signal and often tracks territorial pressure.',
    },
    {
      label: 'Venue split',
      value: `${strongerVenue} +${homeAwayEdge.toFixed(2)} PPG`,
      tone: homeAwayEdge >= 0.6 ? 'strong' : homeAwayEdge >= 0.25 ? 'medium' : 'low',
      detail: `${home.pointsPerGame || 0} home / ${away.pointsPerGame || 0} away`,
      why: 'Home and away splits prevent season averages from hiding where the team is actually strongest.',
    },
    {
      label: 'Recent form',
      value: Array.isArray(form?.form) ? form.form.slice(-5).join('') : '-',
      tone: signalTone(numberValue(recent.winRate), 55, 35),
      detail: `${recent.wins || 0}W ${recent.draws || 0}D ${recent.losses || 0}L`,
      why: 'Short form is momentum context; use it with season data rather than as the only signal.',
    },
  ]

  return (
    <section className="stats-insight-panel">
      <div className="stats-panel__header">
        <span><BarChart3 size={16} /> Market signals</span>
        <strong>{overall.played || 0} matches</strong>
      </div>
      <div className="stats-insight-grid">
        {items.map((item) => <InsightCard key={item.label} {...item} />)}
      </div>
    </section>
  )
}

function SplitCard({ title, data }) {
  if (!data) return null
  const shotStats = data.shotStats || {}
  return (
    <section className="stats-split-card">
      <h3>{title}</h3>
      <div className="stats-split-card__grid">
        <StatBlock label="Played" value={data.played} />
        <StatBlock label="Record" value={`${data.wins || 0}W ${data.draws || 0}D ${data.losses || 0}L`} />
        <StatBlock label="Goals" value={`${data.goalsFor || 0}:${data.goalsAgainst || 0}`} />
        <StatBlock label="Avg goals" value={`${data.averageGoalsFor || 0}:${data.averageGoalsAgainst || 0}`} />
        <StatBlock label="Win rate" value={`${data.winRate || 0}%`} />
        <StatBlock label="Scored" value={`${data.scoredRate || 0}%`} detail={`${data.scored || 0}/${data.played || 0}`} />
        <StatBlock label="Conceded" value={`${data.concededRate || 0}%`} detail={`${data.conceded || 0}/${data.played || 0}`} />
        <StatBlock label="Clean sheets" value={data.cleanSheets || 0} detail={`${data.cleanSheetRate || 0}%`} />
        <StatBlock label="BTTS" value={data.bothTeamsScored || 0} detail={`${data.bothTeamsScoredRate || 0}%`} />
        <StatBlock label="Over 1.5" value={`${data.over15Rate || 0}%`} detail={`${data.over15 || 0}/${data.played || 0}`} />
        <StatBlock label="Over 2.5" value={`${data.over25Rate || 0}%`} detail={`${data.over25 || 0}/${data.played || 0}`} />
        <StatBlock label="Over 3.5" value={`${data.over35Rate || 0}%`} detail={`${data.over35 || 0}/${data.played || 0}`} />
        <StatBlock label="Shots avg" value={shotStats.averageShotsFor || 0} detail={`Against ${shotStats.averageShotsAgainst || 0}`} />
        <StatBlock label="SOT avg" value={shotStats.averageShotsOnTargetFor || 0} detail={`Against ${shotStats.averageShotsOnTargetAgainst || 0}`} />
        <StatBlock label="Corners avg" value={shotStats.averageCornersFor || 0} detail={`Against ${shotStats.averageCornersAgainst || 0}`} />
        <StatBlock label="Possession" value={`${shotStats.averagePossession || 0}%`} />
        <StatBlock label="xG avg" value={shotStats.averageExpectedGoalsFor || 0} detail={`Against ${shotStats.averageExpectedGoalsAgainst || 0}`} />
      </div>
    </section>
  )
}

function H2HMarketInsights({ data }) {
  if (!data?.played) return null
  const meetings = data.meetings || []
  const over25 = meetings.filter((match) => numberValue(match.score?.home) + numberValue(match.score?.away) >= 3).length
  const btts = meetings.filter((match) => numberValue(match.score?.home) > 0 && numberValue(match.score?.away) > 0).length
  const cleanOrBlank = meetings.length - btts
  const teamAWins = numberValue(data.record?.teamAWins)
  const teamBWins = numberValue(data.record?.teamBWins)
  const draws = numberValue(data.record?.draws)
  const dominant = teamAWins > teamBWins ? data.teams?.teamA?.name : teamBWins > teamAWins ? data.teams?.teamB?.name : 'Neither side'

  const items = [
    {
      label: 'Over 2.5 history',
      value: percentValue((over25 / data.played) * 100),
      tone: signalTone((over25 / data.played) * 100, 60, 40),
      detail: `${over25} of ${data.played}`,
      why: 'Head-to-head goal history gives rivalry context for total-goals markets.',
    },
    {
      label: 'BTTS history',
      value: percentValue((btts / data.played) * 100),
      tone: signalTone((btts / data.played) * 100, 58, 40),
      detail: `${btts} shared-score meetings`,
      why: 'Shows whether these teams usually trade goals or one side controls the scoring.',
    },
    {
      label: 'Clean/blank games',
      value: cleanOrBlank,
      tone: signalTone((cleanOrBlank / data.played) * 100, 55, 35),
      detail: 'At least one team failed to score',
      why: 'Important counter-signal when BTTS looks tempting from recent form alone.',
    },
    {
      label: 'Result balance',
      value: dominant,
      tone: Math.max(teamAWins, teamBWins) >= draws + 2 ? 'strong' : 'medium',
      detail: `${teamAWins}-${draws}-${teamBWins}`,
      why: 'Highlights whether the matchup has a repeated winner or is usually tight.',
    },
  ]

  return (
    <section className="stats-insight-panel">
      <div className="stats-panel__header">
        <span><GitCompare size={16} /> Matchup signals</span>
        <strong>{data.played} meetings</strong>
      </div>
      <div className="stats-insight-grid stats-insight-grid--compact">
        {items.map((item) => <InsightCard key={item.label} {...item} />)}
      </div>
    </section>
  )
}

function PlayerBettingInsights({ summary }) {
  if (!summary) return null
  const totals = summary.totals || {}
  const rates = summary.rates || {}
  const minutes = numberValue(totals.minutes)
  const appearances = numberValue(totals.appearances)
  const shots = numberValue(totals.shots)
  const shotAccuracy = shots ? (numberValue(totals.shotsOnTarget) / shots) * 100 : 0
  const cardRate = appearances ? ((numberValue(totals.yellowCards) + numberValue(totals.redCards)) / appearances) : 0

  const items = [
    {
      label: 'Goal involvement',
      value: `${rates.goalsPer90 || 0} G / ${rates.assistsPer90 || 0} A`,
      tone: signalTone(numberValue(rates.goalsPer90) + numberValue(rates.assistsPer90), 0.7, 0.35),
      detail: 'Per 90 minutes',
      why: 'Per-90 output is cleaner than totals because it adjusts for playing time.',
    },
    {
      label: 'Shot volume',
      value: `${rates.shotsPer90 || 0}`,
      tone: signalTone(rates.shotsPer90, 2.5, 1.3),
      detail: 'Shots per 90',
      why: 'Shot takers are more relevant for scorer and shots markets than players with only minutes.',
    },
    {
      label: 'Shot accuracy',
      value: percentValue(shotAccuracy),
      tone: signalTone(shotAccuracy, 45, 30),
      detail: `${totals.shotsOnTarget || 0}/${totals.shots || 0} on target`,
      why: 'Separates low-value attempts from shots that actually test the goalkeeper.',
    },
    {
      label: 'Discipline',
      value: cardRate.toFixed(2),
      tone: cardRate >= 0.35 ? 'strong' : cardRate >= 0.18 ? 'medium' : 'low',
      detail: 'Cards per appearance',
      why: 'Cards per appearance helps judge booking risk more fairly than raw card totals.',
    },
    {
      label: 'Reliability',
      value: appearances ? `${Math.round(minutes / appearances)} min` : '-',
      tone: minutes / Math.max(1, appearances) >= 75 ? 'strong' : minutes / Math.max(1, appearances) >= 45 ? 'medium' : 'low',
      detail: `${appearances} appearances`,
      why: 'A player must stay on the pitch long enough for scorer, assist, shot, or card markets to matter.',
    },
  ]

  return (
    <section className="stats-insight-panel">
      <div className="stats-panel__header">
        <span><UserRound size={16} /> Player signals</span>
        <strong>{minutes} minutes</strong>
      </div>
      <div className="stats-insight-grid">
        {items.map((item) => <InsightCard key={item.label} {...item} />)}
      </div>
    </section>
  )
}

function CompetitionTableInsights({ tableData }) {
  const rows = tableData?.table || []
  if (!rows.length) return null
  const leaders = [...rows].slice(0, 3)
  const attacks = [...rows].sort((a, b) => numberValue(b.goalsFor) - numberValue(a.goalsFor)).slice(0, 3)
  const defenses = [...rows].sort((a, b) => numberValue(a.goalsAgainst) - numberValue(b.goalsAgainst)).slice(0, 3)
  const volatility = rows
    .map((row) => ({ ...row, totalGoals: numberValue(row.goalsFor) + numberValue(row.goalsAgainst) }))
    .sort((a, b) => b.totalGoals - a.totalGoals)
    .slice(0, 3)

  const groups = [
    {
      title: 'Title pressure',
      rows: leaders,
      value: (row) => `${row.points || 0} pts`,
      why: 'Shows the clubs setting the pace and whether the top is tight or stretched.',
    },
    {
      title: 'Best attacks',
      rows: attacks,
      value: (row) => `${row.goalsFor || 0} GF`,
      why: 'Attack ranking gives first context for overs, scorers, and team-goal markets.',
    },
    {
      title: 'Best defenses',
      rows: defenses,
      value: (row) => `${row.goalsAgainst || 0} GA`,
      why: 'Low goals against is a warning signal for overs and opponent scoring props.',
    },
    {
      title: 'Goal-heavy teams',
      rows: volatility,
      value: (row) => `${row.totalGoals || 0} total`,
      why: 'Teams with high combined goals for and against often create livelier match scripts.',
    },
  ]

  return (
    <section className="stats-competition-insights">
      {groups.map((group) => (
        <article className="stats-table-signal" key={group.title}>
          <h3>{group.title}</h3>
          <div>
            {group.rows.map((row, index) => (
              <span key={`${group.title}-${row.teamId}`}>
                <b>{index + 1}</b>
                <strong>{row.teamName || row.team?.name || 'Team'}</strong>
                <em>{group.value(row)}</em>
              </span>
            ))}
          </div>
          <p>{group.why}</p>
        </article>
      ))}
    </section>
  )
}

function H2HGraph({ data }) {
  const teamAWins = Number(data?.record?.teamAWins || 0)
  const teamBWins = Number(data?.record?.teamBWins || 0)
  const draws = Number(data?.record?.draws || 0)
  const total = Math.max(1, teamAWins + teamBWins + draws)
  const teamAWidth = (teamAWins / total) * 100
  const drawsWidth = (draws / total) * 100
  const teamBWidth = (teamBWins / total) * 100

  return (
    <section className="stats-h2h-graph">
      <div className="stats-panel__header">
        <span><GitCompare size={16} /> Win balance</span>
        <strong>{data.played || 0} meetings</strong>
      </div>
      <div className="stats-h2h-graph__bar" aria-label="Head to head win balance">
        <i className="stats-h2h-graph__a" style={{ width: `${teamAWidth}%` }} />
        <i className="stats-h2h-graph__d" style={{ width: `${drawsWidth}%` }} />
        <i className="stats-h2h-graph__b" style={{ width: `${teamBWidth}%` }} />
      </div>
      <div className="stats-h2h-graph__labels">
        <span><b></b>{data.teams?.teamA?.name || 'Team A'} {teamAWins}</span>
        <span><b></b>Draws {draws}</span>
        <span><b></b>{data.teams?.teamB?.name || 'Team B'} {teamBWins}</span>
      </div>
    </section>
  )
}

function RecentMatches({ matches = [], teamId }) {
  const toLocale = useLocalizedPath()
  if (!matches.length) return <p className="match-empty">No recent completed matches.</p>

  return (
    <div className="stats-match-strip">
      {matches.slice(-10).map((match) => (
        <Link className="stats-match-strip__row" to={toLocale(`/matches/${match.id}`)} key={match.id}>
          {teamId ? <span className={`stats-form-dot stats-form-dot--${String(match.result || '').toLowerCase()}`}>{match.result}</span> : null}
          <strong>{match.homeTeam?.name || 'Home'} {match.score?.home ?? '-'} - {match.score?.away ?? '-'} {match.awayTeam?.name || 'Away'}</strong>
          <small>
            {match.competition || match.status || 'Match'}
            {match.teamStats ? ` / ${match.teamStats.shots} shots / ${match.teamStats.corners} corners / ${match.teamStats.expectedGoals} xG` : ''}
          </small>
        </Link>
      ))}
    </div>
  )
}

function GlobalStatsSearch({ onPick }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState({ teams: [], players: [], competitions: [] })
  const [status, setStatus] = useState('idle')

  useEffect(() => {
    const value = query.trim()
    if (value.length < 2) {
      setResults({ teams: [], players: [], competitions: [] })
      setStatus('idle')
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      setStatus('loading')
      getSearchResults(value, controller.signal)
        .then((response) => {
          setResults({
            teams: response.data?.teams?.slice(0, 5) || [],
            players: response.data?.players?.slice(0, 5) || [],
            competitions: response.data?.competitions?.slice(0, 5) || [],
          })
          setStatus('ready')
        })
        .catch((error) => {
          if (error.name !== 'CanceledError' && error.name !== 'AbortError') {
            setStatus('error')
          }
        })
    }, 250)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [query])

  const groups = [
    { type: 'team', label: 'Teams', items: results.teams, icon: Shield },
    { type: 'player', label: 'Players', items: results.players, icon: UserRound },
    { type: 'competition', label: 'Competitions', items: results.competitions, icon: Trophy },
  ]
  const total = groups.reduce((sum, group) => sum + group.items.length, 0)

  return (
    <section className="stats-smart-search">
      <div className="stats-smart-search__title">
        <Search size={18} />
        <div>
          <strong>Find stats fast</strong>
          <span>Search a team, player, or competition. Click a result and the page loads the right stats.</span>
        </div>
      </div>
      <div className="stats-smart-search__input">
        <Search size={18} />
        <input autoComplete="off" onChange={(event) => setQuery(event.target.value)} placeholder="Example: Real Madrid, Messi, Premier League..." value={query} />
      </div>
      {query.trim().length >= 2 ? (
        <div className="stats-smart-results">
          {status === 'loading' ? <p className="match-empty">Searching...</p> : null}
          {status === 'error' ? <p className="match-empty">Search failed.</p> : null}
          {status === 'ready' && total === 0 ? <p className="match-empty">No result found.</p> : null}
          {groups.map((group) => {
            const Icon = group.icon
            if (!group.items.length) return null
            return (
              <div className="stats-smart-results__group" key={group.type}>
                <h2><Icon size={16} /> {group.label}</h2>
                <div className="stats-smart-results__items">
                  {group.items.map((item) => (
                    <button
                      key={`${group.type}-${idOf(item)}`}
                      onClick={() => {
                        onPick(group.type, item)
                        setQuery('')
                        setResults({ teams: [], players: [], competitions: [] })
                      }}
                      type="button"
                    >
                      <EntityAvatar entity={item} type={group.type} />
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.country?.name || item.position || item.type || group.type}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}

function TeamStatsWorkspace({ selectedEntity }) {
  const [team, setTeam] = useState(null)
  const [last, setLast] = useState(10)
  const [venue, setVenue] = useState('all')
  const [form, setForm] = useState(DEFAULT_STATE)
  const [summary, setSummary] = useState(DEFAULT_STATE)

  const load = useCallback(() => {
    const teamId = idOf(team)
    if (!teamId) return
    setForm({ ...DEFAULT_STATE, status: 'loading' })
    setSummary({ ...DEFAULT_STATE, status: 'loading' })
    Promise.allSettled([
      getTeamForm(teamId, { last, venue }),
      getTeamSummary(teamId, { venue }),
    ]).then((results) => {
      setForm(results[0].status === 'fulfilled'
        ? { data: results[0].value.data, status: 'ready', error: '' }
        : { data: null, status: 'error', error: 'Could not load form.' })
      setSummary(results[1].status === 'fulfilled'
        ? { data: results[1].value.data, status: 'ready', error: '' }
        : { data: null, status: 'error', error: 'Could not load summary.' })
    })
  }, [last, team, venue])

  useEffect(() => {
    if (selectedEntity) setTeam(selectedEntity)
  }, [selectedEntity])

  useEffect(() => {
    if (team) load()
  }, [load, team])

  return (
    <section className="stats-workspace">
      <StatsControls>
        <EntitySearchBox label="Team" onSelect={setTeam} placeholder="Search team..." selected={team} type="team" />
        <label className="stats-field">Last matches<input min="1" max="30" onChange={(event) => setLast(event.target.value)} type="number" value={last} /></label>
        <label className="stats-field">Venue<select onChange={(event) => setVenue(event.target.value)} value={venue}><option value="all">All</option><option value="home">Home</option><option value="away">Away</option></select></label>
        <button className="stats-load-button" disabled={!team} onClick={load} type="button">Refresh</button>
      </StatsControls>

      <TeamStatsPanel form={form.data} summary={summary.data} loading={form.status === 'loading' || summary.status === 'loading'} />
      <TeamMarketInsights form={form.data} summary={summary.data} />
      <div className="stats-split-grid">
        <SplitCard title="All Stored Matches" data={summary.data?.overall} />
        <SplitCard title="Home Split" data={summary.data?.home} />
        <SplitCard title="Away Split" data={summary.data?.away} />
      </div>
      <RecentMatches matches={form.data?.matches} teamId={idOf(team)} />
    </section>
  )
}

function HeadToHeadWorkspace({ selectedEntity }) {
  const [teamA, setTeamA] = useState(null)
  const [teamB, setTeamB] = useState(null)
  const [last, setLast] = useState(10)
  const [state, setState] = useState(DEFAULT_STATE)

  const load = useCallback(() => {
    if (!teamA || !teamB) return
    setState({ ...DEFAULT_STATE, status: 'loading' })
    getHeadToHead({ teamAId: idOf(teamA), teamBId: idOf(teamB), last })
      .then((response) => setState({ data: response.data, status: 'ready', error: '' }))
      .catch(() => setState({ data: null, status: 'error', error: 'Could not load head-to-head.' }))
  }, [last, teamA, teamB])

  useEffect(() => {
    if (selectedEntity) setTeamA(selectedEntity)
  }, [selectedEntity])

  useEffect(() => {
    if (teamA && teamB) load()
  }, [load, teamA, teamB])

  const data = state.data

  return (
    <section className="stats-workspace">
      <StatsControls>
        <EntitySearchBox label="Team A" onSelect={setTeamA} placeholder="Search first team..." selected={teamA} type="team" />
        <EntitySearchBox label="Team B" onSelect={setTeamB} placeholder="Search second team..." selected={teamB} type="team" />
        <label className="stats-field">Meetings<input min="1" max="50" onChange={(event) => setLast(event.target.value)} type="number" value={last} /></label>
        <button className="stats-load-button" disabled={!teamA || !teamB} onClick={load} type="button">Refresh</button>
      </StatsControls>

      {state.status === 'loading' ? <div className="stats-panel stats-panel--loading">Loading comparison...</div> : null}
      {data ? (
        <>
          <H2HGraph data={data} />
          <H2HMarketInsights data={data} />
          <div className="stats-h2h-board">
            <StatBlock label={data.teams?.teamA?.name || 'Team A'} value={`${data.record?.teamAWins || 0} wins`} detail={`${data.goals?.teamA || 0} goals`} />
            <StatBlock label="Draws" value={data.record?.draws || 0} detail={`${data.played || 0} meetings`} />
            <StatBlock label={data.teams?.teamB?.name || 'Team B'} value={`${data.record?.teamBWins || 0} wins`} detail={`${data.goals?.teamB || 0} goals`} />
            <StatBlock label="Avg goals" value={data.goals?.averagePerMatch || 0} detail={`BTTS ${data.rates?.bothTeamsScored || 0}%`} />
          </div>
          <RecentMatches matches={data.meetings} />
        </>
      ) : state.status !== 'loading' ? <p className="match-empty">Pick two teams. Use the big search above or the two team boxes here.</p> : null}
    </section>
  )
}

function PlayerStatsWorkspace({ selectedEntity }) {
  const [player, setPlayer] = useState(null)
  const [last, setLast] = useState(12)
  const [state, setState] = useState(DEFAULT_STATE)

  const load = useCallback(() => {
    if (!player) return
    setState({ ...DEFAULT_STATE, status: 'loading' })
    getPlayerSummary(idOf(player), { last })
      .then((response) => setState({ data: response.data, status: 'ready', error: '' }))
      .catch(() => setState({ data: null, status: 'error', error: 'Could not load player stats.' }))
  }, [last, player])

  useEffect(() => {
    if (selectedEntity) setPlayer(selectedEntity)
  }, [selectedEntity])

  useEffect(() => {
    if (player) load()
  }, [load, player])

  const totals = state.data?.totals || {}

  return (
    <section className="stats-workspace">
      <StatsControls>
        <EntitySearchBox label="Player" onSelect={setPlayer} placeholder="Search player..." selected={player} type="player" />
        <label className="stats-field">Last matches<input min="1" max="50" onChange={(event) => setLast(event.target.value)} type="number" value={last} /></label>
        <button className="stats-load-button" disabled={!player} onClick={load} type="button">Refresh</button>
      </StatsControls>

      <PlayerStatsPanel summary={state.data} loading={state.status === 'loading'} />
      <PlayerBettingInsights summary={state.data} />
      {state.data ? (
        <div className="stats-split-card">
          <h3>All player totals</h3>
          <div className="stats-split-card__grid">
            <StatBlock label="Yellow cards" value={totals.yellowCards} />
            <StatBlock label="Red cards" value={totals.redCards} />
            <StatBlock label="Saves" value={totals.saves} />
            <StatBlock label="Clean sheets" value={totals.cleanSheets} />
            <StatBlock label="Shots" value={totals.shots} />
            <StatBlock label="Shots on target" value={totals.shotsOnTarget} />
          </div>
        </div>
      ) : null}
    </section>
  )
}

function CompetitionStatsWorkspace({ selectedEntity }) {
  const [competition, setCompetition] = useState(null)
  const [seasonId, setSeasonId] = useState('')
  const [seasonOptions, setSeasonOptions] = useState([])
  const [state, setState] = useState(DEFAULT_STATE)

  const load = useCallback(() => {
    if (!competition) return
    setState({ ...DEFAULT_STATE, status: 'loading' })
    getCompetitionTable(idOf(competition), { seasonId })
      .then((response) => setState({ data: response.data, status: 'ready', error: '' }))
      .catch(() => setState({ data: null, status: 'error', error: 'Could not load competition table.' }))
  }, [competition, seasonId])

  useEffect(() => {
    if (selectedEntity) {
      setCompetition(selectedEntity)
      setSeasonId('')
      setSeasonOptions([])
    }
  }, [selectedEntity])

  useEffect(() => {
    const competitionId = idOf(competition)
    if (!competitionId) return

    let active = true
    getCompetitionDetails(competitionId)
      .then((response) => {
        if (!active) return
        const currentSeason = response.data?.currentSeason
        const seasons = response.data?.seasons || []
        const options = [currentSeason, ...seasons]
          .filter(Boolean)
          .reduce((items, season) => {
            const id = season.id || season.competitionSeasonId
            if (!id || items.some((item) => String(item.id) === String(id))) return items
            items.push({
              id,
              label: formatCompetitionSeason(season, response.data?.competition || competition),
            })
            return items
          }, [])
        setSeasonOptions(options)
        setSeasonId(options[0]?.id || '')
      })
      .catch(() => {
        if (!active) return
        setSeasonOptions([])
        setSeasonId('')
      })

    return () => {
      active = false
    }
  }, [competition])

  useEffect(() => {
    if (competition && (seasonId || !seasonOptions.length)) load()
  }, [competition, load, seasonId, seasonOptions.length])

  return (
    <section className="stats-workspace">
      <StatsControls>
        <EntitySearchBox label="Competition" onSelect={setCompetition} placeholder="Search competition..." selected={competition} type="competition" />
        <label className="stats-field">Season<select onChange={(event) => setSeasonId(event.target.value)} value={seasonId}>
          {seasonOptions.length ? seasonOptions.map((season) => (
            <option key={season.id} value={season.id}>{season.label}</option>
          )) : <option value="">Current season</option>}
        </select></label>
        <button className="stats-load-button" disabled={!competition} onClick={load} type="button">Refresh</button>
      </StatsControls>

      <CompetitionVisualTable tableData={state.data} loading={state.status === 'loading'} />
      <CompetitionTableInsights tableData={state.data} />
    </section>
  )
}

function StatsControls({ children }) {
  return <div className="stats-controls">{children}</div>
}

function Statistics() {
  const [view, setView] = useState('team')
  const [picked, setPicked] = useState({ type: 'team', entity: null })
  const items = useMemo(() => [
    { value: 'team', label: 'Team', count: 'Form' },
    { value: 'h2h', label: 'H2H', count: 'Compare' },
    { value: 'player', label: 'Player', count: 'Output' },
    { value: 'competition', label: 'Competition', count: 'Table' },
  ], [])

  function handlePick(type, entity) {
    setPicked({ type, entity })
    setView(type === 'competition' ? 'competition' : type)
  }

  return (
    <div className="detail-page stats-page">
      <header className="detail-hero stats-hero">
        <span className="detail-hero__image detail-hero__image--empty"><BarChart3 size={34} /></span>
        <div className="detail-hero__content">
          <p className="eyebrow">XTRA90 data center</p>
          <h1>Statistics</h1>
          <div className="detail-meta">
            <span><Shield size={15} /> Team form</span>
            <span><GitCompare size={15} /> Head-to-head</span>
            <span><UserRound size={15} /> Player output</span>
            <span><Trophy size={15} /> Competition tables</span>
          </div>
        </div>
      </header>

      <GlobalStatsSearch onPick={handlePick} />

      <ChoiceBox ariaLabel="Statistics view" items={items} onChange={setView} value={view} />

      {view === 'team' ? <TeamStatsWorkspace selectedEntity={picked.type === 'team' ? picked.entity : null} /> : null}
      {view === 'h2h' ? <HeadToHeadWorkspace selectedEntity={picked.type === 'team' ? picked.entity : null} /> : null}
      {view === 'player' ? <PlayerStatsWorkspace selectedEntity={picked.type === 'player' ? picked.entity : null} /> : null}
      {view === 'competition' ? <CompetitionStatsWorkspace selectedEntity={picked.type === 'competition' ? picked.entity : null} /> : null}
    </div>
  )
}

export default Statistics
