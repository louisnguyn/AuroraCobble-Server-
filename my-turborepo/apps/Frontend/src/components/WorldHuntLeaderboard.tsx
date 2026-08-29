import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchWorldHuntLeaderboard } from '../api'
import type { WorldHuntLeaderboardResponse } from '../types'
import { ignNamesMatch, scrollElementIntoViewCentered } from '../ignMatch'

/** World Hunt event top board — Leaderboard → World Hunt. */
export function WorldHuntLeaderboard({ viewerIgn }: { viewerIgn?: string | null }) {
  const [data, setData] = useState<WorldHuntLeaderboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchWorldHuntLeaderboard()
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
    return <div className={panelClass}>Loading World Hunt leaderboard…</div>
  }
  if (error) {
    return <div className={`${panelClass} text-error`}>Error: {error}</div>
  }
  if (!data) {
    return <div className={panelClass}>No data.</div>
  }

  const huntLabel = data.pokemon?.trim() || '—'
  const topLabel =
    data.shownCount != null && data.totalSlots != null
      ? `Top ${data.shownCount}/${data.totalSlots}`
      : data.totalSlots != null
        ? `Top ${data.totalSlots}`
        : null

  return (
    <div className="w-full max-w-2xl space-y-6">
      {data.disabled ? (
        <div className="p-8 text-center pixel-panel-soft text-muted text-base">
          World Hunt leaderboard is not available on this site right now.
        </div>
      ) : data.error ? (
        <div className="p-8 text-center pixel-panel-soft text-error text-base">
          Could not load World Hunt board: {data.error}
        </div>
      ) : data.rows.length === 0 ? (
        <div className="p-8 text-center pixel-panel-soft text-muted text-base">
          {data.pokemon
            ? `No World Hunt scores yet for ${huntLabel}.`
            : 'No active World Hunt event right now.'}
        </div>
      ) : (
        <>
          <header>
            <h3 className="text-base font-semibold m-0 mb-1 text-[#e2e8f0]">
              World Hunt{topLabel ? ` (${topLabel})` : ''}
            </h3>
            <p className="text-base text-muted m-0">
              Current hunt: <span className="font-mono text-pink-300">{huntLabel}</span> · points from{' '}
              <span className="font-mono">/hunt event</span>
            </p>
            {data.updatedAt ? (
              <p className="text-xs text-muted/80 m-0 mt-2">
                Last refreshed: {new Date(data.updatedAt).toLocaleString()} · updates about every ~90 seconds
              </p>
            ) : null}
          </header>

          {yourRow ? (
            <div
              className="pixel-panel-soft px-4 py-3 ring-2 ring-pink-400/50"
              role="status"
              aria-live="polite"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-accent m-0 mb-1">Your position</p>
              <p className="text-sm text-[#e2e8f0] m-0">
                <span className="font-mono font-semibold">{yourRow.name}</span> — rank{' '}
                <strong className="tabular-nums text-accent">{yourRow.rank}</strong> with{' '}
                <strong className="tabular-nums text-pink-300">
                  {Number(yourRow.points).toLocaleString()}
                </strong>{' '}
                Asteryn Point
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
                    isYou ? 'ring-2 ring-pink-400/50 brightness-110' : ''
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
                  <span className="shrink-0 text-base font-bold tabular-nums text-pink-300">
                    {Number(row.points).toLocaleString()}
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
