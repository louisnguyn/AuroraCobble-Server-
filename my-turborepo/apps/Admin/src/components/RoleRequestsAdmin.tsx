import { useCallback, useEffect, useState } from 'react'
import {
  approveRoleRequest,
  fetchAdminRoleRequests,
  rejectRoleRequest,
  type AdminRoleGrantRequest,
} from '../authApi'

type Filter = 'pending' | 'all'

export function RoleRequestsAdmin() {
  const [filter, setFilter] = useState<Filter>('pending')
  const [requests, setRequests] = useState<AdminRoleGrantRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [rejectTarget, setRejectTarget] = useState<AdminRoleGrantRequest | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [rejectBusy, setRejectBusy] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const { requests: r } = await fetchAdminRoleRequests({
        status: filter === 'all' ? 'all' : 'pending',
      })
      setRequests(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load requests')
      setRequests([])
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    void load()
  }, [load])

  const handleApprove = async (id: number) => {
    setBusyId(id)
    setError(null)
    try {
      await approveRoleRequest(id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approve failed')
    } finally {
      setBusyId(null)
    }
  }

  const openReject = (r: AdminRoleGrantRequest) => {
    setRejectTarget(r)
    setRejectNote('')
  }

  const closeReject = () => {
    if (!rejectBusy) setRejectTarget(null)
  }

  const confirmReject = async () => {
    if (!rejectTarget) return
    setRejectBusy(true)
    setError(null)
    try {
      await rejectRoleRequest(rejectTarget.id, rejectNote.trim() || undefined)
      setRejectTarget(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reject failed')
    } finally {
      setRejectBusy(false)
    }
  }

  const formatDt = (s: string) =>
    new Date(s).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-[#f5efe6] m-0">Rank grant requests</h1>
      <p className="text-sm text-muted m-0 -mt-2">
        Approve runs <code className="text-sky-300/90">lp user &lt;IGN&gt; parent set &lt;role&gt;</code> via RCON and
        updates the website rank. Reject with an optional note.
      </p>
      {error && (
        <div className="p-3 rounded-lg bg-error/15 border border-error/30 text-error text-sm">{error}</div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilter('pending')}
          className={`px-3 py-2 rounded-md text-sm font-medium border transition-colors ${
            filter === 'pending'
              ? 'bg-accent/25 text-accent border-accent/40'
              : 'border-border text-muted hover:text-[#f5efe6]'
          }`}
        >
          Pending
        </button>
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`px-3 py-2 rounded-md text-sm font-medium border transition-colors ${
            filter === 'all'
              ? 'bg-accent/25 text-accent border-accent/40'
              : 'border-border text-muted hover:text-[#f5efe6]'
          }`}
        >
          All statuses
        </button>
        <button
          type="button"
          onClick={() => void load()}
          className="px-3 py-2 rounded-md text-sm border border-border text-muted hover:text-[#f5efe6]"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : requests.length === 0 ? (
        <p className="text-muted">No requests{filter === 'pending' ? ' pending' : ''}.</p>
      ) : (
        <ul className="space-y-3 list-none m-0 p-0">
          {requests.map((r) => (
            <li
              key={r.id}
              className="rounded-lg bg-surface border border-border p-4 space-y-2 text-sm text-[#f5efe6]"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold m-0">
                    {r.user_username ?? `User #${r.user_id}`}{' '}
                    <span className="text-muted font-normal text-xs">({r.user_email ?? '—'})</span>
                  </p>
                  <p className="text-xs text-muted m-0 mt-1">
                    Request #{r.id} · wants <strong className="text-amber-200/90">{r.requested_role}</strong> · current
                    site rank: {r.user_minecraft_role ?? '—'} · {formatDt(r.created_at)} ·{' '}
                    <span
                      className={
                        r.status === 'pending'
                          ? 'text-amber-200'
                          : r.status === 'approved'
                            ? 'text-emerald-300'
                            : 'text-red-300'
                      }
                    >
                      {r.status}
                    </span>
                  </p>
                </div>
                {r.status === 'pending' ? (
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => void handleApprove(r.id)}
                      className="px-3 py-1.5 rounded-lg bg-accent text-[#1a1510] text-xs font-medium hover:bg-accent/90 disabled:opacity-50"
                    >
                      {busyId === r.id ? '…' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => openReject(r)}
                      className="px-3 py-1.5 rounded-lg text-xs border border-error/50 text-error hover:bg-error/10 disabled:opacity-50"
                    >
                      Reject…
                    </button>
                  </div>
                ) : null}
              </div>
              {r.message ? (
                <p className="text-muted m-0 text-xs border-l-2 border-border pl-2">{r.message}</p>
              ) : (
                <p className="text-muted m-0 text-xs italic">No message from user.</p>
              )}
              {r.status !== 'pending' && r.admin_note ? (
                <p className="text-xs text-amber-200/90 m-0">Staff note: {r.admin_note}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {rejectTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => closeReject()}
        >
          <div
            className="w-full max-w-md rounded-xl bg-surface border border-border shadow-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-[#f5efe6] m-0 mb-2">Reject request</h2>
            <p className="text-sm text-muted m-0 mb-3">
              User: {rejectTarget.user_username} · role: {rejectTarget.requested_role}
            </p>
            <label className="block text-sm text-[#f5efe6] mb-3">
              Note (optional)
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-border bg-[#1a1510] px-3 py-2 text-sm text-[#f5efe6]"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => closeReject()}
                disabled={rejectBusy}
                className="px-4 py-2 rounded-lg border border-border text-sm text-muted hover:text-[#f5efe6]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={rejectBusy}
                onClick={() => void confirmReject()}
                className="px-4 py-2 rounded-lg bg-error/90 text-white text-sm font-medium hover:bg-error disabled:opacity-50"
              >
                {rejectBusy ? '…' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
