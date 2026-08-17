import { useEffect, useMemo, useRef, useState } from 'react'
import { adminMinecraftSkindexGive, fetchAdminSkindexCatalog, fetchAdminUsers, type AdminUser } from '../authApi'

const IGN_RE = /^[A-Za-z0-9_]{2,16}$/

type SkinEntry = { id: string; species: string[] }

const inputClass =
  'w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40'
const menuClass =
  'absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-white/15 bg-[#141218] shadow-xl text-sm'

/**
 * Skindex admin RCON: `skindex give <player> <skin_id>`
 */
export function SkindexAdmin() {
  const [skins, setSkins] = useState<SkinEntry[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)

  const [pickQuery, setPickQuery] = useState('')
  const [debouncedPick, setDebouncedPick] = useState('')
  const [pickOpen, setPickOpen] = useState(false)
  const [pickSuggestions, setPickSuggestions] = useState<AdminUser[]>([])
  const [pickLoading, setPickLoading] = useState(false)
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const pickWrapRef = useRef<HTMLDivElement>(null)

  const [skinQuery, setSkinQuery] = useState('')
  const [skinOpen, setSkinOpen] = useState(false)
  const [selectedSkin, setSelectedSkin] = useState<SkinEntry | null>(null)
  const skinWrapRef = useRef<HTMLDivElement>(null)

  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setCatalogLoading(true)
    fetchAdminSkindexCatalog()
      .then((skinRes) => {
        if (!cancelled) setSkins(skinRes.skins ?? [])
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load skindex catalog.')
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedPick(pickQuery.trim()), 250)
    return () => window.clearTimeout(t)
  }, [pickQuery])

  useEffect(() => {
    if (debouncedPick.length < 1) {
      setPickSuggestions([])
      return
    }
    let cancelled = false
    setPickLoading(true)
    fetchAdminUsers(debouncedPick)
      .then((r) => {
        if (!cancelled) setPickSuggestions(r.users)
      })
      .catch(() => {
        if (!cancelled) setPickSuggestions([])
      })
      .finally(() => {
        if (!cancelled) setPickLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [debouncedPick])

  useEffect(() => {
    if (!pickOpen && !skinOpen) return
    const onDown = (e: MouseEvent) => {
      const t = e.target
      if (!(t instanceof Node)) return
      if (pickWrapRef.current && !pickWrapRef.current.contains(t)) setPickOpen(false)
      if (skinWrapRef.current && !skinWrapRef.current.contains(t)) setSkinOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [pickOpen, skinOpen])

  const filteredSkins = useMemo(() => {
    const q = skinQuery.trim().toLowerCase()
    if (!q) return skins
    return skins.filter(
      (s) =>
        s.id.toLowerCase().includes(q) ||
        s.species.some((sp) => sp.toLowerCase().includes(q))
    )
  }, [skins, skinQuery])

  const ign = selectedUser?.username.trim() ?? ''

  const submit = async () => {
    setMessage(null)
    setError(null)
    if (!ign) {
      setError('Search and pick a website account (username = Minecraft IGN).')
      return
    }
    if (!IGN_RE.test(ign)) {
      setError('Selected username is not a valid Minecraft IGN (2–16 letters, numbers, underscore).')
      return
    }
    if (!selectedSkin) {
      setError('Search and pick a skin id.')
      return
    }
    setBusy(true)
    try {
      const out = await adminMinecraftSkindexGive({ player: ign, skinId: selectedSkin.id })
      if (out.ok) {
        setMessage(`Gave skin ${selectedSkin.id} to ${ign}.`)
      } else {
        setError(out.error ?? 'Could not run skindex give on the server.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-full flex flex-col rounded-2xl border border-indigo-400/25 bg-indigo-950/20 p-4 sm:p-5 space-y-4">
      <div>
        <h4 className="text-base font-semibold m-0 text-indigo-100">SkinDex</h4>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div ref={pickWrapRef} className="relative space-y-1.5">
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide">
            Player
          </label>
          <input
            type="text"
            value={selectedUser ? selectedUser.username : pickQuery}
            onChange={(e) => {
              if (selectedUser) {
                setSelectedUser(null)
                setPickQuery(e.target.value)
              } else {
                setPickQuery(e.target.value)
              }
              setPickOpen(true)
            }}
            onFocus={() => setPickOpen(true)}
            placeholder="Type to search username…"
            autoComplete="off"
            spellCheck={false}
            className={inputClass}
          />
          {pickOpen && !selectedUser && pickQuery.trim().length > 0 ? (
            <ul className={menuClass}>
              {pickLoading ? (
                <li className="px-3 py-2 text-slate-500">Searching…</li>
              ) : pickSuggestions.length === 0 ? (
                <li className="px-3 py-2 text-slate-500">No matching accounts.</li>
              ) : (
                pickSuggestions.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-white/10 text-slate-200"
                      onClick={() => {
                        setSelectedUser(u)
                        setPickQuery('')
                        setPickOpen(false)
                        setPickSuggestions([])
                      }}
                    >
                      <span className="font-medium text-[#f5efe6]">{u.username}</span>
                      <span className="text-slate-500 text-xs block truncate">{u.email}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
          {selectedUser ? (
            <p className="text-xs text-slate-500 m-0">
              Minecraft IGN:{' '}
              <span className="font-mono text-slate-300">{selectedUser.username}</span>
              {' · '}
              <button
                type="button"
                className="text-amber-200/90 hover:underline"
                onClick={() => {
                  setSelectedUser(null)
                  setPickQuery('')
                  setPickOpen(false)
                }}
              >
                Change
              </button>
            </p>
          ) : (
            <p className="text-xs text-slate-500 m-0">Search and pick a website account.</p>
          )}
        </div>

        <div ref={skinWrapRef} className="relative space-y-1.5">
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide">
            Skin id
          </label>
          <input
            type="text"
            value={selectedSkin ? selectedSkin.id : skinQuery}
            onChange={(e) => {
              if (selectedSkin) {
                setSelectedSkin(null)
                setSkinQuery(e.target.value)
              } else {
                setSkinQuery(e.target.value)
              }
              setSkinOpen(true)
            }}
            onFocus={() => setSkinOpen(true)}
            placeholder={catalogLoading ? 'Loading skins…' : 'Type to search skin id…'}
            autoComplete="off"
            spellCheck={false}
            disabled={catalogLoading}
            className={inputClass}
          />
          {skinOpen && !selectedSkin && !catalogLoading ? (
            <ul className={menuClass}>
              {filteredSkins.length === 0 ? (
                <li className="px-3 py-2 text-slate-500">No matching skins.</li>
              ) : (
                filteredSkins.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-white/10 text-slate-200"
                      onClick={() => {
                        setSelectedSkin(s)
                        setSkinQuery('')
                        setSkinOpen(false)
                      }}
                    >
                      <span className="font-medium text-[#f5efe6] font-mono">{s.id}</span>
                      <span className="text-slate-500 text-xs block truncate">{s.species.join(', ')}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
          {selectedSkin ? (
            <p className="text-xs text-slate-500 m-0">
              Applies to:{' '}
              <span className="font-mono text-slate-300">{selectedSkin.species.join(', ')}</span>
              {' · '}
              <button
                type="button"
                className="text-amber-200/90 hover:underline"
                onClick={() => {
                  setSelectedSkin(null)
                  setSkinQuery('')
                  setSkinOpen(false)
                }}
              >
                Change
              </button>
            </p>
          ) : (
            <p className="text-xs text-slate-500 m-0">Search and pick a skin from the catalog.</p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || catalogLoading}
        className="self-start rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-indigo-700 hover:bg-indigo-600 border border-indigo-400/30 disabled:opacity-50"
      >
        {busy ? 'Giving…' : 'Submit'}
      </button>

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
