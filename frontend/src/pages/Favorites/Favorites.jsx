import { useEffect, useMemo, useState } from 'react'
import { getFavorites } from '../../api/favorites'
import CompetitionCard from '../../components/cards/CompetitionCard'
import MatchCard from '../../components/cards/MatchCard'
import NewsCard from '../../components/cards/NewsCard'
import PlayerCard from '../../components/cards/PlayerCard'
import TeamCard from '../../components/cards/TeamCard'
import ChoiceBox from '../../components/ui/ChoiceBox'
import { useFavorites } from '../../hooks/useFavorites'

function FavoriteGroup({ emptyText, items, renderItem, title, variant = 'grid' }) {
  return (
    <section className={`favorite-group favorite-group--${variant}`}>
      <header className="favorite-group__header">
        <h2>{title}</h2>
        <span>{items.length}</span>
      </header>

      {items.length > 0 ? (
        <div className={variant === 'matches' ? 'favorite-match-list' : 'result-grid'}>
          {items.map(renderItem)}
        </div>
      ) : (
        <p className="state-message">{emptyText}</p>
      )}
    </section>
  )
}

function uniqueById(items = []) {
  const seen = new Set()

  return items.filter((item) => {
    const key = String(item?.id ?? '')
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function normalizeFavorites(favorites = {}) {
  return {
    competitions: uniqueById(favorites.competitions),
    teams: uniqueById(favorites.teams),
    players: uniqueById(favorites.players),
    matches: uniqueById(favorites.matches),
    news: uniqueById(favorites.news),
  }
}

function Favorites() {
  const { refreshFavorites } = useFavorites()
  const [favorites, setFavorites] = useState({ competitions: [], teams: [], players: [], matches: [], news: [] })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeCategory, setActiveCategory] = useState('matches')

  useEffect(() => {
    let mounted = true

    async function loadFavorites() {
      setIsLoading(true)
      setError('')

      try {
        const response = await getFavorites()
        if (mounted) {
          setFavorites(normalizeFavorites(response.data.favorites))
        }
      } catch (err) {
        if (mounted) {
          setError(err?.response?.data?.error || 'Unable to load favorites.')
        }
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    loadFavorites()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    refreshFavorites()
  }, [refreshFavorites])

  const total = favorites.competitions.length + favorites.teams.length + favorites.players.length + favorites.matches.length + favorites.news.length
  const favoriteGroups = useMemo(() => [
    {
      value: 'matches',
      title: 'Matches',
      items: favorites.matches,
      variant: 'matches',
      emptyText: 'No favorite matches yet.',
      renderItem: (match) => <MatchCard key={match.id} match={match} />,
    },
    {
      value: 'news',
      title: 'News',
      items: favorites.news,
      emptyText: 'No favorite news yet.',
      renderItem: (item) => <NewsCard key={item.id} item={item} />,
    },
    {
      value: 'competitions',
      title: 'Competitions',
      items: favorites.competitions,
      emptyText: 'No favorite competitions yet.',
      renderItem: (competition) => <CompetitionCard key={competition.id} competition={competition} />,
    },
    {
      value: 'teams',
      title: 'Teams',
      items: favorites.teams,
      emptyText: 'No favorite teams yet.',
      renderItem: (team) => <TeamCard key={team.id} team={team} />,
    },
    {
      value: 'players',
      title: 'Players',
      items: favorites.players,
      emptyText: 'No favorite players yet.',
      renderItem: (player) => <PlayerCard key={player.id} player={player} />,
    },
  ], [favorites])
  const activeGroup = favoriteGroups.find((group) => group.value === activeCategory) || favoriteGroups[0]

  return (
    <section className="favorites-page">
      <header className="favorites-page__header">
        <p className="eyebrow">Account</p>
        <h1>Favorites</h1>
        <span>{total} saved</span>
      </header>

      {isLoading ? <p className="state-message">Loading favorites...</p> : null}
      {error ? <p className="state-message state-message--error">{error}</p> : null}

      {!isLoading && !error ? (
        <div className="favorites-layout">
          <ChoiceBox
            ariaLabel="Favorite category"
            items={favoriteGroups.map((group) => ({ value: group.value, label: group.title, count: group.items.length }))}
            onChange={setActiveCategory}
            value={activeCategory}
          />
          <FavoriteGroup
            title={activeGroup.title}
            items={activeGroup.items}
            variant={activeGroup.variant}
            emptyText={activeGroup.emptyText}
            renderItem={activeGroup.renderItem}
          />
        </div>
      ) : null}
    </section>
  )
}

export default Favorites
