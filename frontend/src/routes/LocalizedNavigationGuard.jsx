import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../hooks/useI18n'
import { localizedPath } from '../hooks/useLocalizedPath'

const LANGUAGE_PREFIX = /^\/(en|fr|ar|de|es)(?=\/|$)/

function LocalizedNavigationGuard() {
  const navigate = useNavigate()
  const { language } = useI18n()

  useEffect(() => {
    function handleClick(event) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return
      }

      const anchor = event.target.closest?.('a[href]')
      if (!anchor || anchor.target || anchor.hasAttribute('download')) {
        return
      }

      const url = new URL(anchor.href, window.location.origin)
      if (url.origin !== window.location.origin || LANGUAGE_PREFIX.test(url.pathname)) {
        return
      }

      event.preventDefault()
      navigate(`${localizedPath(language, url.pathname)}${url.search}${url.hash}`)
    }

    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [language, navigate])

  return null
}

export default LocalizedNavigationGuard
