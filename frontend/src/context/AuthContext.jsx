import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
  resendEmailOtp as resendEmailOtpRequest,
  verifyEmailOtp as verifyEmailOtpRequest
} from '../api/auth'
import { AuthContext } from './auth-context'

function normalizeAuthError(error, fallback = 'Something went wrong.') {
  return error?.response?.data?.error || error?.response?.data?.message || fallback
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    try {
      const response = await getCurrentUser()
      setUser(response.data.user)
      return response.data.user
    } catch (error) {
      if (error?.response?.status !== 401) {
        console.error(error)
      }

      setUser(null)
      return null
    }
  }, [])

  useEffect(() => {
    let mounted = true

    async function loadSession() {
      try {
        const response = await getCurrentUser()

        if (mounted) {
          setUser(response.data.user)
        }
      } catch (error) {
        if (error?.response?.status !== 401) {
          console.error(error)
        }

        if (mounted) {
          setUser(null)
        }
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    loadSession()

    return () => {
      mounted = false
    }
  }, [])

  const login = useCallback(async (payload) => {
    try {
      const response = await loginRequest(payload)
      setUser(response.data.user)
      return response.data.user
    } catch (error) {
      throw new Error(normalizeAuthError(error, 'Invalid email or password'))
    }
  }, [])

  const register = useCallback(async (payload) => {
    try {
      const response = await registerRequest(payload)
      if (response.data.user && !response.data.verificationRequired) {
        setUser(response.data.user)
      }
      return response.data
    } catch (error) {
      throw new Error(normalizeAuthError(error, 'Unable to create account.'))
    }
  }, [])

  const verifyEmailOtp = useCallback(async (payload) => {
    try {
      const response = await verifyEmailOtpRequest(payload)
      setUser(response.data.user)
      return response.data.user
    } catch (error) {
      throw new Error(normalizeAuthError(error, 'Unable to verify email.'))
    }
  }, [])

  const resendEmailOtp = useCallback(async (payload) => {
    try {
      const response = await resendEmailOtpRequest(payload)
      return response.data
    } catch (error) {
      throw new Error(normalizeAuthError(error, 'Unable to resend code.'))
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await logoutRequest()
    } finally {
      setUser(null)
    }
  }, [])

  const value = useMemo(() => ({
    user,
    isAuthenticated: Boolean(user),
    isLoading,
    login,
    logout,
    refreshUser,
    register,
    resendEmailOtp,
    setUser,
    verifyEmailOtp
  }), [isLoading, login, logout, refreshUser, register, resendEmailOtp, user, verifyEmailOtp])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
