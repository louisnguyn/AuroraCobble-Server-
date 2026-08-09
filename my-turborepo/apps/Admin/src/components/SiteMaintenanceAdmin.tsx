import { useCallback, useEffect, useState } from 'react'
import {
  adminFetchSiteMaintenance,
  adminUpdateSiteMaintenance,
  type SiteMaintenance,
} from '../authApi'

const MAX_MESSAGE = 300

/**
 * Website-only maintenance notice — blocks the player site, does not touch
 * the Minecraft server.
 */
export function SiteMaintenanceAdmin() {
  const [state, setState] = useState<SiteMaintenance | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'toggle' | 'message' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminFetchSiteMaintenance()
      setState(res)
      setMessage(res.message)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read website maintenance state.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const save = async (busyKey: 'toggle' | 'message', enabled: boolean, text: string, ok: string) => {
    setNotice(null)
    setError(null)
    setBusy(busyKey)
    try {
      const res = await adminUpdateSiteMaintenance({ enabled, message: text.trim() })
      setState(res)
      setMessage(res.message)
      setNotice(ok)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setBusy(null)
    }
  }

  const enabled = state?.enabled ?? false

  const toggle = async () => {
    if (!enabled) {
      const confirmed = window.confirm(
        'Turn website maintenance ON?\n\nVisitors will see a full-screen maintenance popup. Admins can still browse.'
      )
      if (!confirmed) return
    }
    await save(
      'toggle',
      !enabled,
      message,
      enabled ? 'Website is back online for everyone.' : 'Website maintenance popup is now live.'
    )
  }

  return (
    <div
      className={`rounded-2xl border p-4 sm:p-5 space-y-4 ${
        enabled ? 'border-amber-400/40 bg-amber-950/25' : 'border-slate-400/20 bg-slate-900/30'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-base font-semibold m-0 text-slate-100">Website maintenance</h4>
          <p className="text-xs text-slate-400 m-0 mt-1">
            Shows a blocking popup on the player website. Does not affect the Minecraft server.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
              loading
                ? 'border-white/15 bg-black/30 text-slate-300'
                : enabled
                  ? 'border-amber-400/40 bg-amber-500/15 text-amber-100'
                  : 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100'
            }`}
          >
            {loading ? 'Checking…' : enabled ? 'Website closed' : 'Website open'}
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
            : 'bg-amber-700 hover:bg-amber-600 border-amber-400/30'
        }`}
      >
        {busy === 'toggle' ? 'Applying…' : enabled ? 'Open website' : 'Close website for maintenance'}
      </button>

      <div className="border-t border-white/10 pt-4 space-y-2">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
            Popup message (optional)
          </span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={MAX_MESSAGE}
            rows={2}
            placeholder="Website đang bảo trì, quay lại sau nhé!"
            className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void save('message', enabled, message, 'Popup message saved.')}
            disabled={busy != null || loading}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-slate-700 hover:bg-slate-600 border border-white/15 disabled:opacity-50"
          >
            {busy === 'message' ? 'Saving…' : 'Save message'}
          </button>
          <span className="text-xs text-slate-500">
            {message.length}/{MAX_MESSAGE} · leave empty to use the default text
          </span>
        </div>
      </div>

      {notice && (
        <p className="text-sm text-emerald-300 m-0 rounded-lg border border-emerald-500/25 bg-emerald-950/30 px-3 py-2">
          {notice}
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
