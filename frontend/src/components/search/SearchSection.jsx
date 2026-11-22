import { Search, X } from 'lucide-react'
import { useI18n } from '../../hooks/useI18n'

function SearchSection({ value, onChange, onClear }) {
  const { t } = useI18n()

  return (
    <section className="search-section">
      <form onSubmit={(event) => event.preventDefault()}>
        <Search className="search-section__icon" size={20} aria-hidden="true" />
        <input 
          type="text" 
          placeholder={t('search.placeholder')}
          value={value}
          onChange={onChange}
          autoComplete="off"
        />
        {value ? (
          <button aria-label={t('search.clear')} className="search-section__clear" onClick={onClear} type="button">
            <X size={17} />
          </button>
        ) : null}
      </form>
    </section>
  )
}

export default SearchSection
