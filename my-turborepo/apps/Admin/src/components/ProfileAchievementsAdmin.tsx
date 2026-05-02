import { useCallback, useEffect, useState } from 'react'
import {
  adminCreateAchievementDefinition,
  adminFetchAchievementDefinitions,
  adminFetchAchievementGrants,
  adminGrantProfileAchievement,
  adminPatchAchievementDefinition,
  adminRevokeProfileAchievementGrant,
  type ProfileAchievementDefinition,
  type ProfileAchievementGrantRow,
} from '../authApi'

const TIERS = ['cyan', 'violet', 'gold'] as const

const inp = 'w-full px-2 py-1.5 rounded-lg bg-black/40 border border-white/15 text-sm text-slate-100'
const btnOutline =
  'px-3 py-1.5 rounded-xl text-sm font-medium border border-white/20 text-slate-200 bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-45'
const btnPrimary =
  'px-4 py-2 rounded-xl text-sm font-medium bg-emerald-600/25 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-600/35 disabled:opacity-45'

export function ProfileAchievementsAdmin() {
  const [defs, setDefs] = useState<ProfileAchievementDefinition[]>([])
  const [defsErr, setDefsErr] = useState<string | null>(null)
  const [lookupUser, setLookupUser] = useState('')
  const [resolvedUserId, setResolvedUserId] = useState<number | null>(null)
  const [grants, setGrants] = useState<ProfileAchievementGrantRow[]>([])
  const [grantsLoading, setGrantsLoading] = useState(false)
  const [grantsErr, setGrantsErr] = useState<string | null>(null)

  const [createTitle, setCreateTitle] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const [createTier, setCreateTier] = useState<(typeof TIERS)[number]>('cyan')
  const [createSlug, setCreateSlug] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [grantPickId, setGrantPickId] = useState('')

  const loadDefs = useCallback(async () => {
    setDefsErr(null)
    try {
      const { definitions } = await adminFetchAchievementDefinitions()
      setDefs(definitions)
    } catch (e: unknown) {
      setDefsErr((e as Error)?.message ?? 'Failed to load definitions')
    }
  }, [])

  useEffect(() => {
    loadDefs()
  }, [loadDefs])

  const loadGrants = async () => {
    const q = lookupUser.trim()
    if (!q) {
      setGrantsErr('Enter a username or numeric user id')
      return
    }
    setGrantsLoading(true)
    setGrantsErr(null)
    try {
      const uid = parseInt(q, 10)
      const data =
        Number.isFinite(uid) && String(uid) === q.trim()
          ? await adminFetchAchievementGrants({ user_id: uid })
          : await adminFetchAchievementGrants({ username: q })
      setResolvedUserId(data.user_id)
      setGrants(data.grants)
    } catch (e: unknown) {
      setGrants([])
      setResolvedUserId(null)
      setGrantsErr((e as Error)?.message ?? 'Lookup failed')
    } finally {
      setGrantsLoading(false)
    }
  }

  const onCreateBadge = async () => {
    setBusy(true)
    setMsg(null)
    try {
      await adminCreateAchievementDefinition({
        title: createTitle.trim(),
        description: createDesc.trim(),
        tier: createTier,
        ...(createSlug.trim() ? { slug: createSlug.trim() } : {}),
      })
      setCreateTitle('')
      setCreateDesc('')
      setCreateSlug('')
      setMsg('Badge type created.')
      await loadDefs()
    } catch (e: unknown) {
      setMsg((e as Error)?.message ?? 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  const toggleDefActive = async (d: ProfileAchievementDefinition) => {
    setBusy(true)
    setMsg(null)
    try {
      await adminPatchAchievementDefinition(d.id, { active: !d.active })
      await loadDefs()
    } catch (e: unknown) {
      setMsg((e as Error)?.message ?? 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  const grantSelected = async () => {
    if (!resolvedUserId || !grantPickId) return
    setBusy(true)
    setMsg(null)
    try {
      await adminGrantProfileAchievement({
        target_user_id: resolvedUserId,
        achievement_id: Number(grantPickId),
      })
      setMsg('Granted.')
      const data = await adminFetchAchievementGrants({ user_id: resolvedUserId })
      setGrants(data.grants)
    } catch (e: unknown) {
      setMsg((e as Error)?.message ?? 'Grant failed')
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (grantId: number) => {
    setBusy(true)
    setMsg(null)
    try {
      await adminRevokeProfileAchievementGrant(grantId)
      setMsg('Revoked.')
      if (resolvedUserId != null) {
        const data = await adminFetchAchievementGrants({ user_id: resolvedUserId })
        setGrants(data.grants)
      }
    } catch (e: unknown) {
      setMsg((e as Error)?.message ?? 'Revoke failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-10 text-[#e8e7ed]">
      <div className="rounded-2xl border border-white/10 bg-black/25 p-5 md:p-6">
        <h1 className="text-2xl font-semibold text-[#f5efe6] m-0 mb-2">Profile badges</h1>
        <p className="text-sm text-muted m-0 leading-relaxed max-w-3xl">
          Define achievement cards and grant them to website users. They appear on each user&apos;s public Profile page
          (share link). Hidden badge types stop showing everywhere until re-activated (existing grants remain in the DB).
        </p>
      </div>

      {defsErr ? (
        <p className="text-sm text-rose-300 m-0 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2">{defsErr}</p>
      ) : null}
      {msg ? (
        <p className={`text-sm m-0 rounded-lg px-3 py-2 border ${msg.includes('fail') ? 'text-rose-200 border-rose-500/30 bg-rose-950/25' : 'text-emerald-200 border-emerald-500/30 bg-emerald-950/20'}`}>{msg}</p>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-black/25 p-5 md:p-6 space-y-4">
        <h2 className="text-lg font-semibold m-0 text-[#f5efe6]">Badge types</h2>

        <ul className="list-none m-0 p-0 space-y-2 max-h-[16rem] overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/[0.06]">
          {defs.map((d) => (
            <li key={d.id} className="px-3 py-2.5 flex flex-wrap items-center gap-3 justify-between text-sm bg-black/20">
              <div className="min-w-0">
                <span className="text-xs font-mono text-violet-300">{d.slug}</span>
                <span className={`ml-2 text-[10px] uppercase tracking-wide ${d.active ? 'text-emerald-300' : 'text-slate-500'}`}>
                  {d.active ? 'Active' : 'Hidden'}
                </span>
                <span className="block text-[#ecebff] font-medium">{d.title}</span>
                <span className="text-xs text-slate-500">tier {d.tier}</span>
              </div>
              <button type="button" className={btnOutline} disabled={busy} onClick={() => toggleDefActive(d)}>
                {d.active ? 'Deactivate' : 'Activate'}
              </button>
            </li>
          ))}
        </ul>

        <div className="pt-4 border-t border-white/10 space-y-3">
          <h3 className="text-base font-medium m-0 text-[#f5efe6]">New badge type</h3>
          <input className={inp} placeholder="Title (e.g. Tournament champion)" value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} />
          <textarea
            className={`${inp} min-h-[5.5rem] resize-y`}
            placeholder="Short description shown on public profiles"
            value={createDesc}
            onChange={(e) => setCreateDesc(e.target.value)}
          />
          <input
            className={inp}
            placeholder="Optional slug (auto-derived from title if empty)"
            value={createSlug}
            onChange={(e) => setCreateSlug(e.target.value)}
          />
          <div className="flex flex-wrap gap-2 items-center">
            <label htmlFor="ach-tier-c" className="text-xs text-slate-500 uppercase tracking-wide whitespace-nowrap">
              Tier
            </label>
            <select
              id="ach-tier-c"
              value={createTier}
              onChange={(e) => setCreateTier(e.target.value as (typeof TIERS)[number])}
              className={`${inp} w-auto min-w-[8rem]`}
            >
              <option value="cyan">Cyan</option>
              <option value="violet">Violet</option>
              <option value="gold">Gold</option>
            </select>
            <button type="button" disabled={busy || !createTitle.trim() || !createDesc.trim()} className={btnPrimary} onClick={onCreateBadge}>
              Create type
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/25 p-5 md:p-6 space-y-4">
        <h2 className="text-lg font-semibold m-0 text-[#f5efe6]">Grant / revoke per user</h2>

        <div className="flex flex-wrap gap-2 items-center">
          <input className={`${inp} flex-1 min-w-[14rem]`} placeholder="Username or numeric user id" value={lookupUser} onChange={(e) => setLookupUser(e.target.value)} />
          <button type="button" className={btnOutline} disabled={grantsLoading} onClick={loadGrants}>
            {grantsLoading ? '…' : 'Load grants'}
          </button>
        </div>
        {grantsErr ? <p className="text-xs text-rose-300 m-0">{grantsErr}</p> : null}
        {resolvedUserId != null ? (
          <p className="text-xs text-slate-500 m-0">
            Resolved user id: <span className="text-slate-200 font-mono tabular-nums">{resolvedUserId}</span>
          </p>
        ) : null}

        {resolvedUserId != null ? (
          <>
            <div className="flex flex-wrap gap-2 items-center pt-2">
              <select value={grantPickId} onChange={(e) => setGrantPickId(e.target.value)} className={`${inp} flex-1 min-w-[16rem]`}>
                <option value="">Choose badge to grant…</option>
                {defs
                  .filter((d) => d.active)
                  .map((d) => (
                    <option key={d.id} value={String(d.id)}>
                      {d.title} ({d.slug})
                    </option>
                  ))}
              </select>
              <button type="button" className={btnPrimary} disabled={busy || !grantPickId} onClick={grantSelected}>
                Grant
              </button>
            </div>

            <ul className="list-none m-0 p-0 space-y-2">
              {grants.map((g) => (
                <li
                  key={g.grant_id}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm rounded-xl border border-white/10 px-3 py-2 bg-black/30"
                >
                  <div className="min-w-0">
                    <span className="font-medium text-slate-200">{g.title}</span>
                    {!g.definition_active ? <span className="text-amber-300/95 text-xs ml-2">(type hidden)</span> : null}
                    <span className="block text-xs text-slate-500 font-mono">{g.slug}</span>
                  </div>
                  <button type="button" className={`${btnOutline} text-xs`} disabled={busy} onClick={() => revoke(g.grant_id)}>
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
            {grants.length === 0 ? (
              <p className="text-xs text-muted m-0">No badges granted to this account yet.</p>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  )
}
