import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { login as apiLogin, signup as apiSignup } from '../authApi'

type Mode = 'login' | 'signup'
type MinecraftClientChoice = 'premium' | 'crack'

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
  const [minecraftClient, setMinecraftClient] = useState<MinecraftClientChoice | ''>('')
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
        if (minecraftClient !== 'premium' && minecraftClient !== 'crack') {
          setError('Choose Premium or Crack for your Minecraft account')
          setLoading(false)
          return
        }
        const res = await apiSignup(email.trim(), password, username.trim(), minecraftClient)
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div
        className="w-full max-w-md pixel-panel overflow-hidden shadow-[4px_4px_0_#0a0618]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 sm:p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 id="auth-modal-title" className="text-2xl font-bold text-[#f5efe6]">
              {isLogin ? 'Log in' : 'Create account'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 pixel-btn text-muted"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 text-left">
            {error && (
              <div className="p-3 text-error text-base bg-[#1a0f16] border-2 border-error/45 rounded-sm">
                {error}
              </div>
            )}
            <div>
              <label htmlFor="auth-email" className="block text-left text-base font-medium text-muted mb-1">
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 pixel-field placeholder:text-muted/70"
                placeholder="you@example.com"
                required
              />
            </div>
            {!isLogin && (
              <div>
                <label htmlFor="auth-username" className="block text-left text-base font-medium text-muted mb-1">
                  Username
                </label>
                <input
                  id="auth-username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-3 pixel-field placeholder:text-muted/70"
                  placeholder="Display name"
                  required={!isLogin}
                />
              </div>
            )}
            {!isLogin && (
              <fieldset className="m-0 p-0 border-0">
                <legend className="block text-left text-base font-medium text-muted mb-2">
                  Minecraft account type
                </legend>
                <p className="text-xs text-muted m-0 mb-2">
                  Select how you join the server — official Mojang/Microsoft (Premium) or cracked launcher.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <label
                    className={`flex cursor-pointer items-center justify-center gap-2 rounded-sm border-2 px-3 py-3 text-sm font-semibold transition-colors ${
                      minecraftClient === 'premium'
                        ? 'border-accent bg-accent/15 text-[#e2e8f0]'
                        : 'border-border/80 bg-[#0a0f18]/50 text-muted hover:border-accent/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="minecraft-client"
                      value="premium"
                      checked={minecraftClient === 'premium'}
                      onChange={() => setMinecraftClient('premium')}
                      className="sr-only"
                      required={!isLogin}
                    />
                    Premium
                  </label>
                  <label
                    className={`flex cursor-pointer items-center justify-center gap-2 rounded-sm border-2 px-3 py-3 text-sm font-semibold transition-colors ${
                      minecraftClient === 'crack'
                        ? 'border-accent bg-accent/15 text-[#e2e8f0]'
                        : 'border-border/80 bg-[#0a0f18]/50 text-muted hover:border-accent/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="minecraft-client"
                      value="crack"
                      checked={minecraftClient === 'crack'}
                      onChange={() => setMinecraftClient('crack')}
                      className="sr-only"
                      required={!isLogin}
                    />
                    Crack
                  </label>
                </div>
              </fieldset>
            )}
            <div>
              <label htmlFor="auth-password" className="block text-left text-base font-medium text-muted mb-1">
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 pixel-field placeholder:text-muted/70"
                placeholder={isLogin ? '' : 'Min 8 characters'}
                required
                minLength={isLogin ? undefined : 8}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 pixel-btn-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1f1c18] disabled:opacity-60"
            >
              {loading ? 'Please wait…' : isLogin ? 'Log in' : 'Sign up'}
            </button>
          </form>

          <p className="mt-4 text-center text-base text-muted">
            {isLogin ? "Don't have an account? " : 'Already have an account? '}
            <button
              type="button"
              onClick={() => {
                setMode(isLogin ? 'signup' : 'login')
                setError(null)
                setMinecraftClient('')
              }}
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
