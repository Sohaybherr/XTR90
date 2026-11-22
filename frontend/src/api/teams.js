import api from './api'

export const getTeams = () => api.get('/teams')
export const getTeamById = (id) => api.get(`/teams/${id}`)
export const getTeamDetails = (id) => api.get(`/teams/${id}/details`)
export const getTeamCompetitionDetails = (teamId, competitionSeasonId) => (
  api.get(`/teams/${teamId}/competitions/${competitionSeasonId}/details`)
)
