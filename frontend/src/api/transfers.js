import api from './api'

function toQuery(params = {}) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, value)
    }
  })

  const query = search.toString()
  return query ? `?${query}` : ''
}

export const getLatestTransfers = (params) => api.get(`/transfers/latest${toQuery(params)}`)
export const searchTransfers = (params) => api.get(`/transfers/search${toQuery(params)}`)
export const getTeamTransfers = (teamId) => api.get(`/transfers/team/${teamId}`)
export const getPlayerTransferHistory = (playerId) => api.get(`/transfers/player/${playerId}`)
export const getTransferWindow = () => api.get('/transfers/window')
export const getTransferSummary = (params) => api.get(`/transfers/summary${toQuery(params)}`)
