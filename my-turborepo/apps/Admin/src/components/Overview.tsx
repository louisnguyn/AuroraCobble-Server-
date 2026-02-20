import { useEffect, useState } from 'react'
import { fetchLeaderboard, fetchUsageStats } from '../api'
import type { LeaderboardResponse, UsageStatsResponse } from '../types'

export function Overview() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null)
  const [usage, setUsage] = useState<UsageStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([fetchLeaderboard(), fetchUsageStats()])
      .then(([lb, us]) => {
        if (!cancelled) {
          setLeaderboard(lb)
          setUsage(us)
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="rounded-lg bg-surface border border-border p-8 text-center text-muted">
        Loading…
      </div>
    )
  }
  if (error) {
    return (
      <div className="rounded-lg bg-surface border border-border p-6 text-error">
        {error}
      </div>
    )
  }

  const formatCount = leaderboard?.formats ? Object.keys(leaderboard.formats).length : 0
  const totalPlayers = leaderboard?.formats
    ? Object.values(leaderboard.formats).reduce(
        (sum, f) => sum + (f.players?.length ?? 0),
        0
      )
    : 0
  const totalBattles = usage?.formats
    ? Object.values(usage.formats).reduce((sum, f) => {
        return (
          sum +
          Object.values(f.tiers ?? {}).reduce((tierSum, t) => tierSum + (t.totalBattles ?? 0), 0)
        )
      }, 0)
    : 0

  const cards = [
    { label: 'Formats', value: formatCount },
    { label: 'Players (ranked)', value: totalPlayers },
    { label: 'Total battles', value: totalBattles.toLocaleString() },
    { label: 'Season', value: leaderboard?.seasonName ?? usage?.seasonName ?? '—' },
  ]

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold m-0">Overview</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(({ label, value }) => (
          <div
            key={label}
            className="rounded-lg bg-surface border border-border p-5"
          >
            <p className="text-sm text-muted m-0">{label}</p>
            <p className="text-2xl font-semibold m-0 mt-1">{value}</p>
          </div>
        ))}
      </div>
      {(leaderboard?.timestamp || usage?.timestamp) && (
        <p className="text-sm text-muted">
          Data updated: {leaderboard?.timestamp ?? usage?.timestamp}
        </p>
      )}
    </div>
  )
}
