import { FilePlus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createNews } from '../../api/news'
import { useI18n } from '../../hooks/useI18n'
import { useLocalizedPath } from '../../hooks/useLocalizedPath'

const initialForm = {
  externalId: '',
  source: '',
  title: '',
  summary: '',
  description: '',
  rawArticle: '',
  url: '',
  imageUrl: '',
  publishedAt: '',
  language: '',
  category: '',
  importance: '',
  clubs: '',
  players: '',
  competitions: '',
  processingStatus: 'completed',
  published: true,
  isBreaking: false,
  aiCompleted: false,
  notificationSent: false
}

function AdminNewsNew() {
  const navigate = useNavigate()
  const { language } = useI18n()
  const toLocale = useLocalizedPath()
  const [form, setForm] = useState(() => ({ ...initialForm, language }))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  function handleChange(event) {
    const { checked, name, type, value } = event.target

    setForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  function splitList(value) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setIsSubmitting(true)
    setError('')

    try {
      const payload = {
        externalId: form.externalId,
        source: form.source,
        title: form.title,
        summary: form.summary || null,
        description: form.description || null,
        rawArticle: form.rawArticle || null,
        url: form.url,
        imageUrl: form.imageUrl || null,
        publishedAt: form.publishedAt || null,
        language: form.language || null,
        category: form.category || null,
        importance: form.importance || null,
        clubs: splitList(form.clubs),
        players: splitList(form.players),
        competitions: splitList(form.competitions),
        processingStatus: form.processingStatus,
        published: form.published,
        isBreaking: form.isBreaking,
        aiCompleted: form.aiCompleted,
        notificationSent: form.notificationSent
      }
      const response = await createNews(payload)
      navigate(toLocale(`/news/${response.data.id}`))
    } catch (err) {
      setError(err?.response?.data?.error || 'Unable to add news.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="admin-page">
      <div className="admin-page__top">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Add news</h1>
        </div>
        <Link className="admin-back-link" to={toLocale('/admin')}>Admin page</Link>
      </div>

      <section className="account-section">
        <form className="account-form" onSubmit={handleSubmit}>
          <label>
            <span>External ID</span>
            <input name="externalId" onChange={handleChange} required value={form.externalId} />
          </label>

          <label>
            <span>Source</span>
            <input name="source" onChange={handleChange} required value={form.source} />
          </label>

          <label>
            <span>Title</span>
            <input name="title" onChange={handleChange} required value={form.title} />
          </label>

          <label>
            <span>Summary</span>
            <textarea name="summary" onChange={handleChange} rows={3} value={form.summary} />
          </label>

          <label>
            <span>URL</span>
            <input name="url" onChange={handleChange} required type="url" value={form.url} />
          </label>

          <label>
            <span>Image URL</span>
            <input name="imageUrl" onChange={handleChange} type="url" value={form.imageUrl} />
          </label>

          <label>
            <span>Description</span>
            <textarea name="description" onChange={handleChange} rows={6} value={form.description} />
          </label>

          <label>
            <span>Raw article</span>
            <textarea name="rawArticle" onChange={handleChange} rows={8} value={form.rawArticle} />
          </label>

          <label>
            <span>Published at</span>
            <input name="publishedAt" onChange={handleChange} type="datetime-local" value={form.publishedAt} />
          </label>

          <label>
            <span>Language</span>
            <input maxLength={5} name="language" onChange={handleChange} placeholder="en" value={form.language} />
          </label>

          <label>
            <span>Category</span>
            <input name="category" onChange={handleChange} placeholder="Transfers" value={form.category} />
          </label>

          <label>
            <span>Importance</span>
            <input max={10} min={1} name="importance" onChange={handleChange} type="number" value={form.importance} />
          </label>

          <label>
            <span>Clubs</span>
            <input name="clubs" onChange={handleChange} placeholder="Real Madrid, PSG" value={form.clubs} />
          </label>

          <label>
            <span>Players</span>
            <input name="players" onChange={handleChange} placeholder="Kylian Mbappe, Jude Bellingham" value={form.players} />
          </label>

          <label>
            <span>Competitions</span>
            <input name="competitions" onChange={handleChange} placeholder="Champions League, La Liga" value={form.competitions} />
          </label>

          <label>
            <span>Processing status</span>
            <select name="processingStatus" onChange={handleChange} value={form.processingStatus}>
              <option value="pending">Pending</option>
              <option value="fetched">Fetched</option>
              <option value="classified">Classified</option>
              <option value="summarized">Summarized</option>
              <option value="processing">Processing</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
          </label>

          <div className="account-form__checks">
            <label>
              <input checked={form.published} name="published" onChange={handleChange} type="checkbox" />
              <span>Published</span>
            </label>
            <label>
              <input checked={form.isBreaking} name="isBreaking" onChange={handleChange} type="checkbox" />
              <span>Breaking</span>
            </label>
            <label>
              <input checked={form.aiCompleted} name="aiCompleted" onChange={handleChange} type="checkbox" />
              <span>AI completed</span>
            </label>
            <label>
              <input checked={form.notificationSent} name="notificationSent" onChange={handleChange} type="checkbox" />
              <span>Notification sent</span>
            </label>
          </div>

          {error ? <p className="auth-form__error">{error}</p> : null}

          <button className="auth-submit" disabled={isSubmitting} type="submit">
            <FilePlus size={18} />
            {isSubmitting ? 'Publishing...' : 'Publish news'}
          </button>
        </form>
      </section>
    </section>
  )
}

export default AdminNewsNew
