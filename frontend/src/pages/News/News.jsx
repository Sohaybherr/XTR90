import { useEffect, useState } from "react"
import { getNews } from "../../api/news"
import NewsListSection from "../../components/news/NewsListSection"
import { useI18n } from "../../hooks/useI18n"
import { assertLocaleMatch } from "../../i18n/localeGuards"

function News() {
  const { language, t } = useI18n()
  const [newsItems, setNewsItems] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorKey, setErrorKey] = useState("")

  useEffect(() => {
    let mounted = true

    async function loadNews() {
      try {
        setIsLoading(true)
        setErrorKey("")

        const response = await getNews(language)

        if (mounted) {
          response.data.forEach((item) => {
            assertLocaleMatch({
              expectedLocale: language,
              actualLocale: item.locale || item.language,
              resource: `news article ${item.id}`,
            })
          })
          setNewsItems(response.data)
        }
      } catch (err) {
        console.error(err)

        if (mounted) {
          setErrorKey('news.error')
        }
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    loadNews()

    return () => {
      mounted = false
    }
  }, [language])

  return (
    <div className="news">
      <h1>{t('news.title')}</h1>

      {isLoading && <p className="state-message">{t('news.loading')}</p>}

      {errorKey && (
        <p className="state-message state-message--error">
          {t(errorKey)}
        </p>
      )}

      {!isLoading && !errorKey && newsItems.length === 0 && (
        <p className="state-message">{t('news.empty')}</p>
      )}

      {!isLoading && !errorKey && newsItems.length > 0 && (
        <NewsListSection newsItems={newsItems} />
      )}
    </div>
  )
}

export default News
