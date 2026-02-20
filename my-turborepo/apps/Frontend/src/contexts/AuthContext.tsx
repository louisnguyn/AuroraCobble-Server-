import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { AuthUser } from '../authApi'
import { fetchMe, getStoredToken, setToken, clearToken } from '../authApi'

interface AuthState {
  user: AuthUser | null
  token: string | null
  loading: boolean
  error: string | null
}

interface AuthContextValue extends AuthState {
  login: (token: string, user: AuthUser) => void
  logout: () => void
  setError: (err: string | null) => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: getStoredToken(),
    loading: true,
    error: null,
  })

  const login = useCallback((token: string, user: AuthUser) => {
    setToken(token)
    setState((s) => ({ ...s, token, user, error: null, loading: false }))
  }, [])

  const logout = useCallback(() => {
    clearToken()
    setState((s) => ({ ...s, token: null, user: null, error: null }))
  }, [])

  const setError = useCallback((error: string | null) => {
    setState((s) => ({ ...s, error }))
  }, [])

  useEffect(() => {
    const token = getStoredToken()
    if (!token) {
      setState((s) => ({ ...s, loading: false }))
      return
    }
    fetchMe()
      .then(({ user }) => setState((s) => ({ ...s, user, token, loading: false })))
      .catch(() => {
        clearToken()
        setState((s) => ({ ...s, token: null, user: null, loading: false }))
      })
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      logout,
      setError,
      isAuthenticated: !!state.token && !!state.user,
    }),
    [state, login, logout, setError]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
