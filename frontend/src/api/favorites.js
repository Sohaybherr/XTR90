import api from './api'

export const getFavoriteKeys = () => api.get('/users/me/favorites/keys')
export const getFavoriteMatchesFeed = () => api.get('/users/me/favorites/matches-feed')
export const getFavorites = () => api.get('/users/me/favorites')
export const addFavorite = (type, id) => api.post(`/users/me/favorites/${type}/${id}`)
export const removeFavorite = (type, id) => api.delete(`/users/me/favorites/${type}/${id}`)
