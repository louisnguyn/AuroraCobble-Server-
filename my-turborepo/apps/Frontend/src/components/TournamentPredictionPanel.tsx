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

function formatBetResult(
  result: string,
  payout: number | null
): { label: string; className: string } {
  switch (result) {
    case 'won':
      return {
        label: payout != null && payout > 0 ? `Won — +${payout.toLocaleString()} Cobble$` : 'Won',
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
    return <p className="text-sm text-muted m-0">Loading tournament predictions…</p>
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

  return (
    <div className="space-y-6">
      {!embedded ? (
        <h2 className="text-lg font-medium text-[#e2e8f0] m-0 mb-2">Tournament predictions</h2>
      ) : null}
      {showEventBanner && predictionTournamentTitle ? (
        <PredictionEventBanner
          title={predictionTournamentTitle}
          subtitle={predictionTournamentSubtitle}
        />
      ) : null}
      {viewingMismatch ? (
        <p className="text-xs text-amber-200/90 m-0">
          You are viewing a different bracket — open{' '}
          <span className="text-[#f5efe6] font-medium">{status?.tournament?.title}</span> in the tournament list to
          follow the same event.
        </p>
      ) : null}
      {canBet && eventOpen ? (
        <p className="text-sm text-muted m-0">
          Pick champion and runner-up separately. Champion pays ×{champMult}; runner-up pays ×{ruMult}. Stake{' '}
          {minStake.toLocaleString()}–{maxStake.toLocaleString()} Cobble$ per line (0 = skip). Results settle when
          the final winner is set in the bracket.
          {lockedAt ? (
            <span className="block mt-2 text-amber-200/90">Predictions lock: {lockedAt}</span>
          ) : null}
        </p>
      ) : ledgerActive ? (
        <p className="text-sm text-muted m-0">View all bets below. Log in to place your own.</p>
      ) : (
        <p className="text-sm text-muted m-0">
          No prediction event is open right now. Check back when staff announce one.
        </p>
      )}

      {canBet ? (
      <div className="pixel-well p-4 space-y-4">
        {!status?.active ? (
          <p className="text-xs text-muted m-0">You cannot place new bets until staff open the next event.</p>
        ) : null}
        {status?.active ? (
          <>
        <p className="text-xs text-muted m-0">
          Wallet: <span className="tabular-nums text-[#fbbf24]">{cobbleBalance.toLocaleString()}</span> Cobble$
          {!status?.windowOpen && (
            <span className="block mt-2 text-amber-300">Prediction window is closed.</span>
          )}
          {status?.resultsReady && (
            <span className="block mt-2 text-emerald-300/90">
              Tournament finished — check your lines below. Winnings are in your site Cobble$ balance.
            </span>
          )}
        </p>

        {status?.resultsReady && (actualChampion || actualRunnerUp) ? (
          <div className="rounded-lg border border-emerald-500/35 bg-emerald-950/25 p-3 space-y-1 text-sm">
            <p className="text-xs font-medium text-emerald-200/95 m-0">Official result</p>
            {actualChampion ? <p className="m-0 text-[#e2e8f0]">Champion: {actualChampion}</p> : null}
            {actualRunnerUp ? <p className="m-0 text-[#e2e8f0]">Runner-up: {actualRunnerUp}</p> : null}
          </div>
        ) : null}

        {entry ? (
          <div className="text-sm text-[#e2e8f0] space-y-3">
            <p className="m-0 font-medium">Your entry (locked)</p>
            {!status?.resultsReady ? (
              <p className="text-xs text-muted m-0">
                After the final is played, each line shows Won or Lost and payouts go to your wallet
                automatically.
              </p>
            ) : null}
            {entry.stake_champion > 0 && (
              <div className="rounded-lg border border-border/60 p-3 space-y-1">
                <p className="text-xs text-muted m-0">Champion (×{champMult})</p>
                <p className="m-0">
                  Your pick:{' '}
                  {participantLabel(entry.pick_champion_participant_id ?? 0, participants)}
                </p>
                <p className="m-0 tabular-nums text-[#fbbf24]">
                  Stake {entry.stake_champion.toLocaleString()} Cobble$
                </p>
                <p
                  className={`m-0 font-medium ${formatBetResult(entry.result_champion, entry.payout_champion).className}`}
                >
                  {formatBetResult(entry.result_champion, entry.payout_champion).label}
                </p>
              </div>
            )}
            {entry.stake_runner_up > 0 && (
              <div className="rounded-lg border border-border/60 p-3 space-y-1">
                <p className="text-xs text-muted m-0">Runner-up (×{ruMult})</p>
                <p className="m-0">
                  Your pick:{' '}
                  {participantLabel(entry.pick_runner_up_participant_id ?? 0, participants)}
                </p>
                <p className="m-0 tabular-nums text-[#fbbf24]">
                  Stake {entry.stake_runner_up.toLocaleString()} Cobble$
                </p>
                <p
                  className={`m-0 font-medium ${formatBetResult(entry.result_runner_up, entry.payout_runner_up).className}`}
                >
                  {formatBetResult(entry.result_runner_up, entry.payout_runner_up).label}
                </p>
              </div>
            )}
          </div>
        ) : status?.windowOpen && participants.length >= 2 ? (
          <form
            className="space-y-4"
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
                setError(`Need ${total.toLocaleString()} Cobble$ (wallet too low).`)
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
            <div className="space-y-3 rounded-lg border border-violet-500/25 bg-violet-950/20 p-3">
              <p className="text-xs font-medium text-violet-200 m-0">Champion — ×{champMult}</p>
              <label className="block">
                <span className="block text-xs text-muted mb-1">Player</span>
                <CustomSelect
                  value={pickChampion}
                  onChange={setPickChampion}
                  disabled={busy}
                  options={playerOptions}
                  buttonClassName="w-full rounded-lg border border-border bg-[#0f0a1a]/80 px-3 py-2 text-sm text-[#e2e8f0]"
                />
              </label>
              <label className="block">
                <span className="block text-xs text-muted mb-1">Stake (0 = skip)</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={stakeChampion}
                  onChange={(e) => setStakeChampion(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-lg border border-border bg-[#0f0a1a]/80 px-3 py-2 text-sm tabular-nums text-[#e2e8f0]"
                  disabled={busy}
                />
              </label>
            </div>
            <div className="space-y-3 rounded-lg border border-border/70 bg-[#0f0a1a]/40 p-3">
              <p className="text-xs font-medium text-[#e2e8f0] m-0">Runner-up — ×{ruMult}</p>
              <label className="block">
                <span className="block text-xs text-muted mb-1">Player</span>
                <CustomSelect
                  value={pickRunnerUp}
                  onChange={setPickRunnerUp}
                  disabled={busy}
                  options={playerOptions}
                  buttonClassName="w-full rounded-lg border border-border bg-[#0f0a1a]/80 px-3 py-2 text-sm text-[#e2e8f0]"
                />
              </label>
              <label className="block">
                <span className="block text-xs text-muted mb-1">Stake (0 = skip)</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={stakeRunnerUp}
                  onChange={(e) => setStakeRunnerUp(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-lg border border-border bg-[#0f0a1a]/80 px-3 py-2 text-sm tabular-nums text-[#e2e8f0]"
                  disabled={busy}
                />
              </label>
            </div>
            <button type="submit" disabled={busy} className="py-2 px-4 pixel-btn-primary disabled:opacity-50">
              {busy ? 'Submitting…' : 'Lock predictions'}
            </button>
            {success && <p className="text-sm text-emerald-300 m-0">{success}</p>}
            {error && <p className="text-sm text-error m-0">{error}</p>}
          </form>
        ) : (
          <p className="text-sm text-muted m-0">
            {participants.length < 2
              ? 'Need at least two participants in the tournament bracket.'
              : 'No entry — window closed.'}
          </p>
        )}
          </>
        ) : null}
      </div>
      ) : null}

      <div className="pixel-well p-4 space-y-3">
        <h3 className="text-sm font-semibold text-[#e2e8f0] m-0">Bet ledger</h3>
        <p className="text-xs text-muted m-0">
          Everyone&apos;s stakes for the current prediction event — who picked whom and how much.
        </p>
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
