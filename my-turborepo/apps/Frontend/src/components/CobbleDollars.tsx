import { useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchCobbleDollarsLeaderboard,
  fetchPcoLeaderboard,
  fetchWebsiteCobbledollarsLeaderboard,
} from '../api'
import type { CobbleDollarsLeaderboardResponse } from '../types'
import { ignNamesMatch, scrollElementIntoViewCentered } from '../ignMatch'

export type EconomyLeaderboardKind = 'cobble' | 'website_cobble' | 'pco'

/** In-game economy top 10 — Leaderboard → Economy. */
export function CobbleDollars({
  viewerIgn,
  kind = 'cobble',
}: {
  viewerIgn?: string | null
  kind?: EconomyLeaderboardKind
}) {
  const [data, setData] = useState<CobbleDollarsLeaderboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const api =
      kind === 'pco'
        ? fetchPcoLeaderboard
        : kind === 'website_cobble'
          ? fetchWebsiteCobbledollarsLeaderboard
          : fetchCobbleDollarsLeaderboard
    api()
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
  }, [kind])

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

  const panelClass = 'p-8 text-center pixel-panel'
  const currency = kind === 'pco' ? 'PCO' : kind === 'website_cobble' ? 'AsterynPoints' : 'Cobble$'
  const title =
    kind === 'pco'
      ? 'In-game PCO (top 10)'
      : kind === 'website_cobble'
        ? 'Website AsterynPoints (top 10)'
        : 'In-game Cobble$ (top 10)'
  const subtitle =
    kind === 'pco'
      ? 'Richest players by in-game PCO.'
      : kind === 'website_cobble'
        ? 'Highest balances on this site (wallet AsterynPoints, not Minecraft).'
        : 'Richest players by in-game Cobble$.'
  const balanceClass =
    kind === 'pco' ? 'text-cyan-300' : 'text-[#fbbf24]'
  const ringClass = kind === 'pco' ? 'ring-cyan-400/50' : 'ring-amber-400/60'

  if (loading) {
    return (
      <div className={panelClass}>
        Loading {kind === 'website_cobble' ? 'website' : 'in-game'} {currency} leaderboard…
      </div>
    )
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
        <div className="p-8 text-center pixel-panel-soft text-muted text-base">
          {currency} leaderboard is not available on this site right now.
        </div>
      ) : data.error ? (
        <div className="p-8 text-center pixel-panel-soft text-error text-base">
          Could not load {kind === 'website_cobble' ? 'website' : 'server'} balances: {data.error}
        </div>
      ) : data.top10.length === 0 ? (
        <div className="p-8 text-center pixel-panel-soft text-muted text-base">
          {kind === 'website_cobble'
            ? `No website ${currency} balances yet — earn AsterynPoints from streaks, PvP payouts, and other site rewards.`
            : `No ${currency} balances returned yet. Play on the server to appear on the leaderboard.`}
        </div>
      ) : (
        <>
          <header>
            <h3 className="text-base font-semibold m-0 mb-1 text-[#e2e8f0]">{title}</h3>
            <p className="text-base text-muted m-0">{subtitle}</p>
            {data.updatedAt && (
              <p className="text-xs text-muted/80 m-0 mt-2">
                Last refreshed: {new Date(data.updatedAt).toLocaleString()} · updates about every ~90 seconds
              </p>
            )}
          </header>

          {yourIndex >= 0 && data.top10[yourIndex] ? (
            <div
              className={`pixel-panel-soft px-4 py-3 ring-2 ${ringClass}`}
              role="status"
              aria-live="polite"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-accent m-0 mb-1">Your position</p>
              <p className="text-sm text-[#e2e8f0] m-0">
                <span className="font-mono font-semibold">{data.top10[yourIndex].name}</span> — rank{' '}
                <strong className="tabular-nums text-accent">{yourIndex + 1}</strong> with{' '}
                <strong className={`tabular-nums ${balanceClass}`}>
                  {Number(data.top10[yourIndex].balance).toLocaleString()}
                </strong>{' '}
                {currency}
              </p>
            </div>
          ) : null}

          <ol className="list-none m-0 p-0 space-y-2">
            {data.top10.map((row, i) => (
              <li
                key={`${row.name}-${row.balance}-${i}`}
                ref={i === yourIndex ? youRowRef : undefined}
                className={`flex items-center justify-between gap-3 pixel-panel-soft px-4 py-3 scroll-mt-24 transition-[filter] duration-150 ${
                  i === yourIndex ? `ring-2 ${ringClass} brightness-110` : ''
                }`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center pixel-well text-base font-bold tabular-nums text-accent">
                    {i + 1}
                  </span>
                  <span className="font-mono text-base text-[#e2e8f0] truncate" title={row.name}>
                    {row.name}
                  </span>
                </span>
                <span className={`shrink-0 text-base font-bold tabular-nums ${balanceClass}`}>
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
