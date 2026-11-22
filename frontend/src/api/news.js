import api from './api'

const newsListCache = new Map()
const newsListRequests = new Map()
const newsDetailsCache = new Map()
const newsDetailsRequests = new Map()

function cacheKey(...parts) {
  return parts.map((part) => String(part || '')).join(':')
}

export const getNews = (language) => {
  const key = language || 'default'
  if (newsListCache.has(key)) {
    return Promise.resolve(newsListCache.get(key))
  }

  if (newsListRequests.has(key)) {
    return newsListRequests.get(key)
  }

  const request = api.get('/news', { params: language ? { locale: language } : undefined }).then((response) => {
    newsListCache.set(key, response)
    return response
  }).finally(() => {
    newsListRequests.delete(key)
  })

  newsListRequests.set(key, request)
  return request
}

export const getNewsById = (id, language) => {
  const key = cacheKey(language || 'default', id)
  if (newsDetailsCache.has(key)) {
    return Promise.resolve(newsDetailsCache.get(key))
  }

  if (newsDetailsRequests.has(key)) {
    return newsDetailsRequests.get(key)
  }

  const request = api.get(`/news/${id}`, { params: language ? { locale: language } : undefined }).then((response) => {
    newsDetailsCache.set(key, response)
    return response
  }).finally(() => {
    newsDetailsRequests.delete(key)
  })

  newsDetailsRequests.set(key, request)
  return request
}

export const createNews = (payload) => api.post('/news', payload)
export const updateNews = (id, payload) => api.put(`/news/${id}`, payload)
export const deleteNews = (id) => api.delete(`/news/${id}`)
