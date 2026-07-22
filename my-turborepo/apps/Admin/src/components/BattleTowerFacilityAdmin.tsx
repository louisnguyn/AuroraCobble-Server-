import { useState } from 'react'
import { adminMinecraftFacilityAdmin } from '../authApi'

const FACILITY_MODES = [
  { id: 'tower' as const, label: 'Tower' },
  { id: 'classic' as const, label: 'Classic' },
]

const IGN_RE = /^[A-Za-z0-9_]{2,16}$/

/**
 * Admin tools for Cobblemon Battle Tower / SBF mod RCON:
 * - sbf admin forcewin <player>
 * - sbf admin setstage <player> <tower|classic> <stage>
 */
export function BattleTowerFacilityAdmin() {
  const [player, setPlayer] = useState('')
  const [stage, setStage] = useState('1')
  const [mode, setMode] = useState<'tower' | 'classic'>('tower')
  const [busy, setBusy] = useState<'force_win' | 'set_stage' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ign = player.trim()

  const runForceWin = async () => {
    setMessage(null)
    setError(null)
    if (!IGN_RE.test(ign)) {
      setError('Enter a valid Minecraft IGN (2–16 letters, numbers, underscore).')
      return
    }
    setBusy('force_win')
    try {
      const out = await adminMinecraftFacilityAdmin({
        action: 'force_win',
        minecraft_username: ign,
      })
      if (out.ok) {
        setMessage(`Forced win for ${ign}.${out.command ? ` (${out.command})` : ''}`)
      } else {
        setError(out.error ?? 'Could not force win on the server.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setBusy(null)
    }
  }

  const runSetStage = async () => {
    setMessage(null)
    setError(null)
    if (!IGN_RE.test(ign)) {
      setError('Enter a valid Minecraft IGN (2–16 letters, numbers, underscore).')
      return
    }
    const stageNum = Number.parseInt(stage, 10)
    if (!Number.isFinite(stageNum) || stageNum < 0) {
      setError('Stage must be a whole number ≥ 0.')
      return
    }
    setBusy('set_stage')
    try {
      const out = await adminMinecraftFacilityAdmin({
        action: 'set_stage',
        minecraft_username: ign,
        stage: stageNum,
        mode,
      })
      if (out.ok) {
        setMessage(
          `Set ${ign} to ${mode} stage ${stageNum}.${out.command ? ` (${out.command})` : ''}`
        )
      } else {
        setError(out.error ?? 'Could not set stage on the server.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-2xl border border-violet-400/25 bg-violet-950/20 p-4 sm:p-5 space-y-4">
      <div>
        <h4 className="text-base font-semibold m-0 text-violet-100">Facility admin</h4>
        <p className="text-xs text-slate-400 m-0 mt-1">
          Runs SBF RCON:{' '}
          <code className="text-violet-200/90">sbf admin forcewin …</code> ·{' '}
          <code className="text-violet-200/90">sbf admin setstage … tower|classic …</code>
        </p>
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Player (IGN)</span>
        <input
          type="text"
          value={player}
          onChange={(e) => setPlayer(e.target.value)}
          placeholder="MinecraftUsername"
          autoComplete="off"
          spellCheck={false}
          className="w-full max-w-xs rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
        />
      </label>

      <div className="flex flex-wrap gap-3 items-end">
        <button
          type="button"
          onClick={() => void runForceWin()}
          disabled={busy != null}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-600 border border-emerald-400/30 disabled:opacity-50"
        >
          {busy === 'force_win' ? 'Forcing win…' : 'Force win'}
        </button>
      </div>

      <div className="border-t border-white/10 pt-4 space-y-3">
        <p className="text-sm font-medium text-slate-300 m-0">Set stage</p>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Mode</span>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value === 'classic' ? 'classic' : 'tower')}
              className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            >
              {FACILITY_MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Stage</span>
            <input
              type="number"
              min={0}
              step={1}
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              className="w-24 rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            />
          </label>
          <button
            type="button"
            onClick={() => void runSetStage()}
            disabled={busy != null}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-violet-700 hover:bg-violet-600 border border-violet-400/30 disabled:opacity-50"
          >
            {busy === 'set_stage' ? 'Setting…' : 'Set stage'}
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
