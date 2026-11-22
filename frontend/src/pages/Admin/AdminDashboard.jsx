import { FilePlus, Newspaper, ShieldCheck, Trash2, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useLocalizedPath } from '../../hooks/useLocalizedPath'

const adminLinks = [
  {
    to: '/admin/news/new',
    icon: FilePlus,
    title: 'Add news',
    description: 'Publish a new story to the public news feed.'
  },
  {
    to: '/admin/users',
    icon: UsersRound,
    title: 'Manage users',
    description: 'Approve admins, suspend users, activate users, or mark accounts deleted.'
  },
  {
    to: '/news',
    icon: Newspaper,
    title: 'Review news',
    description: 'Open the public news list and inspect published stories.'
  }
]

function AdminDashboard() {
  const { user } = useAuth()
  const toLocale = useLocalizedPath()

  return (
    <section className="admin-page">
      <header className="profile-hero">
        <span className="profile-hero__avatar profile-hero__avatar--empty">
          <ShieldCheck size={34} />
        </span>
        <div className="profile-hero__content">
          <p className="eyebrow">Admin</p>
          <h1>Admin page</h1>
          <div className="profile-meta">
            <span>{user?.email}</span>
            <span>{user?.role}</span>
          </div>
        </div>
      </header>

      <div className="admin-link-grid">
        {adminLinks.map((item) => {
          const Icon = item.icon

          return (
            <Link className="admin-link-card" key={item.to} to={toLocale(item.to)}>
              <Icon size={22} />
              <strong>{item.title}</strong>
              <span>{item.description}</span>
            </Link>
          )
        })}

        <div className="admin-link-card admin-link-card--disabled">
          <Trash2 size={22} />
          <strong>Delete content</strong>
          <span>Use manage users or future edit pages for destructive actions.</span>
        </div>
      </div>
    </section>
  )
}

export default AdminDashboard
