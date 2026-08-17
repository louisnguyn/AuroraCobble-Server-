import { useState } from 'react'
import { adminMinecraftWorldHunt } from '../authApi'

const SPECIES_RE = /^[A-Za-z0-9][A-Za-z0-9_\-]{0,39}$/

/**
 * World Hunt admin RCON: `hunt set <pokemon>`
 */
export function WorldHuntAdmin() {
  const [species, setSpecies] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setMessage(null)
    setError(null)
    const pokemon = species.trim()
    if (!SPECIES_RE.test(pokemon)) {
      setError('Enter a Pokémon id (letters, numbers, underscore, hyphen — e.g. gardevoir).')
      return
    }
    setBusy(true)
    try {
      const out = await adminMinecraftWorldHunt({ pokemon })
      if (out.ok) {
        setMessage(`World hunt set to ${pokemon}.`)
      } else {
        setError(out.error ?? 'Could not set the world hunt.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-full flex flex-col rounded-2xl border border-pink-400/25 bg-pink-950/20 p-4 sm:p-5 space-y-4">
      <div>
        <h4 className="text-base font-semibold m-0 text-pink-100">World Hunt</h4>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block space-y-1.5 min-w-[12rem] flex-1">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Pokémon</span>
          <input
            type="text"
            value={species}
            onChange={(e) => setSpecies(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void submit()
              }
            }}
            placeholder="gardevoir"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-pink-500/40"
          />
        </label>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-pink-700 hover:bg-pink-600 border border-pink-400/30 disabled:opacity-50"
        >
          {busy ? 'Setting…' : 'Submit'}
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
