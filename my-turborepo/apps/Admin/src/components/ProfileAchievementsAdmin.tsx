import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  adminCreateAchievementDefinition,
  adminFetchAchievementDefinitions,
  adminFetchAchievementGrants,
  adminGrantProfileAchievement,
  adminPatchAchievementDefinition,
  adminRevokeProfileAchievementGrant,
  fetchAdminUsers,
  type AdminUser,
  type ProfileAchievementDefinition,
  type ProfileAchievementGrantRow,
  type ProfileAchievementTier,
} from '../authApi'

const TIERS: ProfileAchievementTier[] = [
  'silver',
  'cyan',
  'emerald',
  'violet',
  'rose',
  'gold',
  'mythic',
  'legend',
]

function achievementTierRank(tier: string): number {
  const i = TIERS.indexOf(tier as ProfileAchievementTier)
  return i === -1 ? 99 : i
}

const TIER_LABELS: Record<ProfileAchievementTier, string> = {
  silver: 'Silver',
  cyan: 'Cyan',
  emerald: 'Emerald',
  violet: 'Violet',
  rose: 'Rose',
  gold: 'Gold',
  mythic: 'Mythic',
  legend: 'Legend',
}

const inp = 'w-full px-2 py-1.5 rounded-lg bg-black/40 border border-white/15 text-sm text-slate-100'
const btnOutline =
  'px-3 py-1.5 rounded-xl text-sm font-medium border border-white/20 text-slate-200 bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-45'
const btnPrimary =
  'px-4 py-2 rounded-xl text-sm font-medium bg-emerald-600/25 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-600/35 disabled:opacity-45'

function adminAcPreviewClass(tier: string): string {
  const map: Record<string, string> = {
    silver: 'admin-ac-preview admin-ac-silver',
    cyan: 'admin-ac-preview admin-ac-cyan',
    emerald: 'admin-ac-preview admin-ac-emerald',
    violet: 'admin-ac-preview admin-ac-violet',
    rose: 'admin-ac-preview admin-ac-rose',
    gold: 'admin-ac-preview admin-ac-gold',
    mythic: 'admin-ac-preview admin-ac-mythic',
    legend: 'admin-ac-preview admin-ac-legend',
  }
  return map[tier] ?? 'admin-ac-preview admin-ac-cyan'
}

function BadgeMiniPreview({ title, tier }: { title: string; tier: string }) {
  const tierLabel = (TIER_LABELS as Record<string, string>)[tier] ?? tier
  const isLegend = tier === 'legend'
  const haloOverflow = tier === 'mythic' || tier === 'violet' || tier === 'gold'
  return (
    <div
      className={`${adminAcPreviewClass(tier)} max-w-[14rem] ${isLegend ? 'relative border-0 bg-transparent p-0 overflow-visible' : ''} ${haloOverflow ? 'overflow-visible' : ''}`}
    >
      {isLegend ? <span className="admin-ac-legend-ring" aria-hidden /> : null}
      <div className={isLegend ? 'relative z-[1] rounded-[10px] bg-[linear-gradient(155deg,rgba(40,12,6,0.98),rgba(14,6,10,0.99))] px-[0.65rem] py-[0.55rem]' : ''}>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 m-0 mb-0.5">{tierLabel}</p>
        <p className="text-sm font-semibold text-[#f5efe6] m-0 leading-snug line-clamp-2">{title}</p>
      </div>
    </div>
  )
}

export function ProfileAchievementsAdmin() {
  const [defs, setDefs] = useState<ProfileAchievementDefinition[]>([])
  const [defsErr, setDefsErr] = useState<string | null>(null)

  const [pickQuery, setPickQuery] = useState('')
  const [debouncedPick, setDebouncedPick] = useState('')
  const [pickOpen, setPickOpen] = useState(false)
  const [pickSuggestions, setPickSuggestions] = useState<AdminUser[]>([])
  const [pickLoading, setPickLoading] = useState(false)
  const [selectedLookupUser, setSelectedLookupUser] = useState<AdminUser | null>(null)
  const pickWrapRef = useRef<HTMLDivElement>(null)

  const [resolvedUserId, setResolvedUserId] = useState<number | null>(null)
  const [grants, setGrants] = useState<ProfileAchievementGrantRow[]>([])
  const [grantsLoading, setGrantsLoading] = useState(false)
  const [grantsErr, setGrantsErr] = useState<string | null>(null)

  const [createTitle, setCreateTitle] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const [createTier, setCreateTier] = useState<ProfileAchievementTier>('cyan')
  const [createSlug, setCreateSlug] = useState('')
  const [createSort, setCreateSort] = useState('0')

  const [editing, setEditing] = useState<ProfileAchievementDefinition | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editTier, setEditTier] = useState<ProfileAchievementTier>('cyan')
  const [editSort, setEditSort] = useState('0')

  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [grantPickId, setGrantPickId] = useState('')

  const sortedDefs = useMemo(
    () =>
      [...defs].sort((a, b) => {
        const tr = achievementTierRank(a.tier) - achievementTierRank(b.tier)
        if (tr !== 0) return tr
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
        return a.title.localeCompare(b.title)
      }),
    [defs]
  )

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
    if (!pickOpen) return
    const onDown = (e: MouseEvent) => {
      const el = pickWrapRef.current
      if (el && e.target instanceof Node && !el.contains(e.target)) setPickOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [pickOpen])

  const loadGrantsForUser = useCallback(async (u: AdminUser) => {
    setGrantsLoading(true)
    setGrantsErr(null)
    try {
      const data = await adminFetchAchievementGrants({ username: u.username.trim() })
      setResolvedUserId(data.user_id)
      setGrants(data.grants)
    } catch (e: unknown) {
      setGrants([])
      setResolvedUserId(null)
      setGrantsErr((e as Error)?.message ?? 'Lookup failed')
    } finally {
      setGrantsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!selectedLookupUser) {
      setResolvedUserId(null)
      setGrants([])
      setGrantsErr(null)
      return
    }
    void loadGrantsForUser(selectedLookupUser)
  }, [selectedLookupUser, loadGrantsForUser])

  const openEdit = (d: ProfileAchievementDefinition) => {
    setEditing(d)
    setEditTitle(d.title)
    setEditDesc(d.description)
    setEditTier(d.tier)
    setEditSort(String(d.sort_order ?? 0))
    setMsg(null)
  }

  const closeEdit = () => {
    setEditing(null)
  }

  const saveEdit = async () => {
    if (!editing) return
    setBusy(true)
    setMsg(null)
    try {
      const sortN = Number.parseInt(editSort, 10)
      await adminPatchAchievementDefinition(editing.id, {
        title: editTitle.trim(),
        description: editDesc.trim(),
        tier: editTier,
        sort_order: Number.isFinite(sortN) ? sortN : editing.sort_order,
      })
      setMsg('Badge type updated.')
      closeEdit()
      await loadDefs()
    } catch (e: unknown) {
      setMsg((e as Error)?.message ?? 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  const onCreateBadge = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const sortN = Number.parseInt(createSort, 10)
      await adminCreateAchievementDefinition({
        title: createTitle.trim(),
        description: createDesc.trim(),
        tier: createTier,
        ...(createSlug.trim() ? { slug: createSlug.trim() } : {}),
        sort_order: Number.isFinite(sortN) ? sortN : 0,
      })
      setCreateTitle('')
      setCreateDesc('')
      setCreateSlug('')
      setCreateSort('0')
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
        <h1 className="text-2xl font-semibold text-[#f5efe6] m-0">Profile badges</h1>
      </div>

      {defsErr ? (
        <p className="text-sm text-rose-300 m-0 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2">{defsErr}</p>
      ) : null}
      {msg ? (
        <p
          className={`text-sm m-0 rounded-lg px-3 py-2 border ${
            msg.includes('fail') ? 'text-rose-200 border-rose-500/30 bg-rose-950/25' : 'text-emerald-200 border-emerald-500/30 bg-emerald-950/20'
          }`}
        >
          {msg}
        </p>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-black/25 p-5 md:p-6 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold m-0 text-[#f5efe6]">Badge types</h2>
          <p className="text-xs text-slate-500 m-0 max-w-md">
            Preview matches the public profile. Lists order by tier (silver → legend), then sort order within the same tier.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sortedDefs.map((d) => (
            <div
              key={d.id}
              className="rounded-2xl border border-white/10 bg-black/30 p-4 flex flex-col gap-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <BadgeMiniPreview title={d.title} tier={d.tier} />
                <span
                  className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${
                    d.active ? 'text-emerald-200 border-emerald-500/35 bg-emerald-950/30' : 'text-slate-500 border-white/10 bg-black/40'
                  }`}
                >
                  {d.active ? 'Active' : 'Hidden'}
                </span>
              </div>
              <p className="text-xs text-slate-500 m-0 line-clamp-3">{d.description}</p>
              <p className="text-[11px] font-mono text-violet-300/90 m-0 truncate" title={d.slug}>
                {d.slug}
              </p>
              <div className="flex flex-wrap gap-2 mt-auto pt-1">
                <button type="button" className={btnOutline} disabled={busy} onClick={() => openEdit(d)}>
                  Edit
                </button>
                <button type="button" className={btnOutline} disabled={busy} onClick={() => toggleDefActive(d)}>
                  {d.active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="pt-5 border-t border-white/10 space-y-3">
          <h3 className="text-base font-medium m-0 text-[#f5efe6]">New badge type</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <input className={inp} placeholder="Title (e.g. Tournament champion)" value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} />
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <label htmlFor="ach-tier-new" className="block text-xs text-slate-500 mb-1">
                  Tier
                </label>
                <select
                  id="ach-tier-new"
                  value={createTier}
                  onChange={(e) => setCreateTier(e.target.value as ProfileAchievementTier)}
                  className={`${inp} w-auto min-w-[10rem]`}
                >
                  {TIERS.map((t) => (
                    <option key={t} value={t}>
                      {TIER_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ach-sort-new" className="block text-xs text-slate-500 mb-1">
                  Sort order (within same tier)
                </label>
                <input
                  id="ach-sort-new"
                  type="number"
                  className={`${inp} w-24`}
                  value={createSort}
                  onChange={(e) => setCreateSort(e.target.value)}
                />
              </div>
            </div>
          </div>
          <textarea
            className={`${inp} min-h-[5.5rem] resize-y md:col-span-2`}
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
          <div className="flex flex-wrap gap-4 items-end justify-between">
            <BadgeMiniPreview title={createTitle || 'Preview title'} tier={createTier} />
            <button type="button" disabled={busy || !createTitle.trim() || !createDesc.trim()} className={btnPrimary} onClick={onCreateBadge}>
              Create type
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/25 p-5 md:p-6 space-y-4">
        <h2 className="text-lg font-semibold m-0 text-[#f5efe6]">Grant / revoke per user</h2>
        <p className="text-xs text-slate-500 m-0">Search by website username, then pick an account to load and manage their badges.</p>

        <div ref={pickWrapRef} className="relative max-w-md space-y-1">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Website account</label>
          <input
            className={inp}
            placeholder="Type to search…"
            value={selectedLookupUser ? selectedLookupUser.username : pickQuery}
            onChange={(e) => {
              if (selectedLookupUser) {
                setSelectedLookupUser(null)
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
          {pickOpen && !selectedLookupUser && pickQuery.trim().length > 0 ? (
            <ul className="absolute z-30 mt-1 w-full max-h-52 overflow-y-auto rounded-lg border border-white/15 bg-[#141218] shadow-xl text-sm">
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
                        setSelectedLookupUser(u)
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
          {selectedLookupUser ? (
            <p className="text-xs text-slate-500 m-0">
              Selected: <span className="text-slate-200 font-mono">{selectedLookupUser.username}</span>
              {' · '}
              <button
                type="button"
                className="text-amber-200/90 hover:underline"
                onClick={() => {
                  setSelectedLookupUser(null)
                  setPickQuery('')
                  setPickOpen(false)
                }}
              >
                Change
              </button>
            </p>
          ) : null}
        </div>

        <button
          type="button"
          className={btnOutline}
          disabled={grantsLoading || !selectedLookupUser}
          onClick={() => selectedLookupUser && void loadGrantsForUser(selectedLookupUser)}
        >
          {grantsLoading ? 'Loading…' : 'Refresh grants'}
        </button>

        {grantsErr ? <p className="text-xs text-rose-300 m-0">{grantsErr}</p> : null}
        {resolvedUserId != null ? (
          <p className="text-xs text-slate-500 m-0">
            User id: <span className="text-slate-200 font-mono tabular-nums">{resolvedUserId}</span>
          </p>
        ) : null}

        {resolvedUserId != null ? (
          <>
            <div className="flex flex-wrap gap-2 items-center pt-2">
              <select value={grantPickId} onChange={(e) => setGrantPickId(e.target.value)} className={`${inp} flex-1 min-w-[16rem]`}>
                <option value="">Choose badge to grant…</option>
                {sortedDefs
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

            <ul className="list-none m-0 p-0 space-y-3">
              {grants.map((g) => (
                <li
                  key={g.grant_id}
                  className="flex flex-wrap items-stretch justify-between gap-3 rounded-xl border border-white/10 px-3 py-3 bg-black/30"
                >
                  <div className="flex gap-3 min-w-0 flex-1">
                    <div className="shrink-0">
                      <BadgeMiniPreview title={g.title} tier={g.tier} />
                    </div>
                    <div className="min-w-0 flex flex-col justify-center">
                      {!g.definition_active ? <span className="text-amber-300/95 text-xs mb-1">Type hidden</span> : null}
                      <span className="text-xs text-slate-500 font-mono truncate">{g.slug}</span>
                    </div>
                  </div>
                  <button type="button" className={`${btnOutline} text-xs self-center shrink-0`} disabled={busy} onClick={() => revoke(g.grant_id)}>
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
            {grants.length === 0 ? <p className="text-xs text-muted m-0">No badges granted to this account yet.</p> : null}
          </>
        ) : null}
      </section>

      {editing ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-badge-title"
          onClick={() => {
            if (!busy) closeEdit()
          }}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#12101c] shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="edit-badge-title" className="text-lg font-semibold text-[#f5efe6] m-0">
              Edit badge type
            </h3>
            <p className="text-xs font-mono text-violet-300/90 m-0 truncate">{editing.slug}</p>
            <input className={inp} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Title" />
            <textarea className={`${inp} min-h-[5rem] resize-y`} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Description" />
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label htmlFor="ach-tier-edit" className="block text-xs text-slate-500 mb-1">
                  Tier
                </label>
                <select
                  id="ach-tier-edit"
                  value={editTier}
                  onChange={(e) => setEditTier(e.target.value as ProfileAchievementTier)}
                  className={`${inp} min-w-[10rem]`}
                >
                  {TIERS.map((t) => (
                    <option key={t} value={t}>
                      {TIER_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ach-sort-edit" className="block text-xs text-slate-500 mb-1">
                  Sort order (within same tier)
                </label>
                <input id="ach-sort-edit" type="number" className={`${inp} w-28`} value={editSort} onChange={(e) => setEditSort(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" className={btnOutline} onClick={closeEdit} disabled={busy}>
                Cancel
              </button>
              <button type="button" className={btnPrimary} disabled={busy || !editTitle.trim() || !editDesc.trim()} onClick={() => void saveEdit()}>
                Save changes
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
