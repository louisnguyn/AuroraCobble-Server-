import { useEffect, useState } from 'react'
import { adminMinecraftNightMarket } from '../authApi'

const DURATION_PRESETS = [15, 30, 60, 120, 180] as const
const MAX_MINUTES = 1440

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`
  return `${s}s`
}

/**
 * Night Market admin RCON:
 * - nightmarket admin open <location> <minutes>
 * - nightmarket admin close <location>
 */
export function NightMarketAdmin() {
  const [minutes, setMinutes] = useState('30')
  const [busy, setBusy] = useState<'open' | 'close' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /* Local estimate only — the mod does not report market state back over RCON. */
  const [closesAt, setClosesAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (closesAt == null) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [closesAt])

  useEffect(() => {
    if (closesAt != null && now >= closesAt) setClosesAt(null)
  }, [closesAt, now])

  const runOpen = async () => {
    setMessage(null)
    setError(null)
    const mins = Number.parseInt(minutes, 10)
    if (!Number.isFinite(mins) || mins < 1) {
      setError('Duration must be a whole number of minutes ≥ 1.')
      return
    }
    if (mins > MAX_MINUTES) {
      setError(`Duration must be at most ${MAX_MINUTES} minutes (24h).`)
      return
    }
    setBusy('open')
    try {
      const out = await adminMinecraftNightMarket({ action: 'open', minutes: mins })
      if (out.ok) {
        setClosesAt(Date.now() + mins * 60_000)
        setNow(Date.now())
        setMessage(`Night Market opened for ${mins} minute${mins === 1 ? '' : 's'}.`)
      } else {
        setError(out.error ?? 'Could not open the Night Market.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setBusy(null)
    }
  }

  const runClose = async () => {
    setMessage(null)
    setError(null)
    setBusy('close')
    try {
      const out = await adminMinecraftNightMarket({ action: 'close' })
      if (out.ok) {
        setClosesAt(null)
        setMessage('Night Market force closed.')
      } else {
        setError(out.error ?? 'Could not close the Night Market.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-2xl border border-indigo-400/25 bg-indigo-950/20 p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-base font-semibold m-0 text-indigo-100">Night Market</h4>
          <p className="text-xs text-slate-400 m-0 mt-1">
            Runs <code className="text-indigo-200/90">nightmarket admin open spawn &lt;minutes&gt;</code> ·{' '}
            <code className="text-indigo-200/90">nightmarket admin close spawn</code>
          </p>
        </div>
        {closesAt != null && (
          <span className="rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-medium text-indigo-100 tabular-nums">
            Closes in {formatRemaining(closesAt - now)}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
            Duration (minutes)
          </span>
          <input
            type="number"
            min={1}
            max={MAX_MINUTES}
            step={1}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="w-28 rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
        </label>
        <button
          type="button"
          onClick={() => void runOpen()}
          disabled={busy != null}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-indigo-700 hover:bg-indigo-600 border border-indigo-400/30 disabled:opacity-50"
        >
          {busy === 'open' ? 'Opening…' : 'Open Night Market'}
        </button>
        <button
          type="button"
          onClick={() => void runClose()}
          disabled={busy != null}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-red-800 hover:bg-red-700 border border-red-400/30 disabled:opacity-50"
        >
          {busy === 'close' ? 'Closing…' : 'Force close'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Quick pick:</span>
        {DURATION_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setMinutes(String(p))}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
              minutes === String(p)
                ? 'border-indigo-400/60 bg-indigo-500/20 text-indigo-100'
                : 'border-white/15 bg-black/30 text-slate-300 hover:bg-white/10'
            }`}
          >
            {p >= 60 ? `${p / 60}h` : `${p}m`}
          </button>
        ))}
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
