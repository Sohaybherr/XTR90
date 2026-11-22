import api from './api'

export const register = (payload) => api.post('/auth/register', payload)
export const verifyEmailOtp = (payload) => api.post('/auth/verify-email-otp', payload)
export const resendEmailOtp = (payload) => api.post('/auth/resend-email-otp', payload)
export const login = (payload) => api.post('/auth/login', payload)
export const logout = () => api.post('/auth/logout')
export const getCurrentUser = () => api.get('/auth/me')

function buildAuthRedirectPath(path) {
  const baseUrl = api.defaults.baseURL || '/api/v1'
  return `${baseUrl.replace(/\/$/, '')}${path}`
}

export function getSocialLoginUrl(provider) {
  return buildAuthRedirectPath(`/auth/${provider}`)
}

export function redirectToSocialLogin(provider) {
  window.location.assign(getSocialLoginUrl(provider))
}
