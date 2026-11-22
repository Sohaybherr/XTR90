
import { useI18n } from '../../hooks/useI18n'

function SearchBar({ value, onInputChange }) {
  const { t } = useI18n()

  return (
    <div className="home-search" role="search">
      <label className="home-search__label" htmlFor="home-search">
        {t('search.title')}
      </label>
      <input
        id="home-search"
        className="home-search__input"
        type="search"
        placeholder={t('search.homePlaceholder')}
        value={value}
        onChange={onInputChange}
      />
    </div>
  )
}

export default SearchBar
