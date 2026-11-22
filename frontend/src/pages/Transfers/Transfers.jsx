import {
  ArrowDownUp,
  CalendarClock,
  CircleDollarSign,
  Filter,
  History,
  RefreshCw,
  Search,
  Shirt,
  UsersRound,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSearchResults } from '../../api/search'
import {
  getLatestTransfers,
  getPlayerTransferHistory,
  getTeamTransfers,
  getTransferSummary,
  getTransferWindow,
  searchTransfers,
} from '../../api/transfers'
import ChoiceBox from '../../components/ui/ChoiceBox'
import { useLocalizedPath } from '../../hooks/useLocalizedPath'
import { resolveAssetUrl } from '../../utils/assets'

const DEFAULT_PAGE = { data: [], page: 1, limit: 20, total: 0, totalPages: 0 }
const DEFAULT_STATE = { status: 'idle', data: null, error: '' }
const MAIN_COMPETITIONS = [
  { apiId: 39, name: 'Premier League' },
  { apiId: 140, name: 'La Liga' },
  { apiId: 135, name: 'Serie A' },
  { apiId: 78, name: 'Bundesliga' },
  { apiId: 61, name: 'Ligue 1' },
]

function compactParams(params) {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''))
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: '2-digit', year: 'numeric' }).format(date)
}

function formatFee(value) {
  if (value === null || value === undefined || value === '') return 'Undisclosed'
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return 'Undisclosed'
  return `EUR ${new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(amount)}`
}

function sortTransfersByPrice(rows) {
  return [...rows].sort((first, second) => {
    const feeDelta = Number(second.transferFee || 0) - Number(first.transferFee || 0)
    if (feeDelta) return feeDelta
    return new Date(second.transferDate || 0).getTime() - new Date(first.transferDate || 0).getTime()
  })
}

function entityId(entity) {
  return entity?.id || entity?.teamId || entity?.playerId || entity?.competitionId || ''
}

function EntityAvatar({ entity, type }) {
  const image = resolveAssetUrl(entity?.logo || entity?.photo)
  const fallback = String(entity?.name || type || '?').charAt(0).toUpperCase()
  if (image) return <img src={image} alt="" loading="lazy" decoding="async" />
  return <i>{fallback}</i>
}

function EntityPicker({ label, type, selected, onSelect, placeholder }) {
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
          setResults((response.data?.[`${type}s`] || []).slice(0, 6))
          setStatus('ready')
        })
        .catch((error) => {
          if (error.name !== 'CanceledError' && error.name !== 'AbortError') setStatus('error')
        })
    }, 250)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [query, type])

  return (
    <div className="transfer-picker">
      <label>{label}</label>
      <div className="transfer-picker__input">
        <Search size={16} />
        <input onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} value={query} />
      </div>
      {selected ? (
        <div className="transfer-selected">
          <EntityAvatar entity={selected} type={type} />
          <strong>{selected.name}</strong>
          <button onClick={() => onSelect(null)} type="button">Clear</button>
        </div>
      ) : null}
      {query.trim().length >= 2 ? (
        <div className="transfer-picker__results">
          {status === 'loading' ? <span>Searching...</span> : null}
          {status === 'error' ? <span>Search failed.</span> : null}
          {status === 'ready' && !results.length ? <span>No results.</span> : null}
          {results.map((item) => (
            <button
              key={`${type}-${entityId(item)}`}
              onClick={() => {
                onSelect(item)
                setQuery('')
                setResults([])
              }}
              type="button"
            >
              <EntityAvatar entity={item} type={type} />
              <span>
                <strong>{item.name}</strong>
                <small>{item.country?.name || item.position || item.type || type}</small>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function useMainCompetitions() {
  return MAIN_COMPETITIONS
}

function TeamBadge({ team }) {
  const toLocale = useLocalizedPath()
  const image = resolveAssetUrl(team?.logo)
  if (!team) return <span className="transfer-team transfer-team--empty">Unknown</span>

  return (
    <Link className="transfer-team" to={team.id ? toLocale(`/teams/${team.id}`) : '#'}>
      {image ? <img src={image} alt="" loading="lazy" decoding="async" /> : <i>{String(team.name || '?').charAt(0)}</i>}
      <span>{team.name || `Team ${team.id}`}</span>
    </Link>
  )
}

function TransferRow({ transfer }) {
  const toLocale = useLocalizedPath()

  return (
    <article className="transfer-row">
      <div className="transfer-row__player">
        <Link to={toLocale(`/players/${transfer.playerId}`)}>{transfer.player || `Player ${transfer.playerId}`}</Link>
        <span>{[transfer.position, transfer.nationality, transfer.age ? `${transfer.age} yrs` : null].filter(Boolean).join(' / ') || 'Player'}</span>
      </div>
      <div className="transfer-row__route">
        <TeamBadge team={transfer.oldTeam} />
        <ArrowDownUp size={16} />
        <TeamBadge team={transfer.newTeam} />
      </div>
      <div className="transfer-row__meta">
        <strong>{transfer.transferType || 'unknown'}</strong>
        <span>{formatDate(transfer.transferDate)} / {formatFee(transfer.transferFee)}</span>
        <small>{transfer.league?.name || 'League unknown'}{transfer.season ? ` / ${transfer.season}` : ''}</small>
      </div>
    </article>
  )
}

function TransferList({ state, emptyText = 'No transfers found.' }) {
  if (state.status === 'loading') return <div className="transfer-panel transfer-panel--loading">Loading transfers...</div>
  if (state.status === 'error') return <div className="transfer-panel transfer-panel--error">{state.error}</div>

  const rows = sortTransfersByPrice(state.data?.data || state.data || [])
  if (!rows.length) return <p className="match-empty">{emptyText}</p>

  return (
    <div className="transfer-list">
      {rows.map((transfer, index) => (
        <TransferRow key={transfer.id || `${transfer.playerId}-${transfer.transferDate}-${index}`} transfer={transfer} />
      ))}
    </div>
  )
}

function TransferFilters({ filters, onChange, onSubmit, searchMode, competitions = [] }) {
  function setField(field, value) {
    onChange((current) => ({ ...current, [field]: value }))
  }

  return (
    <form className="transfer-controls" onSubmit={onSubmit}>
      {searchMode ? (
        <>
          <label>Player<input onChange={(event) => setField('player', event.target.value)} placeholder="Name" value={filters.player || ''} /></label>
          <label>Team<input onChange={(event) => setField('team', event.target.value)} placeholder="Club" value={filters.team || ''} /></label>
          <label>League<input onChange={(event) => setField('league', event.target.value)} placeholder="Competition" value={filters.league || ''} /></label>
          <label>Nationality<input onChange={(event) => setField('nationality', event.target.value)} placeholder="Country" value={filters.nationality || ''} /></label>
          <label>Position<input onChange={(event) => setField('position', event.target.value)} placeholder="Position" value={filters.position || ''} /></label>
        </>
      ) : (
        <>
          <label>Competition<select onChange={(event) => setField('leagueApiId', event.target.value)} value={filters.leagueApiId || ''}>
            <option value="">Top 5 leagues</option>
            {competitions.map((competition) => (
              <option key={competition.apiId || competition.id} value={competition.apiId || competition.api_id}>{competition.name}</option>
            ))}
          </select></label>
          <label>Season<input onChange={(event) => setField('season', event.target.value)} placeholder="Example: 2026" value={filters.season || ''} /></label>
          <label>Date from<input onChange={(event) => setField('dateFrom', event.target.value)} type="date" value={filters.dateFrom || ''} /></label>
          <label>Date to<input onChange={(event) => setField('dateTo', event.target.value)} type="date" value={filters.dateTo || ''} /></label>
        </>
      )}
      <button type="submit"><Filter size={16} /> Apply</button>
    </form>
  )
}

function LatestTransfers() {
  const [filters, setFilters] = useState({ page: 1, limit: 20 })
  const [state, setState] = useState({ ...DEFAULT_STATE, data: DEFAULT_PAGE })
  const competitions = useMainCompetitions()

  const load = useCallback((nextFilters = filters) => {
    setState({ status: 'loading', data: state.data, error: '' })
    getLatestTransfers(compactParams(nextFilters))
      .then((response) => setState({ status: 'ready', data: response.data, error: '' }))
      .catch(() => setState({ status: 'error', data: DEFAULT_PAGE, error: 'Could not load latest transfers.' }))
  }, [filters, state.data])

  useEffect(() => {
    load()
  }, [])

  function submit(event) {
    event.preventDefault()
    const next = { ...filters, page: 1 }
    setFilters(next)
    load(next)
  }

  return (
    <section className="transfer-workspace">
      <section className="transfer-market-strip">
        <strong>Main competitions</strong>
        <div>
          <button className={!filters.leagueApiId ? 'transfer-chip transfer-chip--active' : 'transfer-chip'} onClick={() => {
            const next = { ...filters, leagueApiId: '', page: 1 }
            setFilters(next)
            load(next)
          }} type="button">All</button>
          {competitions.map((competition) => (
            <button
              className={String(filters.leagueApiId || '') === String(competition.apiId || competition.api_id) ? 'transfer-chip transfer-chip--active' : 'transfer-chip'}
              key={competition.apiId || competition.id}
              onClick={() => {
                const next = { ...filters, leagueApiId: competition.apiId || competition.api_id, page: 1 }
                setFilters(next)
                load(next)
              }}
              type="button"
            >
              {competition.name}
            </button>
          ))}
        </div>
      </section>
      <TransferFilters competitions={competitions} filters={filters} onChange={setFilters} onSubmit={submit} />
      <TransferList state={state} />
      <Pagination data={state.data} filters={filters} onChange={(page) => {
        const next = { ...filters, page }
        setFilters(next)
        load(next)
      }} />
    </section>
  )
}

function SearchTransfers() {
  const [filters, setFilters] = useState({ page: 1, limit: 20 })
  const [state, setState] = useState({ ...DEFAULT_STATE, data: DEFAULT_PAGE })

  const runSearch = useCallback((nextFilters = filters) => {
    setState({ status: 'loading', data: state.data, error: '' })
    searchTransfers(compactParams(nextFilters))
      .then((response) => setState({ status: 'ready', data: response.data, error: '' }))
      .catch(() => setState({ status: 'error', data: DEFAULT_PAGE, error: 'Search failed.' }))
  }, [filters, state.data])

  function submit(event) {
    event.preventDefault()
    const next = { ...filters, page: 1 }
    setFilters(next)
    runSearch(next)
  }

  return (
    <section className="transfer-workspace">
      <TransferFilters filters={filters} onChange={setFilters} onSubmit={submit} searchMode />
      <TransferList emptyText="Set one or more filters to search transfers." state={state} />
      <Pagination data={state.data} filters={filters} onChange={(page) => {
        const next = { ...filters, page }
        setFilters(next)
        runSearch(next)
      }} />
    </section>
  )
}

function WindowTransfers() {
  const [state, setState] = useState(DEFAULT_STATE)

  useEffect(() => {
    setState({ status: 'loading', data: null, error: '' })
    getTransferWindow()
      .then((response) => setState({ status: 'ready', data: response.data, error: '' }))
      .catch(() => setState({ status: 'error', data: null, error: 'Could not load transfer windows.' }))
  }, [])

  const groups = [
    ['Today', state.data?.today || []],
    ['Last 7 days', state.data?.last7Days || []],
    ['Last 30 days', state.data?.last30Days || []],
  ]

  return (
    <section className="transfer-window-grid">
      {state.status === 'loading' ? <div className="transfer-panel transfer-panel--loading">Loading windows...</div> : null}
      {state.status === 'error' ? <div className="transfer-panel transfer-panel--error">{state.error}</div> : null}
      {groups.map(([label, rows]) => (
        <div className="transfer-panel" key={label}>
          <h2>{label}</h2>
          <TransferList state={{ status: 'ready', data: rows.slice(0, 8), error: '' }} />
        </div>
      ))}
    </section>
  )
}

function SummaryBars({ title, rows }) {
  const max = Math.max(1, ...rows.map((row) => Number(row.count || 0)))
  return (
    <section className="transfer-panel">
      <h2>{title}</h2>
      <div className="transfer-bars">
        {rows.length ? rows.map((row) => (
          <div className="transfer-bars__row" key={`${title}-${row.id || row.name}`}>
            <span>{row.name || `#${row.id}`}</span>
            <i><b style={{ width: `${(Number(row.count || 0) / max) * 100}%` }} /></i>
            <strong>{row.count || 0}</strong>
          </div>
        )) : <p className="match-empty">No data.</p>}
      </div>
    </section>
  )
}

function SummaryTransfers() {
  const [filters, setFilters] = useState({})
  const [state, setState] = useState(DEFAULT_STATE)
  const competitions = useMainCompetitions()

  const load = useCallback((nextFilters = filters) => {
    setState({ status: 'loading', data: state.data, error: '' })
    getTransferSummary(compactParams(nextFilters))
      .then((response) => setState({ status: 'ready', data: response.data, error: '' }))
      .catch(() => setState({ status: 'error', data: null, error: 'Could not load transfer summary.' }))
  }, [filters, state.data])

  useEffect(() => {
    load()
  }, [])

  const data = state.data || {}

  return (
    <section className="transfer-workspace">
      <TransferFilters competitions={competitions} filters={filters} onChange={setFilters} onSubmit={(event) => {
        event.preventDefault()
        load(filters)
      }} />
      {state.status === 'error' ? <div className="transfer-panel transfer-panel--error">{state.error}</div> : null}
      <div className="transfer-kpis">
        <Kpi label="Total" value={data.totalTransfers || 0} />
        <Kpi label="Loans" value={data.loans || 0} />
        <Kpi label="Permanent" value={data.permanent || 0} />
        <Kpi label="Free" value={data.freeTransfers || 0} />
        <Kpi label="Unknown" value={data.unknown || 0} />
      </div>
      <div className="transfer-summary-grid">
        <SummaryBars title="Most active clubs" rows={data.mostActiveClubs || []} />
        <SummaryBars title="Most active leagues" rows={data.mostActiveLeagues || []} />
        <SummaryBars title="Top positions" rows={data.topTransferredPositions || []} />
        <SummaryBars title="Nationalities" rows={data.transfersByNationality || []} />
      </div>
    </section>
  )
}

function LookupTransfers() {
  const [team, setTeam] = useState(null)
  const [player, setPlayer] = useState(null)
  const [teamState, setTeamState] = useState(DEFAULT_STATE)
  const [playerState, setPlayerState] = useState(DEFAULT_STATE)

  function loadTeam(event) {
    event.preventDefault()
    const teamId = entityId(team)
    if (!teamId) return
    setTeamState({ status: 'loading', data: null, error: '' })
    getTeamTransfers(teamId)
      .then((response) => setTeamState({ status: 'ready', data: response.data, error: '' }))
      .catch(() => setTeamState({ status: 'error', data: null, error: 'Could not load team transfers.' }))
  }

  function loadPlayer(event) {
    event.preventDefault()
    const playerId = entityId(player)
    if (!playerId) return
    setPlayerState({ status: 'loading', data: null, error: '' })
    getPlayerTransferHistory(playerId)
      .then((response) => setPlayerState({ status: 'ready', data: response.data, error: '' }))
      .catch(() => setPlayerState({ status: 'error', data: null, error: 'Could not load player history.' }))
  }

  return (
    <section className="transfer-lookup-grid">
      <div className="transfer-panel">
        <h2>Team transfers</h2>
        <form className="transfer-inline-form" onSubmit={loadTeam}>
          <EntityPicker label="Find a club" onSelect={setTeam} placeholder="Search club name..." selected={team} type="team" />
          <button disabled={!team} type="submit"><UsersRound size={16} /> Load</button>
        </form>
        {teamState.status === 'loading' ? <p className="match-empty">Loading team transfers...</p> : null}
        {teamState.status === 'error' ? <p className="match-empty">{teamState.error}</p> : null}
        {teamState.data ? (
          <div className="transfer-two-column">
            <CompactGroup title="Incoming" rows={teamState.data.transfers?.incoming || []} />
            <CompactGroup title="Outgoing" rows={teamState.data.transfers?.outgoing || []} />
          </div>
        ) : null}
      </div>
      <div className="transfer-panel">
        <h2>Player history</h2>
        <form className="transfer-inline-form" onSubmit={loadPlayer}>
          <EntityPicker label="Find a player" onSelect={setPlayer} placeholder="Search player name..." selected={player} type="player" />
          <button disabled={!player} type="submit"><History size={16} /> Load</button>
        </form>
        {playerState.status === 'loading' ? <p className="match-empty">Loading player history...</p> : null}
        {playerState.status === 'error' ? <p className="match-empty">{playerState.error}</p> : null}
        {playerState.data ? <HistoryList rows={playerState.data.transfers || []} /> : null}
      </div>
    </section>
  )
}

function CompactGroup({ title, rows }) {
  return (
    <section className="transfer-compact-group">
      <h3>{title}</h3>
      {rows.length ? rows.map((row, index) => (
        <div className="transfer-compact-row" key={`${title}-${row.playerId}-${index}`}>
          <strong>{row.player}</strong>
          <span>{[row.position, row.nationality, formatDate(row.transferDate), row.transferType, formatFee(row.transferFee)].filter(Boolean).join(' / ')}</span>
        </div>
      )) : <p className="match-empty">No transfers.</p>}
    </section>
  )
}

function HistoryList({ rows }) {
  if (!rows.length) return <p className="match-empty">No transfer history.</p>
  return (
    <div className="transfer-history-list">
      {rows.map((row) => (
        <article className="transfer-history-row" key={row.id}>
          <span>{formatDate(row.transferDate)}</span>
          <strong>{row.oldTeam?.name || 'Unknown'} to {row.newTeam?.name || 'Unknown'}</strong>
          <small>{row.transferType || 'unknown'} / {formatFee(row.transferFee)}{row.season ? ` / ${row.season}` : ''}</small>
        </article>
      ))}
    </div>
  )
}

function Kpi({ label, value }) {
  return (
    <span className="transfer-kpi">
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  )
}

function Pagination({ data, filters, onChange }) {
  if (!data?.totalPages || data.totalPages <= 1) return null
  const page = Number(filters.page || data.page || 1)
  return (
    <div className="transfer-pagination">
      <button disabled={page <= 1} onClick={() => onChange(page - 1)} type="button">Previous</button>
      <span>{page} / {data.totalPages}</span>
      <button disabled={page >= data.totalPages} onClick={() => onChange(page + 1)} type="button">Next</button>
    </div>
  )
}

function Transfers() {
  const [view, setView] = useState('latest')
  const items = useMemo(() => [
    { value: 'latest', label: 'Latest', count: 'Feed' },
    { value: 'search', label: 'Search', count: 'Filters' },
    { value: 'window', label: 'Window', count: 'Recent' },
    { value: 'summary', label: 'Summary', count: 'Clubs' },
    { value: 'lookup', label: 'Clubs & Players', count: 'History' },
  ], [])

  return (
    <div className="detail-page transfers-page">
      <header className="detail-hero transfers-hero">
        <span className="detail-hero__image detail-hero__image--empty"><ArrowDownUp size={34} /></span>
        <div className="detail-hero__content">
          <p className="eyebrow">Market movement</p>
          <h1>Transfers</h1>
          <div className="detail-meta">
            <span><CalendarClock size={15} /> Latest deals</span>
            <span><Search size={15} /> Transfer search</span>
            <span><CircleDollarSign size={15} /> Market summary</span>
            <span><Shirt size={15} /> Team and player history</span>
          </div>
        </div>
      </header>

      <ChoiceBox ariaLabel="Transfer view" items={items} onChange={setView} value={view} />

      {view === 'latest' ? <LatestTransfers /> : null}
      {view === 'search' ? <SearchTransfers /> : null}
      {view === 'window' ? <WindowTransfers /> : null}
      {view === 'summary' ? <SummaryTransfers /> : null}
      {view === 'lookup' ? <LookupTransfers /> : null}
      <button className="transfer-refresh-hint" onClick={() => window.location.reload()} type="button">
        <RefreshCw size={15} /> Refresh page data
      </button>
    </div>
  )
}

export default Transfers
