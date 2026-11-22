import { useEffect, useMemo, useState } from 'react'
import CompetitionCard from '../cards/CompetitionCard'
import PlayerCard from '../cards/PlayerCard'
import TeamCard from '../cards/TeamCard'
import ChoiceBox from '../ui/ChoiceBox'
import { useI18n } from '../../hooks/useI18n'

const EMPTY_ITEMS = []

function ResultGroup({ title, items, renderItem }) {
  if (items.length === 0) {
    return null
  }

  return (
    <section className="result-group">
      <h2>{title}</h2>
      <div className="result-grid">
        {items.map(renderItem)}
      </div>
    </section>
  )
}

function ResultSection({ results, isLoading }) {
  const { t } = useI18n()
  const [activeType, setActiveType] = useState('teams')
  const teams = results.teams ?? EMPTY_ITEMS
  const players = results.players ?? EMPTY_ITEMS
  const competitions = results.competitions ?? EMPTY_ITEMS
  const total = teams.length + players.length + competitions.length
  const groups = useMemo(() => [
    {
      value: 'teams',
      title: t('search.entity.teams'),
      items: teams,
      renderItem: (team) => <TeamCard key={team.id} team={team} />,
    },
    {
      value: 'players',
      title: t('search.entity.players'),
      items: players,
      renderItem: (player) => <PlayerCard key={player.id} player={player} />,
    },
    {
      value: 'competitions',
      title: t('search.entity.competitions'),
      items: competitions,
      renderItem: (competition) => (
        <CompetitionCard key={competition.id} competition={competition} />
      ),
    },
  ], [competitions, players, t, teams])
  const activeGroup = groups.find((group) => group.value === activeType) || groups[0]

  useEffect(() => {
    if (activeGroup.items.length || total === 0) return
    const nextGroup = groups.find((group) => group.items.length)
    if (nextGroup) setActiveType(nextGroup.value)
  }, [activeGroup.items.length, groups, total])

  return (
    <section className="result-section">
      <div className="result-section__header">
        <h2>{t('search.results')}</h2>
        <span>{t('search.found', { count: total })}</span>
      </div>

      {isLoading && (
        <p className="state-message">{t('search.loading')}</p>
      )}

      {!isLoading && total === 0 && (
        <p className="state-message">{t('search.empty')}</p>
      )}

      {!isLoading && (
        <>
          {total > 0 ? (
            <ChoiceBox
              ariaLabel={t('search.resultType')}
              items={groups.map((group) => ({ value: group.value, label: group.title, count: group.items.length }))}
              onChange={setActiveType}
              value={activeType}
            />
          ) : null}
          <ResultGroup
            title={activeGroup.title}
            items={activeGroup.items}
            renderItem={activeGroup.renderItem}
          />
        </>
      )}
    </section>
  )
}

export default ResultSection
