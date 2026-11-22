import { useNavigate } from 'react-router-dom'
import { useLocalizedPath } from './useLocalizedPath'

export function useLocalizedNavigate() {
  const navigate = useNavigate()
  const toLocale = useLocalizedPath()

  return (path, options) => {
    navigate(toLocale(path), options)
  }
}
