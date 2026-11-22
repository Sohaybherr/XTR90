import NewsCard from '../cards/NewsCard'

function NewsListSection({ newsItems }) {
  return (
    <div className="news-list" data-testid="news-list-section">
      {newsItems.map((item, index) => (
        <NewsCard eager={index < 4} key={item.id} item={item} />
      ))}
    </div>
  )
}
export default NewsListSection
