import type { TournamentPredictionHistoryRow } from '../authApi'

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

export function TournamentPredictionHistoryList({
  rows,
  loading,
}: {
  rows: TournamentPredictionHistoryRow[]
  loading?: boolean
}) {
  if (loading) {
    return <p className="text-sm text-muted m-0">Loading prediction history…</p>
  }
  if (rows.length === 0) {
    return <p className="text-sm text-muted m-0">No past predictions yet.</p>
  }

  return (
    <ul className="list-none m-0 p-0 space-y-3">
      {rows.map((row) => {
        const champ = formatBetResult(row.resultChampion, row.payoutChampion)
        const ru = formatBetResult(row.resultRunnerUp, row.payoutRunnerUp)
        return (
          <li
            key={row.id}
            className="rounded-lg border border-border/60 bg-[#0f0a1a]/40 p-3 space-y-2 text-sm"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="m-0 font-medium text-[#e2e8f0]">{row.tournamentTitle}</p>
              <span className="text-xs text-muted tabular-nums">
                {new Date(row.createdAt).toLocaleString()}
              </span>
            </div>
            {row.stakeChampion > 0 && (
              <p className="m-0 text-[#e2e8f0]">
                <span className="text-muted text-xs">Champion · </span>
                {row.pickChampionLabel ?? '—'} ·{' '}
                <span className="text-[#fbbf24] tabular-nums">{row.stakeChampion.toLocaleString()}</span>{' '}
                Asteryn Point — <span className={champ.className}>{champ.label}</span>
              </p>
            )}
            {row.stakeRunnerUp > 0 && (
              <p className="m-0 text-[#e2e8f0]">
                <span className="text-muted text-xs">Runner-up · </span>
                {row.pickRunnerUpLabel ?? '—'} ·{' '}
                <span className="text-[#fbbf24] tabular-nums">{row.stakeRunnerUp.toLocaleString()}</span>{' '}
                Asteryn Point — <span className={ru.className}>{ru.label}</span>
              </p>
            )}
            <p className="m-0 text-xs text-muted tabular-nums">
              Total staked {row.totalStake.toLocaleString()} Asteryn Point
            </p>
          </li>
        )
      })}
    </ul>
  )
}
