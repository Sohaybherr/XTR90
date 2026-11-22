import { CalendarDays, Shield, Trophy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getCompetitionDetails } from '../../api/competitions'
import { getCompetitionTable } from '../../api/statistics'
import MatchCard from '../../components/cards/MatchCard'
import FavoriteButton from '../../components/common/FavoriteButton'
import { CompetitionVisualTable } from '../../components/statistics/StatisticsPanels'
import AccordionSection from '../../components/ui/AccordionSection'
import ChoiceBox from '../../components/ui/ChoiceBox'
import { useLocalizedPath } from '../../hooks/useLocalizedPath'
import { resolveAssetUrl } from '../../utils/assets'
import { formatCompetitionSeason } from '../../utils/seasons'

const STANDING_OUTCOMES = [
  { key: 'champion', label: 'Champion', className: 'league-table__marker--champion' },
  { key: 'champions-league', label: 'Champions League', className: 'league-table__marker--champions-league' },
  { key: 'champions-league-qualifying', label: 'Champions League qualifying', className: 'league-table__marker--champions-league-qualifying' },
  { key: 'europa-league', label: 'Europa League', className: 'league-table__marker--europa-league' },
  { key: 'conference-league', label: 'Conference League', className: 'league-table__marker--conference-league' },
  { key: 'promotion', label: 'Promotion', className: 'league-table__marker--promotion' },
  { key: 'playoff', label: 'Play-off', className: 'league-table__marker--playoff' },
  { key: 'relegation-playoff', label: 'Relegation play-off', className: 'league-table__marker--relegation-playoff' },
  { key: 'relegation', label: 'Relegation', className: 'league-table__marker--relegation' },
]

const STANDING_OUTCOME_BY_KEY = new Map(STANDING_OUTCOMES.map((item) => [item.key, item]))

function getStandingOutcome(row) {
  const description = String(row?.description || '').toLowerCase()
  if (!description) return null

  if (description.includes('champion') || description.includes('winner')) return STANDING_OUTCOME_BY_KEY.get('champion')
  if (description.includes('relegation') && (description.includes('play-off') || description.includes('playoff'))) return STANDING_OUTCOME_BY_KEY.get('relegation-playoff')
  if (description.includes('relegation')) return STANDING_OUTCOME_BY_KEY.get('relegation')
  if (description.includes('champions league') && (description.includes('qualif') || description.includes('qualification'))) return STANDING_OUTCOME_BY_KEY.get('champions-league-qualifying')
  if (description.includes('champions league')) return STANDING_OUTCOME_BY_KEY.get('champions-league')
  if (description.includes('europa league')) return STANDING_OUTCOME_BY_KEY.get('europa-league')
  if (description.includes('conference league')) return STANDING_OUTCOME_BY_KEY.get('conference-league')
  if (description.includes('promotion') && (description.includes('play-off') || description.includes('playoff'))) return STANDING_OUTCOME_BY_KEY.get('playoff')
  if (description.includes('promotion')) return STANDING_OUTCOME_BY_KEY.get('promotion')
  if (description.includes('play-off') || description.includes('playoff')) return STANDING_OUTCOME_BY_KEY.get('playoff')

  return null
}

function StandingTable({ standings }) {
  const toLocale = useLocalizedPath()
  const outcomes = standings.map((row) => getStandingOutcome(row))
  const legendItems = STANDING_OUTCOMES.filter((outcome) => outcomes.some((item) => item?.key === outcome.key))

  if (!standings.length) {
    return <p className="match-empty">No league table stored for this season.</p>
  }

  return (
    <div className="league-table">
      <div className="league-table__head">
        <span></span>
        <span>#</span>
        <span>Team</span>
        <span>MP</span>
        <span>W</span>
        <span>D</span>
        <span>L</span>
        <span>GD</span>
        <span>Pts</span>
        <span></span>
      </div>
      {standings.map((row, index) => {
        const outcome = outcomes[index]
        return (
        <Link className="league-table__row" to={toLocale(`/teams/${row.team?.id}`)} key={row.id}>
          <span
            className={`league-table__marker ${outcome?.className || ''}`}
            title={outcome?.label || row.description || 'No qualification marker'}
          ></span>
          <span>{row.rank ?? '-'}</span>
          <strong className="league-table__team">
            {resolveAssetUrl(row.team?.logo) ? <img src={resolveAssetUrl(row.team.logo)} alt="" loading="lazy" decoding="async" /> : null}
            <span>{row.team?.name || 'Team'}</span>
          </strong>
          <span>{row.played ?? '-'}</span>
          <span>{row.wins ?? '-'}</span>
          <span>{row.draws ?? '-'}</span>
          <span>{row.losses ?? '-'}</span>
          <span>{row.goalDifference ?? '-'}</span>
          <span>{row.points ?? '-'}</span>
          <FavoriteButton id={row.team?.id} type="team" />
        </Link>
        )
      })}
      {legendItems.length ? (
        <div className="league-table__legend">
          {legendItems.map((item) => (
            <span key={item.key}>
              <i className={`league-table__marker ${item.className}`}></i>
              {item.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function LeaderIdentity({ item, type }) {
  const toLocale = useLocalizedPath()
  const entity = type === 'team' ? item.team : item.player
  const image = resolveAssetUrl(type === 'team' ? entity?.logo : entity?.photo)
  const fallback = String(entity?.name || '?').charAt(0).toUpperCase()

  return (
    <span className="leader-row__identity">
      <Link className="leader-row__entity" to={toLocale(`/${type === 'team' ? 'teams' : 'players'}/${entity?.id}`)}>
        {image ? (
          <img src={image} alt="" loading="lazy" decoding="async" />
        ) : (
          <span>{fallback}</span>
        )}
        <strong>{entity?.name || (type === 'team' ? 'Team' : 'Player')}</strong>
      </Link>
      <FavoriteButton id={entity?.id} type={type} />
    </span>
  )
}

function LeaderBoard({ title, items = [], type = 'player', suffix = '' }) {
  if (!items.length) return null

  return (
    <section className="leader-board">
      <div className="leader-board__header">
        <h3>{title}</h3>
        <span>Top {items.length}</span>
      </div>
      <div className="leader-list">
        {items.map((item, index) => (
          <div className="leader-row" key={`${title}-${item.id}-${index}`}>
            <span>{index + 1}</span>
            <LeaderIdentity item={item} type={type} />
            {type === 'player' && item.team ? (
              <small>{item.team.name}</small>
            ) : null}
            <strong>{item.value}{suffix}</strong>
          </div>
        ))}
      </div>
    </section>
  )
}

function CompetitionStats({ stats }) {
  const playerStats = stats?.players || {}
  const teamStats = stats?.teams || {}
  const hasStats = [
    ...Object.values(playerStats),
    ...Object.values(teamStats),
  ].some((items) => Array.isArray(items) && items.length > 0)

  if (!hasStats) return null

  return (
    <AccordionSection className="detail-section detail-section--wide" title="Stats Leaders" defaultOpen lazy>
      <div className="leader-grid">
        <LeaderBoard title="Top Scorers" items={playerStats.goals} />
        <LeaderBoard title="Top Assists" items={playerStats.assists} />
        <LeaderBoard title="Player Cards" items={playerStats.cards} />
        <LeaderBoard title="Player Yellow Cards" items={playerStats.yellowCards} />
        <LeaderBoard title="Player Red Cards" items={playerStats.redCards} />
        <LeaderBoard title="Best Ratings" items={playerStats.ratings} />
        <LeaderBoard title="Goalkeeper Saves" items={playerStats.saves} />
        <LeaderBoard title="Team Goals" items={teamStats.goals} type="team" />
        <LeaderBoard title="Team Cards" items={teamStats.cards} type="team" />
        <LeaderBoard title="Team Yellow Cards" items={teamStats.yellowCards} type="team" />
        <LeaderBoard title="Team Red Cards" items={teamStats.redCards} type="team" />
        <LeaderBoard title="Team Shots" items={teamStats.shots} type="team" />
        <LeaderBoard title="Avg Team xG" items={teamStats.expectedGoals} type="team" />
        <LeaderBoard title="Max Team xG" items={teamStats.maxExpectedGoals} type="team" />
        <LeaderBoard title="Avg Possession" items={teamStats.possession} type="team" suffix="%" />
      </div>
    </AccordionSection>
  )
}

function formatCompactDate(value) {
  if (!value) return 'TBD'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function CompactTeam({ team, align = 'left' }) {
  const logo = resolveAssetUrl(team?.logo)
  const name = team?.name || 'Team'

  return (
    <span className={`compact-match__team compact-match__team--${align}`}>
      {logo ? <img src={logo} alt="" /> : <span className="compact-match__logo-empty">{name.charAt(0)}</span>}
      <span>{name}</span>
    </span>
  )
}

function CompactMatchRow({ match }) {
  const toLocale = useLocalizedPath()

  return (
    <Link className="compact-match" to={toLocale(`/matches/${match.id}`)}>
      <CompactTeam team={match.homeTeam} align="left" />
      <span className="compact-match__score">
        <strong>{match.score || 'vs'}</strong>
        <small>{formatCompactDate(match.time)}</small>
      </span>
      <CompactTeam team={match.awayTeam} align="right" />
      <FavoriteButton id={match.id} type="match" />
    </Link>
  )
}

const PATH_ROUNDS = ['Round of 32', 'Round of 16', 'Quarter-finals', 'Semi-finals', 'Final']
const PATH_START_ROUND = 'Round of 32'
const KNOCKOUT_ROUNDS = new Set([...PATH_ROUNDS, 'Third-place play-off'])
const DOMESTIC_CUP_API_IDS = new Set([45, 66, 81, 137, 143])
const DOMESTIC_CUP_NAME_PATTERNS = [
  /\bfa cup\b/i,
  /\bcopa del rey\b/i,
  /\bcoppa italia\b/i,
  /\bdfb[-\s]?pokal\b/i,
  /\bcoupe de france\b/i,
]

function getCompetitionApiId(competition) {
  return Number(competition?.api_id || competition?.apiId || competition?.competition_api_id || competition?.competitionApiId)
}

function isDomesticCupCompetition(competition) {
  const apiId = getCompetitionApiId(competition)
  const name = String(competition?.name || '').trim()
  return DOMESTIC_CUP_API_IDS.has(apiId) || DOMESTIC_CUP_NAME_PATTERNS.some((pattern) => pattern.test(name))
}

function normalizeRoundName(round) {
  const name = String(round || 'Other').trim()
  const lower = name.toLowerCase()

  if (['8th finals', 'eighth finals', '1/8-finals', '1/8 finals', 'last 16'].includes(lower)) {
    return 'Round of 16'
  }

  if (['16th finals', '1/16-finals', '1/16 finals'].includes(lower)) {
    return 'Round of 32'
  }

  if (['32nd finals', '1/32-finals', '1/32 finals'].includes(lower)) {
    return 'Round of 64'
  }

  if (['64th finals', '1/64-finals', '1/64 finals'].includes(lower)) {
    return 'Round of 128'
  }

  if (['128th finals', '1/128-finals', '1/128 finals'].includes(lower)) {
    return 'Round of 256'
  }

  const domesticRoundNames = {
    'extra preliminary round': 'Extra Preliminary Round',
    'preliminary round': 'Preliminary Round',
    '1st round qualifying': '1st Round Qualifying',
    '2nd round qualifying': '2nd Round Qualifying',
    '3rd round qualifying': '3rd Round Qualifying',
    '4th round qualifying': '4th Round Qualifying',
    '1st round': '1st Round',
    '2nd round': '2nd Round',
    '3rd round': '3rd Round',
    '4th round': '4th Round',
    '5th round': '5th Round',
    '6th round': '6th Round',
    'round of 256': 'Round of 256',
    'round of 128': 'Round of 128',
    'round of 64': 'Round of 64',
    'round of 32': 'Round of 32',
    'round of 16': 'Round of 16',
    'quarter-finals': 'Quarter-finals',
    'quarter finals': 'Quarter-finals',
    'semi-finals': 'Semi-finals',
    'semi finals': 'Semi-finals',
    final: 'Final',
  }

  if (domesticRoundNames[lower]) {
    return domesticRoundNames[lower]
  }

  if (['knockout round play-offs', 'knockout round playoffs'].includes(lower)) {
    return 'Round of 32'
  }

  if (['third place', 'third-place', 'third place play-off', 'third-place play-off', 'third place playoff', 'third-place playoff', 'third place final', '3rd place final', '3rd-place final'].includes(lower)) {
    return 'Third-place play-off'
  }

  return name
}

function getCompetitionFormat(competition) {
  const apiId = getCompetitionApiId(competition)
  const name = String(competition?.name || '').toLowerCase()

  if (apiId === 1 || name.includes('world cup')) {
    return {
      key: 'world-cup',
      groupMode: 'world',
      groupMatchdays: 3,
      knockoutRounds: ['Round of 32', 'Round of 16', 'Quarter-finals', 'Semi-finals', 'Third-place play-off', 'Final'],
      pathRounds: ['Round of 32', 'Round of 16', 'Quarter-finals', 'Semi-finals', 'Final'],
      hasThirdPlace: true,
    }
  }

  if (name.includes('africa cup of nations') || name.includes('caf africa cup') || name.includes('afcon')) {
    return {
      key: 'afcon',
      groupMode: 'groups',
      groupMatchdays: 3,
      knockoutRounds: ['Round of 16', 'Quarter-finals', 'Semi-finals', 'Third-place play-off', 'Final'],
      pathRounds: ['Round of 16', 'Quarter-finals', 'Semi-finals', 'Final'],
      hasThirdPlace: true,
    }
  }

  if (name.includes('copa america')) {
    return {
      key: 'copa-america',
      groupMode: 'groups',
      groupMatchdays: 3,
      knockoutRounds: ['Quarter-finals', 'Semi-finals', 'Third-place play-off', 'Final'],
      pathRounds: ['Quarter-finals', 'Semi-finals', 'Final'],
      hasThirdPlace: true,
    }
  }

  if (name.includes('euro championship') || name.includes('european championship')) {
    return {
      key: 'euro',
      groupMode: 'groups',
      groupMatchdays: 3,
      knockoutRounds: ['Round of 16', 'Quarter-finals', 'Semi-finals', 'Final'],
      pathRounds: ['Round of 16', 'Quarter-finals', 'Semi-finals', 'Final'],
      hasThirdPlace: false,
    }
  }

  if (name.includes('nations league')) {
    return {
      key: 'nations-league',
      groupMode: 'nations-league',
      groupMatchdays: 6,
      knockoutRounds: ['Quarter-finals', 'Semi-finals', 'Third-place play-off', 'Final'],
      pathRounds: ['Quarter-finals', 'Semi-finals', 'Final'],
      hasThirdPlace: true,
    }
  }

  return {
    key: 'generic',
    groupMode: 'groups',
    groupMatchdays: 3,
    knockoutRounds: null,
    pathRounds: null,
    hasThirdPlace: true,
  }
}

function PathLogo({ team }) {
  const logo = resolveAssetUrl(team?.logo)
  const name = team?.name || 'Team'

  return logo ? (
    <img className="path-match__logo" src={logo} alt={name} title={name} />
  ) : (
    <span className="path-match__logo path-match__logo--empty" title={name}>
      {name.charAt(0)}
    </span>
  )
}

function PathMatchTile({ pot, connects = false, style }) {
  const toLocale = useLocalizedPath()
  const className = `path-match${connects ? ' path-match--connects' : ''}${pot ? '' : ' path-match--empty'}`

  if (!pot) {
    return (
      <div className={className} style={style}>
        <span className="path-match__logo path-match__logo--empty">?</span>
        <span className="path-match__score">
          <strong>vs</strong>
        </span>
        <span className="path-match__logo path-match__logo--empty">?</span>
      </div>
    )
  }

  const content = (
    <>
      <PathLogo team={pot.homeTeam} />
      <span className="path-match__score">
        <strong>{pot.score || 'vs'}</strong>
        {pot.legScore ? <small>{pot.legScore}</small> : null}
      </span>
      <PathLogo team={pot.awayTeam} />
      {pot.isActualMatch ? <FavoriteButton id={pot.matchId} type="match" /> : null}
    </>
  )

  const commonProps = {
    className,
    style,
    title: `${pot.homeTeam?.name || 'TBD'} vs ${pot.awayTeam?.name || 'TBD'}`,
    'data-match-id': pot.matchId || undefined,
    'data-home-team-id': pot.homeTeam?.id || undefined,
    'data-away-team-id': pot.awayTeam?.id || undefined,
  }

  return pot.matchId ? (
    <Link
      {...commonProps}
      to={toLocale(`/matches/${pot.matchId}`)}
    >
      {content}
    </Link>
  ) : (
    <div {...commonProps}>
      {content}
    </div>
  )
}

function phaseOrder(name) {
  const normalized = normalizeRoundName(name)
  const order = {
    'Extra Preliminary Round': 1,
    'Preliminary Round': 2,
    '1st Round Qualifying': 3,
    '2nd Round Qualifying': 4,
    '3rd Round Qualifying': 5,
    '4th Round Qualifying': 6,
    '1st Round': 10,
    '2nd Round': 11,
    '3rd Round': 12,
    '4th Round': 13,
    '5th Round': 14,
    '6th Round': 15,
    'Round of 256': 20,
    'Round of 128': 21,
    'Round of 64': 22,
    'Round of 32': 23,
    'Round of 16': 24,
    'Quarter-finals': 25,
    'Semi-finals': 26,
    'Third-place play-off': 27,
    '3rd Place Final': 27,
    Final: 28,
  }

  return order[normalized] || 99
}

function isKnockoutRoundName(round) {
  return KNOCKOUT_ROUNDS.has(normalizeRoundName(round))
}

function formatLeagueRoundName(round) {
  const normalized = normalizeRoundName(round)
  if (normalized === 'Semi-finals') return 'Season play-offs - Semi-finals'
  if (normalized === 'Final') return 'Season play-offs - Final'
  return round
}

function groupByRound(fixtures) {
  const groups = fixtures.reduce((map, match) => {
    const name = normalizeRoundName(match.round)
    const current = map.get(name) || []
    current.push(match)
    map.set(name, current)
    return map
  }, new Map())

  return Array.from(groups.entries())
    .map(([name, matches]) => ({ name, matches }))
    .sort((a, b) => phaseOrder(a.name) - phaseOrder(b.name))
}

function matchDateTime(match) {
  const date = new Date(match?.time)
  return Number.isNaN(date.getTime()) ? Number.MAX_SAFE_INTEGER : date.getTime()
}

function sortMatchesByDate(matches) {
  return [...matches].sort((a, b) => matchDateTime(a) - matchDateTime(b))
}

function sortPotsByDate(pots) {
  return [...pots].sort((a, b) => matchDateTime(a?.matches?.[0]) - matchDateTime(b?.matches?.[0]))
}

function FixtureRounds({ fixtures, roundNameFormatter = (name) => name }) {
  const rounds = groupByRound(fixtures).map((round) => ({
    ...round,
    matches: sortMatchesByDate(round.matches),
  }))

  if (!rounds.length) {
    return <p className="match-empty">No fixtures stored.</p>
  }

  return (
    <div className="fixture-rounds">
      {rounds.map((round, index) => (
        <AccordionSection
          className="fixture-round"
          count={`${round.matches.length} matches`}
          defaultOpen={index === 0}
          key={round.name}
          lazy
          title={roundNameFormatter(round.name)}
        >
          <div className="match-list">
            {round.matches.map((match) => <MatchCard key={match.id} match={match} />)}
          </div>
        </AccordionSection>
      ))}
    </div>
  )
}

function getTeamId(team) {
  return team?.id == null ? '' : String(team.id)
}

function matchTeamIds(match) {
  return [getTeamId(match?.homeTeam), getTeamId(match?.awayTeam)].filter(Boolean)
}

function potContainsTeam(pot, teamId) {
  if (!teamId || !pot) return false
  return pot.homeTeamId === String(teamId) || pot.awayTeamId === String(teamId) || pot.winnerTeamId === String(teamId)
}

function getTeamSeed(team) {
  return {
    id: team?.id,
    name: team?.name || 'Team',
    logo: team?.logo,
  }
}

function getGroupLabel(index) {
  return `Group ${String.fromCharCode(65 + index)}`
}

function getExplicitGroupName(round) {
  const match = String(round || '').trim().match(/^group\s+([a-z0-9]+)(?:\s*-|\s*$)/i)
  if (!match) return null
  if (match[1].toLowerCase() === 'stage') return null

  return `Group ${match[1].toUpperCase()}`
}

function isGroupRound(round) {
  const name = String(round || '').trim().toLowerCase()
  return name.startsWith('group stage') || Boolean(getExplicitGroupName(round))
}

function toScoreNumber(value) {
  if (value == null) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function sortGroupMatches(matches) {
  return matches.sort((a, b) => {
    const aDate = new Date(a.time)
    const bDate = new Date(b.time)
    return (aDate.getTime() || 0) - (bDate.getTime() || 0)
  })
}

function buildConnectedGroupStage(groupFixtures) {
  const parent = new Map()
  const teams = new Map()

  function ensure(team) {
    const id = getTeamId(team)
    if (!id) return ''
    if (!parent.has(id)) parent.set(id, id)
    if (!teams.has(id)) teams.set(id, getTeamSeed(team))
    return id
  }

  function find(id) {
    const root = parent.get(id)
    if (root === id) return id
    const next = find(root)
    parent.set(id, next)
    return next
  }

  function union(a, b) {
    if (!a || !b) return
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent.set(rootB, rootA)
  }

  groupFixtures.forEach((match) => {
    const homeId = ensure(match.homeTeam)
    const awayId = ensure(match.awayTeam)
    union(homeId, awayId)
  })

  const groups = new Map()

  groupFixtures.forEach((match) => {
    const root = find(getTeamId(match.homeTeam) || getTeamId(match.awayTeam))
    const group = groups.get(root) || { matches: [], teamIds: new Set() }
    group.matches.push(match)
    group.teamIds.add(getTeamId(match.homeTeam))
    group.teamIds.add(getTeamId(match.awayTeam))
    groups.set(root, group)
  })

  return Array.from(groups.values())
    .map((group, index) => ({
      name: getGroupLabel(index),
      teams: Array.from(group.teamIds).map((id) => teams.get(id)).filter(Boolean),
      matches: sortGroupMatches(group.matches),
    }))
    .sort((a, b) => {
      const aDate = new Date(a.matches[0]?.time)
      const bDate = new Date(b.matches[0]?.time)
      return (aDate.getTime() || 0) - (bDate.getTime() || 0)
    })
    .map((group, index) => ({ ...group, name: getGroupLabel(index) }))
}

function getLeaguePhaseName(round) {
  const match = String(round || '').match(/^(League\s+[A-Z])/i)
  return match ? match[1].replace(/\s+/g, ' ') : 'League Phase'
}

function buildNationsLeagueGroups(fixtures) {
  const leagueMatches = fixtures.filter((match) => /^league\s+[a-z]\s*-/i.test(String(match.round || '')))
  const byLeague = leagueMatches.reduce((map, match) => {
    const leagueName = getLeaguePhaseName(match.round)
    const rows = map.get(leagueName) || []
    rows.push(match)
    map.set(leagueName, rows)
    return map
  }, new Map())

  return Array.from(byLeague.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([leagueName, matches]) => (
      buildConnectedGroupStage(matches).map((group, index) => ({
        ...group,
        name: `${leagueName} - Group ${index + 1}`,
      }))
    ))
}

function buildGroupStage(fixtures, format = getCompetitionFormat({ name: 'Generic' }), seasonYear = null) {
  if (format.groupMode === 'nations-league') {
    return buildNationsLeagueGroups(fixtures)
  }

  const groupFixtures = filterMainTournamentGroupMatches(fixtures, format, seasonYear)
  const explicitGroups = new Map()

  groupFixtures.forEach((match) => {
    const name = getExplicitGroupName(match.round)
    if (!name) return

    const group = explicitGroups.get(name) || { name, matches: [], teamIds: new Set(), teams: new Map() }
    group.matches.push(match)
    ;[match.homeTeam, match.awayTeam].forEach((team) => {
      const id = getTeamId(team)
      if (id == null) return
      group.teamIds.add(id)
      group.teams.set(id, team)
    })
    explicitGroups.set(name, group)
  })

  if (explicitGroups.size) {
    return Array.from(explicitGroups.values())
      .map((group) => ({
        name: group.name,
        teams: Array.from(group.teamIds).map((id) => group.teams.get(id)).filter(Boolean),
        matches: sortGroupMatches(group.matches),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  }

  return buildConnectedGroupStage(groupFixtures)
}

function getRoundNumber(round) {
  const match = String(round || '').match(/-\s*(\d+)\s*$/)
  return match ? Number(match[1]) : null
}

function expectedFinalGroupMatchCount(format, seasonYear, groupFixtures) {
  const year = Number(seasonYear)
  const teamIds = new Set()
  groupFixtures.forEach((match) => {
    matchTeamIds(match).forEach((teamId) => teamIds.add(teamId))
  })

  if (format?.key === 'world-cup') return year >= 2026 ? 72 : 48
  if (format?.key === 'euro') return 36
  if (format?.key === 'afcon') return year >= 2019 ? 36 : 24
  if (format?.key === 'copa-america') {
    if (year >= 2024) return 24
    if (year >= 2021) return 20
    return 18
  }

  const groupSize = format?.groupSize || 4
  const groupCount = Math.max(1, Math.ceil(teamIds.size / groupSize))
  return groupCount * ((groupSize * (groupSize - 1)) / 2)
}

function isKnownFinalTournamentFormat(format) {
  return ['world-cup', 'euro', 'afcon', 'copa-america'].includes(format?.key)
}

function filterMainTournamentGroupMatches(fixtures, format, seasonYear) {
  const groupFixtures = fixtures.filter((match) => isGroupRound(match.round))
  if (!groupFixtures.length) return []

  const expectedCount = expectedFinalGroupMatchCount(format, seasonYear, groupFixtures)
  const knockoutStart = Math.min(
    ...fixtures
      .filter((match) => !isGroupRound(match.round) && ['Round of 32', 'Round of 16', '8th Finals', 'Quarter-finals', 'Semi-finals', 'Third-place play-off', '3rd Place Final', 'Final'].includes(normalizeRoundName(match.round)))
      .map((match) => matchDateTime(match))
      .filter((value) => Number.isFinite(value))
  )

  if (Number.isFinite(knockoutStart)) {
    const windowDays = format?.key === 'afcon' ? 45 : 35
    const windowStart = knockoutStart - windowDays * 24 * 60 * 60 * 1000
    const nearKnockout = groupFixtures.filter((match) => {
      const time = matchDateTime(match)
      return Number.isFinite(time) && time >= windowStart && time < knockoutStart
    })

    if (nearKnockout.length) return nearKnockout
  }

  if (isKnownFinalTournamentFormat(format) && groupFixtures.length > expectedCount) {
    return sortMatchesByDate(groupFixtures).slice(-expectedCount)
  }

  const explicit = groupFixtures.some((match) => getExplicitGroupName(match.round))
  if (explicit) return groupFixtures

  const expectedMatchdays = format?.groupMatchdays || 3
  const numbered = groupFixtures.filter((match) => getRoundNumber(match.round) != null)
  if (!numbered.length) return groupFixtures

  const roundCounts = numbered.reduce((map, match) => {
    const roundNumber = getRoundNumber(match.round)
    map.set(roundNumber, (map.get(roundNumber) || 0) + 1)
    return map
  }, new Map())

  const likelyRounds = Array.from(roundCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, expectedMatchdays)
    .map(([roundNumber]) => roundNumber)
    .sort((a, b) => a - b)

  return numbered.filter((match) => likelyRounds.includes(getRoundNumber(match.round)))
}

function buildGroupStandings(group) {
  const rows = new Map()

  group.teams.forEach((team) => {
    rows.set(getTeamId(team), {
      id: `${group.name}-${team.id}`,
      rank: 0,
      team,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
    })
  })

  group.matches.forEach((match) => {
    if (typeof match.homeGoals !== 'number' || typeof match.awayGoals !== 'number') return

    const home = rows.get(getTeamId(match.homeTeam))
    const away = rows.get(getTeamId(match.awayTeam))
    if (!home || !away) return

    home.played += 1
    away.played += 1
    home.goalsFor += match.homeGoals
    home.goalsAgainst += match.awayGoals
    away.goalsFor += match.awayGoals
    away.goalsAgainst += match.homeGoals

    if (match.homeGoals > match.awayGoals) {
      home.wins += 1
      home.points += 3
      away.losses += 1
    } else if (match.homeGoals < match.awayGoals) {
      away.wins += 1
      away.points += 3
      home.losses += 1
    } else {
      home.draws += 1
      away.draws += 1
      home.points += 1
      away.points += 1
    }

    home.goalDifference = home.goalsFor - home.goalsAgainst
    away.goalDifference = away.goalsFor - away.goalsAgainst
  })

  return Array.from(rows.values())
    .sort((a, b) => (
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.team.name.localeCompare(b.team.name)
    ))
    .map((row, index) => ({ ...row, rank: index + 1 }))
}

function getBracketRow(index, count, totalRows) {
  const step = totalRows / Math.max(count, 1)
  return Math.max(1, Math.round(index * step + step / 2))
}

function expectedPathMatchCount(name, fallback) {
  const counts = {
    'Round of 256': 128,
    'Round of 128': 64,
    'Round of 64': 32,
    'Round of 32': 16,
    'Round of 16': 8,
    'Quarter-finals': 4,
    'Semi-finals': 2,
    Final: 1,
  }

  return counts[name] || fallback || 1
}

function getPathRoundNames(phases, format) {
  if (format?.pathRounds?.length) return format.pathRounds

  if (format?.key === 'domestic-cup') {
    const excluded = /qualifying|replay|preliminary/i
    return phases
      .map((phase) => phase.name)
      .filter((name) => !excluded.test(name))
      .filter((name) => ['1st Round', '2nd Round', '3rd Round', '4th Round', '5th Round', '6th Round', 'Round of 256', 'Round of 128', 'Round of 64', 'Round of 32', 'Round of 16', 'Quarter-finals', 'Semi-finals', 'Final'].includes(normalizeRoundName(name)))
      .filter((name) => phaseOrder(name) >= phaseOrder('Round of 32'))
      .sort((a, b) => phaseOrder(a) - phaseOrder(b))
  }

  const available = phases
    .map((phase) => phase.name)
    .filter((name) => PATH_ROUNDS.includes(normalizeRoundName(name)) && phaseOrder(name) >= phaseOrder(PATH_START_ROUND))

  return available.length ? available : ['Round of 32', 'Round of 16', 'Quarter-finals', 'Semi-finals', 'Final']
}

function getMatchScore(match) {
  const home = toScoreNumber(match?.homeGoals)
  const away = toScoreNumber(match?.awayGoals)
  if (home == null || away == null) return null
  return { home, away }
}

function getPenaltyWinner(match) {
  const home = toScoreNumber(match?.penaltyHome)
  const away = toScoreNumber(match?.penaltyAway)
  if (home == null || away == null || home === away) return null
  return home > away ? match.homeTeam : match.awayTeam
}

function getMatchWinner(match) {
  const score = getMatchScore(match)
  if (score) {
    if (score.home > score.away) return match.homeTeam
    if (score.away > score.home) return match.awayTeam
  }
  return getPenaltyWinner(match)
}

function getCompetitionWinner(fixtures) {
  const finals = sortMatchesByDate(fixtures.filter((match) => normalizeRoundName(match.round) === 'Final'))
  const final = finals[finals.length - 1]
  if (!final) return null

  const winner = getMatchWinner(final)
  if (!winner) return null

  return {
    match: final,
    team: getTeamSeed(winner),
  }
}

function buildTiePot(roundName, matches) {
  const orderedMatches = sortMatchesByDate(matches)
  const firstMatch = orderedMatches[0]
  const lastMatch = orderedMatches[orderedMatches.length - 1]
  if (!firstMatch) return null

  const homeTeam = getTeamSeed(firstMatch.homeTeam)
  const awayTeam = getTeamSeed(firstMatch.awayTeam)
  const homeTeamId = getTeamId(homeTeam)
  const awayTeamId = getTeamId(awayTeam)
  let homeAggregate = 0
  let awayAggregate = 0
  let completeScores = true

  orderedMatches.forEach((match) => {
    const score = getMatchScore(match)
    if (!score) {
      completeScores = false
      return
    }

    if (getTeamId(match.homeTeam) === homeTeamId) {
      homeAggregate += score.home
      awayAggregate += score.away
    } else {
      homeAggregate += score.away
      awayAggregate += score.home
    }
  })

  const firstScore = getMatchScore(firstMatch)
  const legScore = orderedMatches.length > 1 && firstScore ? `${firstScore.home}-${firstScore.away}` : ''
  const score = completeScores
    ? `${homeAggregate} - ${awayAggregate}`
    : firstMatch.score || null
  const winnerTeam = completeScores && homeAggregate !== awayAggregate
    ? (homeAggregate > awayAggregate ? homeTeam : awayTeam)
    : getPenaltyWinner(lastMatch)

  return {
    id: `${roundName}-${homeTeamId || 'home'}-${awayTeamId || 'away'}`,
    round: roundName,
    matchId: lastMatch.id,
    matches: orderedMatches,
    homeTeam,
    awayTeam,
    homeTeamId,
    awayTeamId,
    homeMatchId: firstMatch.id,
    awayMatchId: firstMatch.id,
    winnerTeam: winnerTeam ? getTeamSeed(winnerTeam) : null,
    winnerTeamId: winnerTeam ? getTeamId(winnerTeam) : '',
    score,
    legScore,
    isActualMatch: true,
  }
}

function buildRoundPots(matches, roundName) {
  const groups = new Map()

  sortMatchesByDate(matches).forEach((match) => {
    const ids = matchTeamIds(match).sort()
    const key = ids.length === 2 ? ids.join(':') : String(match.id)
    const current = groups.get(key) || []
    current.push(match)
    groups.set(key, current)
  })

  return sortPotsByDate(Array.from(groups.values()).map((items) => buildTiePot(roundName, items)).filter(Boolean))
}

function emptyPot(roundName, index) {
  return {
    id: `${roundName}-empty-${index}`,
    round: roundName,
    matchId: null,
    homeTeam: null,
    awayTeam: null,
    homeTeamId: '',
    awayTeamId: '',
    homeMatchId: null,
    awayMatchId: null,
    winnerTeam: null,
    winnerTeamId: '',
    score: null,
    legScore: '',
    isActualMatch: false,
  }
}

function seedNextRoundPot(pot, side, winnerTeam, feederMatchId) {
  if (!winnerTeam) return pot
  const nextPot = { ...pot }
  const team = getTeamSeed(winnerTeam)

  if (side === 'home' && !nextPot.homeTeam) {
    nextPot.homeTeam = team
    nextPot.homeTeamId = getTeamId(team)
    nextPot.homeMatchId = feederMatchId
  }

  if (side === 'away' && !nextPot.awayTeam) {
    nextPot.awayTeam = team
    nextPot.awayTeamId = getTeamId(team)
    nextPot.awayMatchId = feederMatchId
  }

  if (!nextPot.matchId) nextPot.matchId = feederMatchId
  return nextPot
}

function orderPreviousPotsByNextRound(previousPots, nextPots) {
  const remaining = [...previousPots]
  const ordered = []

  function takeFeeder(teamId) {
    const index = remaining.findIndex((pot) => potContainsTeam(pot, teamId))
    if (index < 0) return null
    return remaining.splice(index, 1)[0]
  }

  nextPots.forEach((nextPot) => {
    ;[nextPot?.homeTeamId, nextPot?.awayTeamId].filter(Boolean).forEach((teamId) => {
      const feeder = takeFeeder(teamId)
      if (feeder && !ordered.some((pot) => pot.id === feeder.id)) {
        ordered.push(feeder)
      }
    })
  })

  return [...ordered, ...remaining]
}

function orderPathPots(pathPhases) {
  const ordered = pathPhases.map((phase) => ({
    ...phase,
    pots: sortPotsByDate(phase.pots),
  }))

  for (let index = ordered.length - 2; index >= 0; index -= 1) {
    ordered[index] = {
      ...ordered[index],
      pots: orderPreviousPotsByNextRound(ordered[index].pots, ordered[index + 1].pots),
    }
  }

  return ordered
}

function buildPathPhases(fixtures, format) {
  const phases = groupByRound(fixtures)
  const phaseMap = new Map(phases.map((phase) => [phase.name, phase]))
  const names = getPathRoundNames(phases, format)
  const pathPhases = orderPathPots(names.map((name) => {
    const matches = phaseMap.get(name)?.matches || []
    const pots = buildRoundPots(matches, name)
    const expectedCount = expectedPathMatchCount(name, pots.length)
    return {
      name,
      pots: Array.from({ length: expectedCount }, (_, index) => pots[index] || emptyPot(name, index)),
    }
  }))

  for (let index = 1; index < pathPhases.length; index += 1) {
    const previous = pathPhases[index - 1]
    const current = pathPhases[index]

    previous.pots.forEach((previousPot, previousIndex) => {
      const targetIndex = Math.floor(previousIndex / 2)
      const side = previousIndex % 2 === 0 ? 'home' : 'away'
      current.pots[targetIndex] = seedNextRoundPot(
        current.pots[targetIndex] || emptyPot(current.name, targetIndex),
        side,
        previousPot.winnerTeam,
        previousPot.matchId
      )
    })
  }

  return pathPhases
}

function TournamentRound({ phase, connects, totalRows }) {
  const expectedCount = expectedPathMatchCount(phase.name, phase.pots.length)
  const slots = Array.from({ length: expectedCount }, (_, index) => phase.pots[index] || null)

  return (
    <section className="tournament-phase knockout-round">
      <div className="tournament-phase__header">
        <h3>{phase.name}</h3>
        <span>{phase.pots.filter((pot) => pot?.isActualMatch).length} matches</span>
      </div>
      <div className="path-match-list knockout-round__matches">
        {slots.map((pot, index) => (
            <PathMatchTile
              connects={connects}
              key={pot?.id || `${phase.name}-${index}`}
              pot={pot}
              style={{
                gridRow: `${getBracketRow(index, expectedCount, totalRows)} / span 2`,
                '--connector-span': `${(totalRows / expectedCount) * 24}px`,
              }}
            />
        ))}
      </div>
    </section>
  )
}

function KnockoutStageMatches({ fixtures, format }) {
  const phases = groupByRound(fixtures)
  const phaseMap = new Map(phases.map((phase) => [phase.name, phase]))
  const expected = format?.knockoutRounds?.length ? format.knockoutRounds : phases.map((phase) => phase.name)

  const displayPhases = expected.map((name) => phaseMap.get(name) || { name, matches: [] })

  return (
    <div className="knockout-matchdays">
      {displayPhases.map((phase, index) => (
        <AccordionSection
          className="group-matchday"
          count={`${phase.matches.length} matches`}
          defaultOpen={index === 0}
          key={phase.name}
          lazy
          title={phase.name}
        >
          <div className="compact-match-list">
            {phase.matches.length ? (
              phase.matches.map((match) => <CompactMatchRow key={match.id} match={match} />)
            ) : (
              <p className="match-empty">Fixtures not available yet.</p>
            )}
          </div>
        </AccordionSection>
      ))}
    </div>
  )
}

function TournamentPath({ fixtures, format }) {
  const displayPhases = buildPathPhases(fixtures, format)
  const totalRows = Math.max(16, (displayPhases[0]?.pots.length || 8) * 2)

  return (
    <div className="tournament-path knockout-bracket">
      {displayPhases.map((phase, index) => (
        <TournamentRound
          connects={index < displayPhases.length - 1}
          phase={phase}
          key={phase.name}
          totalRows={totalRows}
        />
      ))}
    </div>
  )
}

function TournamentGroups({ fixtures, format, seasonYear }) {
  const groups = format?.groupMode === 'world' ? buildGroupStage(fixtures, format, seasonYear) : buildGroupStage(fixtures, format, seasonYear)

  return (
    <div className="world-cup-groups">
      {groups.length ? (
        groups.map((group, index) => (
          <AccordionSection
            className="world-cup-group"
            count={`${group.teams.length} teams`}
            defaultOpen={index === 0}
            key={group.name}
            lazy
            title={group.name}
          >
            <StandingTable standings={buildGroupStandings(group)} />
          </AccordionSection>
        ))
      ) : (
        <p className="match-empty">Group fixtures not available yet.</p>
      )}
    </div>
  )
}

function GroupStageMatches({ fixtures, format, seasonYear }) {
  const groups = format?.groupMode === 'world' ? buildGroupStage(fixtures, format, seasonYear) : buildGroupStage(fixtures, format, seasonYear)

  return (
    <div className="group-matchdays">
      {groups.length ? (
        groups.map((group, index) => (
          <AccordionSection
            className="group-matchday"
            count={`${group.matches.length} matches`}
            defaultOpen={index === 0}
            key={group.name}
            lazy
            title={group.name}
          >
            <div className="compact-match-list">
              {group.matches.map((match) => <CompactMatchRow key={match.id} match={match} />)}
            </div>
          </AccordionSection>
        ))
      ) : (
        <p className="match-empty">Group fixtures not available yet.</p>
      )}
    </div>
  )
}

function isChampionsLeagueQualificationRound(round) {
  const name = String(round || '').toLowerCase()
  return name.includes('qualifying') || name === 'play-offs'
}

function isLeaguePhaseRound(round) {
  return String(round || '').toLowerCase().startsWith('league stage')
}

function teamsFromStandings(standings) {
  return standings
    .map((row) => row.team)
    .filter(Boolean)
    .map((team) => ({
      id: team.id,
      name: team.name,
      code: team.code || team.shortName || '-',
      country_name_snapshot: 'League phase',
    }))
}

function teamsFromFixtures(fixtures) {
  const byId = new Map()

  fixtures.forEach((match) => {
    ;[match.homeTeam, match.awayTeam].forEach((team) => {
      const id = getTeamId(team)
      if (!id || byId.has(id)) return
      byId.set(id, {
        id: team.id,
        name: team.name,
        code: '-',
        country_name_snapshot: 'Main tournament',
      })
    })
  })

  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name))
}

function teamsFromGroupStage(fixtures) {
  const groupTeams = teamsFromFixtures(fixtures.filter((match) => isGroupRound(match.round)))
  return groupTeams.length ? groupTeams : teamsFromFixtures(fixtures)
}

function seasonOptionKey(season, competition) {
  const label = formatCompetitionSeason(season, competition)
  const year = season?.season_year || String(season?.name || '').match(/\b(19|20)\d{2}\b/)?.[0]
  const normalizedLabel = String(label || '').trim().toLowerCase().replace(/\s+/g, ' ')
  return normalizedLabel ? `label:${normalizedLabel}` : `season:${year || season?.id || ''}`
}

function preferSeasonOption(candidate, existing, currentId) {
  if (!existing) return true

  const candidateIsCurrent = currentId && String(candidate.id) === currentId
  const existingIsCurrent = currentId && String(existing.id) === currentId
  if (candidateIsCurrent !== existingIsCurrent) return candidateIsCurrent

  const candidateHasCompetitionSeasonData = Boolean(candidate.season_year && (candidate.start_date || candidate.end_date))
  const existingHasCompetitionSeasonData = Boolean(existing.season_year && (existing.start_date || existing.end_date))
  if (candidateHasCompetitionSeasonData !== existingHasCompetitionSeasonData) return candidateHasCompetitionSeasonData

  return Number(candidate.id || 0) > Number(existing.id || 0)
}

function uniqueSeasonsByLabel(seasons, currentSeason, competition) {
  const currentId = currentSeason?.id == null ? '' : String(currentSeason.id)
  const seasonMap = new Map()

  seasons.forEach((season) => {
    const label = formatCompetitionSeason(season, competition)
    const key = seasonOptionKey(season, competition)
    const existing = seasonMap.get(key)

    if (preferSeasonOption(season, existing, currentId)) {
      seasonMap.set(key, { ...season, label })
    }
  })

  return Array.from(seasonMap.values())
}

function isNationalLeaguePhaseRound(round) {
  const name = String(round || '').toLowerCase()
  return name.includes('league') && !name.includes('quarter') && !name.includes('semi') && !name.includes('final')
}

function CompetitionWinnerBadge({ competition, winner }) {
  if (!winner?.team) return null

  const competitionLogo = resolveAssetUrl(competition?.logo)
  const teamLogo = resolveAssetUrl(winner.team.logo)

  return (
    <div className="competition-winner">
      {competitionLogo ? <img src={competitionLogo} alt="" /> : <Trophy size={18} />}
      <span>Winner</span>
      {teamLogo ? <img src={teamLogo} alt="" /> : null}
      <strong>{winner.team.name}</strong>
    </div>
  )
}

const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN'])

function formatPercent(value) {
  if (!Number.isFinite(value)) return '0%'
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`
}

function matchTimeValue(match) {
  const date = new Date(match?.time || match?.kickoff_at || match?.match_date || 0)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

function matchStatusShort(match) {
  return String(match?.status_short || match?.status || '').toUpperCase()
}

function getCompetitionSummary({ competition, currentSeason, teams, fixtures, standings, stats, winner, isCup, hasPath }) {
  const now = Date.now()
  const orderedMatches = [...fixtures].sort((a, b) => matchTimeValue(a) - matchTimeValue(b))
  const playedMatches = orderedMatches.filter((match) => FINISHED_STATUSES.has(matchStatusShort(match)))
  const upcomingMatches = orderedMatches.filter((match) => matchTimeValue(match) >= now && !FINISHED_STATUSES.has(matchStatusShort(match)))
  const nextMatch = upcomingMatches[0] || null
  const latestMatch = [...playedMatches].reverse()[0] || null
  const leadingTeam = standings[0]?.team?.name || null
  const leadingPoints = standings[0]?.points
  const topScorer = stats?.players?.goals?.[0]
  const topScorerName = topScorer?.player?.name || null
  const bestAttack = stats?.teams?.goals?.[0]
  const bestAttackName = bestAttack?.team?.name || null
  const stage = nextMatch?.round || latestMatch?.round || (isCup ? 'Tournament rounds' : 'League season')
  const seasonLabel = formatCompetitionSeason(currentSeason, competition)
  const progress = fixtures.length ? (playedMatches.length / fixtures.length) * 100 : 0
  const roundCounts = orderedMatches.reduce((map, match) => {
    const round = match.round || 'Other'
    map.set(round, (map.get(round) || 0) + 1)
    return map
  }, new Map())
  const stageItems = Array.from(roundCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, count]) => ({ name, count }))
  const statusLabel = winner?.team?.name
    ? 'Completed'
    : upcomingMatches.length && playedMatches.length
      ? 'In progress'
      : upcomingMatches.length
        ? 'Upcoming'
        : playedMatches.length
          ? 'Results stored'
          : 'No match data'
  const focusItems = [
    standings.length ? { label: 'Table', value: `${standings.length} ranked teams`, target: 'table' } : null,
    fixtures.length ? { label: 'Matches', value: `${fixtures.length} fixtures loaded`, target: 'fixtures' } : null,
    teams.length ? { label: 'Squads', value: `${teams.length} participants`, target: 'teams' } : null,
    hasPath ? { label: 'Route', value: 'Knockout path available', target: 'path' } : null,
    topScorerName ? { label: 'Leaders', value: `${topScorerName} leads scorers`, target: 'stats' } : null,
  ].filter(Boolean).slice(0, 4)

  return {
    headline: winner?.team?.name
      ? `${winner.team.name} won ${seasonLabel}.`
      : nextMatch
        ? `${seasonLabel} is around ${stage}.`
        : playedMatches.length
          ? `${seasonLabel} has ${playedMatches.length} stored result${playedMatches.length === 1 ? '' : 's'}.`
          : `${seasonLabel} is ready, but no match results are stored yet.`,
    stage,
    statusLabel,
    progressLabel: formatPercent(progress),
    progress,
    nextMatch,
    latestMatch,
    stageItems,
    focusItems,
    cards: [
      { label: 'Season', value: seasonLabel, detail: currentSeason?.start_date || currentSeason?.end_date ? `${currentSeason.start_date || 'TBD'} - ${currentSeason.end_date || 'TBD'}` : competition?.type || 'Competition' },
      { label: 'Teams', value: teams.length, detail: `${competition?.type || 'Competition'} participants` },
      { label: 'Matches', value: fixtures.length, detail: `${playedMatches.length} played, ${upcomingMatches.length} upcoming` },
      { label: winner?.team?.name ? 'Winner' : leadingTeam ? 'Leader' : topScorerName ? 'Top scorer' : 'Current stage', value: winner?.team?.name || leadingTeam || topScorerName || stage, detail: winner?.team?.name ? 'Champion stored for this season' : leadingTeam ? `${leadingPoints ?? '-'} points` : topScorerName ? `${topScorer.value} goals` : 'Latest known phase' },
      { label: 'Status', value: statusLabel, detail: `${formatPercent(progress)} of fixtures played` },
      { label: bestAttackName ? 'Best attack' : 'Stats', value: bestAttackName || 'Not loaded', detail: bestAttackName ? `${bestAttack.value} goals` : 'No leader stats stored' },
    ],
  }
}

function CompetitionSummary({ summary, onSelectView }) {
  return (
    <section className="competition-summary" aria-label="Competition summary">
      <div className="competition-summary__intro">
        <span>Summary</span>
        <h2>{summary.headline}</h2>
        <p>{summary.stage}</p>
        <div className="competition-summary__progress" aria-label={`Season progress ${summary.progressLabel}`}>
          <span style={{ width: summary.progressLabel }} />
        </div>
        <small>{summary.statusLabel} - {summary.progressLabel} played</small>
      </div>

      <div className="competition-summary__cards">
        {summary.cards.map((card) => (
          <div className="competition-summary-card" key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.detail}</small>
          </div>
        ))}
      </div>

      <div className="competition-summary__stages">
        <span>Stage map</span>
        <div>
          {summary.stageItems.length ? summary.stageItems.map((item) => (
            <small key={item.name}>
              <strong>{item.name}</strong>
              {item.count} matches
            </small>
          )) : <p className="match-empty">No round breakdown stored.</p>}
        </div>
      </div>

      <div className="competition-summary__focus">
        <span>Check next</span>
        <div>
          {summary.focusItems.map((item) => (
            <button type="button" key={item.label} onClick={() => onSelectView(item.target)}>
              <strong>{item.label}</strong>
              <small>{item.value}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="competition-summary__matches">
        <div>
          <span>Next</span>
          {summary.nextMatch ? <CompactMatchRow match={summary.nextMatch} /> : <p className="match-empty">No upcoming match stored.</p>}
        </div>
        <div>
          <span>Recent</span>
          {summary.latestMatch ? <CompactMatchRow match={summary.latestMatch} /> : <p className="match-empty">No recent result stored.</p>}
        </div>
      </div>
    </section>
  )
}

function Competition() {
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const seasonId = searchParams.get('seasonId')
  const [details, setDetails] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [activeView, setActiveView] = useState('overview')
  const [visualTable, setVisualTable] = useState({ data: null, status: 'idle' })

  useEffect(() => {
    let active = true
    setStatus('loading')
    setVisualTable({ data: null, status: 'loading' })
    getCompetitionDetails(id, seasonId)
      .then((response) => {
        if (!active) return
        setDetails(response.data)
        setStatus('ready')
        const resolvedSeasonId = seasonId || response.data?.currentSeason?.id
        return getCompetitionTable(id, { seasonId: resolvedSeasonId })
      })
      .then((response) => {
        if (active && response) setVisualTable({ data: response.data, status: 'ready' })
      })
      .catch((requestError) => {
        if (!active) return
        if (requestError?.config?.url?.includes('/statistics/')) {
          setVisualTable({ data: null, status: 'error' })
          return
        }
        setError(requestError?.response?.data?.error || 'Could not load competition details.')
        setStatus('error')
      })

    return () => {
      active = false
    }
  }, [id, seasonId])

  function handleSeasonChange(event) {
    setSearchParams(event.target.value ? { seasonId: event.target.value } : {})
  }

  if (status === 'loading') return <div className="state-message detail-page">Loading competition...</div>
  if (status === 'error') return <div className="state-message state-message--error detail-page">{error}</div>

  const { competition, currentSeason, seasons = [], standings = [], teams = [], fixtures = [], stats = null } = details
  const logo = resolveAssetUrl(competition?.logo)
  const isLeague = String(competition?.type || '').toLowerCase() === 'league'
  const isCup = String(competition?.type || '').toLowerCase() === 'cup'
  const competitionFormat = getCompetitionFormat(competition)
  const isChampionsLeague = Number(competition?.api_id || competition?.apiId) === 2
  const isDomesticCup = isDomesticCupCompetition(competition)
  const seasonYear = Number(currentSeason?.season_year || currentSeason?.name)
  const usesChampionsLeagueLeaguePhase = isChampionsLeague && seasonYear >= 2024
  const usesChampionsLeagueClassicGroups = isChampionsLeague && !usesChampionsLeagueLeaguePhase
  const pathFormat = isDomesticCup ? { key: 'domestic-cup' } : competitionFormat
  const seasonOptions = uniqueSeasonsByLabel(seasons, currentSeason, competition)
  const matchCards = fixtures.map((match) => ({
    id: match.id,
    round: match.round,
    time: match.kickoff_at || match.match_date,
    status: match.status_short || match.status,
    homeGoals: toScoreNumber(match.home_goals),
    awayGoals: toScoreNumber(match.away_goals),
    penaltyHome: toScoreNumber(match.penalty_home),
    penaltyAway: toScoreNumber(match.penalty_away),
    score: match.home_goals == null && match.away_goals == null ? null : `${match.home_goals ?? '-'} - ${match.away_goals ?? '-'}`,
    homeTeam: { id: match.home_team_id, name: match.home_team_name || 'Home', logo: match.home_team_logo },
    awayTeam: { id: match.away_team_id, name: match.away_team_name || 'Away', logo: match.away_team_logo },
  }))
  const championsLeagueQualificationMatches = matchCards.filter((match) => isChampionsLeagueQualificationRound(match.round))
  const championsLeagueMainMatches = matchCards.filter((match) => !isChampionsLeagueQualificationRound(match.round))
  const tournamentMatchCards = usesChampionsLeagueClassicGroups ? championsLeagueMainMatches : matchCards
  const nationalLeaguePhaseMatches = competitionFormat.groupMode === 'nations-league'
    ? tournamentMatchCards.filter((match) => isNationalLeaguePhaseRound(match.round) || /^league\s+[a-z]\s*-/i.test(String(match.round || '')))
    : []
  const groupStageMatches = competitionFormat.groupMode === 'nations-league'
    ? []
    : filterMainTournamentGroupMatches(tournamentMatchCards, competitionFormat, seasonYear)
  const groupStageIds = new Set(groupStageMatches.map((match) => String(match.id)))
  const knockoutRoundNames = new Set((competitionFormat.knockoutRounds || []).map((round) => normalizeRoundName(round)))
  const knockoutMatches = competitionFormat.groupMode === 'nations-league'
    ? tournamentMatchCards.filter((match) => !isNationalLeaguePhaseRound(match.round))
    : tournamentMatchCards.filter((match) => (
        !groupStageIds.has(String(match.id)) &&
        (knockoutRoundNames.size ? knockoutRoundNames.has(normalizeRoundName(match.round)) : isKnockoutRoundName(match.round))
      ))
  const domesticPathRoundNames = isDomesticCup
    ? getPathRoundNames(groupByRound(tournamentMatchCards), pathFormat)
    : []
  const domesticPathRoundSet = new Set(domesticPathRoundNames.map((name) => normalizeRoundName(name)))
  const domesticPathMatches = isDomesticCup
    ? tournamentMatchCards.filter((match) => domesticPathRoundSet.has(normalizeRoundName(match.round)))
    : []
  const championsLeagueLeaguePhaseMatches = championsLeagueMainMatches.filter((match) => isLeaguePhaseRound(match.round))
  const championsLeagueKnockoutMatches = championsLeagueMainMatches.filter((match) => !isLeaguePhaseRound(match.round))
  const hasCupGroupStage = isCup && !isDomesticCup && (nationalLeaguePhaseMatches.length > 0 || groupStageMatches.length > 0)
  const cupPathMatches = isDomesticCup ? domesticPathMatches : knockoutMatches
  const pathMatchCount = usesChampionsLeagueLeaguePhase ? championsLeagueKnockoutMatches.length : cupPathMatches.length
  const competitionWinner = isCup ? getCompetitionWinner(tournamentMatchCards) : null
  const displayTeams = usesChampionsLeagueLeaguePhase
    ? (standings.length ? teamsFromStandings(standings) : teamsFromFixtures(championsLeagueMainMatches))
    : usesChampionsLeagueClassicGroups
      ? teamsFromGroupStage(championsLeagueMainMatches)
    : teams
  const statsCount = [
    ...Object.values(stats?.players || {}),
    ...Object.values(stats?.teams || {}),
  ].reduce((total, items) => total + (Array.isArray(items) ? items.length : 0), 0)
  const hasTable = isLeague || usesChampionsLeagueLeaguePhase
  const hasPath = pathMatchCount > 0
  const competitionSummary = getCompetitionSummary({
    competition,
    currentSeason,
    teams: displayTeams,
    fixtures: tournamentMatchCards,
    standings,
    stats,
    winner: competitionWinner,
    isCup,
    hasPath,
  })
  const viewItems = [
    { value: 'overview', label: 'Summary', count: formatCompetitionSeason(currentSeason, competition) },
    hasTable ? { value: 'table', label: usesChampionsLeagueLeaguePhase ? 'League Phase' : 'Table', count: standings.length } : null,
    { value: 'fixtures', label: 'Matches', count: matchCards.length },
    { value: 'teams', label: 'Teams', count: displayTeams.length },
    statsCount ? { value: 'stats', label: 'Leaders', count: statsCount } : null,
    hasPath ? { value: 'path', label: 'Knockout', count: pathMatchCount } : null,
  ].filter(Boolean)
  const selectedView = viewItems.some((item) => item.value === activeView) ? activeView : 'overview'

  return (
    <div className="detail-page">
      <header className="detail-hero competition-hero">
        {logo ? <img className="detail-hero__image" src={logo} alt="" /> : <span className="detail-hero__image detail-hero__image--empty"><Trophy size={32} /></span>}
        <div className="detail-hero__content">
          <p className="eyebrow">{competition?.type || 'Competition'}</p>
          <h1>{competition?.name || 'Unknown competition'}</h1>
          <div className="detail-meta">
            <span><CalendarDays size={15} /> {formatCompetitionSeason(currentSeason, competition)}</span>
            <span><Shield size={15} /> {displayTeams.length} teams</span>
            <span><Trophy size={15} /> {seasonOptions.length} seasons</span>
          </div>
          <CompetitionWinnerBadge competition={competition} winner={competitionWinner} />
          {seasonOptions.length ? (
            <select className="season-select" value={currentSeason?.id || seasonId || ''} onChange={handleSeasonChange}>
              {seasonOptions.map((season) => (
                <option value={season.id} key={season.id}>
                  {season.label}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </header>

      <ChoiceBox ariaLabel="Competition detail view" items={viewItems} onChange={setActiveView} value={selectedView} />

      <div className="detail-grid detail-grid--single-view">
        {selectedView === 'overview' ? <CompetitionSummary summary={competitionSummary} onSelectView={setActiveView} /> : null}

        {hasTable && selectedView === 'table' ? (
          <AccordionSection
            className="detail-section detail-section--wide"
            title={usesChampionsLeagueLeaguePhase ? 'League Phase Table' : 'League Table'}
            count={standings.length}
            defaultOpen
          >
            <CompetitionVisualTable tableData={visualTable.data} loading={visualTable.status === 'loading'} />
            <StandingTable standings={standings} />
          </AccordionSection>
        ) : null}

        {selectedView === 'teams' ? (
        <AccordionSection
          className="detail-section"
          title={usesChampionsLeagueLeaguePhase ? 'Main Tournament Teams' : 'Teams'}
          count={displayTeams.length}
          defaultOpen
        >
          <div className="compact-list">
            {displayTeams.length ? displayTeams.map((team) => (
              <Link className="compact-row" to={`/teams/${team.id}`} key={team.id}>
                <span>{team.code || '-'}</span>
                <strong>{team.name}</strong>
                <small>{team.country_name_snapshot || 'Team'}</small>
                <FavoriteButton id={team.id} type="team" />
              </Link>
            )) : <p className="match-empty">No teams stored.</p>}
          </div>
        </AccordionSection>
        ) : null}

        {selectedView === 'stats' ? <CompetitionStats stats={stats} /> : null}

        {usesChampionsLeagueLeaguePhase && selectedView === 'fixtures' ? (
          <AccordionSection
            className="detail-section detail-section--wide"
            count={championsLeagueLeaguePhaseMatches.length}
            defaultOpen
            lazy
            title="League Phase Matches"
          >
            <FixtureRounds fixtures={championsLeagueLeaguePhaseMatches} />
          </AccordionSection>
        ) : !usesChampionsLeagueLeaguePhase && selectedView === 'fixtures' ? (
          <AccordionSection
            className="detail-section detail-section--wide"
            count={hasCupGroupStage ? (nationalLeaguePhaseMatches.length || groupStageMatches.length) : tournamentMatchCards.length}
            defaultOpen
            lazy
            title={competitionFormat.groupMode === 'nations-league' ? 'League Phase' : hasCupGroupStage ? 'Groups' : 'Fixtures'}
          >
            {competitionFormat.groupMode === 'nations-league' ? (
              <TournamentGroups fixtures={tournamentMatchCards} format={competitionFormat} seasonYear={seasonYear} />
            ) : hasCupGroupStage ? (
              <TournamentGroups fixtures={tournamentMatchCards} format={competitionFormat} seasonYear={seasonYear} />
            ) : (
              <FixtureRounds fixtures={tournamentMatchCards} roundNameFormatter={isLeague ? formatLeagueRoundName : undefined} />
            )}
          </AccordionSection>
        ) : null}

        {hasCupGroupStage && !usesChampionsLeagueLeaguePhase && selectedView === 'fixtures' ? (
          <AccordionSection
            className="detail-section detail-section--wide"
            count={groupStageMatches.length}
            lazy
            title="Group Stage Matches"
          >
            <GroupStageMatches fixtures={tournamentMatchCards} format={competitionFormat} seasonYear={seasonYear} />
          </AccordionSection>
        ) : null}

        {isCup && !isDomesticCup && !usesChampionsLeagueLeaguePhase && selectedView === 'fixtures' && knockoutMatches.length ? (
          <AccordionSection
            className="detail-section detail-section--wide"
            count={knockoutMatches.length}
            lazy
            title="Knockout Stage Matches"
          >
            <KnockoutStageMatches fixtures={knockoutMatches} format={competitionFormat} />
          </AccordionSection>
        ) : null}

        {usesChampionsLeagueLeaguePhase && selectedView === 'fixtures' ? (
          <AccordionSection
            className="detail-section detail-section--wide"
            count={championsLeagueKnockoutMatches.length}
            lazy
            title="Main Tournament Knockout"
          >
            <KnockoutStageMatches fixtures={championsLeagueKnockoutMatches} format={getCompetitionFormat({ name: 'Generic' })} />
          </AccordionSection>
        ) : null}

        {usesChampionsLeagueLeaguePhase && selectedView === 'fixtures' ? (
          <AccordionSection
            className="detail-section detail-section--wide"
            count={championsLeagueQualificationMatches.length}
            lazy
            title="Champions League Qualification"
          >
            <FixtureRounds fixtures={championsLeagueQualificationMatches} />
          </AccordionSection>
        ) : null}

        {hasPath && isCup && !usesChampionsLeagueLeaguePhase && selectedView === 'path' ? (
          <AccordionSection className="detail-section detail-section--wide" title="Path to the Final" lazy>
            <TournamentPath
              fixtures={cupPathMatches}
              format={isDomesticCup ? pathFormat : competitionFormat}
            />
          </AccordionSection>
        ) : null}

        {hasPath && usesChampionsLeagueLeaguePhase && selectedView === 'path' ? (
          <AccordionSection className="detail-section detail-section--wide" title="Path to the Final" lazy>
            <TournamentPath
              fixtures={championsLeagueKnockoutMatches}
              format={getCompetitionFormat({ name: 'Generic' })}
            />
          </AccordionSection>
        ) : null}
      </div>
    </div>
  )
}

export default Competition
