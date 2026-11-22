import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useLocalizedPath } from '../hooks/useLocalizedPath'

function AdminRoute() {
  const location = useLocation()
  const { isAuthenticated, isLoading, user } = useAuth()
  const toLocale = useLocalizedPath()

  if (isLoading) {
    return <p className="state-message">Loading session...</p>
  }

  if (!isAuthenticated) {
    return <Navigate to={toLocale('/login')} replace state={{ from: location }} />
  }

  if (user?.role !== 'ADMIN') {
    return <Navigate to={toLocale('/profile')} replace />
  }

  return <Outlet />
}

export default AdminRoute
