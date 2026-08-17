import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  fetchAchievementLeaderboard,
  fetchCobbleDollarsLeaderboard,
  fetchPcoLeaderboard,
  fetchWebsiteCobbledollarsLeaderboard,
  fetchLeaderboard,
} from '../api'
import {
  adminFetchLeaderboardDisplaySettings,
  adminUpdateLeaderboardDisplaySettings,
  type LeaderboardDisplaySettings,
} from '../authApi'
import { ignNamesMatch, scrollElementIntoViewCentered } from '../ignMatch'
import type {
  AchievementLeaderboardResponse,
  CobbleDollarsLeaderboardResponse,
  LeaderboardFormat,
  LeaderboardPlayer,
  LeaderboardResponse,
} from '../types'
import { normalizePvpTierSlugForAssets, PvPTierBadge } from './PvPTierBadge.tsx'
import { BattleTowerFacilityAdmin } from './BattleTowerFacilityAdmin.tsx'

type MainSection = 'ranks' | 'economy' | 'achievements'
type RankFormatId = 'singles' | 'doubles'
type EconomyKind = 'cobble' | 'website_cobble' | 'pco'

const MAIN_SECTIONS: { id: MainSection; label: string; description: string }[] = [
  { id: 'ranks', label: 'Ranks', description: 'PvP ELO & tiers' },
  { id: 'economy', label: 'Economy', description: 'Website Asteryn Point, in-game Cobble$, or PCO top 10' },
  { id: 'achievements', label: 'Achievements', description: 'Profile badges ranked by tier score' },
]

const RANK_FORMATS: { id: RankFormatId; label: string }[] = [
  { id: 'singles', label: 'Singles' },
  { id: 'doubles', label: 'Doubles' },
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
  { minElo: 1600, displayName: 'Netherite', slug: 'netherite' },
  { minElo: 1400, displayName: 'Diamond', slug: 'diamond' },
  { minElo: 1300, displayName: 'Emerald', slug: 'emerald' },
  { minElo: 1200, displayName: 'Gold', slug: 'gold' },
  { minElo: 1100, displayName: 'Iron', slug: 'iron' },
  { minElo: 1000, displayName: 'Copper', slug: 'copper' },
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

/**
 * Same structure as the public site Leaderboard (Ranks / Economy / Achievements), themed for Server Dashboard.
 */
export function DashboardLeaderboardPanel({ viewerUsername }: { viewerUsername?: string }) {
  const viewerIgn = viewerUsername?.trim() ?? null

  const rankYouRef = useRef<HTMLTableRowElement>(null)
  const cdYouRef = useRef<HTMLLIElement>(null)
  const achYouRef = useRef<HTMLLIElement>(null)

  const [mainSection, setMainSection] = useState<MainSection>('ranks')
  const [economyKind, setEconomyKind] = useState<EconomyKind>('website_cobble')
  const [rankFormatId, setRankFormatId] = useState<RankFormatId>('singles')
  const [displaySettings, setDisplaySettings] = useState<LeaderboardDisplaySettings>({
    hideZeroMatchPlayers: { singles: true, doubles: true },
  })
  const [displaySettingsSaving, setDisplaySettingsSaving] = useState<RankFormatId | null>(null)
  const [displaySettingsErr, setDisplaySettingsErr] = useState<string | null>(null)

  const [lbData, setLbData] = useState<LeaderboardResponse | null>(null)
  const [lbLoading, setLbLoading] = useState(true)
  const [lbError, setLbError] = useState<string | null>(null)

  const [cdData, setCdData] = useState<CobbleDollarsLeaderboardResponse | null>(null)
  const [cdLoading, setCdLoading] = useState(false)
  const [cdError, setCdError] = useState<string | null>(null)

  const [achData, setAchData] = useState<AchievementLeaderboardResponse | null>(null)
  const [achLoading, setAchLoading] = useState(false)
  const [achError, setAchError] = useState<string | null>(null)

  useEffect(() => {
    setLbLoading(true)
    setLbError(null)
    Promise.all([fetchLeaderboard(), adminFetchLeaderboardDisplaySettings()])
      .then(([data, display]) => {
        setLbData(data)
        setDisplaySettings(display)
      })
      .catch((e) => setLbError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLbLoading(false))
  }, [])

  const onToggleHideZeroMatchPlayers = useCallback(
    async (format: RankFormatId) => {
      const prev = displaySettings.hideZeroMatchPlayers
      const next = {
        hideZeroMatchPlayers: {
          ...prev,
          [format]: !prev[format],
        },
      }
      setDisplaySettings(next)
      setDisplaySettingsSaving(format)
      setDisplaySettingsErr(null)
      try {
        const saved = await adminUpdateLeaderboardDisplaySettings(next)
        setDisplaySettings(saved)
      } catch (e) {
        setDisplaySettings({ hideZeroMatchPlayers: prev })
        setDisplaySettingsErr(e instanceof Error ? e.message : 'Failed to save')
      } finally {
        setDisplaySettingsSaving(null)
      }
    },
    [displaySettings.hideZeroMatchPlayers]
  )

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

  const panelClass =
    'p-8 text-center rounded-2xl border border-white/10 bg-surface/40 text-slate-400'

  const formats = lbData?.formats ?? {}
  const rankFormat = getFormatById(formats, rankFormatId)
  const rankPlayersAll = rankFormat?.players ?? []
  const hideZeroMatchPlayers = displaySettings.hideZeroMatchPlayers[rankFormatId]

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

  const yourRankTier = useMemo(() => (yourRankPlayer ? getTier(yourRankPlayer.elo) : null), [yourRankPlayer])

  useEffect(() => {
    if (mainSection !== 'ranks' || !yourRankInTable) return
    scrollElementIntoViewCentered(rankYouRef.current)
  }, [mainSection, yourRankInTable?.uuid, rankFormatId, hideZeroMatchPlayers])

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

  const yourAchRow = useMemo(() => {
    if (!viewerIgn || !achData?.rows?.length) return undefined
    return achData.rows.find((r) => ignNamesMatch(viewerIgn, r.username))
  }, [achData, viewerIgn])

  useEffect(() => {
    if (mainSection !== 'achievements' || !yourAchRow) return
    scrollElementIntoViewCentered(achYouRef.current)
  }, [mainSection, yourAchRow?.userId])

  const mainDescription = MAIN_SECTIONS.find((s) => s.id === mainSection)?.description ?? ''

  const econTab = useMemo(() => {
    const isPco = economyKind === 'pco'
    const isWebsite = economyKind === 'website_cobble'
    return {
      isPco,
      isWebsite,
      loadKind: isPco ? 'PCO' : isWebsite ? 'website Asteryn Point' : 'in-game Cobble$',
      title: isPco ? 'In-game PCO (top 10)' : isWebsite ? 'Website Asteryn Point (top 10)' : 'In-game Cobble$ (top 10)',
      blurb: isWebsite
        ? 'Top 10 site wallet balances (GET /leaderboard/website-asterynpoints â€” same as public Leaderboard).'
        : isPco
          ? 'PCO top 10 from pco top (RCON). Separate from website Asteryn Point.'
          : 'In-game Cobble$ top 10 (RCON; same public endpoint as the website).',
      balanceUnit: isPco ? 'PCO' : isWebsite ? 'Asteryn Point' : 'Cobble$',
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
            Same views as the public site — PvP ranks, Asteryn Point / Cobble$ or PCO economy top 10, and achievement
            badges. Your admin username highlights matching in-game names.
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
            <div className={panelClass}>Loading ranksâ€¦</div>
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
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Public 0-match filter per format">
                {RANK_FORMATS.map(({ id, label }) => {
                  const hiding = displaySettings.hideZeroMatchPlayers[id]
                  const saving = displaySettingsSaving === id
                  return (
                    <button
                      key={`public-filter-${id}`}
                      type="button"
                      aria-pressed={hiding}
                      disabled={displaySettingsSaving != null}
                      onClick={() => void onToggleHideZeroMatchPlayers(id)}
                      className={`py-2 px-3 rounded-xl text-xs font-medium transition-all duration-200 border disabled:opacity-50 ${
                        hiding
                          ? 'border-amber-400/45 text-amber-100 bg-amber-600/15 ring-1 ring-amber-400/25'
                          : 'border-white/10 text-slate-400 bg-black/15 hover:text-white hover:bg-white/5'
                      }`}
                      title={
                        hiding
                          ? `Public ${label}: hide players with 0 matches`
                          : `Public ${label}: show all players`
                      }
                    >
                      {saving
                        ? `${label}: savingâ€¦`
                        : hiding
                          ? `${label}: hide 0-match`
                          : `${label}: show all`}
                    </button>
                  )
                })}
              </div>
              {displaySettingsErr ? (
                <p className="text-xs text-red-300 m-0">{displaySettingsErr}</p>
              ) : (
                <p className="text-xs text-slate-500 m-0">
                  Each format controls the public Leaderboard â†’ Ranks table independently. Preview below matches the
                  selected tab.
                </p>
              )}
              {lbData.seasonName && (
                <p className="text-sm font-medium text-slate-100 m-0">{lbData.seasonName}</p>
              )}
              {lbData.serverId && <p className="text-xs text-slate-500 m-0">Server: {lbData.serverId}</p>}
              {rankPlayers.length === 0 ? (
                <div className={panelClass}>
                  {rankPlayersAll.length > 0 && hideZeroMatchPlayers
                    ? `Everyone on ${getFormatDisplayName(rankFormatId)} has 0 matches. Use â€œ${getFormatDisplayName(rankFormatId)}: show allâ€ to list them on the public site.`
                    : `No entries for ${getFormatDisplayName(rankFormatId)} yet.`}
                </div>
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
                        <span className="font-mono font-semibold">{yourRankPlayer.playerName}</span> â€”{' '}
                        <strong className="text-amber-200 tabular-nums">
                          #{yourRankInTable?.rank ?? yourRankPlayer.rank}
                        </strong>{' '}
                        in {getFormatDisplayName(rankFormatId)} Â· {yourRankPlayer.elo} ELO Â·{' '}
                        {yourRankTier ? (
                          <PvPTierBadge
                            slug={normalizePvpTierSlugForAssets(yourRankTier.slug)}
                            displayName={yourRankTier.displayName}
                            fallbackTextClassName={TIER_COLOR_CLASS[yourRankTier.slug] ?? 'text-slate-400'}
                            imgHeightClass="h-6"
                            className="align-middle ml-1"
                          />
                        ) : null}
                        {hideZeroMatchPlayers && yourRankPlayer.matches === 0 ? (
                          <span className="text-amber-300/90"> Â· 0 matches (hidden on public site)</span>
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
                        const isYou = yourRankInTable ? p.uuid === yourRankInTable.uuid : false
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
              AsterynPoints
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
            <div className={panelClass}>Loading {econTab.loadKind} leaderboardâ€¦</div>
          ) : cdError ? (
            <div className={`${panelClass} text-red-300`}>Error: {cdError}</div>
          ) : !cdData ? (
            <div className={panelClass}>No data.</div>
          ) : cdData.disabled ? (
            <div className={panelClass}>
              {econTab.isPco ? 'PCO' : econTab.isWebsite ? 'Website Asteryn Point' : 'In-game Cobble$'} leaderboard is
              disabled on this deployment.
            </div>
          ) : cdData.error ? (
            <div className={`${panelClass} text-red-300 text-sm`}>
              Could not load{econTab.isWebsite ? ' website' : econTab.isPco ? '' : ' server'} balances:{' '}
              {cdData.error}
            </div>
          ) : cdData.top10.length === 0 ? (
            <div className={panelClass}>
              No {econTab.isPco ? 'PCO' : econTab.isWebsite ? 'Asteryn Point' : 'Cobble$'} balances returned yet.
            </div>
          ) : (
            <>
              <header>
                <h4 className="text-sm font-semibold m-0 mb-1 text-slate-100">{econTab.title}</h4>
                {cdData.updatedAt && (
                  <p className="text-xs text-slate-500 m-0">
                    Last refreshed: {new Date(cdData.updatedAt).toLocaleString()} Â· ~90s cache
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
                    <span className="font-mono font-semibold">{cdData.top10[cdYourIndex].name}</span> â€” rank{' '}
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

      {mainSection === 'achievements' && (
        <section className="space-y-5" aria-labelledby="dash-achievements-heading">
          <h3 id="dash-achievements-heading" className="text-lg font-semibold m-0 text-white">
            Top achievements
          </h3>
          <p className="text-sm text-slate-400 m-0 max-w-3xl">
            Ranked by profile badge score (higher tiers count more: violet 1 → legend 5). Top 50 with at least one
            active badge.
          </p>
          {achLoading && !achData ? (
            <div className={panelClass}>Loading achievementsâ€¦</div>
          ) : achError && !achData ? (
            <div className={`${panelClass} text-red-300`}>Error: {achError}</div>
          ) : !achData?.rows?.length ? (
            <div className={panelClass}>No achievement badges granted yet.</div>
          ) : (
            <>
              {yourAchRow ? (
                <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3" role="status">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-200 m-0 mb-1.5">Your place</p>
                  <p className="text-sm text-slate-100 m-0">
                    #{yourAchRow.rank} Â· {yourAchRow.badgeCount} badges Â· score {yourAchRow.score.toLocaleString()}
                    {yourAchRow.legend + yourAchRow.mythic + yourAchRow.gold > 0
                      ? ` Â· legend ${yourAchRow.legend} Â· mythic ${yourAchRow.mythic} Â· gold ${yourAchRow.gold}`
                      : ''}
                  </p>
                </div>
              ) : viewerIgn ? (
                <p className="text-xs text-slate-500 m-0 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  No badges listed for <span className="font-mono text-slate-300">{viewerIgn}</span> yet.
                </p>
              ) : null}
              <ol className="list-none m-0 p-0 space-y-2 max-w-3xl">
                {achData.rows.map((row) => {
                  const isYou = yourAchRow?.userId === row.userId
                  return (
                    <li
                      key={row.userId}
                      ref={isYou ? achYouRef : undefined}
                      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 scroll-mt-24 ${
                        isYou
                          ? 'border-amber-400/50 bg-amber-500/10 ring-2 ring-amber-400/35'
                          : 'border-white/5 bg-black/25'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sm font-bold tabular-nums text-sky-300">
                          {row.rank}
                        </span>
                        <span className="font-mono text-sm text-white truncate" title={row.username}>
                          {row.username}
                        </span>
                      </span>
                      <span className="text-sm text-slate-400 tabular-nums text-right">
                        <span className="text-white font-semibold">{row.badgeCount}</span> badges
                        <span> Â· score {row.score}</span>
                        {row.legend > 0 || row.mythic > 0 || row.gold > 0 ? (
                          <span className="block text-xs mt-0.5">
                            {row.legend > 0 ? `Legend ${row.legend}` : null}
                            {row.legend > 0 && (row.mythic > 0 || row.gold > 0) ? ' Â· ' : null}
                            {row.mythic > 0 ? `Mythic ${row.mythic}` : null}
                            {row.mythic > 0 && row.gold > 0 ? ' Â· ' : null}
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

      <div className="mt-8 pt-6 border-t border-white/10">
        <BattleTowerFacilityAdmin />
      </div>
    </div>
  )
}
