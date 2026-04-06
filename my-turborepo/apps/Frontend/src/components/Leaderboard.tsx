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

type MainSection = 'ranks' | 'economy' | 'battle'
type RankFormatId = 'singles' | 'doubles'
type BattleModeId = 'singles' | 'doubles' | 'co-op' | 'boss'

const MAIN_SECTIONS: { id: MainSection; label: string; description: string }[] = [
  { id: 'ranks', label: 'Ranks', description: 'PvP ELO & tiers' },
  { id: 'economy', label: 'Economy', description: 'In-game Cobble$ top 10 (server)' },
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
  copper: 'text-copper',
  silver: 'text-silver',
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
  { minElo: 1050, displayName: 'Silver', slug: 'silver' },
  { minElo: 0, displayName: 'Copper', slug: 'copper' },
]

function getTier(elo: number): { displayName: string; slug: string } {
  const tier = RANK_TIERS_BY_ELO.find((t) => elo >= t.minElo)
  return tier ?? { displayName: 'Copper', slug: 'copper' }
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
          PvP ranks, in-game Cobble$, and Battle Tower. When you are signed in, your row is highlighted if your site
          username matches your in-game name.
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
                      className="pixel-panel-soft px-4 py-3 ring-2 ring-accent/40"
                      role="status"
                      aria-live="polite"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-accent m-0 mb-1">
                        Your current rank
                      </p>
                      <p className="text-sm text-[#e2e8f0] m-0">
                        <span className="font-mono font-semibold">{yourRankPlayer.playerName}</span> —{' '}
                        <strong className="text-accent tabular-nums">#{yourRankPlayer.rank}</strong> in{' '}
                        {getFormatDisplayName(rankFormatId)} · {yourRankPlayer.elo} ELO ·{' '}
                        <span className={TIER_COLOR_CLASS[getTier(yourRankPlayer.elo).slug] ?? 'text-muted'}>
                          {getTier(yourRankPlayer.elo).displayName}
                        </span>
                      </p>
                    </div>
                  ) : viewerIgn ? (
                    <p className="text-sm text-muted m-0 pixel-well px-3 py-2">
                      No match for <span className="font-mono text-[#e2e8f0]/80">{viewerIgn}</span> in this format — you
                      may be unranked or use a different in-game name.
                    </p>
                  ) : null}
                <div className="overflow-x-auto pixel-well">
                  <table className="w-full border-collapse text-sm min-w-[640px]">
                    <thead>
                      <tr>
                        <th className="text-left py-2.5 px-3 font-semibold text-muted border-b border-border">
                          Rank
                        </th>
                        <th className="text-left py-2.5 px-3 font-semibold text-muted border-b border-border">
                          Player
                        </th>
                        <th className="text-left py-2.5 px-3 font-semibold text-muted border-b border-border">
                          ELO
                        </th>
                        <th className="text-left py-2.5 px-3 font-semibold text-muted border-b border-border">
                          Tier
                        </th>
                        <th className="text-left py-2.5 px-3 font-semibold text-muted border-b border-border">
                          W
                        </th>
                        <th className="text-left py-2.5 px-3 font-semibold text-muted border-b border-border">
                          L
                        </th>
                        <th className="text-left py-2.5 px-3 font-semibold text-muted border-b border-border">
                          Matches
                        </th>
                        <th className="text-left py-2.5 px-3 font-semibold text-muted border-b border-border">
                          Win %
                        </th>
                        <th className="text-left py-2.5 px-3 font-semibold text-muted border-b border-border">
                          Streak
                        </th>
                        <th className="text-left py-2.5 px-3 font-semibold text-muted border-b border-border">
                          Best
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankPlayers.map((p) => {
                        const tier = getTier(p.elo)
                        const isYou = yourRankPlayer?.uuid === p.uuid
                        return (
                          <tr
                            key={p.uuid}
                            ref={isYou ? rankYouRef : undefined}
                            className={`scroll-mt-24 transition-colors ${
                              isYou
                                ? 'bg-accent/[0.1] ring-1 ring-inset ring-accent/35 hover:bg-accent/[0.14]'
                                : 'hover:bg-surface-hover/50'
                            }`}
                          >
                            <td className="py-2.5 px-3 w-16 text-muted border-b border-border">
                              {p.rank}
                            </td>
                            <td className="py-2.5 px-3 font-medium border-b border-border">
                              {p.playerName}
                            </td>
                            <td className="py-2.5 px-3 w-16 border-b border-border">{p.elo}</td>
                            <td
                              className={`py-2.5 px-3 text-xs font-semibold border-b border-border ${TIER_COLOR_CLASS[tier.slug] ?? 'text-muted'}`}
                            >
                              {tier.displayName}
                            </td>
                            <td className="py-2.5 px-3 w-16 border-b border-border">{p.wins}</td>
                            <td className="py-2.5 px-3 w-16 border-b border-border">{p.losses}</td>
                            <td className="py-2.5 px-3 w-16 border-b border-border">{p.matches}</td>
                            <td className="py-2.5 px-3 w-16 border-b border-border">
                              {p.winRate.toFixed(1)}%
                            </td>
                            <td className="py-2.5 px-3 w-16 border-b border-border">
                              {p.currentStreak}
                            </td>
                            <td className="py-2.5 px-3 w-16 border-b border-border">{p.bestStreak}</td>
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

      {/* ——— Economy (no sub-tabs) ——— */}
      {mainSection === 'economy' && (
        <section className="space-y-4" aria-labelledby="economy-heading">
          <h2 id="economy-heading" className="text-lg font-semibold m-0 text-[#e2e8f0]">
            Economy
          </h2>
          <p className="text-sm text-muted m-0">
            Richest players on the Minecraft server (live CobbleDollars leaderboard via RCON). Manage your website
            balance under Account → C$ balance.
          </p>
          <CobbleDollars viewerIgn={viewerIgn} />
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

          <p className="text-xs text-muted m-0">
            Top 10 per mode · <code className="text-amber-400/90/90">bt leaderboard</code> (RCON) · cached ~90s
          </p>

          {btLoading && !btData ? (
            <div className={panelClass}>Loading Battle Tower…</div>
          ) : btError && !btData ? (
            <div className={`${panelClass} text-error`}>Error: {btError}</div>
          ) : !btData ? (
            <div className={panelClass}>No data.</div>
          ) : btData.disabled ? (
            <div className={`${panelClass} text-muted`}>
              Battle Tower leaderboard is disabled (<code className="text-xs">MC_BT_DISABLE</code>).
            </div>
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
                <p className="text-sm text-muted m-0">
                  Two lists per mode: highest floor and highest win streak (from server output).
                </p>
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
                  Showing raw server lines where the parser could not split players — if stats look wrong, the mod
                  output format may need a parser update.
                </p>
              ) : null}
            </>
          ) : (
            <div className={`${panelClass} text-muted text-sm`}>
              No entries returned. Check RCON and Battle Tower on the server.
            </div>
          )}
        </section>
      )}
    </div>
  )
}
