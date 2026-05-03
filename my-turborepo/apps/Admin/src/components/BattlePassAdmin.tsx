import { useCallback, useEffect, useRef, useState } from 'react'
import {
  adminBattlePassParty,
  adminBattlePassPremium,
  fetchAdminUsers,
  fetchBattlePassGrants,
  type AdminUser,
  type BattlePassGrantListItem,
} from '../authApi'

const inp =
  'w-full max-w-md px-2 py-1.5 rounded-lg bg-black/40 border border-white/15 text-sm text-slate-100'
const btnGrant =
  'px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-600/30 border border-emerald-500/45 text-emerald-100 hover:bg-emerald-600/40 disabled:opacity-45'
const btnRevoke =
  'px-4 py-2 rounded-xl text-sm font-semibold bg-rose-600/25 border border-rose-500/40 text-rose-100 hover:bg-rose-600/35 disabled:opacity-45'

type Tab = 'premium' | 'party'
type Busy = null | 'grant' | 'revoke'

function formatTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

export function BattlePassAdmin() {
  const [tab, setTab] = useState<Tab>('premium')
  const [busy, setBusy] = useState<Busy>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [last, setLast] = useState<{ command: string; output?: string; error?: string } | null>(null)

  const [pickQuery, setPickQuery] = useState('')
  const [debouncedPick, setDebouncedPick] = useState('')
  const [pickOpen, setPickOpen] = useState(false)
  const [pickSuggestions, setPickSuggestions] = useState<AdminUser[]>([])
  const [pickLoading, setPickLoading] = useState(false)
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)

  const [grants, setGrants] = useState<BattlePassGrantListItem[]>([])
  const [grantsLoading, setGrantsLoading] = useState(false)
  const [grantsError, setGrantsError] = useState<string | null>(null)
  const pickWrapRef = useRef<HTMLDivElement>(null)

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

  const loadGrants = useCallback(async () => {
    setGrantsError(null)
    setGrantsLoading(true)
    try {
      const { grants: rows } = await fetchBattlePassGrants(tab)
      setGrants(rows)
    } catch (e: unknown) {
      setGrantsError((e as Error)?.message ?? 'Could not load grants list')
      setGrants([])
    } finally {
      setGrantsLoading(false)
    }
  }, [tab])

  useEffect(() => {
    void loadGrants()
  }, [loadGrants])

  useEffect(() => {
    if (!pickOpen) return
    const onDown = (e: MouseEvent) => {
      const el = pickWrapRef.current
      if (el && e.target instanceof Node && !el.contains(e.target)) setPickOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [pickOpen])

  const ign = selectedUser?.username.trim() ?? ''
  const userId = selectedUser?.id

  const run = async (grant: boolean) => {
    setMsg(null)
    setLast(null)
    if (!ign || userId == null) {
      setMsg('Search and pick a website account (username = Minecraft IGN).')
      return
    }
    setBusy(grant ? 'grant' : 'revoke')
    try {
      const body = { minecraft_username: ign, grant, user_id: userId }
      const res =
        tab === 'premium'
          ? await adminBattlePassPremium(body)
          : await adminBattlePassParty(body)
      setLast({
        command: res.command ?? '',
        output: res.output,
        error: res.error,
      })
      if (res.ok) {
        if (res.dbPersisted === false) {
          setMsg(
            grant
              ? 'Server updated, but the grants list could not be saved — run supabase/battlepass_lp_grants.sql on the database.'
              : 'Server updated, but the grants list could not be updated — run the battle pass SQL migration.'
          )
        } else {
          setMsg(
            grant
              ? tab === 'premium'
                ? 'Premium battle pass access granted.'
                : 'Party creation access granted.'
              : tab === 'premium'
                ? 'Premium battle pass access revoked.'
                : 'Party creation access revoked.'
          )
        }
        void loadGrants()
      } else {
        setMsg(res.error ?? 'Could not update the server.')
      }
    } catch (e: unknown) {
      setMsg((e as Error)?.message ?? 'Request failed')
    } finally {
      setBusy(null)
    }
  }

  const tabBtn = (id: Tab, label: string) => (
    <button
      type="button"
      key={id}
      onClick={() => setTab(id)}
      className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
        tab === id
          ? id === 'premium'
            ? 'bg-emerald-600/35 border-emerald-500/50 text-emerald-50'
            : 'bg-violet-600/35 border-violet-500/50 text-violet-50'
          : 'bg-black/30 border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="space-y-8 text-[#e8e7ed]">
      <div className="rounded-2xl border border-white/10 bg-black/25 p-5 md:p-6">
        <h1 className="text-2xl font-semibold text-[#f5efe6] m-0 mb-2">Battle pass</h1>
        <p className="text-sm text-muted m-0 max-w-3xl leading-relaxed">
          Pick a website account whose username matches the player in-game. The active list is updated when a grant or
          revoke succeeds (after the battle pass grants table exists in the database).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabBtn('premium', 'Premium battle pass')}
        {tabBtn('party', 'Party creation')}
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/25 p-5 md:p-6 space-y-4">
        <h2 className="text-lg font-semibold text-[#f5efe6] m-0">
          {tab === 'premium' ? 'Premium battle pass' : 'Party creation'}
        </h2>
        <p className="text-xs text-slate-400 m-0 leading-relaxed max-w-3xl">
          {tab === 'premium'
            ? 'Grants paid battle pass perks on the Minecraft server.'
            : 'Allows the player to create battle pass parties on the server.'}
        </p>

        <div ref={pickWrapRef} className="relative max-w-md space-y-1">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Website account (search by username)
          </label>
          <input
            className={inp}
            placeholder="Type to search…"
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
            autoComplete="off"
            spellCheck={false}
          />
          {pickOpen && !selectedUser && pickQuery.trim().length > 0 ? (
            <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-white/15 bg-[#141218] shadow-xl text-sm">
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
              Minecraft IGN used: <span className="font-mono text-slate-300">{selectedUser.username}</span>
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
            <p className="text-xs text-slate-500 m-0">Matches Java username rules on the site account.</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnGrant} disabled={busy !== null} onClick={() => run(true)}>
            {busy === 'grant' ? 'Running…' : tab === 'premium' ? 'Grant premium' : 'Grant party permission'}
          </button>
          <button type="button" className={btnRevoke} disabled={busy !== null} onClick={() => run(false)}>
            {busy === 'revoke' ? 'Running…' : tab === 'premium' ? 'Revoke premium' : 'Revoke party permission'}
          </button>
        </div>
      </div>

      {msg ? (
        <p
          className={`text-sm m-0 rounded-lg px-3 py-2 border ${
            msg.startsWith('Server updated, but')
              ? 'text-amber-200 border-amber-500/35 bg-amber-950/20'
              : msg.includes('failed') || msg.includes('Could not update') || msg.includes('Pick')
                ? 'text-rose-200 border-rose-500/35 bg-rose-950/25'
                : 'text-emerald-200 border-emerald-500/30 bg-emerald-950/20'
          }`}
        >
          {msg}
        </p>
      ) : null}

      {last?.command ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-2">
          <p className="text-xs uppercase tracking-wide text-slate-500 m-0">Last command</p>
          <pre className="text-xs text-slate-300 m-0 whitespace-pre-wrap break-all font-mono bg-black/40 border border-white/10 rounded-lg p-3">
            {last.command}
          </pre>
          {last.output ? (
            <>
              <p className="text-xs uppercase tracking-wide text-slate-500 m-0 pt-1">Server output</p>
              <pre className="text-xs text-slate-400 m-0 whitespace-pre-wrap break-all font-mono bg-black/40 border border-white/10 rounded-lg p-3 max-h-48 overflow-y-auto">
                {last.output}
              </pre>
            </>
          ) : null}
          {last.error && !last.output ? <p className="text-xs text-rose-300 m-0">{last.error}</p> : null}
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/10 bg-black/25 p-5 md:p-6 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-semibold text-[#f5efe6] m-0">
            Active grants ({tab === 'premium' ? 'premium' : 'party'})
          </h2>
          <button
            type="button"
            className="text-xs font-semibold text-slate-400 hover:text-slate-200 border border-white/10 rounded-lg px-2 py-1"
            onClick={() => void loadGrants()}
            disabled={grantsLoading}
          >
            {grantsLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
        {grantsError ? <p className="text-sm text-rose-300 m-0">{grantsError}</p> : null}
        {!grantsLoading && !grantsError && grants.length === 0 ? (
          <p className="text-sm text-slate-500 m-0">No active grants recorded for this tab yet.</p>
        ) : null}
        {grants.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full text-sm text-left">
              <thead className="bg-black/40 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Minecraft</th>
                  <th className="px-3 py-2 font-semibold">Website user</th>
                  <th className="px-3 py-2 font-semibold">Granted</th>
                  <th className="px-3 py-2 font-semibold">By</th>
                </tr>
              </thead>
              <tbody>
                {grants.map((g) => (
                  <tr key={g.id} className="border-t border-white/10 hover:bg-white/[0.03]">
                    <td className="px-3 py-2 font-mono text-slate-200">{g.minecraft_username}</td>
                    <td className="px-3 py-2 text-slate-300">
                      {g.website_username ?? '—'}
                      {g.website_email ? (
                        <span className="block text-xs text-slate-500 truncate max-w-[14rem]">{g.website_email}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{formatTs(g.granted_at)}</td>
                    <td className="px-3 py-2 text-slate-400">{g.granted_by_username ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  )
}
