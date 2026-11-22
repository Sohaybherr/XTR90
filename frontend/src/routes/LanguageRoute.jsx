import { useEffect, useMemo, useState } from 'react'
import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom'
import { useI18n } from '../hooks/useI18n'
import i18n from '../i18n/config'
import { namespacesForPath } from '../i18n/bootstrap'
import { normalizeLanguage } from '../i18n/languages'

function LanguageRoute() {
  const { lang } = useParams()
  const location = useLocation()
  const { language, setLanguage } = useI18n()
  const normalizedLang = normalizeLanguage(lang)
  const namespaces = useMemo(() => namespacesForPath(location.pathname), [location.pathname])
  const [isReady, setIsReady] = useState(() => {
    return normalizedLang === language && namespaces.every((namespace) => {
      return i18n.hasResourceBundle(normalizedLang, namespace)
    })
  })

  useEffect(() => {
    let active = true

    async function syncLanguageRoute() {
      const routeIsLoaded = normalizedLang === language && namespaces.every((namespace) => {
        return i18n.hasResourceBundle(normalizedLang, namespace)
      })

      if (routeIsLoaded) {
        setIsReady(true)
        return
      }

      setIsReady(false)
      await setLanguage(normalizedLang, namespaces)
      if (active) setIsReady(true)
    }

    syncLanguageRoute()

    return () => {
      active = false
    }
  }, [language, namespaces, normalizedLang, setLanguage])

  if (lang !== normalizedLang) {
    return <Navigate replace to={`/${normalizedLang}`} />
  }

  if (!isReady) {
    return null
  }

  return <Outlet />
}

export default LanguageRoute
