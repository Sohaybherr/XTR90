import { useEffect, useMemo, useState } from 'react'
import { getSearchResults } from '../../api/search'
import ResultSection from '../../components/search/ResultSection'
import SearchSection from '../../components/search/SearchSection'
import SuggSection from '../../components/search/SuggSection'
import { useI18n } from '../../hooks/useI18n'

function Search() {
  const { t } = useI18n()
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState({ teams: [], players: [], competitions: [] })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  function handleSearchChange(event) {
    setSearchQuery(event.target.value)
  }

  const defaultSuggestions = useMemo(() => [
    { id: 1, name: 'Manchester City', type: 'team' },
    { id: 2, name: 'Real Madrid', type: 'team' },
    { id: 3, name: 'Paris Saint-Germain', type: 'team' },
    { id: 4, name: 'Premier League', type: 'competition' },
    { id: 5, name: 'Ligue 1', type: 'competition' },
  ], [])

  useEffect(() => {
    const query = searchQuery.trim()

    if (!query) {
      setResults({ teams: [], players: [], competitions: [] })
      setError('')
      setIsLoading(false)
      return
    }

    const controller = new AbortController()
    const timeoutId = window.setTimeout(async () => {
      try {
        setIsLoading(true)
        setError('')

        const response = await getSearchResults(query, controller.signal)
        setResults({
          teams: response.data.teams ?? [],
          players: response.data.players ?? [],
          competitions: response.data.competitions ?? [],
        })
      } catch (err) {
        if (err.name === 'CanceledError' || err.name === 'AbortError') {
          return
        }

        console.error(err)
        setError(t('search.error'))
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }, 400)

    return () => {
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [searchQuery, t])

  return (
    <div className="search-page">
      <div className="search-page__header">
        <p className="eyebrow">{t('search.subtitle')}</p>
        <h1>{t('search.title')}</h1>
      </div>

      <SearchSection value={searchQuery} onChange={handleSearchChange} onClear={() => setSearchQuery('')} />

      {error && (
        <p className="state-message state-message--error">
          {error}
        </p>
      )}

      {!searchQuery.trim() && (
        <SuggSection
          suggestions={defaultSuggestions}
          onSuggestionSelect={setSearchQuery}
        />
      )}

      {searchQuery.trim() && (
        <ResultSection
          query={searchQuery}
          results={results}
          isLoading={isLoading}
        />
      )}
    </div>
  )
}

export default Search
