import { BrowserRouter } from 'react-router-dom'
import { lazy, Suspense, useEffect, useState } from 'react'
import { AuthProvider } from './context/AuthContext'
import { FavoritesProvider } from './context/FavoritesContext'
import { I18nProvider } from './context/I18nContext'
import AppRoutes from './routes/AppRoutes'
import LocalizedNavigationGuard from './routes/LocalizedNavigationGuard'
import './App.css'

const LiveEventNotifications = lazy(() => import('./components/live/LiveEventNotifications'))

function App() {
  const [enableLiveNotifications, setEnableLiveNotifications] = useState(false)

  useEffect(() => {
    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(() => setEnableLiveNotifications(true), { timeout: 3000 })
      return () => window.cancelIdleCallback(idleId)
    }

    const timer = window.setTimeout(() => setEnableLiveNotifications(true), 1500)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <BrowserRouter>
      <I18nProvider>
        <AuthProvider>
          <FavoritesProvider>
            <LocalizedNavigationGuard />
            <AppRoutes />
            {enableLiveNotifications ? (
              <Suspense fallback={null}>
                <LiveEventNotifications />
              </Suspense>
            ) : null}
          </FavoritesProvider>
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  )
}

export default App
