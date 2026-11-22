import axios from 'axios'
import i18n from '../i18n/config'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  withCredentials: true,
})

api.interceptors.request.use((config) => {
  try {
    const language = i18n.language || localStorage.getItem('language')
    if (language) {
      config.headers['Accept-Language'] = language
    }
  } catch {
    // Ignore storage errors; requests still work with backend defaults.
  }

  return config
})

export default api
