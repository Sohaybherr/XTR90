import api from './api'

export const getMatches = () => api.get('/matches')
export const getLiveMatches = () => api.get('/matches/live')
export const getMatchById = (id) => api.get(`/matches/${id}`)
export const getMatchDetails = (id) => api.get(`/matches/${id}/details`)
export const syncMatchDetails = (id) => api.post(`/matches/${id}/sync-details`)
export const getMatchEvents = (id) => api.get(`/matches/${id}/events`)
export const getMatchStatistics = (id) => api.get(`/matches/${id}/statistics`)
export const getMatchLineups = (id) => api.get(`/matches/${id}/lineups`)
export const getMatchPlayerStatistics = (id) => api.get(`/matches/${id}/player-statistics`)
