import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import {
  fetchBattleTowerLeaderboard,
  fetchCobbleDollarsLeaderboard,
  fetchPcoLeaderboard,
  fetchWebsiteCobbledollarsLeaderboard,
  fetchLeaderboard,
} from '../api'
import { ignNamesMatch, scrollElementIntoViewCentered } from '../ignMatch'
import type {
  BattleTowerLeaderboardResponse,
  BattleTowerLeaderboardRow,
  CobbleDollarsLeaderboardResponse,
  LeaderboardFormat,
  LeaderboardPlayer,
  LeaderboardResponse,
} from '../types'
import { normalizePvpTierSlugForAssets, PvPTierBadge } from './PvPTierBadge.tsx'

type MainSection = 'ranks' | 'economy' | 'battle'
type RankFormatId = 'singles' | 'doubles'
type BattleModeId = 'singles' | 'doubles' | 'co-op' | 'boss'
type EconomyKind = 'cobble' | 'website_cobble' | 'pco'

const MAIN_SECTIONS: { id: MainSection; label: string; description: string }[] = [
  { id: 'ranks', label: 'Ranks', description: 'PvP ELO & tiers' },
  { id: 'economy', label: 'Economy', description: 'Website or in-game Cobble$, or PCO top 10' },
  { id: 'battle', label: 'Battle Tower', description: 'Floors & streaks' },
]

const RANK_FORMATS: { id: RankFormatId; label: string }[] = [
  { id: 'singles', label: 'Singles' },
  { id: 'doubles', label: 'Doubles' },
]

const BATTLE_MODES: { id: BattleModeId; label: string; apiMode: string }[] = [
  { id: 'singles', label: 'Singles', apiMode: 'singles' },
  { id: 'doubles', label: 'Doubles', apiMode: 'doubles' },
  { id: 'co-op', label: 'Co-op', apiMode: 'coop' },
  { id: 'boss', label: 'Boss', apiMode: 'boss' },
]

const TIER_COLOR_CLASS: Record<string, string> = {
  copper: 'text-amber-600',
  iron: 'text-slate-300',
  gold: 'text-amber-300',
  emerald: 'text-emerald-300',
  diamond: 'text-cyan-300',
  netherite: 'text-netherite',
}

function getFormatDisplayName(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1).toLowerCase()
}

function getFormatById(formats: Record<string, LeaderboardFormat>, id: string): LeaderboardFormat | undefined {
  const key = Object.keys(formats).find((k) => k.toLowerCase() === id)
  return key ? formats[key] : undefined
}

const RANK_TIERS_BY_ELO: { minElo: number; displayName: string; slug: string }[] = [
  { minElo: 1350, displayName: 'Netherite', slug: 'netherite' },
  { minElo: 1250, displayName: 'Diamond', slug: 'diamond' },
  { minElo: 1175, displayName: 'Emerald', slug: 'emerald' },
  { minElo: 1100, displayName: 'Gold', slug: 'gold' },
  { minElo: 1050, displayName: 'Iron', slug: 'iron' },
  { minElo: 0, displayName: 'Copper', slug: 'copper' },
]

function getTier(elo: number): { displayName: string; slug: string } {
  const tier = RANK_TIERS_BY_ELO.find((t) => elo >= t.minElo)
  return tier ?? { displayName: 'Copper', slug: 'copper' }
}

function MainTab({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`py-3 px-5 rounded-xl text-sm font-semibold transition-all duration-200 border ${
        active
          ? 'border-amber-400/50 text-amber-100 bg-amber-600/20 shadow-[0_0_20px_rgba(232,168,56,0.22)] ring-1 ring-amber-400/30'
          : 'border-white/10 text-slate-400 bg-black/20 hover:text-white hover:bg-white/5 hover:border-white/20'
      }`}
    >
      {children}
    </button>
  )
}

function SubTab({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`py-2.5 px-4 rounded-xl text-sm font-medium transition-all duration-200 border ${
        active
          ? 'border-amber-400/45 text-amber-100 bg-amber-600/15 shadow-[0_0_16px_rgba(232,168,56,0.18)] ring-1 ring-amber-400/25'
          : 'border-white/10 text-slate-400 bg-black/15 hover:text-white hover:bg-white/5'
      }`}
    >
      {children}
    </button>
  )
}

function BattleTowerMetricColumn({
  title,
  rows,
  fallbackLines,
  metric,
  viewerIgn,
  youRowRef,
}: {
  title: string
  rows: BattleTowerLeaderboardRow[]
  fallbackLines: string[]
  metric: 'floor' | 'streak'
  viewerIgn?: string | null
  youRowRef?: RefObject<HTMLLIElement | null>
}) {
  const hasParsed = rows.length > 0
  const hasFallback = fallbackLines.length > 0

  const firstYouKey = useMemo(() => {
    if (!viewerIgn?.trim() || !rows.length) return null
    const row = rows.find((r) => ignNamesMatch(viewerIgn, r.name))
    return row ? `${metric}-${row.rank}-${row.name}` : null
  }, [rows, viewerIgn, metric])

  const metricLabel = (row: BattleTowerLeaderboardRow) => {
    if (metric === 'floor') {
      if (row.floor != null) return <span className="text-white">Floor {row.floor}</span>
      if (row.detail) {
        return (
          <span className="block text-sm text-slate-200/90 truncate font-normal" title={row.detail}>
            {row.detail}
          </span>
        )
      }
      return null
    }
    if (row.streak != null) return <span className="text-white">Streak {row.streak}</span>
    if (row.detail) {
      return (
        <span className="block text-sm text-slate-200/90 truncate font-normal" title={row.detail}>
          {row.detail}
        </span>
      )
    }
    return null
  }

  return (
    <div className="space-y-3 min-w-0">
      <h4 className="text-sm font-semibold m-0 text-slate-100">{title}</h4>
      {hasParsed ? (
        <ol className="list-none m-0 p-0 space-y-2">
          {rows.map((row) => {
            const rowKey = `${metric}-${row.rank}-${row.name}`
            const isYou = firstYouKey === rowKey
            return (
            <li
              key={rowKey}
              ref={isYou ? youRowRef : undefined}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-shadow duration-300 scroll-mt-24 ${
                isYou
                  ? 'border-amber-400/50 bg-amber-500/10 ring-2 ring-amber-400/35 shadow-[0_0_20px_rgba(232,168,56,0.2)]'
                  : 'border-white/5 bg-black/25'
              }`}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sm font-bold tabular-nums text-sky-300">
                  {row.rank}
                </span>
                <span className="font-mono text-sm text-white truncate" title={row.name}>
                  {row.name}
                  {row.legendary ? (
                    <span className="ml-1 text-amber-300 font-semibold" title="Used legendary">
                      (L)
                    </span>
                  ) : null}
                </span>
              </span>
              <span className="shrink-0 text-sm text-slate-400 tabular-nums text-right max-w-[min(100%,16rem)]">
                {metricLabel(row)}
              </span>
            </li>
            )
          })}
        </ol>
      ) : null}
      {!hasParsed && hasFallback ? (
        <ol className="list-none m-0 p-0 space-y-2">
          {fallbackLines.map((line, idx) => (
            <li
              key={`${metric}-fb-${idx}-${line.slice(0, 24)}`}
              className="flex items-start gap-3 rounded-xl border border-white/5 bg-black/25 px-4 py-3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sm font-bold tabular-nums text-sky-300">
                {idx + 1}
              </span>
              <span className="text-sm text-slate-200/95 leading-snug break-words min-w-0 pt-0.5">{line}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {!hasParsed && !hasFallback ? (
        <p className="text-sm text-slate-500 m-0">No entries for this list.</p>
      ) : null}
    </div>
  )
}

/**
 * Same structure as the public site Leaderboard (Ranks / Economy / Battle Tower), themed for Server Dashboard.
 */
export function DashboardLeaderboardPanel({ viewerUsername }: { viewerUsername?: string }) {
  const viewerIgn = viewerUsername?.trim() ?? null

  const rankYouRef = useRef<HTMLTableRowElement>(null)
  const cdYouRef = useRef<HTMLLIElement>(null)
  const battleFloorYouRef = useRef<HTMLLIElement>(null)
  const battleStreakYouRef = useRef<HTMLLIElement>(null)

  const [mainSection, setMainSection] = useState<MainSection>('ranks')
  const [economyKind, setEconomyKind] = useState<EconomyKind>('website_cobble')
  const [rankFormatId, setRankFormatId] = useState<RankFormatId>('singles')
  const [battleMode, setBattleMode] = useState<BattleModeId>('singles')

  const [lbData, setLbData] = useState<LeaderboardResponse | null>(null)
  const [lbLoading, setLbLoading] = useState(true)
  const [lbError, setLbError] = useState<string | null>(null)

  const [cdData, setCdData] = useState<CobbleDollarsLeaderboardResponse | null>(null)
  const [cdLoading, setCdLoading] = useState(false)
  const [cdError, setCdError] = useState<string | null>(null)

  const [btData, setBtData] = useState<BattleTowerLeaderboardResponse | null>(null)
  const [btLoading, setBtLoading] = useState(false)
  const [btError, setBtError] = useState<string | null>(null)

  useEffect(() => {
    setLbLoading(true)
    setLbError(null)
    fetchLeaderboard()
      .then(setLbData)
      .catch((e) => setLbError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLbLoading(false))
  }, [])

  useEffect(() => {
    if (mainSection !== 'economy') return
    let cancelled = false
    setCdLoading(true)
    setCdError(null)
    const api =
      economyKind === 'pco'
        ? fetchPcoLeaderboard
        : economyKind === 'website_cobble'
          ? fetchWebsiteCobbledollarsLeaderboard
          : fetchCobbleDollarsLeaderboard
    api()
      .then((d) => {
        if (!cancelled) setCdData(d)
      })
      .catch((e) => {
        if (!cancelled) setCdError(e instanceof Error ? e.message : 'Failed to load')
      })
      .finally(() => {
        if (!cancelled) setCdLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [mainSection, economyKind])

  const battleApiMode = BATTLE_MODES.find((m) => m.id === battleMode)?.apiMode ?? 'singles'

  const loadBattleTower = useCallback(() => {
    setBtLoading(true)
    setBtError(null)
    fetchBattleTowerLeaderboard({ mode: battleApiMode, top: 10 })
      .then(setBtData)
      .catch((e) => {
        setBtData(null)
        setBtError(e instanceof Error ? e.message : 'Failed to load')
      })
      .finally(() => setBtLoading(false))
  }, [battleApiMode])

  useEffect(() => {
    if (mainSection !== 'battle') return
    loadBattleTower()
  }, [mainSection, loadBattleTower])

  const panelClass =
    'p-8 text-center rounded-2xl border border-white/10 bg-surface/40 text-slate-400'

  const formats = lbData?.formats ?? {}
  const rankFormat = getFormatById(formats, rankFormatId)
  const rankPlayers: LeaderboardPlayer[] = useMemo(() => {
    const players = rankFormat?.players ?? []
    return players.filter((p) => p.matches > 0).map((p, idx) => ({ ...p, rank: idx + 1 }))
  }, [rankFormat?.players])

  const yourRankPlayer = useMemo(() => {
    if (!viewerIgn) return undefined
    return rankPlayers.find((p) => ignNamesMatch(viewerIgn, p.playerName))
  }, [rankPlayers, viewerIgn])

  const yourRankTier = useMemo(() => (yourRankPlayer ? getTier(yourRankPlayer.elo) : null), [yourRankPlayer])

  useEffect(() => {
    if (mainSection !== 'ranks' || !yourRankPlayer) return
    scrollElementIntoViewCentered(rankYouRef.current)
  }, [mainSection, yourRankPlayer?.uuid, rankFormatId])

  const cdYourIndex = useMemo(() => {
    if (!viewerIgn) return -1
    const rows = cdData?.top10
    if (!rows?.length) return -1
    return rows.findIndex((row) => ignNamesMatch(viewerIgn, row.name))
  }, [cdData?.top10, viewerIgn])

  useEffect(() => {
    if (mainSection !== 'economy' || cdYourIndex < 0) return
    scrollElementIntoViewCentered(cdYouRef.current)
  }, [mainSection, cdYourIndex, cdData?.top10])

  const battleFloorYou = useMemo(() => {
    if (!viewerIgn || !btData) return undefined
    return btData.floorRows.find((r) => ignNamesMatch(viewerIgn, r.name))
  }, [btData, viewerIgn])

  const battleStreakYou = useMemo(() => {
    if (!viewerIgn || !btData) return undefined
    return btData.streakRows.find((r) => ignNamesMatch(viewerIgn, r.name))
  }, [btData, viewerIgn])

  useEffect(() => {
    if (mainSection !== 'battle' || !btData) return
    const el = battleFloorYouRef.current ?? battleStreakYouRef.current
    scrollElementIntoViewCentered(el)
  }, [mainSection, btData, battleApiMode, battleFloorYou, battleStreakYou])

  const mainDescription = MAIN_SECTIONS.find((s) => s.id === mainSection)?.description ?? ''

  const econTab = useMemo(() => {
    const isPco = economyKind === 'pco'
    const isWebsite = economyKind === 'website_cobble'
    return {
      isPco,
      isWebsite,
      loadKind: isPco ? 'PCO' : isWebsite ? 'website Cobble$' : 'in-game Cobble$',
      title: isPco ? 'In-game PCO (top 10)' : isWebsite ? 'Website Cobble$ (top 10)' : 'In-game Cobble$ (top 10)',
      blurb: isWebsite
        ? 'Top 10 site wallet balances (GET /leaderboard/website-cobbledollars — same as public Leaderboard).'
        : isPco
          ? 'PCO top 10 from pco top (RCON). Separate from website Cobble$.'
          : 'In-game Cobble$ top 10 (RCON; same public endpoint as the website).',
      balanceUnit: isPco ? 'PCO' : 'Cobble$',
    }
  }, [economyKind])

  return (
    <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-stone-950/50 via-slate-950/40 to-slate-950/60 p-5 sm:p-6 shadow-xl shadow-black/20">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-semibold text-white m-0 flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_8px_#e8a838]" />
            Leaderboards
          </h2>
          <p className="text-xs text-slate-500 m-0 mt-1">
            Same views as the public site — PvP ranks, Cobble$ or PCO economy top 10, Battle Tower (public API, ~90s
            cache). Your admin username highlights matching in-game names.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-2" role="tablist" aria-label="Leaderboard category">
        {MAIN_SECTIONS.map(({ id, label }) => (
          <MainTab key={id} active={mainSection === id} onClick={() => setMainSection(id)}>
            {label}
          </MainTab>
        ))}
      </div>
      <p className="text-xs text-slate-500 m-0 mb-6">{mainDescription}</p>

      {mainSection === 'ranks' && (
        <section className="space-y-5" aria-labelledby="dash-ranks-heading">
          <h3 id="dash-ranks-heading" className="sr-only">
            Ranks
          </h3>
          {lbData?.timestamp && (
            <p className="text-xs text-slate-500 m-0">
              Rank data updated: {new Date(lbData.timestamp).toLocaleString()}
            </p>
          )}
          {lbLoading ? (
            <div className={panelClass}>Loading ranks…</div>
          ) : lbError ? (
            <div className={`${panelClass} text-red-300`}>Error: {lbError}</div>
          ) : !lbData || Object.keys(lbData).length === 0 ? (
            <div className={panelClass}>No leaderboard yet. Sync from the server to see data.</div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Rank format">
                {RANK_FORMATS.map(({ id, label }) => (
                  <SubTab key={id} active={rankFormatId === id} onClick={() => setRankFormatId(id)}>
                    {label}
                  </SubTab>
                ))}
              </div>
              {lbData.seasonName && (
                <p className="text-sm font-medium text-slate-100 m-0">{lbData.seasonName}</p>
              )}
              {lbData.serverId && <p className="text-xs text-slate-500 m-0">Server: {lbData.serverId}</p>}
              {rankPlayers.length === 0 ? (
                <div className={panelClass}>No entries for {getFormatDisplayName(rankFormatId)} yet.</div>
              ) : (
                <>
                  {yourRankPlayer ? (
                    <div
                      className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 mb-3 shadow-[0_0_20px_rgba(232,168,56,0.15)]"
                      role="status"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-200 m-0 mb-1">
                        Your current rank
                      </p>
                      <p className="text-sm text-slate-100 m-0">
                        <span className="font-mono font-semibold">{yourRankPlayer.playerName}</span> —{' '}
                        <strong className="text-amber-200 tabular-nums">#{yourRankPlayer.rank}</strong> in{' '}
                        {getFormatDisplayName(rankFormatId)} · {yourRankPlayer.elo} ELO ·{' '}
                        {yourRankTier ? (
                          <PvPTierBadge
                            slug={normalizePvpTierSlugForAssets(yourRankTier.slug)}
                            displayName={yourRankTier.displayName}
                            fallbackTextClassName={TIER_COLOR_CLASS[yourRankTier.slug] ?? 'text-slate-400'}
                            imgHeightClass="h-6"
                            className="align-middle ml-1"
                          />
                        ) : null}
                      </p>
                    </div>
                  ) : viewerIgn ? (
                    <p className="text-xs text-slate-500 m-0 mb-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                      No match for <span className="font-mono text-slate-300">{viewerIgn}</span> in this format.
                    </p>
                  ) : null}
                <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/20">
                  <table className="w-full border-collapse text-sm min-w-[640px]">
                    <thead>
                      <tr>
                        <th className="text-left py-2.5 px-3 font-semibold text-slate-500 border-b border-white/10">
                          Rank
                        </th>
                        <th className="text-left py-2.5 px-3 font-semibold text-slate-500 border-b border-white/10">
                          Player
                        </th>
                        <th className="text-left py-2.5 px-3 font-semibold text-slate-500 border-b border-white/10">
                          ELO
                        </th>
                        <th className="text-left py-2.5 px-3 font-semibold text-slate-500 border-b border-white/10">
                          Tier
                        </th>
                        <th className="text-left py-2.5 px-3 font-semibold text-slate-500 border-b border-white/10">
                          W
                        </th>
                        <th className="text-left py-2.5 px-3 font-semibold text-slate-500 border-b border-white/10">
                          L
                        </th>
                        <th className="text-left py-2.5 px-3 font-semibold text-slate-500 border-b border-white/10">
                          Matches
                        </th>
                        <th className="text-left py-2.5 px-3 font-semibold text-slate-500 border-b border-white/10">
                          Win %
                        </th>
                        <th className="text-left py-2.5 px-3 font-semibold text-slate-500 border-b border-white/10">
                          Streak
                        </th>
                        <th className="text-left py-2.5 px-3 font-semibold text-slate-500 border-b border-white/10">
                          Best
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankPlayers.map((p) => {
                        const tier = getTier(p.elo)
                        const isYou = yourRankPlayer ? p.uuid === yourRankPlayer.uuid : false
                        return (
                          <tr
                            key={p.uuid}
                            ref={isYou ? rankYouRef : undefined}
                            className={`scroll-mt-24 ${
                              isYou
                                ? 'bg-amber-500/10 ring-1 ring-inset ring-amber-400/30 hover:bg-amber-500/[0.14]'
                                : 'hover:bg-white/[0.04]'
                            }`}
                          >
                            <td className="py-2.5 px-3 w-16 text-slate-500 border-b border-white/5">{p.rank}</td>
                            <td className="py-2.5 px-3 font-medium text-slate-100 border-b border-white/5">
                              {p.playerName}
                            </td>
                            <td className="py-2.5 px-3 w-16 border-b border-white/5">{p.elo}</td>
                            <td className="py-2.5 px-3 border-b border-white/5 align-middle">
                              <PvPTierBadge
                                slug={normalizePvpTierSlugForAssets(tier.slug)}
                                displayName={tier.displayName}
                                fallbackTextClassName={TIER_COLOR_CLASS[tier.slug] ?? 'text-slate-400'}
                              />
                            </td>
                            <td className="py-2.5 px-3 w-16 border-b border-white/5">{p.wins}</td>
                            <td className="py-2.5 px-3 w-16 border-b border-white/5">{p.losses}</td>
                            <td className="py-2.5 px-3 w-16 border-b border-white/5">{p.matches}</td>
                            <td className="py-2.5 px-3 w-16 border-b border-white/5">{p.winRate.toFixed(1)}%</td>
                            <td className="py-2.5 px-3 w-16 border-b border-white/5">{p.currentStreak}</td>
                            <td className="py-2.5 px-3 w-16 border-b border-white/5">{p.bestStreak}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </>
          )}
        </section>
      )}

      {mainSection === 'economy' && (
        <section className="space-y-4" aria-labelledby="dash-economy-heading">
          <h3 id="dash-economy-heading" className="text-base font-semibold m-0 text-white">
            Economy
          </h3>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Economy currency">
            <SubTab active={economyKind === 'website_cobble'} onClick={() => setEconomyKind('website_cobble')}>
              Website C$
            </SubTab>
            <SubTab active={economyKind === 'cobble'} onClick={() => setEconomyKind('cobble')}>
              In-game C$
            </SubTab>
            <SubTab active={economyKind === 'pco'} onClick={() => setEconomyKind('pco')}>
              PCO
            </SubTab>
          </div>
          <p className="text-sm text-slate-500 m-0">{econTab.blurb}</p>
          {cdLoading ? (
            <div className={panelClass}>Loading {econTab.loadKind} leaderboard…</div>
          ) : cdError ? (
            <div className={`${panelClass} text-red-300`}>Error: {cdError}</div>
          ) : !cdData ? (
            <div className={panelClass}>No data.</div>
          ) : cdData.disabled ? (
            <div className={panelClass}>
              {econTab.isPco ? 'PCO' : econTab.isWebsite ? 'Website Cobble$' : 'In-game Cobble$'} leaderboard is
              disabled on this deployment.
            </div>
          ) : cdData.error ? (
            <div className={`${panelClass} text-red-300 text-sm`}>
              Could not load{econTab.isWebsite ? ' website' : econTab.isPco ? '' : ' server'} balances:{' '}
              {cdData.error}
            </div>
          ) : cdData.top10.length === 0 ? (
            <div className={panelClass}>
              No {econTab.isPco ? 'PCO' : 'Cobble$'} balances returned yet.
            </div>
          ) : (
            <>
              <header>
                <h4 className="text-sm font-semibold m-0 mb-1 text-slate-100">{econTab.title}</h4>
                {cdData.updatedAt && (
                  <p className="text-xs text-slate-500 m-0">
                    Last refreshed: {new Date(cdData.updatedAt).toLocaleString()} · ~90s cache
                  </p>
                )}
              </header>
              {cdYourIndex >= 0 && cdData.top10[cdYourIndex] ? (
                <div
                  className={`rounded-xl border px-4 py-3 mb-3 max-w-2xl ${
                    econTab.isPco
                      ? 'border-cyan-400/40 bg-cyan-500/10'
                      : 'border-amber-400/40 bg-amber-500/10'
                  }`}
                  role="status"
                >
                  <p
                    className={`text-xs font-semibold uppercase tracking-wide m-0 mb-1 ${
                      econTab.isPco ? 'text-cyan-200' : 'text-amber-200'
                    }`}
                  >
                    Your position
                  </p>
                  <p className="text-sm text-slate-100 m-0">
                    <span className="font-mono font-semibold">{cdData.top10[cdYourIndex].name}</span> — rank{' '}
                    <strong
                      className={`tabular-nums ${econTab.isPco ? 'text-cyan-200' : 'text-amber-200'}`}
                    >
                      {cdYourIndex + 1}
                    </strong>{' '}
                    with{' '}
                    <strong
                      className={`tabular-nums ${econTab.isPco ? 'text-cyan-200' : 'text-amber-200'}`}
                    >
                      {Number(cdData.top10[cdYourIndex].balance).toLocaleString()}
                    </strong>{' '}
                    {econTab.balanceUnit}
                  </p>
                </div>
              ) : null}
              <ol className="list-none m-0 p-0 space-y-2 max-w-2xl">
                {cdData.top10.map((row, i) => (
                  <li
                    key={`${row.name}-${row.balance}-${i}`}
                    ref={i === cdYourIndex ? cdYouRef : undefined}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-shadow scroll-mt-24 ${
                      i === cdYourIndex
                        ? econTab.isPco
                          ? 'border-cyan-400/50 bg-cyan-500/10 ring-2 ring-cyan-400/35'
                          : 'border-amber-400/50 bg-amber-500/10 ring-2 ring-amber-400/35'
                        : 'border-white/5 bg-black/25'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold tabular-nums ${
                          econTab.isPco
                            ? 'bg-cyan-500/15 text-cyan-300'
                            : 'bg-amber-500/15 text-amber-300'
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span className="font-mono text-sm text-white truncate" title={row.name}>
                        {row.name}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 text-sm font-semibold tabular-nums ${
                        econTab.isPco ? 'text-cyan-100' : 'text-amber-100'
                      }`}
                    >
                      {Number(row.balance).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      )}

      {mainSection === 'battle' && (
        <section className="space-y-5" aria-labelledby="dash-battle-heading">
          <h3 id="dash-battle-heading" className="sr-only">
            Battle Tower
          </h3>
          <div className="flex flex-wrap gap-2 items-center justify-between gap-y-3">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Battle Tower mode">
              {BATTLE_MODES.map(({ id, label }) => (
                <SubTab key={id} active={battleMode === id} onClick={() => setBattleMode(id)}>
                  {label}
                </SubTab>
              ))}
            </div>
            <button
              type="button"
              onClick={loadBattleTower}
              disabled={btLoading}
              className="py-2 px-4 rounded-xl text-sm font-medium border border-white/15 text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-50"
            >
              {btLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          <p className="text-xs text-slate-500 m-0">
            Top 10 per mode · <code className="text-sky-300/90">bt leaderboard</code> (RCON) · cached ~90s
          </p>
          {btLoading && !btData ? (
            <div className={panelClass}>Loading Battle Tower…</div>
          ) : btError && !btData ? (
            <div className={`${panelClass} text-red-300`}>Error: {btError}</div>
          ) : !btData ? (
            <div className={panelClass}>No data.</div>
          ) : btData.disabled ? (
            <div className={panelClass}>
              Battle Tower disabled (<code className="text-xs text-slate-400">MC_BT_DISABLE</code>).
            </div>
          ) : btData.error ? (
            <div className={`${panelClass} text-red-300 text-sm`}>Could not load: {btData.error}</div>
          ) : btData.floorRows.length +
              btData.streakRows.length +
              btData.fallbackFloorLines.length +
              btData.fallbackStreakLines.length >
            0 ? (
            <>
              {btData.updatedAt && (
                <p className="text-xs text-slate-500 m-0">
                  Last refreshed: {new Date(btData.updatedAt).toLocaleString()}
                </p>
              )}
              <header>
                <h4 className="text-base font-semibold m-0 mb-1 text-white">Battle Tower (top 10)</h4>
                <p className="text-sm text-slate-500 m-0">
                  Highest floor and highest win streak per mode (from server output).
                </p>
              </header>
              {(battleFloorYou || battleStreakYou) && (
                <div
                  className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3"
                  role="status"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-200 m-0 mb-1.5">
                    Your entries
                  </p>
                  <ul className="m-0 pl-4 text-sm text-slate-100 space-y-1 list-disc marker:text-amber-400/80">
                    {battleFloorYou ? (
                      <li>
                        <span className="font-mono">{battleFloorYou.name}</span> — floor list #
                        <strong className="tabular-nums">{battleFloorYou.rank}</strong>
                        {battleFloorYou.floor != null ? <> · floor {battleFloorYou.floor}</> : null}
                        {battleFloorYou.floor == null && battleFloorYou.detail ? <> · {battleFloorYou.detail}</> : null}
                      </li>
                    ) : null}
                    {battleStreakYou ? (
                      <li>
                        <span className="font-mono">{battleStreakYou.name}</span> — streak list #
                        <strong className="tabular-nums">{battleStreakYou.rank}</strong>
                        {battleStreakYou.streak != null ? <> · streak {battleStreakYou.streak}</> : null}
                        {battleStreakYou.streak == null && battleStreakYou.detail ? (
                          <> · {battleStreakYou.detail}</>
                        ) : null}
                      </li>
                    ) : null}
                  </ul>
                </div>
              )}
              {viewerIgn &&
              !battleFloorYou &&
              !battleStreakYou &&
              btData.floorRows.length + btData.streakRows.length > 0 ? (
                <p className="text-xs text-slate-500 m-0 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  No match for <span className="font-mono text-slate-300">{viewerIgn}</span> in this mode.
                </p>
              ) : null}
              <div className="grid gap-8 md:grid-cols-2">
                <BattleTowerMetricColumn
                  title="Highest floor"
                  rows={btData.floorRows}
                  fallbackLines={btData.fallbackFloorLines}
                  metric="floor"
                  viewerIgn={viewerIgn}
                  youRowRef={battleFloorYouRef}
                />
                <BattleTowerMetricColumn
                  title="Highest win streak"
                  rows={btData.streakRows}
                  fallbackLines={btData.fallbackStreakLines}
                  metric="streak"
                  viewerIgn={viewerIgn}
                  youRowRef={battleStreakYouRef}
                />
              </div>
              {btData.floorRows.length === 0 &&
              btData.streakRows.length === 0 &&
              (btData.fallbackFloorLines.length > 0 || btData.fallbackStreakLines.length > 0) ? (
                <p className="text-xs text-slate-500 m-0">
                  Raw server lines — parser could not split players; update parser if stats look wrong.
                </p>
              ) : null}
            </>
          ) : (
            <div className={`${panelClass} text-sm`}>No entries returned.</div>
          )}
        </section>
      )}
    </div>
  )
}
