import { useCallback, useEffect, useState } from 'react'
import { adminFetchMaintenance, adminSetMaintenance, type MaintenanceState } from '../authApi'

const IGN_RE = /^[A-Za-z0-9_]{2,16}$/

type Busy = 'toggle' | 'allow_add' | 'allow_remove' | 'set_message' | null

/**
 * Maintenance mode toggle. While enabled the server refuses logins for anyone
 * who is not on the mod's allow list.
 */
export function MaintenanceAdmin() {
  const [state, setState] = useState<MaintenanceState | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<Busy>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [player, setPlayer] = useState('')
  const [kickMessage, setKickMessage] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminFetchMaintenance()
      setState(res)
      if (!res.ok) setError(res.error ?? 'Could not read maintenance status.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read maintenance status.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const apply = async (
    busyKey: Exclude<Busy, null>,
    body: Parameters<typeof adminSetMaintenance>[0],
    successText: string
  ) => {
    setMessage(null)
    setError(null)
    setBusy(busyKey)
    try {
      const res = await adminSetMaintenance(body)
      if (res.ok) {
        setState(res)
        setMessage(successText)
      } else {
        setError(res.error ?? 'Command failed on the server.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setBusy(null)
    }
  }

  const enabled = state?.enabled ?? null

  const toggle = async () => {
    if (enabled == null) {
      setError('Current maintenance status is unknown — refresh before toggling.')
      return
    }
    if (!enabled) {
      const ok = window.confirm(
        'Turn maintenance ON?\n\nEveryone who is not on the allow list will be kicked and blocked from joining.'
      )
      if (!ok) return
    }
    await apply(
      'toggle',
      { action: enabled ? 'off' : 'on' },
      enabled ? 'Maintenance turned OFF — players can join again.' : 'Maintenance turned ON — players are blocked.'
    )
  }

  const allow = async (action: 'allow_add' | 'allow_remove') => {
    const ign = player.trim()
    if (!IGN_RE.test(ign)) {
      setError('Enter a valid Minecraft IGN (2–16 letters, numbers, underscore).')
      return
    }
    await apply(
      action,
      { action, player: ign },
      action === 'allow_add' ? `${ign} can now join during maintenance.` : `${ign} removed from the allow list.`
    )
    setPlayer('')
  }

  const saveKickMessage = async () => {
    const text = kickMessage.trim()
    if (!text) {
      setError('Enter a kick message first.')
      return
    }
    await apply('set_message', { action: 'set_message', message: text }, 'Kick message updated.')
  }

  const statusPill = loading
    ? { text: 'Checking…', cls: 'border-white/15 bg-black/30 text-slate-300' }
    : enabled === true
      ? { text: 'Maintenance ON', cls: 'border-red-400/40 bg-red-500/15 text-red-100' }
      : enabled === false
        ? { text: 'Server open', cls: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100' }
        : { text: 'Status unknown', cls: 'border-amber-400/40 bg-amber-500/15 text-amber-100' }

  return (
    <div
      className={`h-full flex flex-col rounded-2xl border p-4 sm:p-5 space-y-4 ${
        enabled === true ? 'border-red-400/40 bg-red-950/25' : 'border-slate-400/20 bg-slate-900/30'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-base font-semibold m-0 text-slate-100">
            Minecraft server maintenance
          </h4>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${statusPill.cls}`}>
            {statusPill.text}
          </span>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || busy != null}
            className="rounded-lg border border-white/15 bg-black/30 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy != null || loading}
        className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-white border disabled:opacity-50 ${
          enabled
            ? 'bg-emerald-700 hover:bg-emerald-600 border-emerald-400/30'
            : 'bg-red-800 hover:bg-red-700 border-red-400/30'
        }`}
      >
        {busy === 'toggle'
          ? 'Applying…'
          : enabled
            ? 'Turn maintenance OFF'
            : 'Turn maintenance ON'}
      </button>

      <div className="border-t border-white/10 pt-4 space-y-3 flex-1">
        <div>
          <p className="text-sm font-medium text-slate-300 m-0">Allowed during maintenance</p>
          <p className="text-xs text-slate-500 m-0 mt-1">
            {state?.allowedRaw ? state.allowedRaw : 'Nobody is on the allow list yet.'}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              Minecraft IGN
            </span>
            <input
              type="text"
              value={player}
              onChange={(e) => setPlayer(e.target.value)}
              placeholder="beLouisss"
              autoComplete="off"
              spellCheck={false}
              className="w-48 rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-400/40"
            />
          </label>
          <button
            type="button"
            onClick={() => void allow('allow_add')}
            disabled={busy != null}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-slate-700 hover:bg-slate-600 border border-white/15 disabled:opacity-50"
          >
            {busy === 'allow_add' ? 'Adding…' : 'Allow'}
          </button>
          <button
            type="button"
            onClick={() => void allow('allow_remove')}
            disabled={busy != null}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-300 bg-black/30 hover:bg-white/10 border border-white/15 disabled:opacity-50"
          >
            {busy === 'allow_remove' ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>

      <div className="border-t border-white/10 pt-4 space-y-3">
        <p className="text-sm font-medium text-slate-300 m-0">Kick message</p>
        <div className="flex flex-wrap items-end gap-2">
          <input
            type="text"
            value={kickMessage}
            onChange={(e) => setKickMessage(e.target.value)}
            maxLength={200}
            placeholder="Server is under maintenance, back soon!"
            className="w-full sm:w-96 rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-400/40"
          />
          <button
            type="button"
            onClick={() => void saveKickMessage()}
            disabled={busy != null}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-slate-700 hover:bg-slate-600 border border-white/15 disabled:opacity-50"
          >
            {busy === 'set_message' ? 'Saving…' : 'Save message'}
          </button>
        </div>
      </div>

      {message && (
        <p className="text-sm text-emerald-300 m-0 rounded-lg border border-emerald-500/25 bg-emerald-950/30 px-3 py-2">
          {message}
        </p>
      )}
      {error && (
        <p className="text-sm text-red-300 m-0 rounded-lg border border-red-500/25 bg-red-950/30 px-3 py-2">
          {error}
        </p>
      )}
    </div>
  )
}
