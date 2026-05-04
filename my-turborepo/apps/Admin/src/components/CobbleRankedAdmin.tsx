import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  adminMinecraftRankedadminElo,
  fetchAdminCobbleRankedFeed,
  fetchAdminUsers,
  fetchRankedBattleStaffHistory,
  setAdminCobbleRankedReview,
  type AdminUser,
  type CobbleRankedFeedEnvelope,
  type RankedBattleStaffEvent,
} from '../authApi'
import type { BattleReplayPayload, MatchResultPayload } from '../types'
import { AdminBattleReplayCard, AdminMatchResultCard, AdminSubTab } from './AdminRankedFeedCards.tsx'

type Tab = 'matches' | 'replays' | 'staff'

function formatTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function truncateKey(key: string, max = 48): string {
  if (key.length <= max) return key
  return `${key.slice(0, max)}…`
}

function staffEventSummary(ev: RankedBattleStaffEvent): { action: string; details: string } {
  if (ev.event_kind === 'feed_review') {
    const kindLabel =
      ev.review_feed_kind === 'battle_replay'
        ? 'Battle replay'
        : ev.review_feed_kind === 'match_result'
          ? 'Match result'
          : 'Feed item'
    const flag = ev.review_reviewed ? 'Marked reviewed' : 'Cleared reviewed'
    const key = ev.review_item_key ? truncateKey(ev.review_item_key) : '—'
    return { action: flag, details: `${kindLabel} · ${key}` }
  }
  const verb = ev.event_kind === 'elo_add' ? 'Added' : 'Removed'
  const player = ev.minecraft_username ?? '—'
  const amt = ev.elo_amount != null ? String(ev.elo_amount) : '—'
  const fmt = ev.elo_format ?? '—'
  const ok = ev.elo_ok === true ? 'Succeeded' : ev.elo_ok === false ? 'Failed' : ''
  const err = ev.elo_error ? ` · ${ev.elo_error}` : ''
  return {
    action: `${verb} ELO`,
    details: `${player} · ${amt} pts · ${fmt}${ok ? ` · ${ok}` : ''}${err}`,
  }
}

export function CobbleRankedAdmin() {
  const [tab, setTab] = useState<Tab>('matches')
  const [matches, setMatches] = useState<CobbleRankedFeedEnvelope<MatchResultPayload>[]>([])
  const [replays, setReplays] = useState<CobbleRankedFeedEnvelope<BattleReplayPayload>[]>([])
  const [reviewedKeys, setReviewedKeys] = useState<Set<string>>(new Set())
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reviewBusyKey, setReviewBusyKey] = useState<string | null>(null)

  const [eloAmount, setEloAmount] = useState('30')
  const [pickQuery, setPickQuery] = useState('')
  const [debouncedPick, setDebouncedPick] = useState('')
  const [pickOpen, setPickOpen] = useState(false)
  const [pickSuggestions, setPickSuggestions] = useState<AdminUser[]>([])
  const [pickLoading, setPickLoading] = useState(false)
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const pickWrapRef = useRef<HTMLDivElement>(null)

  const [eloFormat, setEloFormat] = useState<'singles' | 'doubles'>('singles')
  const [eloReason, setEloReason] = useState('')
  const [eloBusy, setEloBusy] = useState<'add' | 'remove' | null>(null)
  const [eloMessage, setEloMessage] = useState<string | null>(null)
  const [eloError, setEloError] = useState<string | null>(null)

  const [staffEvents, setStaffEvents] = useState<RankedBattleStaffEvent[]>([])
  const [staffLoading, setStaffLoading] = useState(false)
  const [staffError, setStaffError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    return fetchAdminCobbleRankedFeed({ limit: 120 })
      .then((d) => {
        setMatches(d.matches ?? [])
        setReplays(d.replays ?? [])
        setReviewedKeys(new Set(d.reviewedKeys ?? []))
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  const loadStaff = useCallback(() => {
    setStaffLoading(true)
    setStaffError(null)
    return fetchRankedBattleStaffHistory({ limit: 120 })
      .then((d) => setStaffEvents(d.events ?? []))
      .catch((e) => setStaffError(e instanceof Error ? e.message : 'Failed to load staff history'))
      .finally(() => setStaffLoading(false))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (tab === 'staff') void loadStaff()
  }, [tab, loadStaff])

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

  const isReviewed = useCallback((k: string) => reviewedKeys.has(k), [reviewedKeys])

  const toggleReview = async (itemKey: string, feed_kind: 'match_result' | 'battle_replay', next: boolean) => {
    setReviewBusyKey(itemKey)
    try {
      await setAdminCobbleRankedReview({ item_key: itemKey, feed_kind, reviewed: next })
      setReviewedKeys((prev) => {
        const n = new Set(prev)
        if (next) n.add(itemKey)
        else n.delete(itemKey)
        return n
      })
      if (tab === 'staff') void loadStaff()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review save failed')
    } finally {
      setReviewBusyKey(null)
    }
  }

  const visibleMatches = useMemo(() => {
    if (!attentionOnly) return matches
    return matches.filter((m) => m.needsAttention)
  }, [matches, attentionOnly])

  const visibleReplays = useMemo(() => {
    if (!attentionOnly) return replays
    return replays.filter((r) => r.needsAttention)
  }, [replays, attentionOnly])

  const ign = selectedUser?.username.trim() ?? ''
  const userId = selectedUser?.id

  const runElo = async (action: 'add' | 'remove') => {
    setEloError(null)
    setEloMessage(null)
    const amount = Number.parseInt(eloAmount, 10)
    if (!ign || userId == null) {
      setEloError('Search and pick a website account (username = in-game name).')
      return
    }
    if (!Number.isFinite(amount) || amount < 1) {
      setEloError('Amount must be a positive whole number.')
      return
    }
    const reason = eloReason.trim()
    if (!reason) {
      setEloError('Enter a reason (saved to staff history and sent to Discord on success).')
      return
    }
    setEloBusy(action)
    try {
      const out = await adminMinecraftRankedadminElo({
        action,
        amount,
        minecraft_username: ign,
        format: eloFormat,
        reason,
        user_id: userId,
      })
      if (out.ok) {
        setEloMessage(
          action === 'add'
            ? `Added ${amount} ELO (${eloFormat}) for ${ign}.`
            : `Removed ${amount} ELO (${eloFormat}) for ${ign}.`
        )
        if (tab === 'staff') void loadStaff()
      } else {
        setEloError(out.error ?? 'Could not update the server.')
      }
    } catch (e) {
      setEloError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setEloBusy(null)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-white m-0 mb-2">Ranked Battle</h1>
        <p className="text-sm text-slate-500 m-0 max-w-2xl">
          Synced match feed from the game mirror. Flag suspicious rows and mark them reviewed. ELO changes apply on the
          Minecraft server; staff actions are listed under Staff history (after the database migration is applied).
        </p>
      </div>

      <section className="rounded-2xl border border-white/10 bg-black/25 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white m-0">ELO adjustment</h2>
        <p className="text-xs text-slate-500 m-0 max-w-2xl">
          Pick the player’s website account, choose singles or doubles, enter why you’re changing ELO (audit + Discord),
          then add or remove.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1" htmlFor="elo-amount">
              Amount
            </label>
            <input
              id="elo-amount"
              type="number"
              min={1}
              value={eloAmount}
              onChange={(e) => setEloAmount(e.target.value)}
              className="w-28 px-2 py-1.5 rounded-lg bg-black/40 border border-white/15 text-sm text-slate-100"
            />
          </div>
          <div ref={pickWrapRef} className="min-w-[12rem] flex-1 max-w-md relative space-y-1">
            <label className="block text-xs text-slate-500 mb-1" htmlFor="elo-user-search">
              Website account
            </label>
            <input
              id="elo-user-search"
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
              placeholder="Type to search…"
              autoComplete="off"
              spellCheck={false}
              className="w-full px-2 py-1.5 rounded-lg bg-black/40 border border-white/15 text-sm text-slate-100"
            />
            {pickOpen && !selectedUser && pickQuery.trim().length > 0 ? (
              <ul className="absolute z-20 mt-1 w-full max-h-52 overflow-y-auto rounded-lg border border-white/15 bg-[#141218] shadow-xl text-sm">
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
                        <span className="font-medium text-white">{u.username}</span>
                        <span className="text-slate-500 text-xs block truncate">{u.email}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            ) : null}
            {selectedUser ? (
              <p className="text-xs text-slate-500 m-0">
                In-game name: <span className="font-mono text-slate-300">{selectedUser.username}</span>
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
            ) : null}
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1" htmlFor="elo-format">
              Format
            </label>
            <select
              id="elo-format"
              value={eloFormat}
              onChange={(e) => setEloFormat(e.target.value as 'singles' | 'doubles')}
              className="px-2 py-1.5 rounded-lg bg-black/40 border border-white/15 text-sm text-slate-100 min-w-[7rem]"
            >
              <option value="singles">Singles</option>
              <option value="doubles">Doubles</option>
            </select>
          </div>
        </div>
        <div className="max-w-3xl">
          <label className="block text-xs text-slate-500 mb-1" htmlFor="elo-reason">
            Reason
          </label>
          <textarea
            id="elo-reason"
            rows={3}
            value={eloReason}
            onChange={(e) => setEloReason(e.target.value)}
            placeholder="e.g. Manual correction after confirmed win trading / bugged match"
            className="w-full px-2 py-1.5 rounded-lg bg-black/40 border border-white/15 text-sm text-slate-100 placeholder:text-slate-600 resize-y min-h-[4.5rem]"
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <button
            type="button"
            disabled={eloBusy !== null}
            onClick={() => void runElo('add')}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-emerald-600/25 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-600/35 disabled:opacity-50"
          >
            {eloBusy === 'add' ? 'Applying…' : 'Add ELO'}
          </button>
          <button
            type="button"
            disabled={eloBusy !== null}
            onClick={() => void runElo('remove')}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-rose-600/20 border border-rose-500/35 text-rose-200 hover:bg-rose-600/30 disabled:opacity-50"
          >
            {eloBusy === 'remove' ? 'Applying…' : 'Remove ELO'}
          </button>
        </div>
        {eloError ? <p className="text-sm text-rose-400 m-0">{eloError}</p> : null}
        {eloMessage ? <p className="text-sm text-emerald-300/95 m-0">{eloMessage}</p> : null}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex flex-wrap gap-2">
            <AdminSubTab active={tab === 'matches'} onClick={() => setTab('matches')}>
              Match results ({matches.length})
            </AdminSubTab>
            <AdminSubTab active={tab === 'replays'} onClick={() => setTab('replays')}>
              Battle replays ({replays.length})
            </AdminSubTab>
            <AdminSubTab active={tab === 'staff'} onClick={() => setTab('staff')}>
              Staff history
            </AdminSubTab>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {tab !== 'staff' ? (
              <label className="inline-flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={attentionOnly}
                  onChange={(e) => setAttentionOnly(e.target.checked)}
                  className="rounded border-white/20"
                />
                Need attention only
              </label>
            ) : null}
            <button
              type="button"
              onClick={() => {
                if (tab === 'staff') void loadStaff()
                else void load()
              }}
              className="py-2 px-4 rounded-xl text-sm font-medium border border-amber-400/35 text-amber-100 bg-amber-600/15"
            >
              {tab === 'staff' ? 'Refresh history' : 'Refresh feed'}
            </button>
          </div>
        </div>

        {tab === 'staff' ? (
          staffLoading ? (
            <p className="text-slate-500 text-center py-12">Loading…</p>
          ) : staffError ? (
            <p className="text-rose-400 text-center py-8">{staffError}</p>
          ) : staffEvents.length === 0 ? (
            <p className="text-slate-500 text-center py-8">No staff actions recorded yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-sm text-left">
                <thead className="bg-black/40 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">When</th>
                    <th className="px-3 py-2 font-semibold">Staff</th>
                    <th className="px-3 py-2 font-semibold">Action</th>
                    <th className="px-3 py-2 font-semibold">Details</th>
                    <th className="px-3 py-2 font-semibold">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {staffEvents.map((ev) => {
                    const { action, details } = staffEventSummary(ev)
                    const reasonCell =
                      ev.event_kind === 'feed_review'
                        ? '—'
                        : ev.staff_reason?.trim()
                          ? ev.staff_reason
                          : '—'
                    return (
                      <tr key={ev.id} className="border-t border-white/10 hover:bg-white/[0.03]">
                        <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{formatTs(ev.created_at)}</td>
                        <td className="px-3 py-2 text-slate-200">{ev.staff_username ?? `#${ev.staff_user_id}`}</td>
                        <td className="px-3 py-2 text-slate-200">{action}</td>
                        <td className="px-3 py-2 text-slate-400 max-w-xl">{details}</td>
                        <td className="px-3 py-2 text-slate-400 max-w-md whitespace-pre-wrap break-words align-top">
                          {reasonCell}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : loading ? (
          <p className="text-slate-500 text-center py-12">Loading…</p>
        ) : error ? (
          <p className="text-rose-400 text-center py-8">{error}</p>
        ) : tab === 'matches' ? (
          visibleMatches.length === 0 ? (
            <p className="text-slate-500 text-center py-8">No match results.</p>
          ) : (
            <ul className="space-y-4 list-none m-0 p-0">
              {visibleMatches.map((row) => {
                const reviewed = isReviewed(row.key)
                return (
                  <li
                    key={row.key}
                    className={`rounded-2xl border p-4 space-y-3 ${
                      row.needsAttention
                        ? reviewed
                          ? 'border-amber-500/25 bg-amber-950/10'
                          : 'border-amber-400/55 bg-amber-950/20 ring-1 ring-amber-400/25'
                        : 'border-white/10 bg-black/15'
                    }`}
                  >
                    <div className="flex flex-wrap items-start gap-3 justify-between">
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        {row.needsAttention ? (
                          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-amber-500/25 text-amber-200 border border-amber-400/40">
                            Need attention
                          </span>
                        ) : null}
                        {row.attentionReasons.length > 0 ? (
                          <span className="text-xs text-amber-200/90">{row.attentionReasons.join(' · ')}</span>
                        ) : null}
                      </div>
                      <label className="flex items-center gap-2 shrink-0 text-xs text-slate-400 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={reviewed}
                          disabled={reviewBusyKey === row.key}
                          onChange={(e) => void toggleReview(row.key, 'match_result', e.target.checked)}
                          className="rounded border-white/20"
                        />
                        Reviewed
                      </label>
                    </div>
                    <AdminMatchResultCard m={row.item} />
                  </li>
                )
              })}
            </ul>
          )
        ) : visibleReplays.length === 0 ? (
          <p className="text-slate-500 text-center py-8">No battle replays.</p>
        ) : (
          <ul className="space-y-4 list-none m-0 p-0">
            {visibleReplays.map((row) => {
              const reviewed = isReviewed(row.key)
              return (
                <li
                  key={row.key}
                  className={`rounded-2xl border p-4 space-y-3 ${
                    row.needsAttention
                      ? reviewed
                        ? 'border-amber-500/25 bg-amber-950/10'
                        : 'border-amber-400/55 bg-amber-950/20 ring-1 ring-amber-400/25'
                      : 'border-white/10 bg-black/15'
                  }`}
                >
                  <div className="flex flex-wrap items-start gap-3 justify-between">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      {row.needsAttention ? (
                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-amber-500/25 text-amber-200 border border-amber-400/40">
                          Need attention
                        </span>
                      ) : null}
                      {row.attentionReasons.length > 0 ? (
                        <span className="text-xs text-amber-200/90">{row.attentionReasons.join(' · ')}</span>
                      ) : null}
                    </div>
                    <label className="flex items-center gap-2 shrink-0 text-xs text-slate-400 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={reviewed}
                        disabled={reviewBusyKey === row.key}
                        onChange={(e) => void toggleReview(row.key, 'battle_replay', e.target.checked)}
                        className="rounded border-white/20"
                      />
                      Reviewed
                    </label>
                  </div>
                  <AdminBattleReplayCard r={row.item} />
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
