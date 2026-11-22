import api from './api'

export const getProfile = () => api.get('/users/me')
export const updateProfile = (payload) => api.patch('/users/me', payload)
export const changePassword = (payload) => api.patch('/users/me/password', payload)
export const unlinkAuthAccount = (provider) => api.delete(`/users/me/auth-accounts/${provider}`)

function buildUserRedirectPath(path) {
  const baseUrl = api.defaults.baseURL || '/api/v1'
  return `${baseUrl.replace(/\/$/, '')}${path}`
}

export function getAuthAccountLinkUrl(provider) {
  return buildUserRedirectPath(`/users/me/auth-accounts/${provider}/link`)
}

export function redirectToAuthAccountLink(provider) {
  const form = document.createElement('form')
  form.action = getAuthAccountLinkUrl(provider)
  form.method = 'POST'
  form.style.display = 'none'
  document.body.appendChild(form)
  form.submit()
}
