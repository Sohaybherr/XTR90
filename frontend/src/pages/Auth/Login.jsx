import { Eye, EyeOff, LogIn } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { redirectToSocialLogin } from '../../api/auth'
import { useAuth } from '../../hooks/useAuth'
import { useI18n } from '../../hooks/useI18n'
import { useLocalizedPath } from '../../hooks/useLocalizedPath'

function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()
  const { t } = useI18n()
  const toLocale = useLocalizedPath()
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const from = location.state?.from?.pathname || toLocale('/profile')

  function handleChange(event) {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setIsSubmitting(true)
    setError('')

    try {
      await login(form)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleSocialLogin(provider) {
    setError('')
    redirectToSocialLogin(provider)
  }

  return (
    <section className="auth-page">
      <div className="auth-panel">
        <header className="auth-panel__header">
          <p className="eyebrow">{t('auth.account')}</p>
          <h1>{t('auth.signIn')}</h1>
        </header>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            <span>{t('auth.email')}</span>
            <input
              autoComplete="email"
              name="email"
              onChange={handleChange}
              required
              type="email"
              value={form.email}
            />
          </label>

          <label>
            <span>{t('auth.password')}</span>
            <div className="auth-password-field">
              <input
                autoComplete="current-password"
                name="password"
                onChange={handleChange}
                required
                type={showPassword ? 'text' : 'password'}
                value={form.password}
              />
              <button
                aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                onClick={() => setShowPassword((value) => !value)}
                type="button"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          {error ? <p className="auth-form__error">{error}</p> : null}

          <button className="auth-submit" disabled={isSubmitting} type="submit">
            <LogIn size={18} />
            {isSubmitting ? t('auth.signingIn') : t('auth.signIn')}
          </button>
        </form>

        <div className="social-auth">
          <div className="social-auth__divider">
            <span>{t('auth.orContinue')}</span>
          </div>

          <div className="social-auth__grid">
            <button className="social-auth__button" onClick={() => handleSocialLogin('google')} type="button">
              <span className="social-auth__mark social-auth__mark--google">G</span>
              Google
            </button>

            <button className="social-auth__button" onClick={() => handleSocialLogin('facebook')} type="button">
              <span className="social-auth__mark social-auth__mark--facebook">f</span>
              Facebook
            </button>
          </div>
        </div>

        <p className="auth-switch">
          {t('auth.newHere')} <Link to={toLocale('/register')}>{t('auth.createLink')}</Link>
        </p>
      </div>
    </section>
  )
}

export default Login
