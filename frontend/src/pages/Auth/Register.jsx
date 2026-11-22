import { Eye, EyeOff, ShieldCheck, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { redirectToSocialLogin } from '../../api/auth'
import { useAuth } from '../../hooks/useAuth'
import { useI18n } from '../../hooks/useI18n'
import { useLocalizedPath } from '../../hooks/useLocalizedPath'

const initialForm = {
  email: '',
  username: '',
  firstName: '',
  lastName: '',
  password: '',
  confirmPassword: ''
}

function Register() {
  const navigate = useNavigate()
  const { register, resendEmailOtp, verifyEmailOtp } = useAuth()
  const { t } = useI18n()
  const toLocale = useLocalizedPath()
  const [form, setForm] = useState(initialForm)
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [pendingEmail, setPendingEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [devOtp, setDevOtp] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

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
      const response = await register(form)
      if (response.verificationRequired) {
        setPendingEmail(form.email)
        setDevOtp(response.verification?.otp || '')
        setStatus('Enter the verification code sent to your email.')
        return
      }

      navigate(toLocale('/profile'), { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleVerifySubmit(event) {
    event.preventDefault()
    setIsVerifying(true)
    setError('')
    setStatus('')

    try {
      await verifyEmailOtp({ email: pendingEmail, code: otpCode })
      navigate(toLocale('/profile'), { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setIsVerifying(false)
    }
  }

  async function handleResendCode() {
    setIsVerifying(true)
    setError('')
    setStatus('')

    try {
      const response = await resendEmailOtp({ email: pendingEmail })
      setDevOtp(response.verification?.otp || '')
      setStatus('A new verification code was sent.')
    } catch (err) {
      setError(err.message)
    } finally {
      setIsVerifying(false)
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
          <h1>{t('auth.createAccount')}</h1>
        </header>

        {pendingEmail ? (
          <form className="auth-form" onSubmit={handleVerifySubmit}>
            <label>
              <span>Verification code</span>
              <input
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                name="otp"
                onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                value={otpCode}
              />
            </label>

            {devOtp ? <p className="auth-form__success">Development code: {devOtp}</p> : null}
            {status ? <p className="auth-form__success">{status}</p> : null}
            {error ? <p className="auth-form__error">{error}</p> : null}

            <button className="auth-submit" disabled={isVerifying || otpCode.length !== 6} type="submit">
              <ShieldCheck size={18} />
              {isVerifying ? 'Verifying...' : 'Verify email'}
            </button>

            <button className="social-auth__button" disabled={isVerifying} onClick={handleResendCode} type="button">
              Resend code
            </button>
          </form>
        ) : (
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-form__grid">
            <label>
              <span>{t('auth.firstName')}</span>
              <input name="firstName" onChange={handleChange} value={form.firstName} />
            </label>

            <label>
              <span>{t('auth.lastName')}</span>
              <input name="lastName" onChange={handleChange} value={form.lastName} />
            </label>
          </div>

          <label>
            <span>{t('auth.username')}</span>
            <input
              autoComplete="username"
              name="username"
              onChange={handleChange}
              required
              value={form.username}
            />
          </label>

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

          <div className="auth-form__grid">
            <label>
              <span>{t('auth.password')}</span>
              <div className="auth-password-field">
                <input
                  autoComplete="new-password"
                  minLength={8}
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

            <label>
              <span>{t('auth.confirm')}</span>
              <input
                autoComplete="new-password"
                minLength={8}
                name="confirmPassword"
                onChange={handleChange}
                required
                type={showPassword ? 'text' : 'password'}
                value={form.confirmPassword}
              />
            </label>
          </div>

          {error ? <p className="auth-form__error">{error}</p> : null}

          <button className="auth-submit" disabled={isSubmitting} type="submit">
            <UserPlus size={18} />
            {isSubmitting ? t('auth.creating') : t('auth.createAccount')}
          </button>
        </form>
        )}

        {!pendingEmail ? <div className="social-auth">
          <div className="social-auth__divider">
            <span>{t('auth.orSignUp')}</span>
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
        </div> : null}

        {!pendingEmail ? <p className="auth-switch">
          {t('auth.already')} <Link to={toLocale('/login')}>{t('auth.signIn')}</Link>
        </p> : null}
      </div>
    </section>
  )
}

export default Register
