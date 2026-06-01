import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  adminMinecraftRankedadminElo,
  deleteAllAdminCobbleRankedFeed,
  fetchAdminCobbleRankedFeed,
  fetchAdminUsers,
  fetchRankedBattleStaffHistory,
  setAdminCobbleRankedReview,
  setAdminCobbleRankedReviewBundle,
  type AdminUser,
  type CobbleRankedFeedEnvelope,
  type RankedBattleStaffEvent,
} from '../authApi'
import type { BattleReplayPayload, MatchResultPayload } from '../types'
import { AdminBattleReplayCard, AdminMatchResultCard, AdminSubTab } from './AdminRankedFeedCards.tsx'

type Tab = 'feed' | 'staff'

function extractMatchIdFromPayload(body: unknown): string {
  if (!body || typeof body !== 'object') return ''
  const mid = (body as { matchId?: unknown }).matchId
  return typeof mid === 'string' ? mid.trim() : ''
}

function normalizeMatchRankedFormat(m: MatchResultPayload): 'singles' | 'doubles' {
  const f = (m.format ?? '').trim().toLowerCase()
  if (f.includes('double')) return 'doubles'
  return 'singles'
}

type MatchEloRefundStep = {
  minecraft_username: string
  action: 'add' | 'remove'
  amount: number
  originalDelta: number
}

/** Build server commands that undo each player's recorded `eloChange` for this match. */
function buildMatchEloRefundPlan(m: MatchResultPayload): {
  format: 'singles' | 'doubles'
  steps: MatchEloRefundStep[]
  summaryLines: string[]
} | null {
  const steps: MatchEloRefundStep[] = []
  const summaryLines: string[] = []
  for (const p of m.players ?? []) {
    const ign = (p.playerName ?? '').trim()
    const raw = p.eloChange
    if (!ign || raw == null || !Number.isFinite(raw)) continue
    const delta = Math.trunc(raw)
    if (delta === 0) continue
    const amount = Math.abs(delta)
    if (amount < 1) continue
    if (delta > 0) {
      steps.push({ minecraft_username: ign, action: 'remove', amount, originalDelta: delta })
      summaryLines.push(`${ign}: remove ${amount} (recorded +${delta})`)
    } else {
      steps.push({ minecraft_username: ign, action: 'add', amount, originalDelta: delta })
      summaryLines.push(`${ign}: add ${amount} (recorded ${delta})`)
    }
  }
  if (steps.length === 0) return null
  return { format: normalizeMatchRankedFormat(m), steps, summaryLines }
}

type RefundConfirmState = {
  rowKey: string
  match: MatchResultPayload
  plan: NonNullable<ReturnType<typeof buildMatchEloRefundPlan>>
}

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
  if (ev.event_kind === 'feed_clear') {
    return {
      action: 'Cleared match feed',
      details: ev.staff_reason?.trim() || 'Removed all match results and battle replays.',
    }
  }
  if (ev.event_kind === 'feed_review') {
    const kindLabel =
      ev.review_feed_kind === 'battle_replay'
        ? 'Battle replay'
        : ev.review_feed_kind === 'match_result'
          ? 'Match result'
          : typeof ev.review_feed_kind === 'string' &&
              ev.review_feed_kind.includes('match_result') &&
              ev.review_feed_kind.includes('battle_replay')
            ? 'Match result + replay'
            : ev.review_feed_kind
              ? `Feed (${ev.review_feed_kind})`
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
  const [tab, setTab] = useState<Tab>('feed')
  const [matches, setMatches] = useState<CobbleRankedFeedEnvelope<MatchResultPayload>[]>([])
  const [replays, setReplays] = useState<CobbleRankedFeedEnvelope<BattleReplayPayload>[]>([])
  const [reviewedKeys, setReviewedKeys] = useState<Set<string>>(new Set())
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [expandedReplayKey, setExpandedReplayKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reviewBusyKey, setReviewBusyKey] = useState<string | null>(null)
  const [refundBusyKey, setRefundBusyKey] = useState<string | null>(null)
  const [refundFlash, setRefundFlash] = useState<{ rowKey: string; ok: boolean; text: string } | null>(null)
  const [refundConfirm, setRefundConfirm] = useState<RefundConfirmState | null>(null)
  const [deleteFeedOpen, setDeleteFeedOpen] = useState(false)
  const [deleteFeedBusy, setDeleteFeedBusy] = useState(false)

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
        setExpandedReplayKey(null)
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

  type FeedMergedPair = {
    kind: 'pair'
    matchRow: CobbleRankedFeedEnvelope<MatchResultPayload>
    replayRow: CobbleRankedFeedEnvelope<BattleReplayPayload> | null
  }
  type FeedMergedReplayOnly = { kind: 'replay_only'; replayRow: CobbleRankedFeedEnvelope<BattleReplayPayload> }
  type FeedMergedRow = FeedMergedPair | FeedMergedReplayOnly

  const feedRows = useMemo((): FeedMergedRow[] => {
    const replayByMatchId = new Map<string, CobbleRankedFeedEnvelope<BattleReplayPayload>>()
    for (const r of replays) {
      const mid = extractMatchIdFromPayload(r.item)
      if (mid) replayByMatchId.set(mid, r)
    }
    const usedReplayKeys = new Set<string>()
    const out: FeedMergedRow[] = []
    for (const mRow of matches) {
      const mid = extractMatchIdFromPayload(mRow.item)
      const replay = mid ? replayByMatchId.get(mid) : undefined
      if (replay) usedReplayKeys.add(replay.key)
      out.push({ kind: 'pair', matchRow: mRow, replayRow: replay ?? null })
    }
    for (const r of replays) {
      if (!usedReplayKeys.has(r.key)) out.push({ kind: 'replay_only', replayRow: r })
    }
    return out
  }, [matches, replays])

  const visibleFeedRows = useMemo(() => {
    if (!attentionOnly) return feedRows
    return feedRows.filter((row) => {
      if (row.kind === 'pair') {
        const rep = row.replayRow
        return row.matchRow.needsAttention || (rep?.needsAttention ?? false)
      }
      return row.replayRow.needsAttention
    })
  }, [feedRows, attentionOnly])

  const toggleMergedReview = async (
    entries: { item_key: string; feed_kind: 'match_result' | 'battle_replay' }[],
    next: boolean
  ) => {
    if (entries.length === 0) return
    const busy = [...entries.map((e) => e.item_key)].sort().join('|')
    setReviewBusyKey(busy)
    try {
      if (entries.length === 1) {
        await setAdminCobbleRankedReview({ ...entries[0]!, reviewed: next })
      } else {
        await setAdminCobbleRankedReviewBundle({ reviewed: next, entries })
      }
      setReviewedKeys((prev) => {
        const n = new Set(prev)
        for (const e of entries) {
          if (next) n.add(e.item_key)
          else n.delete(e.item_key)
        }
        return n
      })
      if (tab === 'staff') void loadStaff()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review save failed')
    } finally {
      setReviewBusyKey(null)
    }
  }

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

  const openRefundConfirm = (rowKey: string, m: MatchResultPayload) => {
    setRefundFlash(null)
    const plan = buildMatchEloRefundPlan(m)
    if (!plan) {
      setRefundFlash({
        rowKey,
        ok: false,
        text: 'No recorded ELO changes to refund (no non-zero eloChange on any player in this row).',
      })
      return
    }
    setRefundConfirm({ rowKey, match: m, plan })
  }

  const executeMatchEloRefund = async (ctx: RefundConfirmState) => {
    const { rowKey, match, plan } = ctx
    setRefundFlash(null)
    const matchId = (match.matchId ?? '').trim() || 'unknown'
    const fmtLabel = plan.format
    const reason = `Ranked ELO refund (match ${matchId}, ${fmtLabel}): ${plan.summaryLines.join('; ')}.`
    setRefundBusyKey(rowKey)
    const doneNames: string[] = []
    try {
      for (const step of plan.steps) {
        try {
          const out = await adminMinecraftRankedadminElo({
            action: step.action,
            amount: step.amount,
            minecraft_username: step.minecraft_username,
            format: plan.format,
            reason,
          })
          if (!out.ok) {
            const partial = doneNames.length ? ` Applied for ${doneNames.join(', ')}; then failed.` : ''
            setRefundFlash({
              rowKey,
              ok: false,
              text: `${partial} ${step.minecraft_username}: ${out.error ?? 'Server rejected the change.'}`.trim(),
            })
            if (tab === 'staff') void loadStaff()
            return
          }
          doneNames.push(step.minecraft_username)
        } catch (e) {
          const partial = doneNames.length ? `Applied for ${doneNames.join(', ')}; then failed.` : 'Failed immediately.'
          setRefundFlash({
            rowKey,
            ok: false,
            text: `${partial} ${step.minecraft_username}: ${e instanceof Error ? e.message : String(e)}`,
          })
          if (tab === 'staff') void loadStaff()
          return
        }
      }
      setRefundFlash({
        rowKey,
        ok: true,
        text: `Refund completed for ${doneNames.join(', ')}.`,
      })
      if (tab === 'staff') void loadStaff()
    } finally {
      setRefundBusyKey(null)
      setRefundConfirm(null)
    }
  }

  const refundModalWorking = refundConfirm != null && refundBusyKey === refundConfirm.rowKey

  const confirmDeleteAllFeed = async () => {
    setDeleteFeedBusy(true)
    setError(null)
    try {
      await deleteAllAdminCobbleRankedFeed()
      setMatches([])
      setReplays([])
      setReviewedKeys(new Set())
      setExpandedReplayKey(null)
      setDeleteFeedOpen(false)
      if (tab === 'staff') void loadStaff()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete match feed')
    } finally {
      setDeleteFeedBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-white m-0 mb-2">Ranked Battle</h1>
        <p className="text-sm text-slate-500 m-0 max-w-2xl">
          Synced match feed from the game mirror. Rows that share the same{' '}
          <span className="font-mono text-slate-400">matchId</span> are merged: one Reviewed checkbox marks the match
          result and its replay together. When a replay exists, use View replay to expand it. Refund ELO on a match card
          reverses each player’s recorded delta in one confirmation. Staff history lists audit actions. ELO changes
          apply on the Minecraft server.
        </p>
      </div>

      <section className="rounded-2xl border border-white/10 bg-black/25 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white m-0">ELO adjustment</h2>
        <p className="text-xs text-slate-500 m-0 max-w-2xl">
          Pick the player’s website account, choose singles or doubles, enter why you’re changing ELO (audit + Discord),
          then add or remove. To undo a whole battle’s logged ELO at once, use Refund ELO on that match in the feed below.
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
            <AdminSubTab active={tab === 'feed'} onClick={() => setTab('feed')}>
              Match feed ({feedRows.length})
            </AdminSubTab>
            <AdminSubTab active={tab === 'staff'} onClick={() => setTab('staff')}>
              Staff history
            </AdminSubTab>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {tab === 'feed' ? (
              <>
                <label className="inline-flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={attentionOnly}
                    onChange={(e) => setAttentionOnly(e.target.checked)}
                    className="rounded border-white/20"
                  />
                  Need attention only
                </label>
                {feedRows.length > 0 ? (
                  <button
                    type="button"
                    disabled={loading || deleteFeedBusy}
                    onClick={() => setDeleteFeedOpen(true)}
                    className="py-2 px-4 rounded-xl text-sm font-medium border border-rose-500/40 text-rose-200 bg-rose-600/15 hover:bg-rose-600/25 disabled:opacity-50"
                  >
                    Delete all match feed
                  </button>
                ) : null}
              </>
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
                    const reasonCell = ev.staff_reason?.trim() ? ev.staff_reason : '—'
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
        ) : visibleFeedRows.length === 0 ? (
          <p className="text-slate-500 text-center py-8">No feed items in this view.</p>
        ) : (
          <ul className="space-y-4 list-none m-0 p-0">
            {visibleFeedRows.map((row) => {
              if (row.kind === 'replay_only') {
                const r = row.replayRow
                const reviewKeys = [r.key]
                const reviewed = reviewKeys.every((k) => isReviewed(k))
                const needsAttention = r.needsAttention
                return (
                  <li
                    key={r.key}
                    className={`rounded-2xl border p-4 space-y-3 ${
                      needsAttention
                        ? reviewed
                          ? 'border-amber-500/25 bg-amber-950/10'
                          : 'border-amber-400/55 bg-amber-950/20 ring-1 ring-amber-400/25'
                        : 'border-white/10 bg-black/15'
                    }`}
                  >
                    <div className="flex flex-wrap items-start gap-3 justify-between">
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-200 border border-cyan-400/35">
                          Replay only
                        </span>
                        {needsAttention ? (
                          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-amber-500/25 text-amber-200 border border-amber-400/40">
                            Need attention
                          </span>
                        ) : null}
                        {r.attentionReasons.length > 0 ? (
                          <span className="text-xs text-amber-200/90">{r.attentionReasons.join(' · ')}</span>
                        ) : null}
                      </div>
                      <label className="flex items-center gap-2 shrink-0 text-xs text-slate-400 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={reviewed}
                          disabled={reviewBusyKey === r.key}
                          onChange={(e) =>
                            void toggleMergedReview([{ item_key: r.key, feed_kind: 'battle_replay' }], e.target.checked)
                          }
                          className="rounded border-white/20"
                        />
                        Reviewed
                      </label>
                    </div>
                    <AdminBattleReplayCard r={r.item} />
                  </li>
                )
              }

              const mRow = row.matchRow
              const rep = row.replayRow
              const entries: { item_key: string; feed_kind: 'match_result' | 'battle_replay' }[] = [
                { item_key: mRow.key, feed_kind: 'match_result' },
              ]
              if (rep) entries.push({ item_key: rep.key, feed_kind: 'battle_replay' })
              const reviewBusy = entries.map((e) => e.item_key).sort().join('|') === reviewBusyKey
              const reviewed = entries.every((e) => isReviewed(e.item_key))
              const needsAttention = mRow.needsAttention || (rep?.needsAttention ?? false)
              const attentionMsgs = [...mRow.attentionReasons, ...(rep?.attentionReasons ?? [])]
              const rowUiKey = mRow.key
              const refundPlan = buildMatchEloRefundPlan(mRow.item)

              return (
                <li
                  key={rowUiKey}
                  className={`rounded-2xl border p-4 space-y-3 ${
                    needsAttention
                      ? reviewed
                        ? 'border-amber-500/25 bg-amber-950/10'
                        : 'border-amber-400/55 bg-amber-950/20 ring-1 ring-amber-400/25'
                      : 'border-white/10 bg-black/15'
                  }`}
                >
                  <div className="flex flex-wrap items-start gap-3 justify-between">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      {rep ? (
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-200 border border-emerald-400/30">
                          Match + replay
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-slate-500/20 text-slate-300 border border-slate-400/25">
                          Match only
                        </span>
                      )}
                      {needsAttention ? (
                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-amber-500/25 text-amber-200 border border-amber-400/40">
                          Need attention
                        </span>
                      ) : null}
                      {attentionMsgs.length > 0 ? (
                        <span className="text-xs text-amber-200/90">{[...new Set(attentionMsgs)].join(' · ')}</span>
                      ) : null}
                    </div>
                    <label className="flex items-center gap-2 shrink-0 text-xs text-slate-400 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={reviewed}
                        disabled={reviewBusy}
                        onChange={(e) => void toggleMergedReview(entries, e.target.checked)}
                        className="rounded border-white/20"
                      />
                      Reviewed
                      {rep ? <span className="text-slate-600">(match + replay)</span> : null}
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={
                        reviewBusy ||
                        refundBusyKey === rowUiKey ||
                        refundPlan == null ||
                        eloBusy !== null ||
                        refundConfirm != null
                      }
                      onClick={() => openRefundConfirm(rowUiKey, mRow.item)}
                      className="text-sm font-medium px-3 py-1.5 rounded-lg bg-violet-500/15 text-violet-200 border border-violet-400/35 hover:bg-violet-500/25 disabled:opacity-45 disabled:pointer-events-none"
                    >
                      {refundBusyKey === rowUiKey ? 'Refunding…' : 'Refund ELO'}
                    </button>
                    {refundPlan == null ? (
                      <span className="text-xs text-slate-600">No non-zero eloChange on this row — manual adjust only.</span>
                    ) : null}
                    {refundFlash?.rowKey === rowUiKey ? (
                      <p className={`text-xs m-0 max-w-xl ${refundFlash.ok ? 'text-emerald-300/95' : 'text-rose-400'}`}>
                        {refundFlash.text}
                      </p>
                    ) : null}
                  </div>
                  <AdminMatchResultCard m={mRow.item} />
                  {rep ? (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedReplayKey((k) => (k === rowUiKey ? null : rowUiKey))
                        }
                        className="text-sm font-medium px-3 py-1.5 rounded-lg bg-cyan-500/15 text-cyan-200 border border-cyan-400/35 hover:bg-cyan-500/25"
                      >
                        {expandedReplayKey === rowUiKey ? 'Hide replay' : 'View replay'}
                      </button>
                      {expandedReplayKey === rowUiKey ? <AdminBattleReplayCard r={rep.item} /> : null}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {refundConfirm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="refund-elo-title"
          onClick={() => {
            if (!refundModalWorking) setRefundConfirm(null)
          }}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#12131a] shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="refund-elo-title" className="text-lg font-semibold text-white m-0">
              Reverse this match’s ELO?
            </h3>
            <p className="text-sm text-slate-400 m-0 leading-relaxed">
              This runs {refundConfirm.plan.steps.length} Minecraft server command{refundConfirm.plan.steps.length === 1 ? '' : 's'}.
              Each successful step is logged to staff history and sent to the ranked ELO Discord webhook.
            </p>
            <ul className="list-none m-0 p-0 space-y-2">
              {refundConfirm.plan.summaryLines.map((line, i) => (
                <li
                  key={i}
                  className="font-mono text-xs text-slate-200 bg-black/35 border border-white/10 rounded-lg px-3 py-2.5"
                >
                  {line}
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500 m-0">
              Format{' '}
              <span className="text-slate-300">{refundConfirm.plan.format}</span>
              {' · '}
              Match id{' '}
              <span className="font-mono text-slate-400">
                {(refundConfirm.match.matchId ?? '').trim() || 'unknown'}
              </span>
            </p>
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={refundModalWorking}
                onClick={() => setRefundConfirm(null)}
                className="px-4 py-2 rounded-xl text-sm border border-white/15 text-slate-300 hover:bg-white/10 disabled:opacity-45 disabled:pointer-events-none"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={refundModalWorking}
                onClick={() => void executeMatchEloRefund(refundConfirm)}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-violet-600/35 border border-violet-400/45 text-violet-100 hover:bg-violet-600/50 disabled:opacity-45 disabled:pointer-events-none"
              >
                {refundModalWorking ? 'Applying…' : 'Confirm refund'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteFeedOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-feed-title"
          onClick={() => {
            if (!deleteFeedBusy) setDeleteFeedOpen(false)
          }}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#12131a] shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="delete-feed-title" className="text-lg font-semibold text-white m-0">
              Delete all match feed?
            </h3>
            <p className="text-sm text-slate-400 m-0 leading-relaxed">
              This permanently removes all {feedRows.length} feed row{feedRows.length === 1 ? '' : 's'} ({matches.length}{' '}
              match result{matches.length === 1 ? '' : 's'}, {replays.length} replay{replays.length === 1 ? '' : 's'}) from
              the admin feed and database. Review flags are cleared too. This does not change player ELO on the server.
              New matches will still sync in from the game.
            </p>
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={deleteFeedBusy}
                onClick={() => setDeleteFeedOpen(false)}
                className="px-4 py-2 rounded-xl text-sm border border-white/15 text-slate-300 hover:bg-white/10 disabled:opacity-45 disabled:pointer-events-none"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteFeedBusy}
                onClick={() => void confirmDeleteAllFeed()}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-rose-600/35 border border-rose-400/45 text-rose-100 hover:bg-rose-600/50 disabled:opacity-45 disabled:pointer-events-none"
              >
                {deleteFeedBusy ? 'Deleting…' : 'Delete all'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
