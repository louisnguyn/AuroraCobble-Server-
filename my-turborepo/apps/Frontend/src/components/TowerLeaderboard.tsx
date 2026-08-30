import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchTowerLeaderboard } from '../api'
import type { TowerLeaderboardResponse } from '../types'
import { ignNamesMatch, scrollElementIntoViewCentered } from '../ignMatch'

function formatTowerTime(time: string | null): string {
  return time?.trim() || '—'
}

/** Endless Tower / Battle Factory board — Leaderboard → Tower. */
export function TowerLeaderboard({ viewerIgn }: { viewerIgn?: string | null }) {
  const [data, setData] = useState<TowerLeaderboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchTowerLeaderboard()
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
  const yourRow = useMemo(() => {
    if (!viewerIgn?.trim() || !data?.rows?.length) return undefined
    return data.rows.find((row) => ignNamesMatch(viewerIgn, row.name))
  }, [data?.rows, viewerIgn])

  useEffect(() => {
    if (!yourRow) return
    scrollElementIntoViewCentered(youRowRef.current)
  }, [yourRow])

  const panelClass = 'p-8 text-center pixel-panel'

  if (loading) {
    return <div className={panelClass}>Loading Tower leaderboard…</div>
  }
  if (error) {
    return <div className={`${panelClass} text-error`}>Error: {error}</div>
  }
  if (!data) {
    return <div className={panelClass}>No data.</div>
  }

  const modeLabel = data.mode?.trim() || 'tower'

  return (
    <div className="w-full max-w-2xl space-y-6">
      {data.disabled ? (
        <div className="p-8 text-center pixel-panel-soft text-muted text-base">
          Tower leaderboard is not available on this site right now.
        </div>
      ) : data.error ? (
        <div className="p-8 text-center pixel-panel-soft text-error text-base">
          Could not load Tower board: {data.error}
        </div>
      ) : data.rows.length === 0 ? (
        <div className="p-8 text-center pixel-panel-soft text-muted text-base">
          No Tower floors recorded yet.
        </div>
      ) : (
        <>
          <header>
            <h3 className="text-base font-semibold m-0 mb-1 text-[#e2e8f0]">
              Battle Factory [{modeLabel}]
            </h3>
            <p className="text-base text-muted m-0">Highest Endless Tower floor reached.</p>
            {data.updatedAt ? (
              <p className="text-xs text-muted/80 m-0 mt-2">
                Last refreshed: {new Date(data.updatedAt).toLocaleString()} · updates about every ~90 seconds
              </p>
            ) : null}
          </header>

          {yourRow ? (
            <div
              className="pixel-panel-soft px-4 py-3 ring-2 ring-cyan-400/50"
              role="status"
              aria-live="polite"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-accent m-0 mb-1">Your position</p>
              <p className="text-sm text-[#e2e8f0] m-0">
                <span className="font-mono font-semibold">{yourRow.name}</span> — rank{' '}
                <strong className="tabular-nums text-accent">{yourRow.rank}</strong> · floor{' '}
                <strong className="tabular-nums text-cyan-300">{yourRow.floor}</strong>
                {' · '}
                time {formatTowerTime(yourRow.time)}
              </p>
            </div>
          ) : null}

          <ol className="list-none m-0 p-0 space-y-2">
            {data.rows.map((row) => {
              const isYou = yourRow?.rank === row.rank && ignNamesMatch(viewerIgn ?? '', row.name)
              return (
                <li
                  key={`${row.rank}-${row.name}`}
                  ref={isYou ? youRowRef : undefined}
                  className={`flex items-center justify-between gap-3 pixel-panel-soft px-4 py-3 scroll-mt-24 transition-[filter] duration-150 ${
                    isYou ? 'ring-2 ring-cyan-400/50 brightness-110' : ''
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center pixel-well text-base font-bold tabular-nums text-accent">
                      {row.rank}
                    </span>
                    <span className="font-mono text-base text-[#e2e8f0] truncate" title={row.name}>
                      {row.name}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-base font-bold tabular-nums text-cyan-300">
                      Floor {row.floor}
                    </span>
                    <span className="block text-xs tabular-nums text-muted mt-0.5">
                      Time {formatTowerTime(row.time)}
                    </span>
                  </span>
                </li>
              )
            })}
          </ol>
        </>
      )}
    </div>
  )
}
