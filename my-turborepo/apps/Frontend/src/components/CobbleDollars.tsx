import { useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchAsterynPointLeaderboard,
  fetchCobbleDollarsLeaderboard,
  fetchPcoLeaderboard,
  fetchWebsiteCobbledollarsLeaderboard,
} from '../api'
import type { CobbleDollarsLeaderboardResponse } from '../types'
import { ignNamesMatch, scrollElementIntoViewCentered } from '../ignMatch'
import {
  INGAME_ASTERYN_POINT_LABEL,
  INGAME_ASTERYN_POINT_SINGULAR,
  WEBSITE_CURRENCY_LABEL,
  WEBSITE_CURRENCY_SINGULAR,
} from '../currencyLabel'
import {
  INGAME_AP_TO_WEBSITE_COIN_TABLE,
  websiteCoinRewardForIngameApRank,
} from '../ingameAsterynPointCoinRewards'

export type EconomyLeaderboardKind = 'cobble' | 'website_cobble' | 'pco' | 'asteryn_ingame'

/** In-game economy top 10 / top 20 — Leaderboard → Economy. */
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
          : kind === 'asteryn_ingame'
            ? fetchAsterynPointLeaderboard
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
  const isIngameAp = kind === 'asteryn_ingame'
  const isWebsite = kind === 'website_cobble'
  const currency =
    kind === 'pco' ? 'PCO' : kind === 'cobble' ? 'Cobble$' : isIngameAp ? INGAME_ASTERYN_POINT_LABEL : WEBSITE_CURRENCY_LABEL
  const title =
    kind === 'pco'
      ? 'In-game PCO (top 10)'
      : isWebsite
        ? `Website ${WEBSITE_CURRENCY_LABEL} (top 10)`
        : isIngameAp
          ? `In-game ${INGAME_ASTERYN_POINT_LABEL} (top 20)`
          : 'In-game Cobble$ (top 10)'
  const subtitle =
    kind === 'pco'
      ? 'Richest players by in-game PCO.'
      : isWebsite
        ? `Highest balances on this site (wallet ${WEBSITE_CURRENCY_LABEL}, not Minecraft).`
        : isIngameAp
          ? `Richest players by in-game ${INGAME_ASTERYN_POINT_LABEL}. Top 20 ranks convert to website ${WEBSITE_CURRENCY_LABEL} (not 1:1).`
          : 'Richest players by in-game Cobble$.'
  const balanceClass =
    kind === 'pco' ? 'text-cyan-300' : isIngameAp || kind === 'website_cobble' ? 'text-violet-300' : 'text-[#fbbf24]'
  const ringClass =
    kind === 'pco'
      ? 'ring-cyan-400/50'
      : isIngameAp || kind === 'website_cobble'
        ? 'ring-violet-400/50'
        : 'ring-amber-400/60'

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
            ? `No website ${currency} balances yet — earn ${WEBSITE_CURRENCY_LABEL} from streaks, PvP payouts, and other site rewards.`
            : isIngameAp
              ? `No player has earned ${INGAME_ASTERYN_POINT_LABEL} yet.`
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

          {isIngameAp ? (
            <div className="pixel-panel-soft px-4 py-3 text-sm text-muted">
              <p className="m-0 mb-2 font-semibold text-[#e2e8f0]">
                Website {WEBSITE_CURRENCY_LABEL} reward by rank
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
                {INGAME_AP_TO_WEBSITE_COIN_TABLE.map((row) => (
                  <span key={row.label} className="tabular-nums">
                    Rank {row.label}:{' '}
                    <strong className="text-violet-300">
                      {row.coins} {WEBSITE_CURRENCY_SINGULAR}
                      {row.coins === 1 ? '' : 's'}
                    </strong>
                  </span>
                ))}
              </div>
            </div>
          ) : null}

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
                {isIngameAp && websiteCoinRewardForIngameApRank(yourIndex + 1) != null ? (
                  <>
                    {' '}
                    →{' '}
                    <strong className="tabular-nums text-violet-300">
                      +{websiteCoinRewardForIngameApRank(yourIndex + 1)} {WEBSITE_CURRENCY_SINGULAR}
                      {websiteCoinRewardForIngameApRank(yourIndex + 1) === 1 ? '' : 's'}
                    </strong>{' '}
                    on website
                  </>
                ) : null}
              </p>
            </div>
          ) : null}

          <ol className="list-none m-0 p-0 space-y-2">
            {data.top10.map((row, i) => {
              const rank = i + 1
              const coinReward = isIngameAp ? websiteCoinRewardForIngameApRank(rank) : null
              return (
              <li
                key={`${row.name}-${row.balance}-${i}`}
                ref={i === yourIndex ? youRowRef : undefined}
                className={`flex items-center justify-between gap-3 pixel-panel-soft px-4 py-3 scroll-mt-24 transition-[filter] duration-150 ${
                  i === yourIndex ? `ring-2 ${ringClass} brightness-110` : ''
                }`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center pixel-well text-base font-bold tabular-nums text-accent">
                    {rank}
                  </span>
                  <span className="font-mono text-base text-[#e2e8f0] truncate" title={row.name}>
                    {row.name}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={`block text-base font-bold tabular-nums ${balanceClass}`}>
                    {Number(row.balance).toLocaleString()}
                    {isIngameAp ? (
                      <span className="text-xs font-normal text-muted ml-1">{INGAME_ASTERYN_POINT_SINGULAR}</span>
                    ) : null}
                  </span>
                  {coinReward != null ? (
                    <span className="block text-xs font-semibold tabular-nums text-violet-300 mt-0.5">
                      +{coinReward} {WEBSITE_CURRENCY_SINGULAR}
                      {coinReward === 1 ? '' : 's'}
                    </span>
                  ) : null}
                </span>
              </li>
            )})}
          </ol>
        </>
      )}
    </div>
  )
}
