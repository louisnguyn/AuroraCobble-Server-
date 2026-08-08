import { useState } from 'react'
import { login } from '../authApi'
import type { AuthUser } from '../authApi'

interface LoginProps {
  onSuccess: (token: string, user: AuthUser) => void
}

export function Login({ onSuccess }: LoginProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await login(email.trim(), password)
      if (!res.user.is_admin) {
        setError('Access denied. Only accounts with administrator privileges can sign in here.')
        setLoading(false)
        return
      }
      onSuccess(res.token, res.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-surface border border-border p-6 sm:p-8 shadow-xl">
        <div className="text-center mb-6">
          <img src="/logo_text.png" alt="Asteryn Cobblemon SMP" className="w-32 h-auto mx-auto mb-4 object-contain" />
          <h1 className="text-xl font-bold text-[#f5efe6]">Admin sign in</h1>
          <p className="text-sm text-muted mt-1">Only administrator accounts can access this site.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-error/15 border border-error/30 text-error text-sm">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="admin-email" className="block text-sm font-medium text-muted mb-1">
              Email
            </label>
            <input
              id="admin-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-[#0f0d0b]/80 border border-border text-[#f5efe6] placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label htmlFor="admin-password" className="block text-sm font-medium text-muted mb-1">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-[#0f0d0b]/80 border border-border text-[#f5efe6] placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
              placeholder="••••••••"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-accent text-[#1a1510] font-semibold hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface disabled:opacity-60 transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
