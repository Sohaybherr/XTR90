import api from './api'

export const getPlayers = () => api.get('/players')
export const getPlayerById = (id) => api.get(`/players/${id}`)
export const getPlayerDetails = (id) => api.get(`/players/${id}/details`)
export const getPlayerEnrichment = (id) => api.get(`/players/${id}/transfermarkt`)
