import { useEffect, useState } from 'react'
import {
  fetchAdminUsers,
  fetchAdminUserCurrency,
  fetchAdminUserHistory,
  grantCurrency,
  setPullFulfilled,
  deleteAdminPull,
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
  const [deleteConfirmEntry, setDeleteConfirmEntry] = useState<AdminHistoryEntry | null>(null)
  const [deleteConfirmBusy, setDeleteConfirmBusy] = useState(false)

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
      await grantCurrency(selectedUser.id, grantType.trim(), amount)
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

  const openDeleteConfirm = (entry: AdminHistoryEntry) => {
    setDeleteConfirmEntry(entry)
  }

  const closeDeleteConfirm = () => {
    if (!deleteConfirmBusy) setDeleteConfirmEntry(null)
  }

  const confirmDeletePull = async () => {
    const entry = deleteConfirmEntry
    if (!entry) return
    setDeleteConfirmBusy(true)
    try {
      await deleteAdminPull(entry.id)
      setHistory((prev) => prev.filter((h) => h.id !== entry.id))
      setDeleteConfirmEntry(null)
    } catch {
      // ignore
    } finally {
      setDeleteConfirmBusy(false)
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
      <h1 className="text-xl font-bold text-[#f5efe6]">Ticket Management</h1>
      {error && (
        <div className="p-3 rounded-lg bg-error/15 border border-error/30 text-error text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-1 rounded-lg bg-surface border border-border overflow-hidden">
          <div className="p-3 border-b border-border">
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">All users</h2>
          </div>
          <ul>
            {users.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => setSelectedUser(u)}
                  className={`block w-full text-left px-4 py-3 border-b border-border/50 text-sm transition-colors ${
                    selectedUser?.id === u.id
                      ? 'bg-accent/20 text-accent font-medium'
                      : 'hover:bg-surface-hover text-[#f5efe6]'
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
                <h2 className="text-sm font-semibold text-[#f5efe6] mb-3">
                  Currency · {selectedUser.username}
                </h2>
                <div className="flex flex-wrap gap-4 mb-4">
                  {currencies.map((c) => (
                    <div
                      key={c.id}
                      className="px-3 py-2 rounded-lg bg-[#0f0d0b]/50 border border-border text-sm"
                    >
                      <span className="text-muted">{c.currency_type}:</span>{' '}
                      <span className="font-medium text-[#f5efe6]">{c.balance}</span>
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
                    <select
                      id="grant-type"
                      value={grantType}
                      onChange={(e) => setGrantType(e.target.value)}
                      className="min-w-[140px] px-2 py-1.5 rounded bg-[#0f0d0b] border border-border text-sm text-[#f5efe6]"
                    >
                      <option value="tickets">tickets</option>
                      <option value="mythic tickets">mythic tickets</option>
                      <option value="shiny mythic tickets">shiny mythic tickets</option>
                      <option value="legendary tickets">legend tickets</option>
                      <option value="shiny legendary tickets">shiny legend tickets</option>
                      <option value="shiny paradox tickets">shiny paradox tickets</option>
                    </select>
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
                      className="w-24 px-2 py-1.5 rounded bg-[#0f0d0b] border border-border text-sm text-[#f5efe6]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={granting}
                    className="px-3 py-1.5 rounded-lg bg-accent text-[#1a1510] text-sm font-medium hover:bg-accent/90 disabled:opacity-50"
                  >
                    {granting ? 'Granting…' : 'Grant'}
                  </button>
                </form>
              </div>

              <div className="rounded-lg bg-surface border border-border p-4">
                <h2 className="text-sm font-semibold text-[#f5efe6] mb-3">Gacha history · Given in-game</h2>
                <p className="text-xs text-muted mb-3">
                  Tick when you have given this reward to the user in-game. Use Delete to remove a row from history (e.g. after it’s been handled).
                </p>
                {historyError ? (
                  <p className="text-sm text-error">{historyError}</p>
                ) : history.length === 0 ? (
                  <p className="text-sm text-muted">No gacha pulls yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {history.map((entry) => (
                      <li
                        key={entry.id}
                        className="flex items-center gap-3 py-2 px-3 rounded-lg bg-[#0f0d0b]/50 border border-border/50"
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
                          <span className="text-sm font-medium text-[#f5efe6]">{entry.rewardType}</span>
                          <span className="block text-xs text-muted">
                            {entry.poolName} · {formatDate(entry.pulledAt)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => openDeleteConfirm(entry)}
                          className="shrink-0 text-xs py-1.5 px-2 rounded border border-error/40 text-error hover:bg-error/15"
                          title="Remove this history entry"
                        >
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {deleteConfirmEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-confirm-title"
          onClick={() => closeDeleteConfirm()}
        >
          <div
            className="w-full max-w-md rounded-xl bg-surface border border-border shadow-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="delete-confirm-title" className="text-lg font-semibold text-[#f5efe6] m-0 mb-2">
              Remove from history?
            </h3>
            <p className="text-sm text-muted m-0 mb-4">
              This will permanently remove this pull from the user’s gacha history. You can’t undo this.
            </p>
            <div className="rounded-lg bg-[#0f0d0b]/50 border border-border/50 px-3 py-2 mb-6">
              <p className="text-sm font-medium text-[#f5efe6] m-0">{deleteConfirmEntry.rewardType}</p>
              <p className="text-xs text-muted m-0 mt-1">
                {deleteConfirmEntry.poolName} · {formatDate(deleteConfirmEntry.pulledAt)}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteConfirm}
                disabled={deleteConfirmBusy}
                className="px-4 py-2 rounded-lg text-sm border border-border text-muted hover:bg-surface-hover hover:text-[#f5efe6] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeletePull}
                disabled={deleteConfirmBusy}
                className="px-4 py-2 rounded-lg text-sm bg-error/20 border border-error/40 text-error hover:bg-error/30 disabled:opacity-50"
              >
                {deleteConfirmBusy ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
