import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useLocalizedPath } from '../hooks/useLocalizedPath'

function ProtectedRoute() {
  const location = useLocation()
  const { isAuthenticated, isLoading } = useAuth()
  const toLocale = useLocalizedPath()

  if (isLoading) {
    return <p className="state-message">Loading session...</p>
  }

  if (!isAuthenticated) {
    return <Navigate to={toLocale('/login')} replace state={{ from: location }} />
  }

  return <Outlet />
}

export default ProtectedRoute
