import { Star } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useFavorites } from '../../hooks/useFavorites'
import { useLocalizedPath } from '../../hooks/useLocalizedPath'

function FavoriteButton({ id, type }) {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const { isFavorite, toggleFavorite } = useFavorites()
  const toLocale = useLocalizedPath()
  const active = isFavorite(type, id)

  if (!id) {
    return null
  }

  async function handleClick(event) {
    event.preventDefault()
    event.stopPropagation()

    if (!isAuthenticated) {
      navigate(toLocale('/login'))
      return
    }

    try {
      await toggleFavorite(type, id)
    } catch (error) {
      console.error(error)
    }
  }

  return (
    <button
      aria-label={active ? 'Remove from favorites' : 'Add to favorites'}
      aria-pressed={active}
      className={`favorite-button${active ? ' favorite-button--active' : ''}`}
      onClick={handleClick}
      title={active ? 'Remove from favorites' : 'Add to favorites'}
      type="button"
    >
      <Star size={17} fill={active ? 'currentColor' : 'none'} />
    </button>
  )
}

export default FavoriteButton
