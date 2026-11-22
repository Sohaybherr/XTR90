import { Link } from 'react-router-dom'
import { memo } from 'react'
import FavoriteButton from '../common/FavoriteButton'
import { resolveAssetUrl } from '../../utils/assets'
import { useI18n } from '../../hooks/useI18n'
import { useLocalizedPath } from '../../hooks/useLocalizedPath'
import { formatDate } from '../../i18n/formatting'

function NewsCard({ eager = false, item }) {
  const { language, t } = useI18n()
  const toLocale = useLocalizedPath()
  const imageSrc = resolveAssetUrl(item.imageUrl || item.image_url)
  const teaser = item.summary || item.description
  const isBreaking = item.isBreaking || item.is_breaking
  const meta = [item.source, item.category, formatDate(item.publishedAt || item.published_at, language)].filter(Boolean)

  return (
    <Link className="news-card" to={toLocale(`/news/${item.id}`)} data-testid="news-item">
      {imageSrc ? (
        <img
          className="news-card__image"
          src={imageSrc}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={eager ? 'high' : 'auto'}
        />
      ) : (
        <span className="news-card__image news-card__image--empty">{item.source?.slice(0, 2) || 'N'}</span>
      )}
      <span className="news-card__content">
        <span className="news-card__badges">
          {isBreaking ? <span className="news-pill news-pill--breaking">{t('news.breaking')}</span> : null}
          {item.category ? <span className="news-pill">{item.category}</span> : null}
        </span>
        <strong>{item.title}</strong>
        {teaser ? <span>{teaser}</span> : null}
        <small>{meta.join(' - ')}</small>
      </span>
      <FavoriteButton id={item.id} type="news" />
    </Link>
  )
}

export default memo(NewsCard)
