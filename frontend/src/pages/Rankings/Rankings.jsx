import { ArrowUpRight, BadgeCheck, Building2, Flag, Medal, Shield, Trophy } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getRankings } from '../../api/rankings'
import ChoiceBox from '../../components/ui/ChoiceBox'
import { useLocalizedPath } from '../../hooks/useLocalizedPath'
import { resolveAssetUrl } from '../../utils/assets'

const DEFAULT_STATE = { status: 'idle', data: { fifaMen: [], uefaClub: [] }, error: '' }

function formatNumber(value, digits = 2) {
  const number = Number(value || 0)
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(number)
}

function formatDate(value) {
  if (!value) return 'Not dated'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: '2-digit', year: 'numeric' }).format(date)
}

function tierLabel(value) {
  return String(value || 'unclassified').replaceAll('_', ' ')
}

function movementLabel(value) {
  const movement = Number(value || 0)
  if (movement > 0) return `+${movement}`
  if (movement < 0) return String(movement)
  return '0'
}

function RankingRow({ row }) {
  const toLocale = useLocalizedPath()
  const image = resolveAssetUrl(row.logo)

  return (
    <Link className="ranking-row" to={toLocale(`/teams/${row.teamId}`)}>
      <span className="ranking-row__rank">#{row.rank}</span>
      <span className="ranking-row__team">
        {image ? <img src={image} alt="" loading="lazy" decoding="async" /> : <i>{String(row.team || '?').charAt(0)}</i>}
        <strong>{row.team}</strong>
      </span>
      <span className="ranking-row__points">{formatNumber(row.points, row.type === 'uefa_club' ? 3 : 2)}</span>
      <span className={`ranking-row__move ranking-row__move--${Number(row.movement || 0) > 0 ? 'up' : Number(row.movement || 0) < 0 ? 'down' : 'same'}`}>
        {movementLabel(row.movement)}
      </span>
      <span className="ranking-row__tier">{tierLabel(row.classification?.tier)}</span>
    </Link>
  )
}

function RankingTable({ rows, emptyText }) {
  if (!rows.length) return <p className="match-empty">{emptyText}</p>
  return (
    <div className="ranking-table">
      <div className="ranking-table__head">
        <span>Rank</span>
        <span>Team</span>
        <span>Points</span>
        <span>Move</span>
        <span>Class</span>
      </div>
      {rows.map((row) => <RankingRow key={`${row.type}-${row.teamId}-${row.rank}`} row={row} />)}
    </div>
  )
}

function RankingStats({ rows, source }) {
  const leader = rows[0]
  const date = leader?.rankingDate
  const averagePoints = rows.length ? rows.reduce((sum, row) => sum + Number(row.points || 0), 0) / rows.length : 0

  return (
    <div className="ranking-kpis">
      <span>
        <small>Leader</small>
        <strong>{leader?.team || '-'}</strong>
      </span>
      <span>
        <small>Rows</small>
        <strong>{rows.length}</strong>
      </span>
      <span>
        <small>Average points</small>
        <strong>{formatNumber(averagePoints, source === 'UEFA' ? 3 : 2)}</strong>
      </span>
      <span>
        <small>Updated</small>
        <strong>{formatDate(date)}</strong>
      </span>
    </div>
  )
}

function Rankings() {
  const [view, setView] = useState('fifa')
  const [state, setState] = useState(DEFAULT_STATE)
  const rows = view === 'fifa' ? state.data.fifaMen : state.data.uefaClub
  const source = view === 'fifa' ? 'FIFA' : 'UEFA'
  const items = useMemo(() => [
    { value: 'fifa', label: 'FIFA national teams', count: state.data.fifaMen.length || 'Men' },
    { value: 'uefa', label: 'UEFA clubs', count: state.data.uefaClub.length || 'Club' },
  ], [state.data.fifaMen.length, state.data.uefaClub.length])

  useEffect(() => {
    setState(DEFAULT_STATE)
    setState((current) => ({ ...current, status: 'loading' }))
    getRankings()
      .then((response) => setState({ status: 'ready', data: response.data || DEFAULT_STATE.data, error: '' }))
      .catch(() => setState({ status: 'error', data: DEFAULT_STATE.data, error: 'Could not load rankings.' }))
  }, [])

  return (
    <div className="detail-page rankings-page">
      <header className="detail-hero rankings-hero">
        <span className="detail-hero__image detail-hero__image--empty"><Trophy size={34} /></span>
        <div className="detail-hero__content">
          <p className="eyebrow">Team strength</p>
          <h1>Rankings</h1>
          <div className="detail-meta">
            <span><Flag size={15} /> FIFA national teams</span>
            <span><Building2 size={15} /> UEFA clubs</span>
            <span><Shield size={15} /> Team classification</span>
            <span><BadgeCheck size={15} /> Prediction signal</span>
          </div>
        </div>
      </header>

      <ChoiceBox ariaLabel="Ranking view" items={items} onChange={setView} value={view} />

      <section className="ranking-workspace">
        <section className="ranking-panel ranking-panel--intro">
          <div>
            <h2>{source} classification</h2>
            <p>{source === 'FIFA' ? 'National teams ordered by world ranking strength.' : 'European clubs ordered by UEFA coefficient strength.'}</p>
          </div>
          <Medal size={28} />
        </section>

        <RankingStats rows={rows} source={source} />

        <section className="ranking-panel">
          <div className="ranking-panel__title">
            <h2>{source === 'FIFA' ? 'National team ranking' : 'Club coefficient ranking'}</h2>
            {rows[0]?.sourceUrl ? (
              <a href={rows[0].sourceUrl} rel="noreferrer" target="_blank">
                Source <ArrowUpRight size={14} />
              </a>
            ) : null}
          </div>
          {state.status === 'loading' ? <div className="transfer-panel transfer-panel--loading">Loading rankings...</div> : null}
          {state.status === 'error' ? <div className="transfer-panel transfer-panel--error">{state.error}</div> : null}
          {state.status !== 'loading' && state.status !== 'error' ? (
            <RankingTable emptyText="No ranking rows found." rows={rows} />
          ) : null}
        </section>
      </section>
    </div>
  )
}

export default Rankings
