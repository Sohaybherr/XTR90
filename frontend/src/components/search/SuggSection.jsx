import { useI18n } from '../../hooks/useI18n'

function SuggSection({ suggestions, onSuggestionSelect }) {
  const { t } = useI18n()

  return (
    <section className="sugg-section">
      <h2>{t('search.suggestions')}</h2>
      <div className="sugg-section__list">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.id}
            type="button"
            className="suggestion-chip"
            onClick={() => onSuggestionSelect(suggestion.name)}
          >
            <span>{suggestion.name}</span>
            <small>{t(`search.entity.${suggestion.type}`)}</small>
          </button>
        ))}
      </div>
    </section>
  )
}

export default SuggSection
