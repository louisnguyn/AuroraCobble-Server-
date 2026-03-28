import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchCobbleDollarsLeaderboard } from '../api'
import type { CobbleDollarsLeaderboardResponse } from '../types'
import { ignNamesMatch, scrollElementIntoViewCentered } from '../ignMatch'

/**
 * In-game Cobble$ top 10 (RCON). Used on Leaderboard → Economy only.
 */
export function CobbleDollars({ viewerIgn }: { viewerIgn?: string | null }) {
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

  const youRowRef = useRef<HTMLLIElement>(null)
  const yourIndex = useMemo(() => {
    if (!viewerIgn?.trim()) return -1
    const rows = data?.top10
    if (!rows?.length) return -1
    return rows.findIndex((row) => ignNamesMatch(viewerIgn, row.name))
  }, [data?.top10, viewerIgn])

  useEffect(() => {
    if (yourIndex < 0 || !data?.top10.length) return
    scrollElementIntoViewCentered(youRowRef.current)
  }, [yourIndex, data?.top10])

  const panelClass = 'p-8 text-center rounded-lg bg-surface border border-border'

  if (loading) {
    return <div className={panelClass}>Loading in-game Cobble$ leaderboard…</div>
  }
  if (error) {
    return <div className={`${panelClass} text-error`}>Error: {error}</div>
  }
  if (!data) {
    return <div className={panelClass}>No data.</div>
  }

  return (
    <div className="w-full max-w-2xl space-y-6">
      {data.disabled ? (
        <div className="p-8 text-center rounded-xl border border-border bg-surface/80 text-muted">
          Cobble$ leaderboard is not available on this site right now.
        </div>
      ) : data.error ? (
        <div className="p-8 text-center rounded-xl border border-border bg-surface/80 text-error text-sm">
          Could not load server balances: {data.error}
        </div>
      ) : data.top10.length === 0 ? (
        <div className="p-8 text-center rounded-xl border border-border bg-surface/80 text-muted">
          No Cobble$ balances returned yet. Play on the server to appear on the leaderboard.
        </div>
      ) : (
        <>
          <header>
            <h3 className="text-base font-semibold m-0 mb-1 text-[#e2e8f0]">In-game Cobble$ (top 10)</h3>
            <p className="text-sm text-muted m-0">
              Richest players on the Minecraft server (CobbleDollars leaderboard via RCON).
            </p>
            {data.updatedAt && (
              <p className="text-xs text-muted/80 m-0 mt-2">
                Last refreshed: {new Date(data.updatedAt).toLocaleString()} · updates about every ~90 seconds
              </p>
            )}
          </header>

          {yourIndex >= 0 && data.top10[yourIndex] ? (
            <div
              className="rounded-xl border border-accent/40 bg-accent/[0.08] px-4 py-3 shadow-[0_0_24px_rgba(167,139,250,0.12)]"
              role="status"
              aria-live="polite"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-accent m-0 mb-1">Your position</p>
              <p className="text-sm text-[#e2e8f0] m-0">
                <span className="font-mono font-semibold">{data.top10[yourIndex].name}</span> — rank{' '}
                <strong className="tabular-nums text-accent">{yourIndex + 1}</strong> with{' '}
                <strong className="tabular-nums text-[#fbbf24]">
                  {Number(data.top10[yourIndex].balance).toLocaleString()}
                </strong>{' '}
                Cobble$
              </p>
            </div>
          ) : null}

          <ol className="list-none m-0 p-0 space-y-2">
            {data.top10.map((row, i) => (
              <li
                key={`${row.name}-${row.balance}-${i}`}
                ref={i === yourIndex ? youRowRef : undefined}
                className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-shadow duration-300 scroll-mt-24 ${
                  i === yourIndex
                    ? 'border-accent/55 bg-accent/[0.12] ring-2 ring-accent/35 shadow-[0_0_20px_rgba(167,139,246,0.15)]'
                    : 'border-border bg-surface/80'
                }`}
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
        </>
      )}
    </div>
  )
}
