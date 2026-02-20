import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { login as apiLogin, signup as apiSignup } from '../authApi'

type Mode = 'login' | 'signup'

interface AuthModalProps {
  onClose: () => void
  defaultMode?: Mode
}

export function AuthModal({ onClose, defaultMode = 'login' }: AuthModalProps) {
  const { login } = useAuth()
  const [mode, setMode] = useState<Mode>(defaultMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === 'login') {
        const res = await apiLogin(email.trim(), password)
        login(res.token, res.user)
      } else {
        const res = await apiSignup(email.trim(), password, username.trim())
        login(res.token, res.user)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const isLogin = mode === 'login'
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-surface border border-border shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 sm:p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 id="auth-modal-title" className="text-xl font-bold text-[#e2e8f0]">
              {isLogin ? 'Log in' : 'Create account'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-muted hover:text-[#e2e8f0] hover:bg-surface-hover transition-colors touch-manipulation"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-error/15 border border-error/30 text-error text-sm">
                {error}
              </div>
            )}
            <div>
              <label htmlFor="auth-email" className="block text-sm font-medium text-muted mb-1">
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-[#0f0a1a]/80 border border-border text-[#e2e8f0] placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
                placeholder="you@example.com"
                required
              />
            </div>
            {!isLogin && (
              <div>
                <label htmlFor="auth-username" className="block text-sm font-medium text-muted mb-1">
                  Username
                </label>
                <input
                  id="auth-username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-[#0f0a1a]/80 border border-border text-[#e2e8f0] placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
                  placeholder="Display name"
                  required={!isLogin}
                />
              </div>
            )}
            <div>
              <label htmlFor="auth-password" className="block text-sm font-medium text-muted mb-1">
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-[#0f0a1a]/80 border border-border text-[#e2e8f0] placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
                placeholder={isLogin ? '' : 'Min 8 characters'}
                required
                minLength={isLogin ? undefined : 8}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-accent text-[#0f0a1a] font-semibold hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface disabled:opacity-60 transition-colors touch-manipulation"
            >
              {loading ? 'Please wait…' : isLogin ? 'Log in' : 'Sign up'}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-muted">
            {isLogin ? "Don't have an account? " : 'Already have an account? '}
            <button
              type="button"
              onClick={() => { setMode(isLogin ? 'signup' : 'login'); setError(null); }}
              className="text-accent font-medium hover:underline"
            >
              {isLogin ? 'Sign up' : 'Log in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
