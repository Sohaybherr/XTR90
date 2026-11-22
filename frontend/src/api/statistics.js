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

export const getTeamForm = (teamId, params) => api.get(`/statistics/teams/${teamId}/form${toQuery(params)}`)
export const getTeamSummary = (teamId, params) => api.get(`/statistics/teams/${teamId}/summary${toQuery(params)}`)
export const getHeadToHead = (params) => api.get(`/statistics/head-to-head${toQuery(params)}`)
export const getPlayerSummary = (playerId, params) => api.get(`/statistics/players/${playerId}/summary${toQuery(params)}`)
export const getCompetitionTable = (competitionId, params) => api.get(`/statistics/competitions/${competitionId}/table${toQuery(params)}`)
