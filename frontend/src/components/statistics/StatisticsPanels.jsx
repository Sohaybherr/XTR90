import { Activity, BarChart3, Goal, ShieldCheck, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useLocalizedPath } from '../../hooks/useLocalizedPath'
import { resolveAssetUrl } from '../../utils/assets'

function numberValue(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function formatPercent(value) {
  return `${numberValue(value).toFixed(numberValue(value) % 1 === 0 ? 0 : 1)}%`
}

function safeWidth(value) {
  return `${Math.max(0, Math.min(100, numberValue(value)))}%`
}

function polarToCartesian(cx, cy, radius, angle) {
  const radians = ((angle - 90) * Math.PI) / 180
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  }
}

function donutPath(cx, cy, radius, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, radius, endAngle)
  const end = polarToCartesian(cx, cy, radius, startAngle)
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y}`
}

function DonutChart({ title, center, segments }) {
  const total = segments.reduce((sum, segment) => sum + numberValue(segment.value), 0)
  let angle = 0

  return (
    <div className="stats-chart stats-chart--donut">
      <div className="stats-chart__header">
        <span>{title}</span>
        <strong>{center}</strong>
      </div>
      <svg viewBox="0 0 120 120" role="img" aria-label={title}>
        <circle className="stats-donut__track" cx="60" cy="60" r="42" />
        {segments.map((segment) => {
          if (!total || !numberValue(segment.value)) return null
          const size = (numberValue(segment.value) / total) * 360
          if (size >= 359.5) {
            angle += size
            return <circle className={`stats-donut__segment stats-donut__segment--${segment.key}`} cx="60" cy="60" r="42" key={segment.key} />
          }
          const path = donutPath(60, 60, 42, angle, angle + size)
          angle += size
          return <path className={`stats-donut__segment stats-donut__segment--${segment.key}`} d={path} key={segment.key} />
        })}
        <text x="60" y="53">{total}</text>
        <text x="60" y="69">matches</text>
      </svg>
      <div className="stats-chart__legend">
        {segments.map((segment) => (
          <span className={`stats-legend stats-legend--${segment.key}`} key={segment.key}>
            <i></i>{segment.label} <b>{segment.value}</b>
          </span>
        ))}
      </div>
    </div>
  )
}

function Sparkline({ title, matches = [], teamId }) {
  const values = matches.map((match) => {
    if (teamId) {
      const isHome = Number(match.homeTeam?.id) === Number(teamId)
      return numberValue(isHome ? match.score?.home : match.score?.away)
    }
    return numberValue(match.score?.home) + numberValue(match.score?.away)
  })
  const max = Math.max(...values, 1)
  const points = values.map((value, index) => {
    const x = values.length <= 1 ? 100 : (index / (values.length - 1)) * 200
    const y = 82 - (value / max) * 64
    return `${x},${y}`
  }).join(' ')

  return (
    <div className="stats-chart stats-chart--spark">
      <div className="stats-chart__header">
        <span>{title}</span>
        <strong>{values.join(' - ') || '0'}</strong>
      </div>
      <svg viewBox="0 0 200 96" role="img" aria-label={title}>
        <path d="M0 82 H200" />
        <path d="M0 50 H200" />
        <polyline points={points || '0,82 200,82'} />
        {values.map((value, index) => {
          const x = values.length <= 1 ? 100 : (index / (values.length - 1)) * 200
          const y = 82 - (value / max) * 64
          return (
            <g key={`${value}-${index}`}>
              <circle cx={x} cy={y} r="3.5" />
              <text x={x} y={Math.max(12, y - 8)}>{value}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function CompareBars({ title, items }) {
  const max = Math.max(...items.map((item) => numberValue(item.value)), 1)
  return (
    <div className="stats-chart stats-chart--bars">
      <div className="stats-chart__header">
        <span>{title}</span>
        <strong>{items.length} metrics</strong>
      </div>
      <div className="stats-bar-chart">
        {items.map((item) => (
          <div className="stats-bar-chart__row" key={item.label}>
            <span>{item.label}</span>
            <i><b style={{ width: `${(numberValue(item.value) / max) * 100}%` }}><em>{item.value}</em></b></i>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyStats({ label = 'No completed-match statistics yet.' }) {
  return <p className="match-empty stats-empty">{label}</p>
}

function FormDot({ result }) {
  const value = String(result || '').toUpperCase()
  return <span className={`stats-form-dot stats-form-dot--${value.toLowerCase()}`}>{value || '-'}</span>
}

export function TeamStatsPanel({ form, summary, loading = false, compact = false }) {
  if (loading) return <div className="stats-panel stats-panel--loading">Loading statistics...</div>
  if (!form && !summary) return <EmptyStats />

  const record = form?.record || summary?.overall || {}
  const goals = form?.goals || {
    for: record.goalsFor,
    against: record.goalsAgainst,
    difference: record.goalDifference,
  }
  const rates = form?.rates || {
    win: record.winRate,
    cleanSheet: record.cleanSheetRate,
    scored: record.scoredRate,
    conceded: record.concededRate,
    failedToScore: record.failedToScoreRate,
    bothTeamsScored: record.bothTeamsScoredRate,
    over05: record.over05Rate,
    over15: record.over15Rate,
    over25: record.over25Rate,
    over35: record.over35Rate,
  }
  const shotStats = record.shotStats || {}
  const formItems = form?.form || record.form || []

  return (
    <section className={`stats-panel${compact ? ' stats-panel--compact' : ''}`}>
      <div className="stats-panel__header">
        <span><TrendingUp size={16} /> Recent team form</span>
        <strong>Last {record.played ?? form?.matchesPlayed ?? 0}</strong>
      </div>

      <div className="stats-form-line" aria-label="Recent form">
        {formItems.length ? formItems.map((result, index) => <FormDot result={result} key={`${result}-${index}`} />) : <span className="stats-muted">No form</span>}
      </div>

      <div className="stats-chart-grid">
        <DonutChart
          center={`${record.wins ?? 0}W ${record.draws ?? 0}D ${record.losses ?? 0}L`}
          segments={[
            { key: 'wins', label: 'Wins', value: record.wins ?? 0 },
            { key: 'draws', label: 'Draws', value: record.draws ?? 0 },
            { key: 'losses', label: 'Losses', value: record.losses ?? 0 },
          ]}
          title={`Result split / ${record.played ?? 0} matches`}
        />
        <Sparkline matches={form?.matches || []} teamId={form?.team?.id} title="Goals scored trend" />
        <CompareBars
          items={[
            { label: 'Goals for', value: goals.for ?? 0 },
            { label: 'Goals against', value: goals.against ?? 0 },
            { label: 'Shots for', value: shotStats.shotsFor ?? 0 },
            { label: 'Shots against', value: shotStats.shotsAgainst ?? 0 },
            { label: 'Corners for', value: shotStats.cornersFor ?? 0 },
          ]}
          title={`Pressure volume / ${record.played ?? 0} matches`}
        />
      </div>

      <div className="stats-signal-grid">
        <SignalCard label="Scored in" value={rates.scored} />
        <SignalCard label="Conceded in" value={rates.conceded} danger />
        <SignalCard label="BTTS" value={rates.bothTeamsScored} />
        <SignalCard label="Over 1.5" value={rates.over15} />
        <SignalCard label="Over 2.5" value={rates.over25} />
        <SignalCard label="Over 3.5" value={rates.over35} />
      </div>

      <div className="stats-kpi-grid">
        <span><small>Record</small><strong>{record.wins ?? 0}W {record.draws ?? 0}D {record.losses ?? 0}L</strong></span>
        <span><small>Goals</small><strong>{goals.for ?? 0}:{goals.against ?? 0}</strong></span>
        <span><small>Goal diff</small><strong>{numberValue(goals.difference) > 0 ? '+' : ''}{goals.difference ?? 0}</strong></span>
        <span><small>PPG</small><strong>{record.pointsPerGame ?? 0}</strong></span>
        <span><small>Avg goals</small><strong>{record.averageGoalsFor ?? 0}:{record.averageGoalsAgainst ?? 0}</strong></span>
        <span><small>Avg total</small><strong>{record.averageTotalGoals ?? 0}</strong></span>
        <span><small>Avg shots</small><strong>{shotStats.averageShotsFor ?? 0}</strong></span>
        <span><small>Avg SOT</small><strong>{shotStats.averageShotsOnTargetFor ?? 0}</strong></span>
        <span><small>Avg corners</small><strong>{shotStats.averageCornersFor ?? 0}</strong></span>
        <span><small>Possession</small><strong>{shotStats.averagePossession ?? 0}%</strong></span>
        <span><small>xG for</small><strong>{shotStats.averageExpectedGoalsFor ?? 0}</strong></span>
        <span><small>xG against</small><strong>{shotStats.averageExpectedGoalsAgainst ?? 0}</strong></span>
      </div>

      <div className="stats-rate-list">
        <RateBar label="Win rate" value={rates.win} />
        <RateBar label="Scored in matches" value={rates.scored} />
        <RateBar label="Conceded in matches" value={rates.conceded} />
        <RateBar label="Clean sheets" value={rates.cleanSheet} />
        <RateBar label="Failed to score" value={rates.failedToScore} />
        <RateBar label="Both scored" value={rates.bothTeamsScored} />
        <RateBar label="Over 1.5 goals" value={rates.over15} />
        <RateBar label="Over 2.5 goals" value={rates.over25} />
        <RateBar label="Over 3.5 goals" value={rates.over35} />
      </div>
    </section>
  )
}

function SignalCard({ label, value, danger = false }) {
  const numericValue = numberValue(value)
  return (
    <span className={`stats-signal-card${danger ? ' stats-signal-card--danger' : ''}`}>
      <small>{label}</small>
      <strong>{formatPercent(numericValue)}</strong>
      <i><b style={{ width: safeWidth(numericValue) }} /></i>
    </span>
  )
}

export function PlayerStatsPanel({ summary, loading = false }) {
  if (loading) return <div className="stats-panel stats-panel--loading">Loading statistics...</div>
  if (!summary) return <EmptyStats />

  const totals = summary.totals || {}
  const rates = summary.rates || {}

  return (
    <section className="stats-panel">
      <div className="stats-panel__header">
        <span><Activity size={16} /> Player output</span>
        <strong>{totals.appearances ?? 0} apps</strong>
      </div>

      <div className="stats-kpi-grid stats-kpi-grid--player">
        <span><small>Minutes</small><strong>{totals.minutes ?? 0}</strong></span>
        <span><small>Goals</small><strong>{totals.goals ?? 0}</strong></span>
        <span><small>Assists</small><strong>{totals.assists ?? 0}</strong></span>
        <span><small>Starts</small><strong>{totals.starts ?? 0}</strong></span>
        <span><small>Shots</small><strong>{totals.shots ?? 0}</strong></span>
        <span><small>On target</small><strong>{totals.shotsOnTarget ?? 0}</strong></span>
      </div>

      <div className="stats-chart-grid">
        <DonutChart
          center={`${rates.shotAccuracy ?? 0}%`}
          segments={[
            { key: 'wins', label: 'On target', value: totals.shotsOnTarget ?? 0 },
            { key: 'losses', label: 'Off target', value: Math.max(0, numberValue(totals.shots) - numberValue(totals.shotsOnTarget)) },
          ]}
          title="Shot quality"
        />
        <CompareBars
          items={[
            { label: 'Goals', value: totals.goals ?? 0 },
            { label: 'Assists', value: totals.assists ?? 0 },
            { label: 'Shots', value: totals.shots ?? 0 },
            { label: 'Cards', value: numberValue(totals.yellowCards) + numberValue(totals.redCards) },
            { label: 'Saves', value: totals.saves ?? 0 },
          ]}
          title="Output profile"
        />
      </div>

      <div className="stats-rate-list">
        <RateBar label="Shot accuracy" value={rates.shotAccuracy} />
        <MetricLine label="Goals per 90" value={rates.goalsPer90} icon={<Goal size={15} />} />
        <MetricLine label="Assists per 90" value={rates.assistsPer90} icon={<BarChart3 size={15} />} />
        <MetricLine label="Clean sheets" value={totals.cleanSheets ?? 0} icon={<ShieldCheck size={15} />} />
      </div>
    </section>
  )
}

export function CompetitionVisualTable({ tableData, loading = false }) {
  const toLocale = useLocalizedPath()
  if (loading) return <div className="stats-panel stats-panel--loading">Loading table...</div>
  const rows = tableData?.table || []
  if (!rows.length) return <EmptyStats label="No completed-match table data yet." />

  const maxPoints = Math.max(...rows.map((row) => numberValue(row.points)), 1)
  const topRows = rows.slice(0, 8)

  return (
    <div className="stats-table-visual">
      <div className="stats-panel__header">
        <span><BarChart3 size={16} /> Visual table</span>
        <strong>{tableData.source === 'matches' ? 'Live computed' : 'Official standings'}</strong>
      </div>

      <div className="stats-chart-grid stats-chart-grid--competition">
        <CompareBars
          items={topRows.map((row) => ({ label: row.teamName || `Team ${row.teamId}`, value: row.points ?? 0 }))}
          title="Top points"
        />
        <CompareBars
          items={topRows.map((row) => ({ label: row.teamName || `Team ${row.teamId}`, value: Math.max(0, numberValue(row.goalDifference)) }))}
          title="Positive goal difference"
        />
      </div>

      <div className="stats-table-visual__rows">
        {rows.slice(0, 24).map((row) => {
          const logo = resolveAssetUrl(row.teamLogo)
          return (
            <Link className="stats-table-visual__row" to={toLocale(`/teams/${row.teamId}`)} key={row.teamId}>
              <span className="stats-table-visual__rank">{row.rank ?? '-'}</span>
              <span className="stats-table-visual__team">
                {logo ? <img src={logo} alt="" loading="lazy" decoding="async" /> : <i>{String(row.teamName || '?').charAt(0)}</i>}
                <strong>{row.teamName || 'Team'}</strong>
              </span>
              <span className="stats-table-visual__bar"><i style={{ width: `${(numberValue(row.points) / maxPoints) * 100}%` }} /></span>
              <span className="stats-table-visual__meta">{row.points ?? 0} pts</span>
              <span className="stats-table-visual__meta">{row.goalDifference > 0 ? '+' : ''}{row.goalDifference ?? 0} GD</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function RateBar({ label, value }) {
  return (
    <div className="stats-rate">
      <span>{label}</span>
      <strong>{formatPercent(value)}</strong>
      <i><b style={{ width: safeWidth(value) }} /></i>
    </div>
  )
}

function MetricLine({ label, value, icon }) {
  return (
    <div className="stats-metric-line">
      <span>{icon}{label}</span>
      <strong>{value ?? 0}</strong>
    </div>
  )
}
