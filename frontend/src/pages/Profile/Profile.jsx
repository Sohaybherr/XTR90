import { KeyRound, Link2, Save, Unlink } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { changePassword, redirectToAuthAccountLink, unlinkAuthAccount, updateProfile } from '../../api/users'
import AccordionSection from '../../components/ui/AccordionSection'
import { useAuth } from '../../hooks/useAuth'
import { useI18n } from '../../hooks/useI18n'
import { namespacesForPath } from '../../i18n/bootstrap'
import { resolveAssetUrl } from '../../utils/assets'

const LANGUAGE_PREFIX = /^\/(en|fr|ar|de|es)(?=\/|$)/

function getInitials(user) {
  const first = user?.firstName?.[0] || user?.username?.[0] || 'U'
  const last = user?.lastName?.[0] || ''
  return `${first}${last}`.toUpperCase()
}

function Profile() {
  const location = useLocation()
  const navigate = useNavigate()
  const { refreshUser, setUser, user } = useAuth()
  const { language, languages, setLanguage } = useI18n()
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    avatar: '',
    preferredLanguage: language,
    showOdds: true
  })
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [profileStatus, setProfileStatus] = useState('')
  const [passwordStatus, setPasswordStatus] = useState('')
  const [profileError, setProfileError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [socialStatus, setSocialStatus] = useState('')
  const [socialError, setSocialError] = useState('')
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isSavingPreferences, setIsSavingPreferences] = useState(false)
  const [isSavingPassword, setIsSavingPassword] = useState(false)
  const [unlinkingProvider, setUnlinkingProvider] = useState('')
  const [activeSection, setActiveSection] = useState('profile')

  useEffect(() => {
    setProfileForm({
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      avatar: user?.avatar || '',
      preferredLanguage: language || user?.preferredLanguage,
      showOdds: user?.showOdds !== false
    })
  }, [language, user])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('accountLink') === 'failed') {
      setSocialError('Unable to link account.')
    } else if (params.get('accountLink') === 'success') {
      setSocialStatus('Account linked.')
    }
  }, [location.search])

  const displayName = useMemo(() => {
    const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ')
    return fullName || user?.username || 'Account'
  }, [user])
  const avatarSrc = resolveAssetUrl(user?.avatar)
  const linkedProviders = useMemo(() => new Set((user?.authAccounts || []).map((account) => account.provider)), [user])

  function handleProfileChange(event) {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value
    setProfileForm((current) => ({
      ...current,
      [event.target.name]: value
    }))
  }

  function handlePasswordChange(event) {
    setPasswordForm((current) => ({
      ...current,
      [event.target.name]: event.target.value
    }))
  }

  async function handleProfileSubmit(event) {
    event.preventDefault()
    setIsSavingProfile(true)
    setProfileError('')
    setProfileStatus('')

    try {
      const response = await updateProfile(profileForm)
      setUser(response.data.user)
      await setLanguage(response.data.user.preferredLanguage || profileForm.preferredLanguage)
      try {
        localStorage.setItem('gamblingContentEnabled', String(response.data.user.showOdds !== false))
        window.dispatchEvent(new CustomEvent('gambling-content-change', { detail: { enabled: response.data.user.showOdds !== false } }))
      } catch {
        // Ignore storage failures; saved account settings still apply after refresh.
      }
      setProfileStatus('Profile updated.')
    } catch (error) {
      setProfileError(error?.response?.data?.error || 'Unable to update profile.')
      await refreshUser()
    } finally {
      setIsSavingProfile(false)
    }
  }

  function applyOddsPreference(next) {
    try {
      localStorage.setItem('gamblingContentEnabled', String(next))
      window.dispatchEvent(new CustomEvent('gambling-content-change', { detail: { enabled: next } }))
    } catch {
      // Account save still persists even if local storage is unavailable.
    }
  }

  async function savePreferences(nextPreferences) {
    const nextForm = {
      ...profileForm,
      ...nextPreferences,
    }

    setProfileForm(nextForm)
    setIsSavingPreferences(true)
    setProfileError('')
    setProfileStatus('')

    if (Object.prototype.hasOwnProperty.call(nextPreferences, 'showOdds')) {
      applyOddsPreference(nextPreferences.showOdds)
    }

    try {
      const response = await updateProfile(nextForm)
      setUser(response.data.user)
      if (Object.prototype.hasOwnProperty.call(nextPreferences, 'showOdds')) {
        applyOddsPreference(response.data.user.showOdds !== false)
      }
      setProfileStatus('Preferences updated.')
    } catch (error) {
      setProfileError(error?.response?.data?.error || 'Unable to update preferences.')
      await refreshUser()
    } finally {
      setIsSavingPreferences(false)
    }
  }

  async function handlePreferenceLanguageChange(event) {
    const nextLanguage = event.target.value
    const nextPathname = location.pathname.replace(LANGUAGE_PREFIX, `/${nextLanguage}`)
    const nextLocation = `${nextPathname}${location.search}${location.hash}`

    setProfileForm((current) => ({ ...current, preferredLanguage: nextLanguage }))
    await setLanguage(nextLanguage, namespacesForPath(nextPathname))
    navigate(nextLocation, { replace: true })
    savePreferences({ preferredLanguage: nextLanguage })
  }

  function handlePreferenceOddsChange(showOdds) {
    if (profileForm.showOdds === showOdds || isSavingPreferences) return
    savePreferences({ showOdds })
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault()
    setIsSavingPassword(true)
    setPasswordError('')
    setPasswordStatus('')

    try {
      await changePassword(passwordForm)
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      })
      setPasswordStatus('Password updated.')
    } catch (error) {
      setPasswordError(error?.response?.data?.error || 'Unable to update password.')
    } finally {
      setIsSavingPassword(false)
    }
  }

  function handleLinkProvider(provider) {
    setSocialError('')
    setSocialStatus('')
    redirectToAuthAccountLink(provider)
  }

  async function handleUnlinkProvider(provider) {
    setUnlinkingProvider(provider)
    setSocialError('')
    setSocialStatus('')

    try {
      await unlinkAuthAccount(provider)
      await refreshUser()
      setSocialStatus(`${provider === 'google' ? 'Google' : 'Facebook'} account unlinked.`)
    } catch (error) {
      setSocialError(error?.response?.data?.error || 'Unable to unlink account.')
    } finally {
      setUnlinkingProvider('')
    }
  }

  return (
    <section className="profile-page">
      <header className="profile-hero">
        {avatarSrc ? (
          <img alt="" className="profile-hero__avatar" src={avatarSrc} />
        ) : (
          <span className="profile-hero__avatar profile-hero__avatar--empty">{getInitials(user)}</span>
        )}

        <div className="profile-hero__content">
          <p className="eyebrow">Signed in</p>
          <h1>{displayName}</h1>
          <div className="profile-meta">
            <span>{user?.email}</span>
            <span>{user?.role}</span>
            <span>{user?.status}</span>
          </div>
        </div>
      </header>

      <div className="profile-grid">
        <AccordionSection
          className="account-section"
          title="Profile"
          open={activeSection === 'profile'}
          onOpenChange={(isOpen) => setActiveSection(isOpen ? 'profile' : '')}
        >
          <form className="account-form" onSubmit={handleProfileSubmit}>
            <div className="auth-form__grid">
              <label>
                <span>First name</span>
                <input name="firstName" onChange={handleProfileChange} value={profileForm.firstName} />
              </label>

              <label>
                <span>Last name</span>
                <input name="lastName" onChange={handleProfileChange} value={profileForm.lastName} />
              </label>
            </div>

            <label>
              <span>Avatar path</span>
              <input name="avatar" onChange={handleProfileChange} value={profileForm.avatar} />
            </label>

            {profileError ? <p className="auth-form__error">{profileError}</p> : null}
            {profileStatus ? <p className="auth-form__success">{profileStatus}</p> : null}

            <button className="auth-submit" disabled={isSavingProfile} type="submit">
              <Save size={18} />
              {isSavingProfile ? 'Saving...' : 'Save profile'}
            </button>
          </form>
        </AccordionSection>

        <AccordionSection
          className="account-section"
          title="Preferences"
          open={activeSection === 'preferences'}
          onOpenChange={(isOpen) => setActiveSection(isOpen ? 'preferences' : '')}
        >
          <div className="account-form preferences-form">
            <label className="preferences-field">
              <span>App language</span>
              <select
                disabled={isSavingPreferences}
                name="preferredLanguage"
                onChange={handlePreferenceLanguageChange}
                value={profileForm.preferredLanguage}
              >
                {languages.map((item) => (
                  <option key={item.code} value={item.code}>{item.nativeName}</option>
                ))}
              </select>
            </label>

            <div className="preferences-field">
              <span>Odds in match pages</span>
              <div className="preferences-choice" role="group" aria-label="Odds in match pages">
                <button
                  className={`preferences-choice__button${profileForm.showOdds ? ' preferences-choice__button--active' : ''}`}
                  disabled={isSavingPreferences}
                  onClick={() => handlePreferenceOddsChange(true)}
                  type="button"
                >
                  Show odds
                </button>
                <button
                  className={`preferences-choice__button${!profileForm.showOdds ? ' preferences-choice__button--active' : ''}`}
                  disabled={isSavingPreferences}
                  onClick={() => handlePreferenceOddsChange(false)}
                  type="button"
                >
                  Hide odds
                </button>
              </div>
            </div>

            {profileError ? <p className="auth-form__error">{profileError}</p> : null}
            {profileStatus ? <p className="auth-form__success">{profileStatus}</p> : null}
            {isSavingPreferences ? <p className="preferences-saving">Saving...</p> : null}
          </div>
        </AccordionSection>

        <AccordionSection
          className="account-section"
          title="Password"
          open={activeSection === 'password'}
          onOpenChange={(isOpen) => setActiveSection(isOpen ? 'password' : '')}
        >
          <form className="account-form" onSubmit={handlePasswordSubmit}>
            <label>
              <span>Current password</span>
              <input
                autoComplete="current-password"
                name="currentPassword"
                onChange={handlePasswordChange}
                required
                type="password"
                value={passwordForm.currentPassword}
              />
            </label>

            <label>
              <span>New password</span>
              <input
                autoComplete="new-password"
                minLength={8}
                name="newPassword"
                onChange={handlePasswordChange}
                required
                type="password"
                value={passwordForm.newPassword}
              />
            </label>

            <label>
              <span>Confirm password</span>
              <input
                autoComplete="new-password"
                minLength={8}
                name="confirmPassword"
                onChange={handlePasswordChange}
                required
                type="password"
                value={passwordForm.confirmPassword}
              />
            </label>

            {passwordError ? <p className="auth-form__error">{passwordError}</p> : null}
            {passwordStatus ? <p className="auth-form__success">{passwordStatus}</p> : null}

            <button className="auth-submit" disabled={isSavingPassword} type="submit">
              <KeyRound size={18} />
              {isSavingPassword ? 'Updating...' : 'Change password'}
            </button>
          </form>
        </AccordionSection>

        <AccordionSection
          className="account-section account-section--wide"
          title="Connected accounts"
          count={2}
          open={activeSection === 'connected'}
          onOpenChange={(isOpen) => setActiveSection(isOpen ? 'connected' : '')}
        >
          <div className="connected-account-list">
            <div className="connected-account">
              <div>
                <span className="social-auth__mark social-auth__mark--google">G</span>
                <strong>Google</strong>
              </div>

              <div className="connected-account__actions">
                <button className="connected-account__button" disabled={linkedProviders.has('google')} onClick={() => handleLinkProvider('google')} type="button">
                  <Link2 size={17} />
                  {linkedProviders.has('google') ? 'Linked' : 'Link'}
                </button>
                <button
                  className="connected-account__button connected-account__button--danger"
                  disabled={!linkedProviders.has('google') || unlinkingProvider === 'google'}
                  onClick={() => handleUnlinkProvider('google')}
                  type="button"
                >
                  <Unlink size={17} />
                  {unlinkingProvider === 'google' ? 'Unlinking...' : 'Unlink'}
                </button>
              </div>
            </div>

            <div className="connected-account">
              <div>
                <span className="social-auth__mark social-auth__mark--facebook">f</span>
                <strong>Facebook</strong>
              </div>

              <div className="connected-account__actions">
                <button className="connected-account__button" disabled={linkedProviders.has('facebook')} onClick={() => handleLinkProvider('facebook')} type="button">
                  <Link2 size={17} />
                  {linkedProviders.has('facebook') ? 'Linked' : 'Link'}
                </button>
                <button
                  className="connected-account__button connected-account__button--danger"
                  disabled={!linkedProviders.has('facebook') || unlinkingProvider === 'facebook'}
                  onClick={() => handleUnlinkProvider('facebook')}
                  type="button"
                >
                  <Unlink size={17} />
                  {unlinkingProvider === 'facebook' ? 'Unlinking...' : 'Unlink'}
                </button>
              </div>
            </div>
          </div>

          {socialError ? <p className="auth-form__error">{socialError}</p> : null}
          {socialStatus ? <p className="auth-form__success">{socialStatus}</p> : null}
        </AccordionSection>
      </div>
    </section>
  )
}

export default Profile
