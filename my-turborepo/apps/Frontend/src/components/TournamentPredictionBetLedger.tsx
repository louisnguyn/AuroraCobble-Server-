import type {
  TournamentPredictionBetEntry,
  TournamentPredictionBetsSummary,
} from '../authApi'

function resultCell(
  result: string,
  payout: number | null,
  staked: boolean
): { text: string; className: string; badgeClass: string } {
  if (!staked) return { text: '—', className: 'text-muted', badgeClass: 'border-border/50 bg-[#0f0a1a]/40 text-muted' }
  switch (result) {
    case 'won':
      return {
        text: payout != null && payout > 0 ? `+${payout.toLocaleString()}` : 'Won',
        className: 'text-emerald-200',
        badgeClass: 'border-emerald-500/40 bg-emerald-950/50 text-emerald-200',
      }
    case 'lost':
      return { text: 'Lost', className: 'text-rose-200', badgeClass: 'border-rose-500/35 bg-rose-950/40 text-rose-200' }
    default:
      return { text: 'Pending', className: 'text-amber-200/90', badgeClass: 'border-amber-500/35 bg-amber-950/35 text-amber-200/90' }
  }
}

function PickTotals({
  title,
  rows,
  tone,
}: {
  title: string
  rows: TournamentPredictionBetsSummary['champion']
  tone: 'champion' | 'runnerUp'
}) {
  if (rows.length === 0) return null
  const border =
    tone === 'champion' ? 'border-amber-500/35' : 'border-sky-500/35'
  const bg =
    tone === 'champion'
      ? 'bg-gradient-to-br from-amber-950/35 to-[#0f0a1a]/50'
      : 'bg-gradient-to-br from-sky-950/30 to-[#0f0a1a]/50'
  const titleColor = tone === 'champion' ? 'text-amber-200' : 'text-sky-200'
  return (
    <div className={`rounded-xl border ${border} ${bg} p-4 space-y-3`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${titleColor} m-0`}>{title}</p>
      <ul className="list-none m-0 p-0 space-y-2">
        {rows.map((s, i) => (
          <li
            key={s.participantId}
            className={`flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-[#0f0a1a]/45 px-3 py-2 ${
              i === 0 ? 'ring-1 ring-inset ring-white/5' : ''
            }`}
          >
            <div className="min-w-0">
              <p className="text-sm text-[#e2e8f0] m-0 truncate">
                <span className="text-muted font-medium">#{s.seedRank}</span> {s.displayName}
              </p>
              <p className="text-[10px] text-muted m-0 mt-0.5">{s.betCount} bet{s.betCount === 1 ? '' : 's'}</p>
            </div>
            <span className="tabular-nums text-sm font-semibold text-[#fbbf24] shrink-0">
              {s.totalStake.toLocaleString()}
            </span>
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
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-14 rounded-xl bg-[#0f0a1a]/60 border border-border/40" />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="h-32 rounded-xl bg-[#0f0a1a]/60 border border-border/40" />
          <div className="h-32 rounded-xl bg-[#0f0a1a]/60 border border-border/40" />
        </div>
        <div className="h-48 rounded-xl bg-[#0f0a1a]/60 border border-border/40" />
      </div>
    )
  }

  if (!summary) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-[#0f0a1a]/30 px-4 py-8 text-center">
        <p className="text-sm text-muted m-0">No bets yet for this prediction event.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg border border-violet-500/35 bg-violet-950/30 px-3 py-1.5 text-xs font-medium text-violet-200">
          {tournamentTitle}
        </span>
        <span className="rounded-lg border border-border/60 bg-[#0f0a1a]/50 px-3 py-1.5 text-xs text-[#e2e8f0]">
          <span className="tabular-nums font-semibold">{summary.totalEntries}</span> bet
          {summary.totalEntries === 1 ? '' : 's'}
        </span>
        <span className="rounded-lg border border-amber-500/30 bg-amber-950/25 px-3 py-1.5 text-xs tabular-nums text-[#fbbf24] font-semibold">
          {summary.totalStaked.toLocaleString()} CD staked
        </span>
      </div>

      {(summary.champion.length > 0 || summary.runnerUp.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <PickTotals title="Champion picks" rows={summary.champion} tone="champion" />
          <PickTotals title="Runner-up picks" rows={summary.runnerUp} tone="runnerUp" />
        </div>
      )}

      {entries.length === 0 ? (
        <p className="text-sm text-muted m-0">No individual entries yet.</p>
      ) : (
        <>
          <div className="hidden md:block overflow-x-auto rounded-xl border border-border/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <table className="w-full text-left text-sm border-collapse min-w-[52rem]">
              <thead>
                <tr className="border-b border-border/70 bg-gradient-to-r from-violet-950/40 to-[#0f0a1a]/80 text-[10px] uppercase tracking-wider text-muted">
                  <th className="px-3 py-2.5 font-semibold">User</th>
                  <th className="px-3 py-2.5 font-semibold">Champion</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Stake</th>
                  <th className="px-3 py-2.5 font-semibold">Result</th>
                  <th className="px-3 py-2.5 font-semibold">Runner-up</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Stake</th>
                  <th className="px-3 py-2.5 font-semibold">Result</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Total</th>
                  <th className="px-3 py-2.5 font-semibold">When</th>
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
                      className={`border-b border-border/35 last:border-0 transition-colors ${
                        isYou ? 'bg-violet-950/40' : 'hover:bg-surface-hover/25'
                      }`}
                    >
                      <td className="px-3 py-2.5 text-[#e2e8f0] font-medium whitespace-nowrap">
                        {row.username}
                        {isYou ? (
                          <span className="ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-violet-500/25 text-violet-200">
                            you
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-[#e2e8f0] text-xs">
                        {row.stakeChampion > 0 ? (row.pickChampionLabel ?? '—') : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[#fbbf24] text-xs">
                        {row.stakeChampion > 0 ? row.stakeChampion.toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        {row.stakeChampion > 0 ? (
                          <span
                            className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${champ.badgeClass}`}
                          >
                            {champ.text}
                          </span>
                        ) : (
                          <span className="text-muted text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-[#e2e8f0] text-xs">
                        {row.stakeRunnerUp > 0 ? (row.pickRunnerUpLabel ?? '—') : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[#fbbf24] text-xs">
                        {row.stakeRunnerUp > 0 ? row.stakeRunnerUp.toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        {row.stakeRunnerUp > 0 ? (
                          <span
                            className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${ru.badgeClass}`}
                          >
                            {ru.text}
                          </span>
                        ) : (
                          <span className="text-muted text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-[#e2e8f0]">
                        {row.totalStake.toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-muted whitespace-nowrap">
                        {new Date(row.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <ul className="md:hidden list-none m-0 p-0 space-y-3">
            {entries.map((row) => {
              const champ = resultCell(row.resultChampion, row.payoutChampion, row.stakeChampion > 0)
              const ru = resultCell(row.resultRunnerUp, row.payoutRunnerUp, row.stakeRunnerUp > 0)
              const isYou =
                highlightUsername &&
                row.username.toLowerCase() === highlightUsername.toLowerCase()
              return (
                <li
                  key={row.id}
                  className={`rounded-xl border p-3 space-y-2 ${
                    isYou
                      ? 'border-violet-500/45 bg-violet-950/30'
                      : 'border-border/60 bg-[#0f0a1a]/45'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-[#e2e8f0] text-sm">{row.username}</span>
                    {isYou ? (
                      <span className="text-[10px] uppercase tracking-wide text-violet-300 font-semibold">You</span>
                    ) : null}
                  </div>
                  {row.stakeChampion > 0 ? (
                    <div className="rounded-lg border border-amber-500/25 bg-amber-950/20 px-2.5 py-2 text-xs">
                      <p className="text-amber-200/90 font-medium m-0 mb-0.5">Champion</p>
                      <p className="text-[#e2e8f0] m-0">{row.pickChampionLabel}</p>
                      <div className="flex justify-between mt-1 gap-2">
                        <span className="tabular-nums text-[#fbbf24]">{row.stakeChampion.toLocaleString()} CD</span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] border ${champ.badgeClass}`}>
                          {champ.text}
                        </span>
                      </div>
                    </div>
                  ) : null}
                  {row.stakeRunnerUp > 0 ? (
                    <div className="rounded-lg border border-sky-500/25 bg-sky-950/20 px-2.5 py-2 text-xs">
                      <p className="text-sky-200/90 font-medium m-0 mb-0.5">Runner-up</p>
                      <p className="text-[#e2e8f0] m-0">{row.pickRunnerUpLabel}</p>
                      <div className="flex justify-between mt-1 gap-2">
                        <span className="tabular-nums text-[#fbbf24]">{row.stakeRunnerUp.toLocaleString()} CD</span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] border ${ru.badgeClass}`}>
                          {ru.text}
                        </span>
                      </div>
                    </div>
                  ) : null}
                  <p className="text-[10px] text-muted m-0 flex justify-between">
                    <span>Total {row.totalStake.toLocaleString()} CD</span>
                    <span>{new Date(row.createdAt).toLocaleString()}</span>
                  </p>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
