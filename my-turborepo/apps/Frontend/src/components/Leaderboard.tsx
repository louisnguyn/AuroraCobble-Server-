import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { fetchBattleTowerLeaderboard, fetchLeaderboard } from '../api'
import { useAuth } from '../contexts/AuthContext'
import { ignNamesMatch, scrollElementIntoViewCentered } from '../ignMatch'
import type {
  BattleTowerLeaderboardResponse,
  BattleTowerLeaderboardRow,
  LeaderboardResponse,
  LeaderboardFormat,
  LeaderboardPlayer,
} from '../types'
import { CobbleDollars } from './CobbleDollars.tsx'
import { normalizePvpTierSlugForAssets, PvPTierBadge } from './PvPTierBadge.tsx'
import { RankedApiFeed } from './RankedApiFeed.tsx'

type MainSection = 'ranks' | 'economy' | 'battle' | 'ranked'
type RankFormatId = 'singles' | 'doubles'
type BattleModeId = 'singles' | 'doubles' | 'co-op' | 'boss'
type EconomyKind = 'cobble' | 'pco'

const MAIN_SECTIONS: { id: MainSection; label: string; description: string }[] = [
  { id: 'ranks', label: 'Ranks', description: 'PvP ELO & tiers' },
  {
    id: 'economy',
    label: 'Economy',
    description: 'In-game Cobble$ or PCO top 10',
  },
  { id: 'battle', label: 'Battle Tower', description: 'Floors & streaks' },
  {
    id: 'ranked',
    label: 'Ranked feed',
    description: 'CobbleRanked match results summary (teams hidden)',
  },
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
  copper: 'text-copper',
  iron: 'text-iron',
  gold: 'text-gold',
  emerald: 'text-emerald',
  diamond: 'text-diamond',
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

function pvpRankPillClass(rank: number): string {
  if (rank === 1) return 'lb-rank-pill lb-rank-pill--gold'
  if (rank === 2) return 'lb-rank-pill lb-rank-pill--silver'
  if (rank === 3) return 'lb-rank-pill lb-rank-pill--bronze'
  return 'lb-rank-pill lb-rank-pill--muted'
}

/** Primary section tabs (Ranks / Economy / Battle Tower) */
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
      className={`py-3 px-5 text-base font-bold transition-[filter] duration-150 ${
        active ? 'pixel-pill pixel-pill-active-gold' : 'pixel-pill'
      }`}
    >
      {children}
    </button>
  )
}

/** Sub-tabs (Singles / Doubles / …) — matches compact pill style */
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
      className={`py-2.5 px-4 text-base font-semibold transition-[filter] duration-150 ${
        active ? 'pixel-pill pixel-pill-active-accent' : 'pixel-pill'
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
      if (row.floor != null) return <span className="text-[#e2e8f0]">Floor {row.floor}</span>
      if (row.detail) {
        return (
          <span className="block text-sm text-[#e2e8f0]/90 truncate font-normal" title={row.detail}>
            {row.detail}
          </span>
        )
      }
      return null
    }
    if (row.streak != null) return <span className="text-[#e2e8f0]">Streak {row.streak}</span>
    if (row.detail) {
      return (
        <span className="block text-sm text-[#e2e8f0]/90 truncate font-normal" title={row.detail}>
          {row.detail}
        </span>
      )
    }
    return null
  }

  return (
    <div className="space-y-3 min-w-0">
      <h4 className="text-base font-bold m-0 text-[#e2e8f0]">{title}</h4>
      {hasParsed ? (
        <ol className="list-none m-0 p-0 space-y-2">
          {rows.map((row) => {
            const rowKey = `${metric}-${row.rank}-${row.name}`
            const isYou = firstYouKey === rowKey
            return (
            <li
              key={rowKey}
              ref={isYou ? youRowRef : undefined}
              className={`flex flex-wrap items-center justify-between gap-3 pixel-panel-soft px-4 py-3 scroll-mt-24 transition-[filter] duration-150 ${
                isYou ? 'ring-2 ring-amber-400/60 brightness-110' : ''
              }`}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center pixel-well text-base font-bold tabular-nums text-amber-400/90">
                  {row.rank}
                </span>
                <span className="font-mono text-base text-[#e2e8f0] truncate" title={row.name}>
                  {row.name}
                  {row.legendary ? (
                    <span className="ml-1 text-amber-400 font-semibold" title="Used legendary">
                      (L)
                    </span>
                  ) : null}
                </span>
              </span>
              <span className="shrink-0 text-base text-muted tabular-nums text-right max-w-[min(100%,16rem)]">
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
              className="flex items-start gap-3 pixel-panel-soft px-4 py-3"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center pixel-well text-base font-bold tabular-nums text-amber-400/90">
                {idx + 1}
              </span>
              <span className="text-base text-[#e2e8f0]/95 leading-snug break-words min-w-0 pt-0.5">{line}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {!hasParsed && !hasFallback ? (
        <p className="text-base text-muted m-0">No entries for this list.</p>
      ) : null}
    </div>
  )
}

export function Leaderboard() {
  const { user, isAuthenticated } = useAuth()
  const viewerIgn = user?.username?.trim() ?? null

  const [mainSection, setMainSection] = useState<MainSection>('ranks')
  const [economyKind, setEconomyKind] = useState<EconomyKind>('cobble')
  const [rankFormatId, setRankFormatId] = useState<RankFormatId>('singles')
  const [battleMode, setBattleMode] = useState<BattleModeId>('singles')

  const rankYouRef = useRef<HTMLTableRowElement>(null)
  const battleFloorYouRef = useRef<HTMLLIElement>(null)
  const battleStreakYouRef = useRef<HTMLLIElement>(null)

  const [lbData, setLbData] = useState<LeaderboardResponse | null>(null)
  const [lbLoading, setLbLoading] = useState(true)
  const [lbError, setLbError] = useState<string | null>(null)

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

  const panelClass = 'p-8 text-center pixel-panel'

  const formats = lbData?.formats ?? {}
  const rankFormat = getFormatById(formats, rankFormatId)
  const rankPlayers: LeaderboardPlayer[] = rankFormat?.players ?? []

  const yourRankPlayer = useMemo(() => {
    if (!viewerIgn) return undefined
    return rankPlayers.find((p) => ignNamesMatch(viewerIgn, p.playerName))
  }, [rankPlayers, viewerIgn])

  const yourRankTier = useMemo(() => (yourRankPlayer ? getTier(yourRankPlayer.elo) : null), [yourRankPlayer])

  useEffect(() => {
    if (mainSection !== 'ranks' || !yourRankPlayer) return
    scrollElementIntoViewCentered(rankYouRef.current)
  }, [mainSection, yourRankPlayer?.uuid, rankFormatId])

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

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8 pb-10">
      <header className="space-y-2 border-b border-border/50 pb-6">
        <h1 className="text-2xl font-semibold m-0 text-[#e2e8f0] tracking-tight">Leaderboard</h1>
        <p className="text-sm text-muted m-0 max-w-2xl leading-relaxed">
          PvP ranks, in-game Cobble$ or PCO top 10, Battle Tower, and CobbleRanked match summaries. When you are
          signed in, your row is highlighted if your site username matches your in-game name.
        </p>
        {!isAuthenticated ? (
          <p className="text-sm text-muted/90 m-0 pixel-panel-soft px-3 py-2 max-w-xl">
            <span className="text-[#e2e8f0]/90">Tip:</span> Sign in via Account to jump to your place on each list
            automatically.
          </p>
        ) : null}
        {lbData?.timestamp && mainSection === 'ranks' && (
          <p className="text-xs text-muted/80 m-0">
            Rank data updated: {new Date(lbData.timestamp).toLocaleString()}
          </p>
        )}
      </header>

      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        aria-label="Leaderboard category"
      >
        {MAIN_SECTIONS.map(({ id, label }) => (
          <MainTab key={id} active={mainSection === id} onClick={() => setMainSection(id)}>
            {label}
          </MainTab>
        ))}
      </div>

      <p className="text-xs text-muted m-0 -mt-4">{mainDescription}</p>

      {/* ——— Ranks ——— */}
      {mainSection === 'ranks' && (
        <section className="space-y-5" aria-labelledby="ranks-heading">
          <h2 id="ranks-heading" className="sr-only">
            Ranks
          </h2>
          {lbLoading ? (
            <div className={panelClass}>Loading ranks…</div>
          ) : lbError ? (
            <div className={`${panelClass} text-error`}>Error: {lbError}</div>
          ) : !lbData || Object.keys(lbData).length === 0 ? (
            <div className={`${panelClass} text-muted`}>
              No leaderboard yet. Sync from the server to see data.
            </div>
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
                <p className="text-sm font-medium text-[#e2e8f0] m-0">{lbData.seasonName}</p>
              )}
              {lbData.serverId && (
                <p className="text-xs text-muted m-0">Server: {lbData.serverId}</p>
              )}

              {rankPlayers.length === 0 ? (
                <div className={`${panelClass} text-muted`}>
                  No entries for {getFormatDisplayName(rankFormatId)} yet.
                </div>
              ) : (
                <>
                  {yourRankPlayer ? (
                    <div
                      className="lb-esports-wrap px-4 py-3 ring-1 ring-accent/35"
                      role="status"
                      aria-live="polite"
                    >
                      <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted m-0 mb-2">
                        Your current rank
                      </p>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className={pvpRankPillClass(yourRankPlayer.rank)}>#{yourRankPlayer.rank}</span>
                        <span className="lb-pvp-namebadge min-w-0" title={yourRankPlayer.playerName}>
                          {yourRankPlayer.playerName}
                        </span>
                        <span className="tabular-nums text-base font-bold text-[#ecebff]">
                          {yourRankPlayer.elo} <span className="text-xs font-semibold text-muted">ELO</span>
                        </span>
                        {yourRankTier ? (
                          <span className="lb-tier-frame ml-auto sm:ml-0">
                            <PvPTierBadge
                              slug={normalizePvpTierSlugForAssets(yourRankTier.slug)}
                              displayName={yourRankTier.displayName}
                              fallbackTextClassName={TIER_COLOR_CLASS[yourRankTier.slug] ?? 'text-muted'}
                              imgHeightClass="h-7"
                              className="align-middle"
                            />
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted m-0 mt-2">{getFormatDisplayName(rankFormatId)}</p>
                    </div>
                  ) : viewerIgn ? (
                    <p className="text-sm text-muted m-0 pixel-well px-3 py-2">
                      No match for <span className="font-mono text-[#e2e8f0]/80">{viewerIgn}</span> in this format — you
                      may be unranked or use a different in-game name.
                    </p>
                  ) : null}
                <div className="overflow-x-auto lb-esports-wrap p-4 sm:p-5">
                  <table className="lb-esports-table min-w-[760px]" role="table" aria-label="PvP leaderboard">
                    <thead>
                      <tr>
                        <th scope="col" className="text-left w-[5.5rem]">
                          Rank
                        </th>
                        <th scope="col" className="text-left min-w-[12rem]">
                          Player
                        </th>
                        <th scope="col" className="text-left w-[4.25rem]">
                          ELO
                        </th>
                        <th scope="col" className="text-left w-[7rem]">
                          Tier
                        </th>
                        <th scope="col" className="text-center w-[4.75rem]">
                          W / L
                        </th>
                        <th scope="col" className="text-left w-[5.75rem]">
                          Win rate
                        </th>
                        <th scope="col" className="text-center w-[4rem]">
                          Streak
                        </th>
                        <th scope="col" className="text-center w-[3.25rem]">
                          Best
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankPlayers.map((p) => {
                        const tier = getTier(p.elo)
                        const isYou = yourRankPlayer?.uuid === p.uuid
                        const streak = p.currentStreak
                        const streakStr = streak > 0 ? `+${streak}` : String(streak)
                        const winPct = Math.min(100, Math.max(0, p.winRate))
                        return (
                          <tr
                            key={p.uuid}
                            ref={isYou ? rankYouRef : undefined}
                            className={`scroll-mt-24 ${isYou ? 'lb-esports-highlight' : ''}`}
                          >
                            <td>
                              <span className={pvpRankPillClass(p.rank)}>#{p.rank}</span>
                            </td>
                            <td className="min-w-0">
                              <span className="lb-pvp-namebadge max-w-[14rem]" title={p.playerName}>
                                {p.playerName}
                              </span>
                            </td>
                            <td>
                              <span className="text-base font-bold tabular-nums text-[#f4f4ff]">{p.elo}</span>
                            </td>
                            <td>
                              <span className="lb-tier-frame align-middle inline-flex">
                                <PvPTierBadge
                                  slug={normalizePvpTierSlugForAssets(tier.slug)}
                                  displayName={tier.displayName}
                                  fallbackTextClassName={TIER_COLOR_CLASS[tier.slug] ?? 'text-muted'}
                                  imgHeightClass="h-8"
                                />
                              </span>
                            </td>
                            <td
                              className="text-center tabular-nums font-semibold text-sm"
                              title={`${p.matches} matches`}
                            >
                              <span className="text-emerald-400">{p.wins}</span>
                              <span className="text-slate-500 font-normal px-1">/</span>
                              <span className="text-rose-400/90">{p.losses}</span>
                            </td>
                            <td>
                              <div className="w-[4.85rem] max-w-full">
                                <div className="text-[0.8rem] font-bold tabular-nums text-[#ecebff]">
                                  {p.winRate.toFixed(1)}%
                                </div>
                                <div className="mt-1.5 h-1 rounded-full bg-white/[0.08] overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-emerald-400/90 shadow-[0_0_10px_rgba(52,211,153,0.35)]"
                                    style={{ width: `${winPct}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="text-center">
                              <span
                                className={`tabular-nums text-sm font-bold ${
                                  streak > 0
                                    ? 'text-emerald-400'
                                    : streak < 0
                                      ? 'text-rose-400/90'
                                      : 'text-amber-300/85'
                                }`}
                              >
                                {streakStr}
                              </span>
                            </td>
                            <td className="text-center">
                              <span className="tabular-nums text-sm font-semibold text-amber-200/85">
                                {p.bestStreak}
                              </span>
                            </td>
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

      {/* ——— Economy: Cobble$ vs PCO ——— */}
      {mainSection === 'economy' && (
        <section className="space-y-4" aria-labelledby="economy-heading">
          <h2 id="economy-heading" className="text-lg font-semibold m-0 text-[#e2e8f0]">
            Economy
          </h2>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Economy currency">
            <SubTab active={economyKind === 'cobble'} onClick={() => setEconomyKind('cobble')}>
              Cobble$
            </SubTab>
            <SubTab active={economyKind === 'pco'} onClick={() => setEconomyKind('pco')}>
              PCO
            </SubTab>
          </div>
          <p className="text-sm text-muted m-0">
            {economyKind === 'cobble' ? (
              <>Richest players by in-game Cobble$. Your website wallet is under Account → C$ balance.</>
            ) : (
              <>Top 10 by PCO in-game. Separate from website Cobble$.</>
            )}
          </p>
          <CobbleDollars viewerIgn={viewerIgn} kind={economyKind} />
        </section>
      )}

      {/* ——— Battle Tower ——— */}
      {mainSection === 'battle' && (
        <section className="space-y-5" aria-labelledby="battle-heading">
          <h2 id="battle-heading" className="sr-only">
            Battle Tower
          </h2>
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
              className="pixel-btn py-2 px-4 text-base disabled:opacity-50"
            >
              {btLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          <p className="text-xs text-muted m-0">Top 10 per mode · updates about every minute</p>

          {btLoading && !btData ? (
            <div className={panelClass}>Loading Battle Tower…</div>
          ) : btError && !btData ? (
            <div className={`${panelClass} text-error`}>Error: {btError}</div>
          ) : !btData ? (
            <div className={panelClass}>No data.</div>
          ) : btData.disabled ? (
            <div className={`${panelClass} text-muted`}>Battle Tower leaderboard is turned off for this site.</div>
          ) : btData.error ? (
            <div className={`${panelClass} text-error text-sm`}>Could not load: {btData.error}</div>
          ) : btData.floorRows.length +
              btData.streakRows.length +
              btData.fallbackFloorLines.length +
              btData.fallbackStreakLines.length >
            0 ? (
            <>
              {btData.updatedAt && (
                <p className="text-xs text-muted/80 m-0">
                  Last refreshed: {new Date(btData.updatedAt).toLocaleString()}
                </p>
              )}
              <header>
                <h3 className="text-base font-semibold m-0 mb-1 text-[#e2e8f0]">Battle Tower (top 10)</h3>
                <p className="text-sm text-muted m-0">Two lists per mode: highest floor and highest win streak.</p>
              </header>
              {(battleFloorYou || battleStreakYou) && (
                <div
                  className="pixel-panel-soft px-4 py-3 max-w-5xl ring-2 ring-accent/40"
                  role="status"
                  aria-live="polite"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-accent m-0 mb-1.5">
                    Your entries
                  </p>
                  <ul className="m-0 pl-4 text-sm text-[#e2e8f0] space-y-1 list-disc marker:text-accent/80">
                    {battleFloorYou ? (
                      <li>
                        <span className="font-mono">{battleFloorYou.name}</span> — floor list rank{' '}
                        <strong className="tabular-nums text-accent">#{battleFloorYou.rank}</strong>
                        {battleFloorYou.floor != null ? (
                          <> · floor {battleFloorYou.floor}</>
                        ) : battleFloorYou.detail ? (
                          <> · {battleFloorYou.detail}</>
                        ) : null}
                      </li>
                    ) : null}
                    {battleStreakYou ? (
                      <li>
                        <span className="font-mono">{battleStreakYou.name}</span> — streak list rank{' '}
                        <strong className="tabular-nums text-accent">#{battleStreakYou.rank}</strong>
                        {battleStreakYou.streak != null ? (
                          <> · streak {battleStreakYou.streak}</>
                        ) : battleStreakYou.detail ? (
                          <> · {battleStreakYou.detail}</>
                        ) : null}
                      </li>
                    ) : null}
                  </ul>
                </div>
              )}
              {viewerIgn && !battleFloorYou && !battleStreakYou && btData.floorRows.length + btData.streakRows.length > 0 ? (
                <p className="text-sm text-muted m-0 max-w-5xl pixel-well px-3 py-2">
                  No match for <span className="font-mono text-[#e2e8f0]/80">{viewerIgn}</span> in this mode&apos;s top
                  lists.
                </p>
              ) : null}
              <div className="grid gap-8 md:grid-cols-2 max-w-5xl">
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
                <p className="text-xs text-muted m-0 max-w-5xl">
                  Some rows could not be split into clean stats — refresh later if numbers look off.
                </p>
              ) : null}
            </>
          ) : (
            <div className={`${panelClass} text-muted text-sm`}>
              No entries yet. Try again after playing Battle Tower on the server.
            </div>
          )}
        </section>
      )}

      {mainSection === 'ranked' && <RankedApiFeed />}
    </div>
  )
}
