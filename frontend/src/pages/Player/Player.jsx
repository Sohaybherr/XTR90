import { Activity, ArrowRight, Award, BadgeDollarSign, BriefcaseBusiness, CalendarDays, Hash, Ruler, Shirt, UserRound, Weight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getPlayerDetails, getPlayerEnrichment } from '../../api/players'
import { getPlayerSummary } from '../../api/statistics'
import FavoriteButton from '../../components/common/FavoriteButton'
import { PlayerStatsPanel } from '../../components/statistics/StatisticsPanels'
import AccordionSection from '../../components/ui/AccordionSection'
import ChoiceBox from '../../components/ui/ChoiceBox'
import { useLocalizedPath } from '../../hooks/useLocalizedPath'
import { resolveAssetUrl } from '../../utils/assets'
import { formatSeason } from '../../utils/seasons'

function groupBySeason(rows, getSeason) {
  const groups = rows.reduce((map, row) => {
    const season = formatSeason(getSeason(row) || 'Unknown season')
    const current = map.get(season) || []
    current.push(row)
    map.set(season, current)
    return map
  }, new Map())

  return Array.from(groups.entries()).map(([season, items]) => ({ season, items }))
}

function formatMoney(value) {
  if (value === null || value === undefined) return '-'
  return new Intl.NumberFormat(undefined, {
    currency: 'EUR',
    maximumFractionDigits: 0,
    notation: Math.abs(Number(value)) >= 1000000 ? 'compact' : 'standard',
    style: 'currency',
  }).format(Number(value))
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : '-'
}

function fullDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString()
}

function compactJoin(items, fallback = '-') {
  return Array.isArray(items) && items.length ? items.filter(Boolean).join(', ') : fallback
}

function firstValue(...values) {
  return values.find((value) => value !== null && value !== undefined && value !== '')
}

function teamFromTransfer(row, side) {
  const direct = firstValue(
    row?.[side],
    side === 'from' ? row?.clubFrom : row?.clubTo,
    side === 'from' ? row?.fromClub : row?.toClub,
    side === 'from' ? row?.teamFrom : row?.teamTo
  )
  if (direct && typeof direct === 'object') {
    return {
      id: firstValue(direct.id, direct.teamId, direct.clubId),
      logo: firstValue(direct.logo, direct.logoUrl, direct.image, direct.crest),
      name: firstValue(direct.name, direct.clubName, direct.teamName),
    }
  }

  const prefix = side === 'from' ? 'from' : 'to'
  return {
    id: firstValue(row?.[`${prefix}TeamId`], row?.[`${prefix}_team_id`], row?.[`${prefix}ClubId`], row?.[`${prefix}_club_id`]),
    logo: firstValue(row?.[`${prefix}TeamLogo`], row?.[`${prefix}_team_logo`], row?.[`${prefix}ClubLogo`], row?.[`${prefix}_club_logo`]),
    name: firstValue(
      row?.[`${prefix}TeamName`],
      row?.[`${prefix}_team_name`],
      row?.[`${prefix}ClubName`],
      row?.[`${prefix}_club_name`],
      side === 'from' ? row?.clubFromName : row?.clubToName,
      side === 'from' ? row?.fromClubName : row?.toClubName,
      row?.[prefix]
    ),
  }
}

function normalizeTransfer(row, index, source = 'local') {
  const fromTeam = teamFromTransfer(row, 'from')
  const toTeam = teamFromTransfer(row, 'to')
  const date = firstValue(row?.date, row?.transferDate, row?.transfer_date, row?.joinedAt, row?.joined_at)
  const season = firstValue(row?.season, row?.seasonName)
  const fee = firstValue(row?.fee, row?.transferFee, row?.transfer_fee, row?.marketValue, row?.market_value, row?.value)
  const type = firstValue(row?.type, row?.transferType, row?.transfer_type, row?.description, row?.detail)

  return {
    id: firstValue(row?.id, `${source}-${date || season || index}-${fromTeam.name || 'from'}-${toTeam.name || 'to'}`),
    date,
    fee,
    fromTeam,
    season,
    source,
    toTeam,
    type,
  }
}

function buildTransferTimeline(localTransfers = [], enrichedTransfers = null) {
  const enrichedRows = Array.isArray(enrichedTransfers?.transfers)
    ? enrichedTransfers.transfers
    : Array.isArray(enrichedTransfers)
      ? enrichedTransfers
      : []
  const localRows = Array.isArray(localTransfers) ? localTransfers : []
  const rows = enrichedRows.length ? enrichedRows.map((row, index) => normalizeTransfer(row, index, 'enriched')) : localRows.map((row, index) => normalizeTransfer(row, index, 'local'))

  return rows.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
}

function yearsSince(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const now = new Date()
  let years = now.getFullYear() - date.getFullYear()
  const hasHadBirthday = now.getMonth() > date.getMonth() || (now.getMonth() === date.getMonth() && now.getDate() >= date.getDate())
  if (!hasHadBirthday) years -= 1
  return years
}

function Player() {
  const { id } = useParams()
  const toLocale = useLocalizedPath()
  const [details, setDetails] = useState(null)
  const [enrichment, setEnrichment] = useState(null)
  const [enrichmentStatus, setEnrichmentStatus] = useState('idle')
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [activeView, setActiveView] = useState('overview')
  const [performanceSummary, setPerformanceSummary] = useState({ data: null, status: 'idle' })

  useEffect(() => {
    let active = true
    setStatus('loading')
    setEnrichment(null)
    setEnrichmentStatus('loading')
    setPerformanceSummary({ data: null, status: 'loading' })

    async function loadPlayer() {
      try {
        const response = await getPlayerDetails(id)
        if (!active) return
        setDetails(response.data)
        setStatus('ready')

        try {
          const enrichmentResponse = await getPlayerEnrichment(id)
          if (!active) return
          setEnrichment(enrichmentResponse.data)
          setEnrichmentStatus('ready')
        } catch {
          if (active) setEnrichmentStatus('error')
        }
      } catch (requestError) {
        if (!active) return
        setError(requestError?.response?.data?.error || 'Could not load player details.')
        setStatus('error')
      }
    }

    loadPlayer()

    getPlayerSummary(id, { last: 12 })
      .then((response) => {
        if (active) setPerformanceSummary({ data: response.data, status: 'ready' })
      })
      .catch(() => {
        if (active) setPerformanceSummary({ data: null, status: 'error' })
      })

    return () => {
      active = false
    }
  }, [id])

  if (status === 'loading') return <div className="state-message detail-page">Loading player...</div>
  if (status === 'error') return <div className="state-message state-message--error detail-page">{error}</div>

  const { player, currentTeam, statistics = [], teamSeasons = [], transferHistory = [], nextMatch = null } = details
  const statSnapshot = statistics[0] || null
  const statisticsBySeason = groupBySeason(statistics, (row) => row.season)
  const careerBySeason = groupBySeason(teamSeasons, (row) => row.season)
  const marketValue = enrichment?.marketValue || null
  const marketHistory = marketValue?.marketValueHistory || []
  const latestHistory = marketHistory.slice(-8)
  const maxMarketValue = marketHistory.reduce((max, row) => Math.max(max, Number(row.marketValue || 0)), 0)
  const tmProfile = enrichment?.profile || null
  const tmInjuries = enrichment?.injuries?.injuries || []
  const tmAchievements = enrichment?.achievements?.achievements || []
  const tmJerseyNumbers = enrichment?.jerseyNumbers?.jerseyNumbers || []
  const transferTimeline = buildTransferTimeline(transferHistory, enrichment?.transfers)
  const achievementTotal = tmAchievements.reduce((sum, row) => sum + Number(row.count || 0), 0)
  const photo = tmProfile?.imageUrl || resolveAssetUrl(player?.photo || player?.photoPath || player?.photo_path)
  const isLocalPlayerPhoto = /^\/assets\/players\//.test(photo) || /\/assets\/players\//.test(photo)
  const displayName = tmProfile?.name || player?.name || 'Unknown player'
  const displayPosition = tmProfile?.position?.main || player?.position || 'Player'
  const birthDate = tmProfile?.dateOfBirth || tmProfile?.birthDate || player?.birthDate
  const playerAge = yearsSince(birthDate)
  const birthPlace = compactJoin([tmProfile?.placeOfBirth?.city, tmProfile?.placeOfBirth?.country].filter(Boolean))
  const viewItems = [
    { value: 'overview', label: 'Overview', count: 'Now' },
    { value: 'stats', label: 'Performance', count: statistics.length },
    { value: 'career', label: 'Career', count: teamSeasons.length + transferTimeline.length },
    { value: 'history', label: 'History', count: achievementTotal + tmInjuries.length + tmJerseyNumbers.length },
  ]

  return (
    <div className="detail-page">
      <header className="detail-hero player-hero">
        <div className="player-hero__identity">
          {photo ? (
            <img
              className={`detail-hero__image player-hero__photo${isLocalPlayerPhoto ? ' player-hero__photo--local' : ''}`}
              src={photo}
              alt=""
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
          ) : (
            <span className="detail-hero__image detail-hero__image--empty player-hero__photo"><UserRound size={32} /></span>
          )}
          <div className="detail-hero__content player-hero__content">
            <div className="player-hero__title-row">
              <div>
                <p className="eyebrow">{displayPosition}</p>
                <h1>{displayName}</h1>
              </div>
              <FavoriteButton id={player?.id} type="player" />
            </div>
            <p className="detail-hero__note player-hero__note">
              {[
                playerAge ? `${playerAge} years old` : null,
                compactJoin(tmProfile?.citizenship),
                currentTeam?.name || tmProfile?.club?.name,
                marketValue?.marketValue ? `Market value: ${formatMoney(marketValue.marketValue)}` : null,
              ].filter(Boolean).join(' / ')}
            </p>
            <div className="detail-meta player-hero__meta">
              {currentTeam ? <Link to={toLocale(`/teams/${currentTeam.id}`)}><Shirt size={15} /> {currentTeam.name}</Link> : null}
              <span><CalendarDays size={15} /> {playerAge ? `${playerAge} years old` : 'Unknown age'}</span>
              <span><Ruler size={15} /> {tmProfile?.height ? `${tmProfile.height} cm` : player?.height || 'Unknown'}</span>
              <span><Weight size={15} /> {player?.weight || 'Unknown'}</span>
            </div>
          </div>
        </div>

        <aside className="player-hero__snapshot" aria-label="Player snapshot">
          <div className="player-hero__value">
            <small>Market value</small>
            <strong>{marketValue?.marketValue ? formatMoney(marketValue.marketValue) : '-'}</strong>
          </div>
          <div className="player-hero__mini-stats">
            <span><strong>{statSnapshot?.appearances ?? 0}</strong><small>Apps</small></span>
            <span><strong>{statSnapshot?.goals ?? 0}</strong><small>Goals</small></span>
            <span><strong>{statSnapshot?.assists ?? 0}</strong><small>Assists</small></span>
            <span><strong>{statSnapshot?.minutes ?? 0}</strong><small>Min</small></span>
          </div>
        </aside>

        <div className="player-hero__sections">
          <section className="player-hero__section">
            <h2>Profile</h2>
            <dl>
              <div><dt>Full name</dt><dd>{tmProfile?.nameInHomeCountry || tmProfile?.name || displayName}</dd></div>
              <div><dt>Citizenship</dt><dd>{compactJoin(tmProfile?.citizenship)}</dd></div>
              <div><dt>Born</dt><dd>{birthDate ? fullDate(birthDate) : '-'}</dd></div>
              <div><dt>Birthplace</dt><dd>{birthPlace}</dd></div>
            </dl>
          </section>

          <section className="player-hero__section">
            <h2>Role</h2>
            <dl>
              <div><dt>Main position</dt><dd>{displayPosition}</dd></div>
              <div><dt>Other positions</dt><dd>{compactJoin(tmProfile?.position?.other)}</dd></div>
              <div><dt>Foot</dt><dd>{tmProfile?.foot || '-'}</dd></div>
              <div><dt>Shirt number</dt><dd>{tmProfile?.shirtNumber || '-'}</dd></div>
            </dl>
          </section>

          <section className="player-hero__section">
            <h2>Club</h2>
            <dl>
              <div><dt>Current club</dt><dd>{tmProfile?.club?.name || currentTeam?.name || '-'}</dd></div>
              <div><dt>Joined</dt><dd>{fullDate(tmProfile?.club?.joined)}</dd></div>
              <div><dt>Contract</dt><dd>{fullDate(tmProfile?.club?.contractExpires)}</dd></div>
              <div><dt>Agent</dt><dd>{tmProfile?.agent?.name || '-'}</dd></div>
            </dl>
          </section>
        </div>
      </header>

      <ChoiceBox ariaLabel="Player detail view" items={viewItems} onChange={setActiveView} value={activeView} />

      <div className="detail-grid detail-grid--single-view">
        {activeView === 'overview' ? (
          <>
        <AccordionSection className="detail-section" title="Competition Snapshot" defaultOpen>
          {statSnapshot ? (
            <>
              <p className="detail-note">
                {statSnapshot.competition?.name || 'Competition'} - {formatSeason(statSnapshot.season)}
              </p>
              <div className="stat-summary-grid">
                <span><strong>{statSnapshot.appearances ?? 0}</strong><small>Apps</small></span>
                <span><strong>{statSnapshot.goals ?? 0}</strong><small>Goals</small></span>
                <span><strong>{statSnapshot.assists ?? 0}</strong><small>Assists</small></span>
                <span><strong>{statSnapshot.minutes ?? 0}</strong><small>Minutes</small></span>
                <span><strong>{statSnapshot.cards?.yellow ?? 0}</strong><small>Yellow</small></span>
                <span><strong>{statSnapshot.cards?.red ?? 0}</strong><small>Red</small></span>
              </div>
            </>
          ) : (
            <p className="match-empty">No competition statistics stored.</p>
          )}
        </AccordionSection>

        <AccordionSection className="detail-section" title="Recent Output" count={performanceSummary.data?.totals?.appearances ?? 0} defaultOpen>
          <PlayerStatsPanel summary={performanceSummary.data} loading={performanceSummary.status === 'loading'} />
        </AccordionSection>

        <AccordionSection className="detail-section" title="Market Value" count={marketValue?.marketValue ? 1 : 0} defaultOpen>
          {enrichmentStatus === 'loading' ? (
            <p className="match-empty">Loading market data...</p>
          ) : marketValue ? (
            <>
              <p className="detail-note">
                <BadgeDollarSign size={15} /> Current market value
              </p>
              <div className="market-value-card">
                <strong>{formatMoney(marketValue.marketValue)}</strong>
                <span>{displayName}</span>
                {marketValue.ranking ? <small>{Object.keys(marketValue.ranking).length} ranking signals</small> : null}
              </div>
              {latestHistory.length ? (
                <div className="market-chart" aria-label="Recent market value history">
                  {latestHistory.map((row) => {
                    const height = maxMarketValue ? Math.max(8, Math.round((Number(row.marketValue || 0) / maxMarketValue) * 100)) : 8
                    const label = `${formatDate(row.date)} - ${formatMoney(row.marketValue)}`
                    return (
                      <span className="market-chart__bar" data-label={label} key={`${row.date}-${row.clubId || row.clubName}`} title={label}>
                        <i style={{ height: `${height}%` }} />
                        <small>{new Date(row.date).getFullYear()}</small>
                      </span>
                    )
                  })}
                </div>
              ) : null}
            </>
          ) : (
            <p className="match-empty">
              {enrichmentStatus === 'error' ? 'Market data is not available for this player.' : 'No market value data found.'}
            </p>
          )}
        </AccordionSection>

        <AccordionSection className="detail-section" title="Next Match" count={nextMatch ? 1 : 0} defaultOpen>
          {nextMatch ? (
            <article className="compact-row compact-row--with-action">
              <Link className="compact-row__link" to={toLocale(`/matches/${nextMatch.id}`)}>
                <span>{nextMatch.status_short || nextMatch.status || 'Match'}</span>
                <strong>{nextMatch.home_team_id === currentTeam?.id ? 'Home' : 'Away'} match</strong>
                <small>{nextMatch.kickoff_at || nextMatch.match_date ? new Date(nextMatch.kickoff_at || nextMatch.match_date).toLocaleString() : 'TBD'}</small>
              </Link>
              <FavoriteButton id={nextMatch.id} type="match" />
            </article>
          ) : (
            <p className="match-empty">No upcoming match stored.</p>
          )}
        </AccordionSection>
          </>
        ) : null}

        {activeView === 'stats' ? (
          <>
        <AccordionSection className="detail-section" title="Recent Output" count={performanceSummary.data?.totals?.appearances ?? 0} defaultOpen>
          <PlayerStatsPanel summary={performanceSummary.data} loading={performanceSummary.status === 'loading'} />
        </AccordionSection>

        <AccordionSection className="detail-section" title="Competition Statistics" count={statistics.length} lazy>
          {statisticsBySeason.length ? statisticsBySeason.map((group, index) => (
            <AccordionSection count={group.items.length} defaultOpen={index === 0} key={group.season} lazy title={group.season}>
              <div className="stats-table">
                <div className="stats-table__head">
                  <span>Season</span><span>Team</span><span>Comp</span><span>Apps</span><span>G</span><span>A</span><span>Min</span><span>Rating</span><span>Cards</span>
                </div>
                {group.items.map((row) => (
                  <div className="stats-table__row" key={row.id}>
                    <span>{formatSeason(row.season)}</span>
                    <span>{row.team?.name}</span>
                    <span>{row.competition?.name}</span>
                    <span>{row.appearances}</span>
                    <span>{row.goals}</span>
                    <span>{row.assists}</span>
                    <span>{row.minutes}</span>
                    <span>{row.rating ?? '-'}</span>
                    <span>{row.cards?.yellow ?? 0}/{row.cards?.red ?? 0}</span>
                  </div>
                ))}
              </div>
            </AccordionSection>
          )) : <p className="match-empty">No competition statistics stored.</p>}
        </AccordionSection>
          </>
        ) : null}

        {activeView === 'career' ? (
          <>
        <AccordionSection className="detail-section" title="Career" count={teamSeasons.length} lazy>
          {careerBySeason.length ? careerBySeason.map((group, index) => (
            <AccordionSection count={group.items.length} defaultOpen={index === 0} key={group.season} lazy title={group.season}>
              <div className="compact-list">
                {group.items.map((row) => (
                  <Link className="compact-row" to={toLocale(`/teams/${row.team?.id}`)} key={row.id}>
                    <span>{row.current ? 'Now' : '-'}</span>
                    <strong>{row.team?.name}</strong>
                    <small>{row.current ? 'Current' : row.position}</small>
                    <FavoriteButton id={row.team?.id} type="team" />
                  </Link>
                ))}
              </div>
            </AccordionSection>
          )) : <p className="match-empty">No career rows stored.</p>}
        </AccordionSection>

        <AccordionSection className="detail-section detail-section--wide" title="Transfer History" count={transferTimeline.length} lazy>
          {transferTimeline.length ? (
            <div className="transfer-timeline">
              {transferTimeline.map((transfer, index) => {
                const fromLogo = resolveAssetUrl(transfer.fromTeam.logo)
                const toLogo = resolveAssetUrl(transfer.toTeam.logo)
                const feeLabel = typeof transfer.fee === 'number' ? formatMoney(transfer.fee) : transfer.fee

                return (
                  <article className="transfer-timeline__item" key={transfer.id || index}>
                    <time>{transfer.date ? fullDate(transfer.date) : transfer.season || '-'}</time>
                    <div className="transfer-timeline__clubs">
                      <span>
                        {fromLogo ? <img src={fromLogo} alt="" loading="lazy" decoding="async" /> : <i>{String(transfer.fromTeam.name || '?').charAt(0)}</i>}
                        <strong>{transfer.fromTeam.name || 'Unknown club'}</strong>
                      </span>
                      <ArrowRight size={16} />
                      <span>
                        {toLogo ? <img src={toLogo} alt="" loading="lazy" decoding="async" /> : <i>{String(transfer.toTeam.name || '?').charAt(0)}</i>}
                        <strong>{transfer.toTeam.name || 'Unknown club'}</strong>
                      </span>
                    </div>
                    <div className="transfer-timeline__meta">
                      <span>{feeLabel || transfer.type || 'Transfer'}</span>
                      {transfer.type && feeLabel ? <small>{transfer.type}</small> : null}
                    </div>
                  </article>
                )
              })}
            </div>
          ) : <p className="match-empty">No transfer history stored.</p>}
        </AccordionSection>
          </>
        ) : null}

        {activeView === 'history' ? (
          <>
        <AccordionSection className="detail-section" title="Achievements" count={achievementTotal || tmAchievements.length} lazy>
          {tmAchievements.length ? (
            <div className="tm-list">
              {tmAchievements.slice(0, 12).map((row) => (
                <div className="tm-list-row" key={row.title}>
                  <Award size={16} />
                  <strong>{row.title}</strong>
                  <span>{row.count || row.details?.length || 1}</span>
                  <small>{row.details?.[0]?.season?.name || '-'}</small>
                </div>
              ))}
            </div>
          ) : <p className="match-empty">No achievements stored.</p>}
        </AccordionSection>

        <AccordionSection className="detail-section detail-section--wide" title="Injuries" count={tmInjuries.length} lazy>
          {tmInjuries.length ? (
            <div className="tm-list">
              {tmInjuries.map((row, index) => (
                <div className="tm-list-row tm-list-row--injury" key={`${row.injury}-${row.fromDate}-${index}`}>
                  <Activity size={16} />
                  <strong>{row.injury || 'Unavailable'}</strong>
                  <span>{row.season || '-'}</span>
                  <small>{`${fullDate(row.fromDate)} - ${fullDate(row.untilDate)}`}</small>
                  <em>{row.days ? `${row.days} days` : '-'}</em>
                  <em>{row.gamesMissed ? `${row.gamesMissed} missed` : '-'}</em>
                </div>
              ))}
            </div>
          ) : <p className="match-empty">No injury history stored.</p>}
        </AccordionSection>

        <AccordionSection className="detail-section" title="Jersey Numbers" count={tmJerseyNumbers.length} lazy>
          {tmJerseyNumbers.length ? (
            <div className="tm-number-grid">
              {tmJerseyNumbers.slice(0, 36).map((row, index) => (
                <span className="tm-number" key={`${row.club}-${row.season}-${row.jerseyNumber}-${index}`}>
                  <Hash size={14} />
                  <strong>{row.jerseyNumber}</strong>
                  <small>{row.season}</small>
                </span>
              ))}
            </div>
          ) : <p className="match-empty">No jersey number history stored.</p>}
        </AccordionSection>

        <AccordionSection className="detail-section" title="Links" count={tmProfile?.socialMedia?.length || 0} lazy>
          {tmProfile?.socialMedia?.length || tmProfile?.relatives?.length ? (
            <div className="tm-list">
              {tmProfile.socialMedia?.map((url) => (
                <a className="tm-list-row" href={url} key={url} rel="noreferrer" target="_blank">
                  <BriefcaseBusiness size={16} />
                  <strong>{url.replace(/^https?:\/\//, '')}</strong>
                  <span>Social</span>
                  <small>External</small>
                </a>
              ))}
              {tmProfile.relatives?.map((relative) => (
                <div className="tm-list-row" key={relative.id || relative.name}>
                  <UserRound size={16} />
                  <strong>{relative.name}</strong>
                  <span>{relative.profileType || 'Relative'}</span>
                  <small>{relative.id || '-'}</small>
                </div>
              ))}
            </div>
          ) : <p className="match-empty">No links stored.</p>}
        </AccordionSection>
          </>
        ) : null}
      </div>
    </div>
  )
}

export default Player
