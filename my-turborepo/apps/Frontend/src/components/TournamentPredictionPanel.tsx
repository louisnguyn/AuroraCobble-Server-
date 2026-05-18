import { useCallback, useEffect, useState } from 'react'
import { CustomSelect } from './CustomSelect.tsx'
import {
  fetchTournamentPrediction,
  submitTournamentPrediction,
  type TournamentPredictionStatus,
} from '../authApi'

function participantLabel(id: number, participants: { id: number; displayName: string; seedRank: number }[]) {
  const p = participants.find((x) => x.id === id)
  return p ? `#${p.seedRank} ${p.displayName}` : `#${id}`
}

export function TournamentPredictionPanel({
  cobbleBalance,
  onBalanceChange,
}: {
  cobbleBalance: number
  onBalanceChange: (balance: number) => void
}) {
  const [status, setStatus] = useState<TournamentPredictionStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [pickChampion, setPickChampion] = useState('')
  const [pickRunnerUp, setPickRunnerUp] = useState('')
  const [stakeChampion, setStakeChampion] = useState('')
  const [stakeRunnerUp, setStakeRunnerUp] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const s = await fetchTournamentPrediction()
      setStatus(s)
    } catch {
      setStatus({ active: false })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return <p className="text-sm text-muted m-0">Loading tournament predictions…</p>
  }

  if (!status?.active) {
    return (
      <p className="text-sm text-muted m-0">
        No tournament prediction is open right now. Check back when an event is announced.
      </p>
    )
  }

  const participants = status.participants ?? []
  const minStake = status.minStake ?? 100
  const maxStake = status.maxStake ?? 20_000
  const champMult = status.championWinMultiplier ?? 2
  const ruMult = status.runnerUpWinMultiplier ?? 2
  const lockedAt = status.predictionsLockedAt
    ? new Date(status.predictionsLockedAt).toLocaleString()
    : null

  const playerOptions = [
    { value: '', label: '— Select —' },
    ...participants.map((p) => ({
      value: String(p.id),
      label: `#${p.seedRank} ${p.displayName}`,
    })),
  ]

  const entry = status.entry

  return (
    <>
      <h2 className="text-lg font-medium text-[#e2e8f0] m-0 mb-2">Tournament predictions</h2>
      <p className="text-sm text-muted m-0 mb-4">
        {status.tournament?.title ?? 'Tournament'} — pick champion and runner-up separately. Champion pays ×
        {champMult}; runner-up pays ×{ruMult}. Stake {minStake.toLocaleString()}–{maxStake.toLocaleString()}{' '}
        Cobble$ per line (0 = skip). Results settle when the final winner is set in the bracket.
        {lockedAt ? (
          <span className="block mt-2 text-amber-200/90">Predictions lock: {lockedAt}</span>
        ) : null}
      </p>

      <div className="mb-6 pixel-well p-4 space-y-4">
        <p className="text-xs text-muted m-0">
          Wallet: <span className="tabular-nums text-[#fbbf24]">{cobbleBalance.toLocaleString()}</span> Cobble$
          {!status.windowOpen && (
            <span className="block mt-2 text-amber-300">Prediction window is closed.</span>
          )}
          {status.resultsReady && (
            <span className="block mt-2 text-emerald-300/90">Final results are in — payouts processed.</span>
          )}
        </p>

        {entry ? (
          <div className="text-sm text-[#e2e8f0] space-y-3">
            <p className="m-0 font-medium">Your entry (locked)</p>
            {entry.stake_champion > 0 && (
              <div className="rounded-lg border border-border/60 p-3 space-y-1">
                <p className="text-xs text-muted m-0">Champion (×{champMult})</p>
                <p className="m-0">
                  {participantLabel(entry.pick_champion_participant_id ?? 0, participants)}
                </p>
                <p className="m-0 tabular-nums text-[#fbbf24]">
                  Stake {entry.stake_champion.toLocaleString()} Cobble$ — {entry.result_champion}
                  {entry.payout_champion
                    ? ` · +${entry.payout_champion.toLocaleString()}`
                    : ''}
                </p>
              </div>
            )}
            {entry.stake_runner_up > 0 && (
              <div className="rounded-lg border border-border/60 p-3 space-y-1">
                <p className="text-xs text-muted m-0">Runner-up (×{ruMult})</p>
                <p className="m-0">
                  {participantLabel(entry.pick_runner_up_participant_id ?? 0, participants)}
                </p>
                <p className="m-0 tabular-nums text-[#fbbf24]">
                  Stake {entry.stake_runner_up.toLocaleString()} Cobble$ — {entry.result_runner_up}
                  {entry.payout_runner_up ? ` · +${entry.payout_runner_up.toLocaleString()}` : ''}
                </p>
              </div>
            )}
          </div>
        ) : status.windowOpen && participants.length >= 2 ? (
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
      </div>
    </>
  )
}
