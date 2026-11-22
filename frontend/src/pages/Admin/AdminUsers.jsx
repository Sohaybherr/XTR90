import { ShieldCheck, ShieldPlus, Trash2, UserCheck, UserX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteAdminUser, getAdminUsers, updateAdminUserRole, updateAdminUserStatus } from '../../api/admin'
import { useAuth } from '../../hooks/useAuth'
import { useLocalizedPath } from '../../hooks/useLocalizedPath'

function AdminUsers() {
  const { user: currentUser } = useAuth()
  const toLocale = useLocalizedPath()
  const [users, setUsers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionStatus, setActionStatus] = useState('')

  async function loadUsers() {
    try {
      setIsLoading(true)
      setError('')
      const response = await getAdminUsers()
      setUsers(response.data.users)
    } catch (err) {
      setError(err?.response?.data?.error || 'Unable to load users.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  async function runAction(action, successMessage) {
    try {
      setActionStatus('')
      setError('')
      await action()
      setActionStatus(successMessage)
      await loadUsers()
    } catch (err) {
      setError(err?.response?.data?.error || 'Action failed.')
    }
  }

  return (
    <section className="admin-page">
      <div className="admin-page__top">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Manage users</h1>
        </div>
        <Link className="admin-back-link" to={toLocale('/admin')}>Admin page</Link>
      </div>

      {isLoading ? <p className="state-message">Loading users...</p> : null}
      {error ? <p className="state-message state-message--error">{error}</p> : null}
      {actionStatus ? <p className="state-message state-message--success">{actionStatus}</p> : null}

      {!isLoading && users.length > 0 ? (
        <div className="admin-user-list">
          {users.map((item) => {
            const isSelf = String(item.id) === String(currentUser?.id)

            return (
              <article className="admin-user-row" key={item.id}>
                <div className="admin-user-row__main">
                  <strong>{item.username}</strong>
                  <span>{item.email}</span>
                </div>

                <div className="admin-user-row__badges">
                  <span>{item.role}</span>
                  <span>{item.status}</span>
                </div>

                <div className="admin-user-row__actions">
                  <button
                    disabled={item.role === 'ADMIN'}
                    onClick={() => runAction(() => updateAdminUserRole(item.id, 'ADMIN'), 'User promoted to admin.')}
                    title="Approve as admin"
                    type="button"
                  >
                    <ShieldPlus size={16} />
                  </button>
                  <button
                    disabled={item.role === 'USER'}
                    onClick={() => runAction(() => updateAdminUserRole(item.id, 'USER'), 'User role changed to user.')}
                    title="Make simple user"
                    type="button"
                  >
                    <ShieldCheck size={16} />
                  </button>
                  <button
                    disabled={item.status === 'ACTIVE'}
                    onClick={() => runAction(() => updateAdminUserStatus(item.id, 'ACTIVE'), 'User activated.')}
                    title="Activate"
                    type="button"
                  >
                    <UserCheck size={16} />
                  </button>
                  <button
                    disabled={isSelf || item.status === 'SUSPENDED'}
                    onClick={() => runAction(() => updateAdminUserStatus(item.id, 'SUSPENDED'), 'User suspended.')}
                    title="Suspend"
                    type="button"
                  >
                    <UserX size={16} />
                  </button>
                  <button
                    disabled={isSelf || item.status === 'DELETED'}
                    onClick={() => runAction(() => deleteAdminUser(item.id), 'User marked deleted.')}
                    title="Delete"
                    type="button"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}

export default AdminUsers
