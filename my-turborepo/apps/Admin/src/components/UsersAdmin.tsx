import { useEffect, useState } from 'react'
import {
  fetchAdminUsers,
  fetchAdminUserCurrency,
  fetchAdminUserHistory,
  grantCurrency,
  setPullFulfilled,
  type AdminUser,
  type UserCurrencyRow,
  type AdminHistoryEntry,
} from '../authApi'

export function UsersAdmin() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [currencies, setCurrencies] = useState<UserCurrencyRow[]>([])
  const [history, setHistory] = useState<AdminHistoryEntry[]>([])
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [grantType, setGrantType] = useState('tickets')
  const [grantAmount, setGrantAmount] = useState('')
  const [granting, setGranting] = useState(false)

  useEffect(() => {
    fetchAdminUsers()
      .then(({ users: u }) => setUsers(u))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load users'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedUser) {
      setCurrencies([])
      setHistory([])
      setHistoryError(null)
      return
    }
    setError(null)
    setHistoryError(null)
    fetchAdminUserCurrency(selectedUser.id)
      .then(({ currencies: c }) => setCurrencies(c))
      .catch(() => setCurrencies([]))
    fetchAdminUserHistory(selectedUser.id)
      .then(({ history: h }) => setHistory(h))
      .catch((e) => {
        setHistory([])
        setHistoryError(e instanceof Error ? e.message : 'Failed to load history')
      })
  }, [selectedUser])

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUser || granting) return
    const amount = Number(grantAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a positive amount')
      return
    }
    setGranting(true)
    setError(null)
    try {
      await grantCurrency(selectedUser.id, grantType, amount)
      setGrantAmount('')
      const { currencies: c } = await fetchAdminUserCurrency(selectedUser.id)
      setCurrencies(c)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Grant failed')
    } finally {
      setGranting(false)
    }
  }

  const handleToggleFulfilled = async (entry: AdminHistoryEntry) => {
    const next = !entry.fulfilledAt
    try {
      const res = await setPullFulfilled(entry.id, next)
      setHistory((prev) =>
        prev.map((h) => (h.id === entry.id ? { ...h, fulfilledAt: res.fulfilled_at } : h))
      )
    } catch {
      // ignore
    }
  }

  const formatDate = (s: string) =>
    new Date(s).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  if (loading) {
    return (
      <div className="rounded-lg bg-surface border border-border p-8 text-center text-muted">
        Loading users…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-[#e2e8f0]">Users</h1>
      {error && (
        <div className="p-3 rounded-lg bg-error/15 border border-error/30 text-error text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 rounded-lg bg-surface border border-border overflow-hidden">
          <div className="p-3 border-b border-border">
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">All users</h2>
          </div>
          <ul className="max-h-[400px] overflow-y-auto">
            {users.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => setSelectedUser(u)}
                  className={`block w-full text-left px-4 py-3 border-b border-border/50 text-sm transition-colors ${
                    selectedUser?.id === u.id
                      ? 'bg-accent/20 text-accent font-medium'
                      : 'hover:bg-surface-hover text-[#e2e8f0]'
                  }`}
                >
                  <span className="font-medium">{u.username}</span>
                  <span className="block text-xs text-muted truncate">{u.email}</span>
                  {u.is_admin && (
                    <span className="inline-block mt-1 text-xs px-1.5 py-0.5 rounded bg-accent/30 text-accent">
                      Admin
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {!selectedUser ? (
            <div className="rounded-lg bg-surface border border-border p-8 text-center text-muted">
              Select a user to view currency, grant rewards, and gacha history.
            </div>
          ) : (
            <>
              <div className="rounded-lg bg-surface border border-border p-4">
                <h2 className="text-sm font-semibold text-[#e2e8f0] mb-3">
                  Currency · {selectedUser.username}
                </h2>
                <div className="flex flex-wrap gap-4 mb-4">
                  {currencies.map((c) => (
                    <div
                      key={c.id}
                      className="px-3 py-2 rounded-lg bg-[#0f0a1a]/50 border border-border text-sm"
                    >
                      <span className="text-muted">{c.currency_type}:</span>{' '}
                      <span className="font-medium text-[#e2e8f0]">{c.balance}</span>
                    </div>
                  ))}
                  {currencies.length === 0 && (
                    <p className="text-sm text-muted">No currency records yet.</p>
                  )}
                </div>
                <form onSubmit={handleGrant} className="flex flex-wrap items-end gap-3">
                  <div>
                    <label htmlFor="grant-type" className="block text-xs text-muted mb-1">
                      Type
                    </label>
                    <input
                      id="grant-type"
                      type="text"
                      value={grantType}
                      onChange={(e) => setGrantType(e.target.value)}
                      placeholder="e.g. gems, tickets"
                      className="w-28 px-2 py-1.5 rounded bg-[#0f0a1a] border border-border text-sm text-[#e2e8f0]"
                    />
                  </div>
                  <div>
                    <label htmlFor="grant-amount" className="block text-xs text-muted mb-1">
                      Amount
                    </label>
                    <input
                      id="grant-amount"
                      type="number"
                      min="1"
                      value={grantAmount}
                      onChange={(e) => setGrantAmount(e.target.value)}
                      className="w-24 px-2 py-1.5 rounded bg-[#0f0a1a] border border-border text-sm text-[#e2e8f0]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={granting}
                    className="px-3 py-1.5 rounded-lg bg-accent text-[#0f0a1a] text-sm font-medium hover:bg-accent/90 disabled:opacity-50"
                  >
                    {granting ? 'Granting…' : 'Grant'}
                  </button>
                </form>
              </div>

              <div className="rounded-lg bg-surface border border-border p-4">
                <h2 className="text-sm font-semibold text-[#e2e8f0] mb-3">Gacha history · Given in-game</h2>
                <p className="text-xs text-muted mb-3">
                  Tick when you have given this reward to the user in-game.
                </p>
                {historyError ? (
                  <p className="text-sm text-error">{historyError}</p>
                ) : history.length === 0 ? (
                  <p className="text-sm text-muted">No gacha pulls yet.</p>
                ) : (
                  <ul className="space-y-2 max-h-72 overflow-y-auto">
                    {history.map((entry) => (
                      <li
                        key={entry.id}
                        className="flex items-center gap-3 py-2 px-3 rounded-lg bg-[#0f0a1a]/50 border border-border/50"
                      >
                        <button
                          type="button"
                          onClick={() => handleToggleFulfilled(entry)}
                          className={`shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                            entry.fulfilledAt
                              ? 'bg-emerald/30 border-emerald text-emerald'
                              : 'border-muted hover:border-accent text-transparent'
                          }`}
                          title={entry.fulfilledAt ? 'Mark as not given' : 'Mark as given in-game'}
                        >
                          {entry.fulfilledAt ? (
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-current" />
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-medium text-[#e2e8f0]">{entry.rewardType}</span>
                          <span className="block text-xs text-muted">
                            {entry.poolName} · {formatDate(entry.pulledAt)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
