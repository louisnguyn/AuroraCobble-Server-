import { useCallback, useEffect, useState } from 'react'
import { CustomSelect } from './CustomSelect.tsx'
import {
  fetchTournamentPrediction,
  fetchTournamentPredictionLedger,
  submitTournamentPrediction,
  type TournamentPredictionBetEntry,
  type TournamentPredictionBetsSummary,
  type TournamentPredictionStatus,
} from '../authApi'
import { TournamentPredictionBetLedger } from './TournamentPredictionBetLedger.tsx'

function participantLabel(id: number, participants: { id: number; displayName: string; seedRank: number }[]) {
  const p = participants.find((x) => x.id === id)
  return p ? `#${p.seedRank} ${p.displayName}` : `#${id}`
}

function PredictionEventBanner({
  title,
  subtitle,
}: {
  title: string
  subtitle?: string | null
}) {
  return (
    <div
      className="rounded-xl border-2 border-violet-500/55 bg-gradient-to-br from-violet-950/70 via-[#120a22]/90 to-[#0f0a1a]/90 px-4 py-3 shadow-[0_0_28px_rgba(139,92,246,0.15)]"
      role="status"
      aria-label={`Prediction event: ${title}`}
    >
      <p className="text-[10px] uppercase tracking-widest text-violet-300 font-semibold m-0 mb-1.5">
        Placing predictions for
      </p>
      <p className="text-lg sm:text-xl font-semibold text-[#f5efe6] m-0 leading-snug">{title}</p>
      {subtitle ? <p className="text-xs text-violet-200/70 mt-1.5 m-0">{subtitle}</p> : null}
    </div>
  )
}

function parseStakeInput(raw: string): number | null {
  const n = parseInt(raw.replace(/,/g, ''), 10)
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null
}

function PredictionRulesOverview({
  champMult,
  ruMult,
  minStake,
  maxStake,
  lockedAt,
}: {
  champMult: number
  ruMult: number
  minStake: number
  maxStake: number
  lockedAt: string | null
}) {
  const fmt = (n: number) => n.toLocaleString()
  return (
    <div className="rounded-xl border border-violet-500/35 bg-gradient-to-br from-violet-950/45 via-[#120a22]/85 to-[#0f0a1a]/90 p-4 sm:p-5 space-y-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-violet-300/90 font-semibold m-0 mb-1">
            How it works
          </p>
          <p className="text-sm text-[#e2e8f0] m-0 leading-snug">
            Pick champion and runner-up separately — stake each line on its own.
          </p>
        </div>
        {lockedAt ? (
          <p className="text-xs text-amber-200/95 m-0 rounded-lg border border-amber-500/35 bg-amber-950/30 px-2.5 py-1.5 shrink-0">
            Locks {lockedAt}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-amber-500/45 bg-gradient-to-b from-amber-950/50 to-[#0f0a1a]/60 px-3 py-4 text-center">
          <p className="text-[10px] uppercase tracking-wider text-amber-300/85 font-semibold m-0 mb-2">
            Champion
          </p>
          <p className="text-3xl sm:text-4xl font-bold tabular-nums text-amber-200 m-0 leading-none">
            ×{champMult}
          </p>
          <p className="text-[11px] text-muted mt-2 m-0">Win payout on stake</p>
        </div>

        <div className="rounded-xl border border-sky-500/40 bg-gradient-to-b from-sky-950/45 to-[#0f0a1a]/60 px-3 py-4 text-center">
          <p className="text-[10px] uppercase tracking-wider text-sky-300/85 font-semibold m-0 mb-2">
            Runner-up
          </p>
          <p className="text-3xl sm:text-4xl font-bold tabular-nums text-sky-200 m-0 leading-none">
            ×{ruMult}
          </p>
          <p className="text-[11px] text-muted mt-2 m-0">Win payout on stake</p>
        </div>

        <div className="rounded-xl border border-emerald-500/35 bg-gradient-to-b from-emerald-950/35 to-[#0f0a1a]/60 px-3 py-4 text-center">
          <p className="text-[10px] uppercase tracking-wider text-emerald-300/85 font-semibold m-0 mb-2">
            Min stake
          </p>
          <p className="text-lg sm:text-xl font-bold tabular-nums text-[#fbbf24] m-0 leading-tight">
            {fmt(minStake)}
          </p>
          <p className="text-[11px] text-muted mt-2 m-0">Asteryn Point per line</p>
        </div>

        <div className="rounded-xl border border-rose-500/30 bg-gradient-to-b from-rose-950/30 to-[#0f0a1a]/60 px-3 py-4 text-center">
          <p className="text-[10px] uppercase tracking-wider text-rose-300/85 font-semibold m-0 mb-2">
            Max stake
          </p>
          <p className="text-lg sm:text-xl font-bold tabular-nums text-[#fbbf24] m-0 leading-tight">
            {fmt(maxStake)}
          </p>
          <p className="text-[11px] text-muted mt-2 m-0">Asteryn Point per line</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-[11px] text-muted">
        <span className="rounded-md border border-border/60 bg-[#0f0a1a]/50 px-2 py-1">
          Stake <span className="text-[#e2e8f0]">0</span> on a line to skip it
        </span>
        <span className="rounded-md border border-border/60 bg-[#0f0a1a]/50 px-2 py-1">
          Picks must be <span className="text-[#e2e8f0]">different players</span>
        </span>
        <span className="rounded-md border border-border/60 bg-[#0f0a1a]/50 px-2 py-1">
          Settles when the <span className="text-[#e2e8f0]">final winner</span> is set
        </span>
      </div>
    </div>
  )
}

function StakePayoutHint({
  stakeRaw,
  multiplier,
  minStake,
  maxStake,
}: {
  stakeRaw: string
  multiplier: number
  minStake: number
  maxStake: number
}) {
  const stake = parseStakeInput(stakeRaw)
  if (stake == null) {
    return (
      <p className="text-[11px] text-muted m-0 mt-1.5">
        Enter {minStake.toLocaleString()}–{maxStake.toLocaleString()} or 0 to skip
      </p>
    )
  }
  if (stake < minStake || stake > maxStake) {
    return (
      <p className="text-[11px] text-rose-300/90 m-0 mt-1.5">
        Stake must be {minStake.toLocaleString()}–{maxStake.toLocaleString()} Asteryn Point
      </p>
    )
  }
  return (
    <div className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-950/25 px-2.5 py-2">
      <p className="text-[11px] text-emerald-300/90 m-0">
        Potential win{' '}
        <span className="font-bold tabular-nums text-emerald-200 text-sm">
          +{(stake * multiplier).toLocaleString()}
        </span>{' '}
        <span className="text-muted">AsterynPoints</span>
      </p>
    </div>
  )
}

function StakeQuickButtons({
  minStake,
  maxStake,
  disabled,
  onPick,
}: {
  minStake: number
  maxStake: number
  disabled?: boolean
  onPick: (value: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onPick('0')}
        className="rounded-md border border-border/70 bg-[#0f0a1a]/60 px-2 py-0.5 text-[10px] font-medium text-muted hover:text-[#e2e8f0] hover:border-border disabled:opacity-40"
      >
        Skip
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onPick(String(minStake))}
        className="rounded-md border border-emerald-500/30 bg-emerald-950/25 px-2 py-0.5 text-[10px] font-medium text-emerald-200/90 hover:bg-emerald-950/40 disabled:opacity-40"
      >
        Min
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onPick(String(maxStake))}
        className="rounded-md border border-amber-500/30 bg-amber-950/25 px-2 py-0.5 text-[10px] font-medium text-amber-200/90 hover:bg-amber-950/40 disabled:opacity-40"
      >
        Max
      </button>
    </div>
  )
}

function PredictionWalletBar({
  balance,
  windowOpen,
  resultsReady,
}: {
  balance: number
  windowOpen: boolean
  resultsReady: boolean
}) {
  let statusLabel = 'Open'
  let statusClass = 'border-emerald-500/40 bg-emerald-950/35 text-emerald-200'
  if (resultsReady) {
    statusLabel = 'Settled'
    statusClass = 'border-violet-500/40 bg-violet-950/35 text-violet-200'
  } else if (!windowOpen) {
    statusLabel = 'Closed'
    statusClass = 'border-amber-500/40 bg-amber-950/35 text-amber-200'
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-gradient-to-r from-[#0f0a1a]/90 to-[#120a22]/70 px-4 py-3">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted font-semibold m-0 mb-0.5">Your wallet</p>
        <p className="text-xl sm:text-2xl font-bold tabular-nums text-[#fbbf24] m-0 leading-none">
          {balance.toLocaleString()}
          <span className="text-sm font-medium text-muted ml-1.5">Asteryn Point</span>
        </p>
      </div>
      <span className={`rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${statusClass}`}>
        {statusLabel}
      </span>
    </div>
  )
}

function LockedBetLine({
  tone,
  multiplier,
  pickLabel,
  stake,
  result,
  payout,
}: {
  tone: 'champion' | 'runnerUp'
  multiplier: number
  pickLabel: string
  stake: number
  result: string
  payout: number | null
}) {
  const isChamp = tone === 'champion'
  const border = isChamp ? 'border-amber-500/35' : 'border-sky-500/35'
  const bg = isChamp
    ? 'bg-gradient-to-br from-amber-950/35 to-[#0f0a1a]/50'
    : 'bg-gradient-to-br from-sky-950/30 to-[#0f0a1a]/50'
  const accent = isChamp ? 'text-amber-200' : 'text-sky-200'
  const { label, className } = formatBetResult(result, payout)
  return (
    <div className={`rounded-xl border ${border} ${bg} p-4 space-y-2`}>
      <div className="flex items-center justify-between gap-2">
        <p className={`text-xs font-semibold uppercase tracking-wide ${accent} m-0`}>
          {isChamp ? 'Champion' : 'Runner-up'}
        </p>
        <span className={`rounded-md border ${border} px-2 py-0.5 text-[10px] font-bold tabular-nums ${accent}`}>
          ×{multiplier}
        </span>
      </div>
      <p className="text-base font-medium text-[#f5efe6] m-0 leading-snug">{pickLabel}</p>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/5">
        <span className="text-sm tabular-nums text-[#fbbf24] font-medium">{stake.toLocaleString()} AsterynPoints staked</span>
        <span className={`text-sm font-semibold ${className}`}>{label}</span>
      </div>
    </div>
  )
}

function PredictionLoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-20 rounded-xl bg-[#0f0a1a]/60 border border-border/40" />
      <div className="h-44 rounded-xl bg-[#0f0a1a]/60 border border-border/40" />
      <div className="h-64 rounded-xl bg-[#0f0a1a]/60 border border-border/40" />
    </div>
  )
}

function formatBetResult(
  result: string,
  payout: number | null
): { label: string; className: string } {
  switch (result) {
    case 'won':
      return {
        label: payout != null && payout > 0 ? `Won — +${payout.toLocaleString()} Asteryn Point` : 'Won',
        className: 'text-emerald-300',
      }
    case 'lost':
      return { label: 'Lost', className: 'text-rose-300' }
    case 'skipped':
      return { label: '—', className: 'text-muted' }
    default:
      return { label: 'Waiting for final', className: 'text-amber-200/90' }
  }
}

export function TournamentPredictionPanel({
  cobbleBalance,
  onBalanceChange,
  embedded = false,
  viewingSlug,
  canBet = true,
  highlightUsername,
  onEventTitleChange,
}: {
  cobbleBalance: number
  onBalanceChange: (balance: number) => void
  /** When true, used inside the main Tournament page (subsection styling). */
  embedded?: boolean
  /** Bracket slug currently open on the Tournament page (for mismatch hint). */
  viewingSlug?: string
  /** Load status / submit bets (requires login). */
  canBet?: boolean
  highlightUsername?: string | null
  /** Called when the active prediction tournament title is known (or cleared). */
  onEventTitleChange?: (title: string | null) => void
}) {
  const [status, setStatus] = useState<TournamentPredictionStatus | null>(null)
  const [ledgerEntries, setLedgerEntries] = useState<TournamentPredictionBetEntry[]>([])
  const [ledgerSummary, setLedgerSummary] = useState<TournamentPredictionBetsSummary | null>(null)
  const [ledgerTournamentTitle, setLedgerTournamentTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [ledgerLoading, setLedgerLoading] = useState(true)
  const [pickChampion, setPickChampion] = useState('')
  const [pickRunnerUp, setPickRunnerUp] = useState('')
  const [stakeChampion, setStakeChampion] = useState('')
  const [stakeRunnerUp, setStakeRunnerUp] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(canBet)
    setLedgerLoading(true)
    try {
      const [s, ledger] = await Promise.all([
        canBet
          ? fetchTournamentPrediction().catch(() => ({ active: false } as TournamentPredictionStatus))
          : Promise.resolve({ active: false } as TournamentPredictionStatus),
        fetchTournamentPredictionLedger().catch(() => ({
          active: false,
          tournament: null,
          entries: [],
          summary: null,
        })),
      ])
      setStatus(s)
      setLedgerEntries(ledger.entries ?? [])
      setLedgerSummary(ledger.summary)
      const title = ledger.tournament?.title ?? s.tournament?.title ?? ''
      setLedgerTournamentTitle(title)
      const hasEvent = Boolean(s.active || ledger.summary || (ledger.entries?.length ?? 0) > 0)
      onEventTitleChange?.(hasEvent && title ? title : null)
    } catch {
      setStatus({ active: false })
      setLedgerEntries([])
      setLedgerSummary(null)
      setLedgerTournamentTitle('')
      onEventTitleChange?.(null)
    } finally {
      setLoading(false)
      setLedgerLoading(false)
    }
  }, [canBet, onEventTitleChange])

  useEffect(() => {
    void load()
  }, [load])

  if (loading && ledgerLoading) {
    return <PredictionLoadingSkeleton />
  }

  const eventOpen = Boolean(status?.active)
  const ledgerActive = Boolean(ledgerSummary || ledgerEntries.length > 0)
  const participants = status?.participants ?? []
  const minStake = status?.minStake ?? 100
  const maxStake = status?.maxStake ?? 20_000
  const champMult = status?.championWinMultiplier ?? 2
  const ruMult = status?.runnerUpWinMultiplier ?? 2
  const lockedAt = status?.predictionsLockedAt
    ? new Date(status.predictionsLockedAt).toLocaleString()
    : null

  const playerOptions = [
    { value: '', label: '— Select —' },
    ...participants.map((p) => ({
      value: String(p.id),
      label: `#${p.seedRank} ${p.displayName}`,
    })),
  ]

  const entry = status?.entry
  const actualChampion =
    status?.championParticipantId != null
      ? participantLabel(status.championParticipantId, participants)
      : null
  const actualRunnerUp =
    status?.runnerUpParticipantId != null
      ? participantLabel(status.runnerUpParticipantId, participants)
      : null

  const viewingMismatch =
    embedded &&
    eventOpen &&
    viewingSlug?.trim() &&
    status?.tournament?.slug &&
    viewingSlug.trim().toLowerCase() !== status.tournament.slug.toLowerCase()

  const predictionTournamentTitle =
    (status?.tournament?.title ?? ledgerTournamentTitle) || null
  const predictionTournamentSubtitle = status?.tournament?.subtitle ?? null
  const showEventBanner = Boolean(predictionTournamentTitle && (eventOpen || ledgerActive))

  const totalStakePreview =
    (parseStakeInput(stakeChampion) ?? 0) + (parseStakeInput(stakeRunnerUp) ?? 0)

  return (
    <div className="space-y-6">
      {!embedded ? (
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-[#f5efe6] m-0">Tournament predictions</h2>
          <p className="text-sm text-muted m-0">Stake Asteryn Point on champion and runner-up before the bracket locks.</p>
        </div>
      ) : null}
      {showEventBanner && predictionTournamentTitle ? (
        <PredictionEventBanner
          title={predictionTournamentTitle}
          subtitle={predictionTournamentSubtitle}
        />
      ) : null}
      {viewingMismatch ? (
        <div className="rounded-xl border border-amber-500/35 bg-amber-950/25 px-4 py-3 text-sm text-amber-100/95">
          You are viewing a different bracket — open{' '}
          <span className="text-[#f5efe6] font-semibold">{status?.tournament?.title}</span> in the tournament list
          to follow the same event.
        </div>
      ) : null}
      {canBet && eventOpen ? (
        <PredictionRulesOverview
          champMult={champMult}
          ruMult={ruMult}
          minStake={minStake}
          maxStake={maxStake}
          lockedAt={lockedAt}
        />
      ) : ledgerActive ? (
        <div className="rounded-xl border border-dashed border-violet-500/30 bg-violet-950/15 px-4 py-3 text-sm text-muted">
          View community bets below. Log in to place your own predictions.
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border/60 bg-[#0f0a1a]/30 px-4 py-8 text-center">
          <p className="text-sm text-muted m-0">No prediction window is open at this time.</p>
        </div>
      )}

      {canBet ? (
        <div className="rounded-xl border border-violet-500/25 bg-gradient-to-b from-[#120a22]/80 to-[#0f0a1a]/90 p-4 sm:p-5 space-y-5 shadow-[0_8px_32px_rgba(0,0,0,0.25)]">
          {!status?.active ? (
            <p className="text-sm text-muted m-0 text-center py-4">
              You cannot place new bets until the next event opens.
            </p>
          ) : null}
          {status?.active ? (
            <>
              <PredictionWalletBar
                balance={cobbleBalance}
                windowOpen={Boolean(status?.windowOpen)}
                resultsReady={Boolean(status?.resultsReady)}
              />

              {!status?.windowOpen && !status?.resultsReady ? (
                <p className="text-sm text-amber-200/95 m-0 rounded-lg border border-amber-500/30 bg-amber-950/25 px-3 py-2">
                  Prediction window is closed — no new entries.
                </p>
              ) : null}
              {status?.resultsReady ? (
                <p className="text-sm text-emerald-200/95 m-0 rounded-lg border border-emerald-500/30 bg-emerald-950/25 px-3 py-2">
                  Tournament finished — winnings are in your site Asteryn Point balance.
                </p>
              ) : null}

              {status?.resultsReady && (actualChampion || actualRunnerUp) ? (
                <div className="rounded-xl border border-emerald-500/40 bg-gradient-to-br from-emerald-950/40 to-[#0f0a1a]/60 p-4 space-y-2">
                  <p className="text-[10px] uppercase tracking-widest font-semibold text-emerald-300/90 m-0 mb-2">
                    Official result
                  </p>
                  {actualChampion ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-amber-300/90 w-20 shrink-0">Champion</span>
                      <span className="text-[#f5efe6] font-medium">{actualChampion}</span>
                    </div>
                  ) : null}
                  {actualRunnerUp ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-sky-300/90 w-20 shrink-0">Runner-up</span>
                      <span className="text-[#f5efe6] font-medium">{actualRunnerUp}</span>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {entry ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-violet-400" aria-hidden />
                    <p className="text-sm font-semibold text-[#f5efe6] m-0">Your predictions are locked</p>
                  </div>
                  {!status?.resultsReady ? (
                    <p className="text-xs text-muted m-0">
                      Payouts settle automatically when the final winner is set in the bracket.
                    </p>
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {entry.stake_champion > 0 ? (
                      <LockedBetLine
                        tone="champion"
                        multiplier={champMult}
                        pickLabel={participantLabel(entry.pick_champion_participant_id ?? 0, participants)}
                        stake={entry.stake_champion}
                        result={entry.result_champion}
                        payout={entry.payout_champion}
                      />
                    ) : null}
                    {entry.stake_runner_up > 0 ? (
                      <LockedBetLine
                        tone="runnerUp"
                        multiplier={ruMult}
                        pickLabel={participantLabel(entry.pick_runner_up_participant_id ?? 0, participants)}
                        stake={entry.stake_runner_up}
                        result={entry.result_runner_up}
                        payout={entry.payout_runner_up}
                      />
                    ) : null}
                  </div>
                </div>
              ) : status?.windowOpen && participants.length >= 2 ? (
                <form
                  className="space-y-5"
                  onSubmit={async (e) => {
              e.preventDefault()
              setError(null)
              setSuccess(null)
              const parseN = (s: string) => parseInt(s.replace(/,/g, ''), 10)
              const sc = parseN(stakeChampion)
              const sr = parseN(stakeRunnerUp)
              const champId = parseInt(pickChampion, 10)
              const ruId = parseInt(pickRunnerUp, 10)
              const na = (v: number) => !Number.isFinite(v) || !Number.isInteger(v) || v < 0
              if (na(sc) || na(sr)) {
                setError('Use whole-number stakes (0 to skip a line).')
                return
              }
              const check = (x: number, label: string) => {
                if (x === 0) return null
                if (x < minStake || x > maxStake) return `${label}: ${minStake}–${maxStake}`
                return null
              }
              const bandErr = check(sc, 'Champion') || check(sr, 'Runner-up')
              if (bandErr) {
                setError(bandErr)
                return
              }
              if (sc + sr <= 0) {
                setError('Stake at least one line.')
                return
              }
              if (sc > 0 && !pickChampion) {
                setError('Pick a champion when champion stake > 0.')
                return
              }
              if (sr > 0 && !pickRunnerUp) {
                setError('Pick a runner-up when runner-up stake > 0.')
                return
              }
              if (sc > 0 && sr > 0 && champId === ruId) {
                setError('Champion and runner-up must be different.')
                return
              }
              const total = sc + sr
              if (cobbleBalance < total) {
                setError(`Need ${total.toLocaleString()} Asteryn Point (wallet too low).`)
                return
              }
              setBusy(true)
              try {
                const res = await submitTournamentPrediction({
                  pickChampionParticipantId: sc > 0 ? champId : 0,
                  stakeChampion: sc,
                  pickRunnerUpParticipantId: sr > 0 ? ruId : 0,
                  stakeRunnerUp: sr,
                })
                setSuccess('Predictions locked.')
                onBalanceChange(res.newBalance)
                setStakeChampion('')
                setStakeRunnerUp('')
                await load()
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Submit failed')
              } finally {
                setBusy(false)
              }
            }}
          >
            <p className="text-xs text-muted m-0">Choose your picks — you can stake one line or both.</p>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3 rounded-xl border border-amber-500/35 bg-gradient-to-br from-amber-950/30 to-[#0f0a1a]/55 p-4 shadow-[inset_0_1px_0_rgba(251,191,36,0.08)]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-amber-500/40 bg-amber-950/50 text-xs font-bold text-amber-200">
                      1
                    </span>
                    <p className="text-sm font-semibold text-amber-100 m-0">Champion</p>
                  </div>
                  <span className="rounded-md border border-amber-500/45 bg-amber-950/50 px-2.5 py-1 text-xs font-bold tabular-nums text-amber-200">
                    ×{champMult}
                  </span>
                </div>
                <label className="block">
                  <span className="block text-[11px] uppercase tracking-wide text-muted mb-1.5">Player</span>
                  <CustomSelect
                    value={pickChampion}
                    onChange={setPickChampion}
                    disabled={busy}
                    options={playerOptions}
                    buttonClassName="w-full rounded-lg border border-amber-500/20 bg-[#0f0a1a]/85 px-3 py-2.5 text-sm text-[#e2e8f0]"
                  />
                </label>
                <label className="block">
                  <span className="block text-[11px] uppercase tracking-wide text-muted mb-1.5">Stake</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={stakeChampion}
                    onChange={(e) => setStakeChampion(e.target.value)}
                    placeholder="0 to skip"
                    className="w-full rounded-lg border border-amber-500/20 bg-[#0f0a1a]/85 px-3 py-2.5 text-base tabular-nums text-[#fbbf24] font-medium"
                    disabled={busy}
                  />
                  <StakeQuickButtons
                    minStake={minStake}
                    maxStake={maxStake}
                    disabled={busy}
                    onPick={setStakeChampion}
                  />
                  <StakePayoutHint
                    stakeRaw={stakeChampion}
                    multiplier={champMult}
                    minStake={minStake}
                    maxStake={maxStake}
                  />
                </label>
              </div>

              <div className="space-y-3 rounded-xl border border-sky-500/35 bg-gradient-to-br from-sky-950/25 to-[#0f0a1a]/55 p-4 shadow-[inset_0_1px_0_rgba(56,189,248,0.06)]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-sky-500/40 bg-sky-950/50 text-xs font-bold text-sky-200">
                      2
                    </span>
                    <p className="text-sm font-semibold text-sky-100 m-0">Runner-up</p>
                  </div>
                  <span className="rounded-md border border-sky-500/45 bg-sky-950/50 px-2.5 py-1 text-xs font-bold tabular-nums text-sky-200">
                    ×{ruMult}
                  </span>
                </div>
                <label className="block">
                  <span className="block text-[11px] uppercase tracking-wide text-muted mb-1.5">Player</span>
                  <CustomSelect
                    value={pickRunnerUp}
                    onChange={setPickRunnerUp}
                    disabled={busy}
                    options={playerOptions}
                    buttonClassName="w-full rounded-lg border border-sky-500/20 bg-[#0f0a1a]/85 px-3 py-2.5 text-sm text-[#e2e8f0]"
                  />
                </label>
                <label className="block">
                  <span className="block text-[11px] uppercase tracking-wide text-muted mb-1.5">Stake</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={stakeRunnerUp}
                    onChange={(e) => setStakeRunnerUp(e.target.value)}
                    placeholder="0 to skip"
                    className="w-full rounded-lg border border-sky-500/20 bg-[#0f0a1a]/85 px-3 py-2.5 text-base tabular-nums text-[#fbbf24] font-medium"
                    disabled={busy}
                  />
                  <StakeQuickButtons
                    minStake={minStake}
                    maxStake={maxStake}
                    disabled={busy}
                    onPick={setStakeRunnerUp}
                  />
                  <StakePayoutHint
                    stakeRaw={stakeRunnerUp}
                    multiplier={ruMult}
                    minStake={minStake}
                    maxStake={maxStake}
                  />
                </label>
              </div>
            </div>

            {totalStakePreview > 0 ? (
              <div className="rounded-xl border border-violet-500/30 bg-violet-950/25 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-muted">Total to lock</span>
                <span className="text-lg font-bold tabular-nums text-[#fbbf24]">
                  {totalStakePreview.toLocaleString()} Asteryn Point
                </span>
              </div>
            ) : null}

            <div className="space-y-2">
              <button
                type="submit"
                disabled={busy}
                className="w-full py-3 px-4 pixel-btn-primary disabled:opacity-50 text-sm font-semibold tracking-wide"
              >
                {busy ? 'Locking predictions…' : 'Lock predictions'}
              </button>
              {success ? (
                <p className="text-sm text-emerald-300 m-0 text-center rounded-lg border border-emerald-500/30 bg-emerald-950/25 py-2">
                  {success}
                </p>
              ) : null}
              {error ? (
                <p className="text-sm text-error m-0 text-center rounded-lg border border-rose-500/30 bg-rose-950/25 py-2">
                  {error}
                </p>
              ) : null}
            </div>
          </form>
        ) : (
          <div className="rounded-xl border border-dashed border-border/60 bg-[#0f0a1a]/30 px-4 py-6 text-center">
            <p className="text-sm text-muted m-0">
              {participants.length < 2
                ? 'Need at least two participants in the tournament bracket.'
                : 'No entry — window closed.'}
            </p>
          </div>
        )}
            </>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-xl border border-border/60 bg-gradient-to-b from-[#120a22]/60 to-[#0f0a1a]/90 p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-[#f5efe6] m-0">Community bets</h3>
            <p className="text-xs text-muted m-0 mt-1">
              Who picked whom and how much is on the line.
            </p>
          </div>
        </div>
        {ledgerActive || ledgerLoading ? (
          <TournamentPredictionBetLedger
            tournamentTitle={ledgerTournamentTitle || status?.tournament?.title || 'Tournament'}
            entries={ledgerEntries}
            summary={ledgerSummary}
            loading={ledgerLoading}
            highlightUsername={highlightUsername}
          />
        ) : (
          <p className="text-sm text-muted m-0">No open prediction event — nothing to show yet.</p>
        )}
      </div>
    </div>
  )
}
