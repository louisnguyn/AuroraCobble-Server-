import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { fetchAchievementLeaderboard, fetchLeaderboard, fetchLeaderboardDisplaySettings } from '../api'
import { useAuth } from '../contexts/AuthContext'
import { ignNamesMatch, scrollElementIntoViewCentered } from '../ignMatch'
import { hideZeroMatchForFormat } from '../leaderboardDisplaySettings'
import type {
  AchievementLeaderboardResponse,
  LeaderboardDisplaySettings,
  LeaderboardResponse,
  LeaderboardFormat,
  LeaderboardPlayer,
  PvpRankDailyRewardsMeta,
} from '../types'
import { CobbleDollars } from './CobbleDollars.tsx'
import { getPvpTierFromElo, normalizePvpTierSlugForAssets, PvPTierBadge } from './PvPTierBadge.tsx'
import { RankedApiFeed } from './RankedApiFeed.tsx'
import { PageHeader, PageNotice, PageShell, PageTabBar } from './PageLayout.tsx'

type MainSection = 'ranks' | 'economy' | 'achievements' | 'ranked'
type RankFormatId = 'singles' | 'doubles'
type EconomyKind = 'cobble' | 'website_cobble' | 'pco'

const MAIN_SECTIONS: { id: MainSection; label: string; description: string }[] = [
  { id: 'ranks', label: 'Ranks', description: 'PvP ELO & tiers' },
  {
    id: 'economy',
    label: 'Economy',
    description: 'Website AsterynPoints, in-game Cobble$, or PCO top 10',
  },
  { id: 'achievements', label: 'Achievements', description: 'Profile badges ranked by tier score' },
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

function pvpRankPillClass(rank: number): string {
  if (rank === 1) return 'lb-rank-pill lb-rank-pill--gold'
  if (rank === 2) return 'lb-rank-pill lb-rank-pill--silver'
  if (rank === 3) return 'lb-rank-pill lb-rank-pill--bronze'
  return 'lb-rank-pill lb-rank-pill--muted'
}

function fmtCd(n: number): string {
  return n.toLocaleString('en-US')
}

function pvpRewardForRank(
  rewards: PvpRankDailyRewardsMeta | undefined,
  rank: number
): { cobble: number; tickets: number } | null {
  if (!rewards?.ranks?.length) return null
  const row = rewards.ranks.find((r) => r.rank === rank)
  if (!row || row.cobble <= 0) return null
  return { cobble: row.cobble, tickets: row.tickets }
}

function ticketBonusLabel(count: number): string {
  return `+${count} ticket${count === 1 ? '' : 's'}`
}

function PvpDailyRewardPill({ cobble, tickets }: { cobble: number; tickets: number }) {
  return (
    <span className="lb-reward-pill" title={tickets > 0 ? `${ticketBonusLabel(tickets)}/day` : undefined}>
      +{fmtCd(cobble)} AsterynPoints/day
      {tickets > 0 ? <span className="lb-reward-pill-tickets">{ticketBonusLabel(tickets)}</span> : null}
    </span>
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

export function Leaderboard() {
  const { user, isAuthenticated } = useAuth()
  const viewerIgn = user?.username?.trim() ?? null

  const [mainSection, setMainSection] = useState<MainSection>('ranks')
  const [economyKind, setEconomyKind] = useState<EconomyKind>('website_cobble')
  const [rankFormatId, setRankFormatId] = useState<RankFormatId>('singles')

  const rankYouRef = useRef<HTMLTableRowElement>(null)
  const achYouRef = useRef<HTMLLIElement>(null)

  const [lbData, setLbData] = useState<LeaderboardResponse | null>(null)
  const [lbLoading, setLbLoading] = useState(true)
  const [lbError, setLbError] = useState<string | null>(null)
  const [displaySettings, setDisplaySettings] = useState<LeaderboardDisplaySettings>({
    hideZeroMatchPlayers: { singles: true, doubles: true },
  })
  const pvpRankRewards = displaySettings.pvpRankDailyRewards
  const topRewardRank = pvpRankRewards?.ranks?.length
    ? Math.max(...pvpRankRewards.ranks.map((r) => r.rank))
    : 3

  const [achData, setAchData] = useState<AchievementLeaderboardResponse | null>(null)
  const [achLoading, setAchLoading] = useState(false)
  const [achError, setAchError] = useState<string | null>(null)

  useEffect(() => {
    setLbLoading(true)
    setLbError(null)
    Promise.all([fetchLeaderboard(), fetchLeaderboardDisplaySettings()])
      .then(([data, display]) => {
        setLbData(data)
        setDisplaySettings(display)
      })
      .catch((e) => setLbError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLbLoading(false))
  }, [])

  useEffect(() => {
    if (mainSection !== 'achievements') return
    setAchLoading(true)
    setAchError(null)
    fetchAchievementLeaderboard()
      .then(setAchData)
      .catch((e) => {
        setAchData(null)
        setAchError(e instanceof Error ? e.message : 'Failed to load')
      })
      .finally(() => setAchLoading(false))
  }, [mainSection])

  const panelClass = 'p-8 text-center pixel-panel'

  const formats = lbData?.formats ?? {}
  const rankFormat = getFormatById(formats, rankFormatId)
  const rankPlayersAll = rankFormat?.players ?? []
  const hideZeroMatchPlayers = hideZeroMatchForFormat(displaySettings, rankFormatId)

  const rankPlayers: LeaderboardPlayer[] = useMemo(() => {
    const players = hideZeroMatchPlayers ? rankPlayersAll.filter((p) => p.matches > 0) : rankPlayersAll
    return players.map((p, idx) => ({ ...p, rank: idx + 1 }))
  }, [rankPlayersAll, hideZeroMatchPlayers])

  const yourRankPlayer = useMemo(() => {
    if (!viewerIgn) return undefined
    return rankPlayersAll.find((p) => ignNamesMatch(viewerIgn, p.playerName))
  }, [rankPlayersAll, viewerIgn])

  const yourRankInTable = useMemo(() => {
    if (!yourRankPlayer) return undefined
    return rankPlayers.find((p) => p.uuid === yourRankPlayer.uuid)
  }, [rankPlayers, yourRankPlayer])

  const yourRankTier = useMemo(
    () => (yourRankPlayer ? getPvpTierFromElo(yourRankPlayer.elo) : null),
    [yourRankPlayer]
  )

  useEffect(() => {
    if (mainSection !== 'ranks' || !yourRankInTable) return
    scrollElementIntoViewCentered(rankYouRef.current)
  }, [mainSection, yourRankInTable?.uuid, rankFormatId, hideZeroMatchPlayers])

  const yourAchRow = useMemo(() => {
    if (!viewerIgn || !achData?.rows?.length) return undefined
    return achData.rows.find((r) => ignNamesMatch(viewerIgn, r.username))
  }, [achData, viewerIgn])

  useEffect(() => {
    if (mainSection !== 'achievements' || !yourAchRow) return
    scrollElementIntoViewCentered(achYouRef.current)
  }, [mainSection, yourAchRow?.userId])

  const mainDescription = MAIN_SECTIONS.find((s) => s.id === mainSection)?.description ?? ''

  return (
    <PageShell max="6xl" className="space-y-6">
      <PageHeader
        accent="cyan"
        eyebrow="Competitive"
        title="Leaderboard"
        description="PvP ranks, economy top 10, profile achievement badges, and CobbleRanked match summaries. When you are signed in, your row is highlighted if your site username matches your in-game name."
        footer={
          <>
            {!isAuthenticated ? (
              <PageNotice>
                <span className="text-[#e2e8f0]/90">Tip:</span> Sign in via Account to jump to your place on each
                list automatically.
              </PageNotice>
            ) : null}
            {lbData?.timestamp && mainSection === 'ranks' ? (
              <p className="text-xs text-muted/80 m-0 mt-2">
                Rank data updated: {new Date(lbData.timestamp).toLocaleString()}
              </p>
            ) : null}
          </>
        }
      />

      <PageTabBar
        ariaLabel="Leaderboard category"
        tabs={MAIN_SECTIONS.map(({ id, label }) => ({ id, label }))}
        active={mainSection}
        onChange={setMainSection}
      />

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

              {pvpRankRewards ? (
                <p className="text-sm text-muted m-0 max-w-3xl leading-relaxed">
                  Top {topRewardRank} on each ladder earn daily website AsterynPoints at 00:00{' '}
                  {pvpRankRewards.timezone}.{' '}
                  {pvpRankRewards.ranks.map((r, i) => (
                    <span key={r.rank}>
                      {i > 0 ? ' · ' : ''}
                      #{r.rank}{' '}
                      <strong className="text-[#f0d48a] font-semibold">+{fmtCd(r.cobble)} AsterynPoints</strong>
                      {r.tickets > 0 ? ` (${ticketBonusLabel(r.tickets)})` : ''}
                    </span>
                  ))}
                </p>
              ) : null}

              {rankPlayers.length === 0 ? (
                <div className={`${panelClass} text-muted`}>
                  {rankPlayersAll.length > 0 && hideZeroMatchPlayers
                    ? `No players with matches on ${getFormatDisplayName(rankFormatId)} yet.`
                    : `No entries for ${getFormatDisplayName(rankFormatId)} yet.`}
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
                        <span className={pvpRankPillClass(yourRankInTable?.rank ?? yourRankPlayer.rank)}>
                          #{yourRankInTable?.rank ?? yourRankPlayer.rank}
                        </span>
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
                        {(() => {
                          const rk = yourRankInTable?.rank ?? yourRankPlayer.rank
                          const rw = pvpRewardForRank(pvpRankRewards, rk)
                          return rw ? <PvpDailyRewardPill cobble={rw.cobble} tickets={rw.tickets} /> : null
                        })()}
                      </div>
                      <p className="text-xs text-muted m-0 mt-2">
                        {getFormatDisplayName(rankFormatId)}
                        {hideZeroMatchPlayers && yourRankPlayer.matches === 0 ? (
                          <span className="text-amber-200/90"> · 0 matches (not listed publicly)</span>
                        ) : null}
                      </p>
                    </div>
                  ) : viewerIgn ? (
                    <p className="text-sm text-muted m-0 pixel-well px-3 py-2">
                      No match for <span className="font-mono text-[#e2e8f0]/80">{viewerIgn}</span> in this format — you
                      may be unranked or use a different in-game name.
                    </p>
                  ) : null}
                <div className="overflow-x-auto lb-esports-wrap p-4 sm:p-5">
                  <table className="lb-esports-table min-w-[860px]" role="table" aria-label="PvP leaderboard">
                    <thead>
                      <tr>
                        <th scope="col" className="text-left w-[5.5rem]">
                          Rank
                        </th>
                        <th scope="col" className="text-left min-w-[12rem]">
                          Player
                        </th>
                        <th scope="col" className="text-left w-[9.5rem]">
                          Daily reward
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
                        const tier = getPvpTierFromElo(p.elo)
                        const isYou = yourRankInTable?.uuid === p.uuid
                        const streak = p.currentStreak
                        const streakStr = streak > 0 ? `+${streak}` : String(streak)
                        const winPct = Math.min(100, Math.max(0, p.winRate))
                        const dailyReward = pvpRewardForRank(pvpRankRewards, p.rank)
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
                              {dailyReward ? (
                                <PvpDailyRewardPill cobble={dailyReward.cobble} tickets={dailyReward.tickets} />
                              ) : (
                                <span className="text-muted text-sm">—</span>
                              )}
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

      {/* ——— Economy: website / in-game Cobble$ vs PCO ——— */}
      {mainSection === 'economy' && (
        <section className="space-y-4" aria-labelledby="economy-heading">
          <h2 id="economy-heading" className="text-lg font-semibold m-0 text-[#e2e8f0]">
            Economy
          </h2>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Economy currency">
            <SubTab active={economyKind === 'website_cobble'} onClick={() => setEconomyKind('website_cobble')}>
              AsterynPoints
            </SubTab>
            <SubTab active={economyKind === 'cobble'} onClick={() => setEconomyKind('cobble')}>
              In-game C$
            </SubTab>
            <SubTab active={economyKind === 'pco'} onClick={() => setEconomyKind('pco')}>
              PCO
            </SubTab>
          </div>
          <p className="text-sm text-muted m-0">
            {economyKind === 'website_cobble' ? (
              <>Top site wallet balances (same AsterynPoints you see under Account).</>
            ) : economyKind === 'cobble' ? (
              <>Richest players by in-game Cobble$ (Minecraft server). Deposit from your website wallet under Account.</>
            ) : (
              <>Top 10 by PCO in-game. Separate from website AsterynPoints.</>
            )}
          </p>
          <CobbleDollars viewerIgn={viewerIgn} kind={economyKind} />
        </section>
      )}

      {/* ——— Achievements ——— */}
      {mainSection === 'achievements' && (
        <section className="space-y-5" aria-labelledby="achievements-heading">
          <h2 id="achievements-heading" className="text-lg font-semibold m-0 text-[#e2e8f0]">
            Top achievements
          </h2>
          <p className="text-sm text-muted m-0 max-w-3xl">
            Ranked by profile badge score (higher tiers count more: violet 1 → legend 5). Shows the top 50 players with
            at least one active badge.
          </p>
          {achLoading && !achData ? (
            <div className={panelClass}>Loading achievements…</div>
          ) : achError && !achData ? (
            <div className={`${panelClass} text-error`}>Error: {achError}</div>
          ) : !achData?.rows?.length ? (
            <div className={`${panelClass} text-muted`}>No achievement badges granted yet.</div>
          ) : (
            <>
              {yourAchRow ? (
                <div className="pixel-panel-soft px-4 py-3 ring-1 ring-accent/35" role="status">
                  <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted m-0 mb-2">Your place</p>
                  <p className="text-sm text-[#e2e8f0] m-0">
                    #{yourAchRow.rank} · {yourAchRow.badgeCount} badges · score {yourAchRow.score.toLocaleString()}
                    {yourAchRow.legend + yourAchRow.mythic + yourAchRow.gold > 0
                      ? ` · legend ${yourAchRow.legend} · mythic ${yourAchRow.mythic} · gold ${yourAchRow.gold}`
                      : ''}
                  </p>
                </div>
              ) : viewerIgn ? (
                <p className="text-sm text-muted m-0 pixel-well px-3 py-2">
                  No badges listed for <span className="font-mono text-[#e2e8f0]/80">{viewerIgn}</span> yet.
                </p>
              ) : null}
              <ol className="list-none m-0 p-0 space-y-2">
                {achData.rows.map((row) => {
                  const isYou = yourAchRow?.userId === row.userId
                  return (
                    <li
                      key={row.userId}
                      ref={isYou ? achYouRef : undefined}
                      className={`flex flex-wrap items-center justify-between gap-3 pixel-panel-soft px-4 py-3 scroll-mt-24 ${
                        isYou ? 'ring-2 ring-amber-400/60 brightness-110' : ''
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className={pvpRankPillClass(row.rank)}>#{row.rank}</span>
                        <span className="font-mono text-base text-[#e2e8f0] truncate" title={row.username}>
                          {row.username}
                        </span>
                      </span>
                      <span className="text-sm text-muted tabular-nums text-right">
                        <span className="text-[#e2e8f0] font-semibold">{row.badgeCount}</span> badges
                        <span className="text-muted"> · score {row.score}</span>
                        {row.legend > 0 || row.mythic > 0 || row.gold > 0 ? (
                          <span className="block text-xs mt-0.5">
                            {row.legend > 0 ? `Legend ${row.legend}` : null}
                            {row.legend > 0 && (row.mythic > 0 || row.gold > 0) ? ' · ' : null}
                            {row.mythic > 0 ? `Mythic ${row.mythic}` : null}
                            {row.mythic > 0 && row.gold > 0 ? ' · ' : null}
                            {row.gold > 0 ? `Gold ${row.gold}` : null}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  )
                })}
              </ol>
            </>
          )}
        </section>
      )}

      {mainSection === 'ranked' && <RankedApiFeed />}
    </PageShell>
  )
}
