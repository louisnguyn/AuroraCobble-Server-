import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { changePassword } from '../authApi'
import { AuthModal } from './AuthModal'

export function Account() {
  const { isAuthenticated, user } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters')
      return
    }
    setSubmitting(true)
    try {
      await changePassword(currentPassword, newPassword)
      setSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change password')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-lg mx-auto rounded-2xl bg-surface/80 border border-border p-8 text-center">
        <h1 className="text-2xl font-semibold text-[#e2e8f0] m-0 mb-2">Account</h1>
        <p className="text-muted text-sm mb-6">Log in to change your password.</p>
        <button
          type="button"
          onClick={() => setShowAuth(true)}
          className="py-2.5 px-6 rounded-xl bg-accent text-[#0f0a1a] font-semibold hover:bg-accent/90"
        >
          Log in
        </button>
        {showAuth && <AuthModal onClose={() => setShowAuth(false)} defaultMode="login" />}
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto rounded-2xl bg-surface/80 border border-border p-6 sm:p-8">
      <h1 className="text-2xl font-semibold text-[#e2e8f0] m-0 mb-1">Account</h1>
      <p className="text-muted text-sm mb-6">
        Signed in as <span className="text-[#e2e8f0]">{user?.username}</span>
        {user?.email && (
          <span className="block mt-1 truncate" title={user.email}>
            {user.email}
          </span>
        )}
      </p>

      <h2 className="text-lg font-medium text-[#e2e8f0] m-0 mb-4">Change password</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-error/15 border border-error/30 text-error text-sm">{error}</div>
        )}
        {success && (
          <div className="p-3 rounded-lg bg-emerald/15 border border-emerald/30 text-emerald text-sm">
            Password updated successfully.
          </div>
        )}
        <div>
          <label htmlFor="current-password" className="block text-xs text-muted mb-1">
            Current password
          </label>
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-[#0f0a1a] border border-border text-[#e2e8f0] text-sm"
            required
          />
        </div>
        <div>
          <label htmlFor="new-password" className="block text-xs text-muted mb-1">
            New password
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-[#0f0a1a] border border-border text-[#e2e8f0] text-sm"
            required
            minLength={8}
          />
          <p className="text-xs text-muted mt-1">At least 8 characters.</p>
        </div>
        <div>
          <label htmlFor="confirm-password" className="block text-xs text-muted mb-1">
            Confirm new password
          </label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-[#0f0a1a] border border-border text-[#e2e8f0] text-sm"
            required
            minLength={8}
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full sm:w-auto py-2.5 px-6 rounded-xl bg-accent text-[#0f0a1a] font-semibold hover:bg-accent/90 disabled:opacity-50"
        >
          {submitting ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </div>
  )
}
