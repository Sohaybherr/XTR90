import { useCallback, useEffect, useMemo, useState } from 'react'
import { addFavorite, getFavoriteKeys, removeFavorite } from '../api/favorites'
import { useAuth } from '../hooks/useAuth'
import { FavoritesContext } from './favorites-context'

function favoriteKey(type, id) {
  return `${type}:${id}`
}

export function FavoritesProvider({ children }) {
  const { isAuthenticated } = useAuth()
  const [favoriteKeys, setFavoriteKeys] = useState(() => new Set())
  const [isLoadingFavorites, setIsLoadingFavorites] = useState(false)

  const refreshFavorites = useCallback(async () => {
    if (!isAuthenticated) {
      setFavoriteKeys(new Set())
      return
    }

    setIsLoadingFavorites(true)

    try {
      const response = await getFavoriteKeys()
      setFavoriteKeys(new Set((response.data.favorites || []).map((item) => favoriteKey(item.type, item.id))))
    } catch (error) {
      if (error?.response?.status !== 401) {
        console.error(error)
      }
      setFavoriteKeys(new Set())
    } finally {
      setIsLoadingFavorites(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    refreshFavorites()
  }, [refreshFavorites])

  const isFavorite = useCallback((type, id) => favoriteKeys.has(favoriteKey(type, id)), [favoriteKeys])

  const toggleFavorite = useCallback(async (type, id) => {
    if (!isAuthenticated) {
      throw new Error('Sign in to save favorites.')
    }

    const key = favoriteKey(type, id)
    const nextFavorite = !favoriteKeys.has(key)

    setFavoriteKeys((current) => {
      const next = new Set(current)
      if (nextFavorite) next.add(key)
      else next.delete(key)
      return next
    })

    try {
      if (nextFavorite) {
        await addFavorite(type, id)
      } else {
        await removeFavorite(type, id)
      }
    } catch (error) {
      setFavoriteKeys((current) => {
        const next = new Set(current)
        if (nextFavorite) next.delete(key)
        else next.add(key)
        return next
      })
      throw new Error(error?.response?.data?.error || 'Unable to update favorite.')
    }
  }, [favoriteKeys, isAuthenticated])

  const value = useMemo(() => ({
    favoriteKeys,
    isFavorite,
    isLoadingFavorites,
    refreshFavorites,
    toggleFavorite
  }), [favoriteKeys, isFavorite, isLoadingFavorites, refreshFavorites, toggleFavorite])

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  )
}
