import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getNewsById } from '../../api/news'
import { useI18n } from '../../hooks/useI18n'
import { formatDate, formatTime } from '../../i18n/formatting'
import { assertLocaleMatch } from '../../i18n/localeGuards'
import { resolveAssetUrl } from '../../utils/assets'

function NewsDetails() {
  const { id } = useParams()
  const { language, t } = useI18n()
  const [item, setItem] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorKey, setErrorKey] = useState('')

  useEffect(() => {
    let mounted = true

    async function loadNewsDetails() {
      try {
        setIsLoading(true)
        setErrorKey('')

        const response = await getNewsById(id, language)

        if (mounted) {
          assertLocaleMatch({
            expectedLocale: language,
            actualLocale: response.data.locale || response.data.language,
            resource: `news article ${response.data.id || id}`,
          })
          setItem(response.data)
        }
      } catch (err) {
        console.error(err)

        if (mounted) {
          setErrorKey('news.detailError')
        }
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    loadNewsDetails()

    return () => {
      mounted = false
    }
  }, [id, language])

  if (isLoading) {
    return <p className="state-message">{t('news.loading')}</p>
  }

  if (errorKey) {
    return (
      <p className="state-message state-message--error">
        {t(errorKey)}
      </p>
    )
  }

  if (!item) {
    return <p className="state-message">{t('news.notFound')}</p>
  }

  const imageSrc = resolveAssetUrl(item.imageUrl || item.image_url)
  const isBreaking = item.isBreaking || item.is_breaking
  const publishedAt = item.publishedAt || item.published_at
  const relatedItems = [
    ...(item.clubs || []),
    ...(item.players || []),
    ...(item.competitions || []),
  ].filter(Boolean)

  return (
    <article className="news-detail">
      {imageSrc ? <img className="news-detail__image" src={imageSrc} alt="" /> : null}
      <div className="news-detail__header">
        <div className="news-card__badges">
          {isBreaking ? <span className="news-pill news-pill--breaking">{t('news.breaking')}</span> : null}
          {item.category ? <span className="news-pill">{item.category}</span> : null}
          {item.language ? <span className="news-pill">{item.language.toUpperCase()}</span> : null}
        </div>
        <p className="eyebrow">{[item.source, formatDate(publishedAt, language), formatTime(publishedAt, language)].filter(Boolean).join(' - ')}</p>
        <h1>{item.title}</h1>
        {item.summary ? <p className="news-detail__summary">{item.summary}</p> : null}
      </div>
      {item.description ? <p className="news-detail__content">{item.description}</p> : null}
      {relatedItems.length > 0 ? (
        <div className="news-detail__related">
          {relatedItems.slice(0, 8).map((value) => (
            <span key={value}>{value}</span>
          ))}
        </div>
      ) : null}
      <a className="auth-submit" href={item.url} rel="noreferrer" target="_blank">
        {t('news.readOriginal')}
      </a>
    </article>
  )
}

export default NewsDetails
