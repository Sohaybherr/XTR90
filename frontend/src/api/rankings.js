import api from './api'

export const getRankings = (type) => {
  const query = type ? `?type=${encodeURIComponent(type)}` : ''
  return api.get(`/rankings${query}`)
}
