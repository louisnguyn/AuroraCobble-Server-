import { useEffect, useState } from 'react'
import { fetchCobbleDollarsLeaderboard } from '../api'
import type { CobbleDollarsLeaderboardResponse } from '../types'

export function CobbleDollars() {
  const [data, setData] = useState<CobbleDollarsLeaderboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchCobbleDollarsLeaderboard()
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const panelClass = 'p-8 text-center rounded-lg bg-surface border border-border'

  if (loading) return <div className={panelClass}>Loading Cobble$ leaderboard…</div>
  if (error) return <div className={`${panelClass} text-error`}>Error: {error}</div>
  if (!data) return <div className={panelClass}>No data.</div>

  if (data.disabled) {
    return (
      <div className="w-full max-w-lg mx-auto">
        <div className={`${panelClass} text-muted`}>
          Cobble$ leaderboard is not available on this site right now.
        </div>
      </div>
    )
  }

  if (data.error) {
    return (
      <div className="w-full max-w-lg mx-auto">
        <div className={`${panelClass} text-error text-sm`}>Could not load server balances: {data.error}</div>
      </div>
    )
  }

  if (data.top10.length === 0) {
    return (
      <div className="w-full max-w-lg mx-auto">
        <div className={`${panelClass} text-muted`}>
          No Cobble$ balances returned yet. Play on the server to appear on the leaderboard.
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold m-0 mb-1 text-[#e2e8f0]">Cobble$ top 10</h1>
        <p className="text-sm text-muted m-0">
          Richest players on the Minecraft server (from the in-game CobbleDollars leaderboard).
        </p>
        {data.updatedAt && (
          <p className="text-xs text-muted/80 m-0 mt-2">
            Last refreshed: {new Date(data.updatedAt).toLocaleString()} · updates about every ~90 seconds here
          </p>
        )}
      </header>

      <ol className="list-none m-0 p-0 space-y-2">
        {data.top10.map((row, i) => (
          <li
            key={`${row.name}-${row.balance}-${i}`}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface/80 px-4 py-3"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-sm font-bold tabular-nums text-accent">
                {i + 1}
              </span>
              <span className="font-mono text-sm text-[#e2e8f0] truncate" title={row.name}>
                {row.name}
              </span>
            </span>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-[#fbbf24]">
              {Number(row.balance).toLocaleString()}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
