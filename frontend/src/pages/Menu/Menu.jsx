import {
  BadgeDollarSign,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogIn,
  LogOut,
  Mail,
  PlayCircle,
  Settings,
  Star,
  UserPlus,
  UserRound,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { updateProfile } from '../../api/users'
import { useAuth } from '../../hooks/useAuth'
import { useI18n } from '../../hooks/useI18n'
import { useLocalizedPath } from '../../hooks/useLocalizedPath'
import { namespacesForPath } from '../../i18n/bootstrap'

function Menu() {
  const location = useLocation()
  const navigate = useNavigate()
  const toLocale = useLocalizedPath()
  const { isAuthenticated, logout, setUser, user } = useAuth()
  const { language, languages, setLanguage, t } = useI18n()
  const [gamblingContentEnabled, setGamblingContentEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem('gamblingContentEnabled')
      return stored == null ? true : stored === 'true'
    } catch {
      return true
    }
  })
  const displayName = useMemo(() => {
    const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ')
    return fullName || user?.username || 'Account'
  }, [user])

  useEffect(() => {
    if (!isAuthenticated || !user) return
    setGamblingContentEnabled(user.showOdds !== false)
  }, [isAuthenticated, user])

  function applyOddsPreference(next) {
    try {
      localStorage.setItem('gamblingContentEnabled', String(next))
      window.dispatchEvent(new CustomEvent('gambling-content-change', { detail: { enabled: next } }))
    } catch {
      // The UI state still updates when storage is unavailable.
    }
  }

  async function persistUserPreferences(payload) {
    if (!isAuthenticated) return

    try {
      const response = await updateProfile(payload)
      setUser(response.data.user)
    } catch (error) {
      console.error(error)
    }
  }

  function handleGamblingToggle() {
    setGamblingContentEnabled((current) => {
      const next = !current
      applyOddsPreference(next)
      persistUserPreferences({ showOdds: next })
      return next
    })
  }

  async function handleLanguageChange(event) {
    const nextLanguage = event.target.value
    const nextPathname = location.pathname.replace(/^\/(en|fr|ar|de|es)(?=\/|$)/, `/${nextLanguage}`)
    const nextLocation = `${nextPathname}${location.search}${location.hash}`

    await setLanguage(nextLanguage, namespacesForPath(nextPathname))
    persistUserPreferences({ preferredLanguage: nextLanguage })
    navigate(nextLocation)
  }

  async function handleLogout() {
    await logout()
    navigate(toLocale('/'))
  }

  return (
    <section className="menu-page">
      <header className="profile-hero">
        <span className="profile-hero__avatar profile-hero__avatar--empty">
          <Settings size={34} />
        </span>
        <div className="profile-hero__content">
          <p className="eyebrow">Menu</p>
          <h1>{isAuthenticated ? displayName : 'Account & settings'}</h1>
          <div className="profile-meta">
            <span>{isAuthenticated ? user?.email : 'Guest'}</span>
            {isAuthenticated ? <span>{user?.role}</span> : null}
          </div>
        </div>
      </header>

      <div className="menu-grid">
        <section className="account-section">
          <div className="account-section__header">
            <h2>Account</h2>
          </div>
          <div className="menu-action-list">
            {isAuthenticated ? (
              <>
                <Link className="menu-action" to={toLocale('/profile')}>
                  <UserRound size={18} />
                  <span>{t('nav.profile')}</span>
                </Link>
                {user?.role === 'ADMIN' ? (
                  <Link className="menu-action" to={toLocale('/admin')}>
                    <LayoutDashboard size={18} />
                    <span>{t('nav.admin')}</span>
                  </Link>
                ) : null}
                <button className="menu-action menu-action--danger" onClick={handleLogout} type="button">
                  <LogOut size={18} />
                  <span>{t('nav.signOut')}</span>
                </button>
              </>
            ) : (
              <>
                <Link className="menu-action" to={toLocale('/login')}>
                  <LogIn size={18} />
                  <span>{t('nav.signIn')}</span>
                </Link>
                <Link className="menu-action menu-action--primary" to={toLocale('/register')}>
                  <UserPlus size={18} />
                  <span>{t('nav.join')}</span>
                </Link>
              </>
            )}
          </div>
        </section>

        <section className="account-section">
          <div className="account-section__header">
            <h2>Preferences</h2>
            <span>Personalize your language and content filters.</span>
          </div>
          <div className="preference-list">
            <label className="preference-row">
              <span className="preference-row__icon">
                <Settings size={18} />
              </span>
              <span className="preference-row__content">
                <strong>{t('nav.language')}</strong>
                <small>Choose the language used across the app.</small>
              </span>
              <select className="preference-row__select" aria-label={t('nav.language')} onChange={handleLanguageChange} value={language}>
                {languages.map((item) => (
                  <option key={item.code} value={item.code}>{item.nativeName}</option>
                ))}
              </select>
            </label>

            <button className={`preference-row preference-row--button${gamblingContentEnabled ? ' preference-row--active' : ''}`} onClick={handleGamblingToggle} type="button">
              <span className="preference-row__icon">
                <BadgeDollarSign size={18} />
              </span>
              <span className="preference-row__content">
                <strong>Odds content</strong>
                <small>{gamblingContentEnabled ? 'Betting odds are visible in match pages.' : 'Betting odds are hidden from match pages.'}</small>
              </span>
              <span className="preference-row__status">{gamblingContentEnabled ? t('nav.on') : t('nav.off')}</span>
            </button>
          </div>
        </section>

        <section className="account-section account-section--wide">
          <div className="account-section__header">
            <h2>Help & business</h2>
            <span>Plans, payment, conditions, and support.</span>
          </div>
          <div className="menu-action-list menu-action-list--columns">
            <Link className="menu-action" to={toLocale('/plans')}>
              <Star size={18} />
              <span>Plans</span>
            </Link>
            <Link className="menu-action" to={toLocale('/payment')}>
              <CreditCard size={18} />
              <span>Payment</span>
            </Link>
            <Link className="menu-action" to={toLocale('/conditions')}>
              <FileText size={18} />
              <span>Conditions</span>
            </Link>
            <Link className="menu-action" to={toLocale('/contact')}>
              <Mail size={18} />
              <span>Contact</span>
            </Link>
            <Link className="menu-action menu-action--primary" to={toLocale('/learn')}>
              <PlayCircle size={18} />
              <span>{t('nav.learn')}</span>
            </Link>
          </div>
        </section>
      </div>
    </section>
  )
}

export default Menu
