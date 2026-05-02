import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  adminMinecraftRankedadminElo,
  fetchAdminCobbleRankedFeed,
  setAdminCobbleRankedReview,
  type CobbleRankedFeedEnvelope,
} from '../authApi'
import type { BattleReplayPayload, MatchResultPayload } from '../types'
import { AdminBattleReplayCard, AdminMatchResultCard, AdminSubTab } from './AdminRankedFeedCards.tsx'

type Tab = 'matches' | 'replays'

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
  const [eloIgn, setEloIgn] = useState('')
  const [eloFormat, setEloFormat] = useState<'singles' | 'doubles'>('singles')
  const [eloBusy, setEloBusy] = useState<'add' | 'remove' | null>(null)
  const [eloMessage, setEloMessage] = useState<string | null>(null)
  const [eloError, setEloError] = useState<string | null>(null)

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

  useEffect(() => {
    void load()
  }, [load])

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

  const runElo = async (action: 'add' | 'remove') => {
    setEloError(null)
    setEloMessage(null)
    const amount = Number.parseInt(eloAmount, 10)
    const user = eloIgn.trim()
    if (!user) {
      setEloError('Enter Minecraft username (IGN).')
      return
    }
    if (!Number.isFinite(amount) || amount < 1) {
      setEloError('Amount must be a positive whole number.')
      return
    }
    setEloBusy(action)
    try {
      const out = await adminMinecraftRankedadminElo({
        action,
        amount,
        minecraft_username: user,
        format: eloFormat,
      })
      if (out.ok) {
        setEloMessage(
          `${action === 'add' ? 'Add' : 'Remove'} ELO sent. Command: ${out.command ?? ''}\n${out.output ?? ''}`.trim()
        )
      } else {
        setEloError((out.error ?? 'RCON failed') + (out.command ? ` (${out.command})` : ''))
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
        <h1 className="text-xl font-semibold text-white m-0 mb-2">CobbleRanked · Admin</h1>
        <p className="text-sm text-slate-500 m-0 max-w-2xl">
          Full feed from the synced CobbleRanked mirror. Flag suspicious rows, mark when reviewed (stored in the
          database). ELO adjustments run via RCON using <code className="text-sky-300">rankedadmin</code> commands.
        </p>
      </div>

      <section className="rounded-2xl border border-white/10 bg-black/25 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white m-0">Rankedadmin ELO (RCON)</h2>
        <p className="text-xs text-slate-500 m-0">
          Sends <code className="text-sky-300/90">rankedadmin addelo …</code> or{' '}
          <code className="text-sky-300/90">removeelo …</code> without a leading slash. Format is sent as{' '}
          <code className="text-sky-300/90">SINGLES</code>/<code className="text-sky-300/90">DOUBLES</code> — set backend{' '}
          <code className="text-sky-300/90">MC_RANKEDADMIN_ELO_FORMAT_LOWERCASE=true</code> if your mod needs lowercase.
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
          <div className="min-w-[10rem] flex-1">
            <label className="block text-xs text-slate-500 mb-1" htmlFor="elo-ign">
              Minecraft username (IGN)
            </label>
            <input
              id="elo-ign"
              type="text"
              value={eloIgn}
              onChange={(e) => setEloIgn(e.target.value)}
              placeholder="Player name"
              className="w-full px-2 py-1.5 rounded-lg bg-black/40 border border-white/15 text-sm text-slate-100"
            />
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
          <button
            type="button"
            disabled={eloBusy !== null}
            onClick={() => void runElo('add')}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-emerald-600/25 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-600/35 disabled:opacity-50"
          >
            {eloBusy === 'add' ? 'Sending…' : 'Add ELO'}
          </button>
          <button
            type="button"
            disabled={eloBusy !== null}
            onClick={() => void runElo('remove')}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-rose-600/20 border border-rose-500/35 text-rose-200 hover:bg-rose-600/30 disabled:opacity-50"
          >
            {eloBusy === 'remove' ? 'Sending…' : 'Remove ELO'}
          </button>
        </div>
        {eloError ? <p className="text-sm text-rose-400 m-0">{eloError}</p> : null}
        {eloMessage ? (
          <pre className="text-xs text-slate-400 m-0 whitespace-pre-wrap rounded-lg bg-black/40 border border-white/10 p-3 overflow-x-auto">
            {eloMessage}
          </pre>
        ) : null}
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
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={attentionOnly}
                onChange={(e) => setAttentionOnly(e.target.checked)}
                className="rounded border-white/20"
              />
              Need attention only
            </label>
            <button
              type="button"
              onClick={() => void load()}
              className="py-2 px-4 rounded-xl text-sm font-medium border border-amber-400/35 text-amber-100 bg-amber-600/15"
            >
              Refresh feed
            </button>
          </div>
        </div>

        {loading ? (
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
                          onChange={(e) =>
                            void toggleReview(row.key, 'match_result', e.target.checked)
                          }
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
                        onChange={(e) =>
                          void toggleReview(row.key, 'battle_replay', e.target.checked)
                        }
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
