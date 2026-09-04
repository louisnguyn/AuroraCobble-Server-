import { useState } from 'react'
import { adminMinecraftAsteryAccess } from '../authApi'

const IGN_RE = /^[A-Za-z0-9_]{2,16}$/

/**
 * AsteryAccess Discord ↔ Minecraft link admin RCON:
 * `asteryaccess admin reset-unclaimed <player>`
 */
export function AsteryAccessAdmin() {
  const [ign, setIgn] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setMessage(null)
    setError(null)
    const name = ign.trim()
    if (!IGN_RE.test(name)) {
      setError('Enter a Minecraft IGN (2–16 letters, numbers, underscore).')
      return
    }
    setBusy(true)
    try {
      const out = await adminMinecraftAsteryAccess({
        action: 'reset_unclaimed',
        minecraft_username: name,
      })
      if (out.ok) {
        setMessage(`Revoked Discord link for ${name}.`)
      } else {
        setError(out.error ?? 'Could not revoke the Discord link.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-full flex flex-col rounded-2xl border border-sky-400/25 bg-sky-950/20 p-4 sm:p-5 space-y-4">
      <div>
        <h4 className="text-base font-semibold m-0 text-sky-100">Astery Access</h4>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block space-y-1.5 min-w-[12rem] flex-1">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
            Minecraft name
          </span>
          <input
            type="text"
            value={ign}
            onChange={(e) => setIgn(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void submit()
              }
            }}
            placeholder="PlayerName"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
          />
        </label>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-sky-700 hover:bg-sky-600 border border-sky-400/30 disabled:opacity-50"
        >
          {busy ? 'Revoking…' : 'Revoke'}
        </button>
      </div>

      {message ? (
        <p className="text-sm text-emerald-300 m-0 rounded-lg border border-emerald-500/25 bg-emerald-950/30 px-3 py-2">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-300 m-0 rounded-lg border border-red-500/25 bg-red-950/30 px-3 py-2">
          {error}
        </p>
      ) : null}
    </div>
  )
}
