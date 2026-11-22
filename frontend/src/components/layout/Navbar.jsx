import {
  CalendarDays,
  BarChart3,
  ChevronDown,
  Compass,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogIn,
  Mail,
  Menu,
  Moon,
  Newspaper,
  PlayCircle,
  Search,
  Star,
  Repeat2,
  Medal,
  Sun,
  Trophy,
  UserPlus,
  UserRound,
} from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useI18n } from '../../hooks/useI18n'
import { useLocalizedPath } from '../../hooks/useLocalizedPath'

function Navbar() {
  const { isAuthenticated, user } = useAuth()
  const { t } = useI18n()
  const toLocale = useLocalizedPath()
  const isAdmin = user?.role === 'ADMIN'
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || localStorage.getItem('theme') || 'light')

  function toggleTheme() {
    setTheme((currentTheme) => {
      const nextTheme = currentTheme === 'dark' ? 'light' : 'dark'
      document.documentElement.dataset.theme = nextTheme
      localStorage.setItem('theme', nextTheme)
      return nextTheme
    })
  }

  const navGroups = [
    {
      label: t('nav.matches'),
      icon: CalendarDays,
      items: [
        { label: t('nav.matches'), to: '/', icon: CalendarDays },
        { label: 'Live center', to: '/matches', icon: Trophy },
        ...(isAuthenticated ? [{ label: t('nav.favorites'), to: '/favorites', icon: Star }] : []),
      ],
    },
    {
      label: 'Explore',
      icon: Compass,
      items: [
        { label: t('nav.news'), to: '/news', icon: Newspaper },
        { label: t('nav.search'), to: '/search', icon: Search },
        { label: 'Statistics', to: '/statistics', icon: BarChart3 },
        { label: 'Transfers', to: '/transfers', icon: Repeat2 },
        { label: 'Rankings', to: '/rankings', icon: Medal },
        { label: t('nav.learn'), to: '/learn', icon: PlayCircle },
        { label: 'Plans', to: '/plans', icon: Trophy },
        { label: 'Payment', to: '/payment', icon: CreditCard },
        { label: 'Conditions', to: '/conditions', icon: FileText },
        { label: 'Contact', to: '/contact', icon: Mail },
        { label: 'Full menu', to: '/menu', icon: Menu },
      ],
    },
    {
      label: isAuthenticated ? t('nav.profile') : 'Account',
      icon: UserRound,
      items: isAuthenticated
        ? [
            { label: t('nav.profile'), to: '/profile', icon: UserRound },
            ...(isAdmin ? [{ label: t('nav.admin'), to: '/admin', icon: LayoutDashboard }] : []),
            { label: 'Settings', to: '/menu', icon: Menu },
          ]
        : [
            { label: t('nav.signIn'), to: '/login', icon: LogIn },
            { label: t('nav.join'), to: '/register', icon: UserPlus },
            { label: 'Settings', to: '/menu', icon: Menu },
          ],
    },
  ]

  return (
    <header className="navbar">
      <Link className="navbar__brand" to={toLocale('/')}>
        <span className="navbar__wordmark" aria-label="XTRA90">
          <span className="navbar__wordmark-x">X</span>TRA<span className="navbar__wordmark-90">90</span>
        </span>
      </Link>
      <nav className="navbar__nav" aria-label={t('nav.primary')}>
        {navGroups.map((group) => {
          const GroupIcon = group.icon

          return (
            <div className="navbar__menu" key={group.label}>
              <button className="navbar__menu-trigger" type="button" aria-haspopup="true">
                <GroupIcon size={15} />
                <span>{group.label}</span>
                <ChevronDown className="navbar__menu-chevron" size={14} />
              </button>
              <div className="navbar__dropdown" role="menu">
                {group.items.map((item) => {
                  const ItemIcon = item.icon

                  return (
                    <NavLink className="navbar__dropdown-link" key={`${group.label}-${item.to}-${item.label}`} to={toLocale(item.to)} role="menuitem">
                      <ItemIcon size={16} />
                      <span>{item.label}</span>
                    </NavLink>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>
      <button
        className="navbar__theme-button"
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        type="button"
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
      </button>
    </header>
  )
}

export default Navbar
