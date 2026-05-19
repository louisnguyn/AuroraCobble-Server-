import type {
  TournamentPredictionBetEntry,
  TournamentPredictionBetsSummary,
} from '../authApi'

function resultCell(
  result: string,
  payout: number | null,
  staked: boolean
): { text: string; className: string } {
  if (!staked) return { text: '—', className: 'text-muted' }
  switch (result) {
    case 'won':
      return {
        text: payout != null && payout > 0 ? `won (+${payout.toLocaleString()})` : 'won',
        className: 'text-emerald-300',
      }
    case 'lost':
      return { text: 'lost', className: 'text-rose-300' }
    default:
      return { text: 'pending', className: 'text-slate-400' }
  }
}

function PickTotals({
  title,
  rows,
}: {
  title: string
  rows: TournamentPredictionBetsSummary['champion']
}) {
  if (rows.length === 0) return null
  return (
    <div className="rounded-lg border border-border/60 bg-[#0f0a1a]/40 p-3 space-y-2">
      <p className="text-xs font-semibold text-violet-200/95 m-0">{title}</p>
      <ul className="list-none m-0 p-0 space-y-1 text-sm">
        {rows.map((s) => (
          <li key={s.participantId} className="flex justify-between gap-2 text-[#e2e8f0]">
            <span>
              #{s.seedRank} {s.displayName}{' '}
              <span className="text-muted text-xs">({s.betCount})</span>
            </span>
            <span className="tabular-nums text-[#fbbf24] shrink-0">{s.totalStake.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function TournamentPredictionBetLedger({
  tournamentTitle,
  entries,
  summary,
  loading,
  highlightUsername,
}: {
  tournamentTitle: string
  entries: TournamentPredictionBetEntry[]
  summary: TournamentPredictionBetsSummary | null
  loading?: boolean
  highlightUsername?: string | null
}) {
  if (loading) {
    return <p className="text-sm text-muted m-0">Loading bet history…</p>
  }

  if (!summary) {
    return <p className="text-sm text-muted m-0">No bets yet for this prediction event.</p>
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted m-0">
        <span className="text-[#f5efe6] font-semibold">{tournamentTitle}</span> — {summary.totalEntries}{' '}
        bet{summary.totalEntries === 1 ? '' : 's'}, {summary.totalStaked.toLocaleString()} Cobble$ total staked
      </p>

      {(summary.champion.length > 0 || summary.runnerUp.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <PickTotals title="Champion — total staked per pick" rows={summary.champion} />
          <PickTotals title="Runner-up — total staked per pick" rows={summary.runnerUp} />
        </div>
      )}

      {entries.length === 0 ? (
        <p className="text-sm text-muted m-0">No bets yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full text-left text-sm border-collapse min-w-[52rem]">
            <thead>
              <tr className="border-b border-border/70 bg-[#0f0a1a]/80 text-xs uppercase tracking-wide text-muted">
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium">Champion pick</th>
                <th className="px-3 py-2 font-medium text-right">Stake</th>
                <th className="px-3 py-2 font-medium">Result</th>
                <th className="px-3 py-2 font-medium">Runner-up pick</th>
                <th className="px-3 py-2 font-medium text-right">Stake</th>
                <th className="px-3 py-2 font-medium">Result</th>
                <th className="px-3 py-2 font-medium text-right">Total</th>
                <th className="px-3 py-2 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((row) => {
                const champ = resultCell(row.resultChampion, row.payoutChampion, row.stakeChampion > 0)
                const ru = resultCell(row.resultRunnerUp, row.payoutRunnerUp, row.stakeRunnerUp > 0)
                const isYou =
                  highlightUsername &&
                  row.username.toLowerCase() === highlightUsername.toLowerCase()
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-border/40 last:border-0 ${
                      isYou ? 'bg-violet-950/35' : 'hover:bg-surface-hover/30'
                    }`}
                  >
                    <td className="px-3 py-2 text-[#e2e8f0] font-medium whitespace-nowrap">
                      {row.username}
                      {isYou ? <span className="text-xs text-accent ml-1">(you)</span> : null}
                    </td>
                    <td className="px-3 py-2 text-[#e2e8f0]">
                      {row.stakeChampion > 0 ? (row.pickChampionLabel ?? '—') : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#fbbf24]">
                      {row.stakeChampion > 0 ? row.stakeChampion.toLocaleString() : '—'}
                    </td>
                    <td className={`px-3 py-2 text-xs ${champ.className}`}>{champ.text}</td>
                    <td className="px-3 py-2 text-[#e2e8f0]">
                      {row.stakeRunnerUp > 0 ? (row.pickRunnerUpLabel ?? '—') : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#fbbf24]">
                      {row.stakeRunnerUp > 0 ? row.stakeRunnerUp.toLocaleString() : '—'}
                    </td>
                    <td className={`px-3 py-2 text-xs ${ru.className}`}>{ru.text}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-[#e2e8f0]">
                      {row.totalStake.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted whitespace-nowrap">
                      {new Date(row.createdAt).toLocaleString()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
