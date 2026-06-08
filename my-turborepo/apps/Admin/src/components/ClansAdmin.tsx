import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  adminDisbandClan,
  fetchAdminClanDetail,
  fetchAdminClans,
  type AdminClanDetail,
  type AdminClanSummary,
  type AdminClansSummary,
} from '../authApi'

type SortKey = 'treasury' | 'level' | 'elo' | 'members' | 'created' | 'name'
type DetailTab = 'overview' | 'members' | 'activity'

function formatCd(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function formatDt(s: string): string {
  return new Date(s).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function formatShortDate(s: string): string {
  return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function payoutCategoryLabel(category: string): string {
  if (category === 'top_treasury') return 'Top treasury'
  if (category === 'top_average_elo') return 'Total ELO'
  if (category === 'top_level') return 'Top level'
  return category
}

function rankMedal(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return `#${rank}`
}

const EMPTY_SUMMARY: AdminClansSummary = {
  total_clans: 0,
  total_members: 0,
  total_treasury: 0,
  total_elo: 0,
  avg_level: 0,
}

export function ClansAdmin() {
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [sort, setSort] = useState<SortKey>('treasury')
  const [clans, setClans] = useState<AdminClanSummary[]>([])
  const [summary, setSummary] = useState<AdminClansSummary>(EMPTY_SUMMARY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<AdminClanDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailTab, setDetailTab] = useState<DetailTab>('overview')
  const [disbandOpen, setDisbandOpen] = useState(false)
  const [disbandBusy, setDisbandBusy] = useState(false)
  const detailPanelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = window.setTimeout(() => setSearchDebounced(search.trim()), 300)
    return () => window.clearTimeout(t)
  }, [search])

  const loadList = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await fetchAdminClans(searchDebounced || undefined)
      setClans(res.clans)
      setSummary(res.summary ?? EMPTY_SUMMARY)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load clans')
      setClans([])
      setSummary(EMPTY_SUMMARY)
    } finally {
      setLoading(false)
    }
  }, [searchDebounced])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const sortedClans = useMemo(() => {
    const rows = [...clans]
    rows.sort((a, b) => {
      switch (sort) {
        case 'name':
          return a.name.localeCompare(b.name)
        case 'level':
          return b.level - a.level || b.xp - a.xp
        case 'elo':
          return (b.total_elo ?? 0) - (a.total_elo ?? 0)
        case 'members':
          return b.member_count - a.member_count
        case 'created':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        case 'treasury':
        default:
          return b.bank_balance - a.bank_balance
      }
    })
    return rows
  }, [clans, sort])

  const loadDetail = useCallback(async (clanId: number) => {
    setDetailLoading(true)
    setError(null)
    try {
      const d = await fetchAdminClanDetail(clanId)
      setDetail(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load clan detail')
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const selectClan = (clan: AdminClanSummary) => {
    setSelectedId(clan.id)
    setDetailTab('overview')
    setDisbandOpen(false)
    void loadDetail(clan.id)
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
      requestAnimationFrame(() => {
        detailPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }

  const closeDetail = () => {
    setSelectedId(null)
    setDetail(null)
    setDisbandOpen(false)
  }

  const confirmDisband = async () => {
    if (!selectedId) return
    setDisbandBusy(true)
    setError(null)
    try {
      await adminDisbandClan(selectedId)
      closeDetail()
      await loadList()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Disband failed')
    } finally {
      setDisbandBusy(false)
    }
  }

  const sortedMembers = useMemo(() => {
    if (!detail) return []
    return [...detail.members].sort((a, b) => {
      if (a.role === 'leader' && b.role !== 'leader') return -1
      if (b.role === 'leader' && a.role !== 'leader') return 1
      return b.donated_total - a.donated_total || b.elo - a.elo
    })
  }, [detail])

  const mobileDetailOpen = selectedId != null

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className={mobileDetailOpen ? 'hidden lg:block' : undefined}>
        <h1 className="text-xl sm:text-2xl font-bold text-[#f5efe6] m-0 tracking-tight">Clans</h1>
        <p className="text-sm text-muted m-0 mt-1.5 max-w-3xl">
          Monitor treasury, XP, members, economy perks, and leaderboard rewards. Select a clan for full activity
          history.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-error/15 border border-error/30 text-error text-sm">{error}</div>
      )}

      {!loading && clans.length > 0 && !mobileDetailOpen ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          <SummaryCard label="Total clans" value={String(summary.total_clans)} accent="text-accent" />
          <SummaryCard label="Total members" value={String(summary.total_members)} accent="text-sky-300" />
          <SummaryCard label="Combined treasury" value={`${formatCd(summary.total_treasury)} CD`} accent="text-amber-200" />
          <SummaryCard
            label="Avg level"
            value={`Lv ${summary.avg_level}`}
            subValue={`${formatCd(summary.total_elo)} ELO`}
            accent="text-emerald-300"
            className="col-span-2 lg:col-span-1"
          />
        </div>
      ) : null}

      <div className="grid lg:grid-cols-5 gap-3 sm:gap-4 items-start">
        {/* List panel */}
        <div
          className={`lg:col-span-2 space-y-3 min-w-0 ${mobileDetailOpen ? 'hidden lg:block' : ''}`}
        >
          <div className="rounded-xl bg-surface border border-border p-3 space-y-3">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clan name…"
              className="w-full px-3 py-2.5 rounded-lg bg-black/25 border border-border text-sm text-[#f5efe6] placeholder:text-muted focus:outline-none focus:border-accent/50"
            />
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 overflow-x-auto pb-0.5 -mx-0.5 px-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex gap-1.5 w-max pr-1">
                  {(
                    [
                      ['treasury', 'Treasury'],
                      ['level', 'Level'],
                      ['elo', 'ELO'],
                      ['members', 'Members'],
                      ['created', 'Newest'],
                      ['name', 'Name'],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSort(key)}
                      className={`shrink-0 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                        sort === key
                          ? 'bg-accent/20 text-accent border-accent/40'
                          : 'border-border/80 text-muted hover:text-[#f5efe6]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void loadList()}
                className="shrink-0 px-2.5 py-1 rounded-md text-xs border border-border text-muted hover:text-[#f5efe6]"
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="rounded-xl bg-surface border border-border overflow-hidden min-h-[240px] sm:min-h-[320px]">
            {loading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-16 rounded-lg bg-surface-hover/50 animate-pulse" />
                ))}
              </div>
            ) : sortedClans.length === 0 ? (
              <p className="p-6 text-muted text-sm m-0">No clans found.</p>
            ) : (
              <ul className="divide-y divide-border/70 list-none m-0 p-0 max-h-[min(55vh,28rem)] sm:max-h-[70vh] overflow-y-auto">
                {sortedClans.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => selectClan(c)}
                      className={`w-full text-left px-3 py-3 flex gap-3 transition-colors ${
                        selectedId === c.id
                          ? 'bg-accent/12 border-l-2 border-l-accent'
                          : 'hover:bg-surface-hover/50 border-l-2 border-l-transparent'
                      }`}
                    >
                      <img
                        src={c.avatar_url}
                        alt=""
                        className="w-11 h-11 rounded-xl object-cover shrink-0 bg-black/30 ring-1 ring-border/60"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-[#f5efe6] truncate">{c.name}</span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-accent/20 text-accent border border-accent/30">
                            Lv {c.level}
                          </span>
                        </div>
                        <p className="text-xs text-muted m-0 mt-0.5 truncate">
                          {c.leader_username} · {c.member_count}/{c.max_members} members
                        </p>
                        <p className="text-xs text-[#f5efe6]/80 m-0 mt-1">
                          <span className="text-amber-200/90">{formatCd(c.bank_balance)} CD</span>
                          <span className="text-muted mx-1.5">·</span>
                          <span>{c.total_elo != null ? `${formatCd(c.total_elo)} ELO` : '— ELO'}</span>
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Detail panel */}
        <div ref={detailPanelRef} className="lg:col-span-3 lg:sticky lg:top-4 min-w-0 scroll-mt-3">
          {selectedId == null ? (
            <div className="hidden lg:block rounded-xl bg-surface border border-dashed border-border/80 p-10 text-center">
              <p className="text-[#f5efe6] font-medium m-0">Select a clan</p>
              <p className="text-sm text-muted m-0 mt-2">
                Pick a clan from the list to view members, milestones, donations, and payouts.
              </p>
            </div>
          ) : (
            <div className="rounded-xl bg-surface border border-border overflow-hidden">
              {/* Mobile sticky back bar */}
              <div className="lg:hidden sticky top-0 max-md:top-14 z-10 flex items-center gap-2 px-3 py-2.5 border-b border-border/70 bg-surface/95 backdrop-blur-sm">
                <button
                  type="button"
                  onClick={closeDetail}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border text-[#f5efe6] hover:bg-surface-hover/60"
                >
                  <span aria-hidden>←</span> Back
                </button>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#f5efe6]">
                  {detail?.clan.name ?? 'Loading…'}
                </span>
              </div>

              {detailLoading || !detail ? (
                <div className="p-4 sm:p-8 space-y-4">
                  <div className="flex gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-surface-hover/60 animate-pulse" />
                    <div className="flex-1 space-y-2 pt-1">
                      <div className="h-5 w-40 rounded bg-surface-hover/60 animate-pulse" />
                      <div className="h-4 w-64 rounded bg-surface-hover/40 animate-pulse" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div key={i} className="h-14 rounded-lg bg-surface-hover/40 animate-pulse" />
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {/* Hero */}
                  <div className="relative px-3 sm:px-5 pt-4 sm:pt-5 pb-4 border-b border-border/70 bg-gradient-to-br from-accent/8 via-transparent to-transparent">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 min-w-0 w-full sm:w-auto">
                        <img
                          src={detail.clan.avatar_url}
                          alt=""
                          className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover shrink-0 ring-2 ring-accent/25 shadow-lg mx-auto sm:mx-0"
                        />
                        <div className="min-w-0 flex-1 text-center sm:text-left">
                          <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                            <h2 className="text-lg sm:text-xl font-bold text-[#f5efe6] m-0 truncate max-w-full">
                              {detail.clan.name}
                            </h2>
                            <span className="text-xs text-muted">#{detail.clan.id}</span>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-accent/25 text-accent border border-accent/35">
                              Level {detail.clan.level}
                            </span>
                          </div>
                          <p className="text-sm text-muted m-0 mt-1 break-words">
                            Leader <span className="text-[#f5efe6]">{detail.clan.leader_username}</span>
                          </p>
                          {detail.clan.leader_email ? (
                            <p className="text-xs text-muted m-0 mt-0.5 break-all">{detail.clan.leader_email}</p>
                          ) : null}
                          {detail.clan.bio ? (
                            <p className="text-sm text-[#f5efe6]/75 m-0 mt-2 max-w-xl leading-relaxed">
                              {detail.clan.bio}
                            </p>
                          ) : null}
                          <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-3">
                            <RankPill
                              label="Treasury"
                              rank={detail.clan.leaderboard_ranks.top_treasury}
                            />
                            <RankPill label="Total ELO" rank={detail.clan.leaderboard_ranks.top_total_elo} />
                            <RankPill label="Level" rank={detail.clan.leaderboard_ranks.top_level} />
                            {detail.clan.leaderboard_daily_bonus > 0 ? (
                              <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                +{formatCd(detail.clan.leaderboard_daily_bonus)} CD/day bonus
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={closeDetail}
                        className="hidden lg:inline-flex px-3 py-1.5 rounded-lg text-xs border border-border text-muted hover:text-[#f5efe6] shrink-0"
                      >
                        Close
                      </button>
                    </div>

                    <div className="mt-4 space-y-2">
                      <ProgressBar
                        label={`XP to next level (${detail.clan.xp_in_level} / ${detail.clan.xp_per_level})`}
                        value={detail.clan.xp_in_level}
                        max={detail.clan.xp_per_level}
                        tone="accent"
                      />
                      {detail.clan.next_member_unlock_treasury != null &&
                      detail.clan.member_count < detail.clan.max_members ? (
                        <ProgressBar
                          label={`Next member slot (${formatCd(detail.clan.bank_balance)} / ${formatCd(detail.clan.next_member_unlock_treasury)} CD)`}
                          value={detail.clan.bank_balance}
                          max={detail.clan.next_member_unlock_treasury}
                          tone="amber"
                        />
                      ) : detail.clan.member_count >= detail.clan.max_members ? (
                        <p className="text-xs text-muted m-0">Member slots maxed ({detail.clan.max_members}/5).</p>
                      ) : null}
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="border-b border-border/60 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <div className="flex gap-1 px-3 sm:px-4 pt-3 w-max min-w-full">
                      {(
                        [
                          ['overview', 'Overview'],
                          ['members', `Members (${detail.members.length})`],
                          ['activity', 'Activity'],
                        ] as const
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setDetailTab(key)}
                          className={`shrink-0 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                            detailTab === key
                              ? 'border-accent text-accent'
                              : 'border-transparent text-muted hover:text-[#f5efe6]'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-3 sm:p-4 space-y-4 lg:max-h-[calc(70vh-12rem)] lg:overflow-y-auto">
                    {detailTab === 'overview' ? (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                          <MetricTile label="Treasury" value={`${formatCd(detail.clan.bank_balance)} CD`} />
                          <MetricTile
                            label="Daily income"
                            value={`${formatCd(detail.clan.daily_income_per_day)} CD`}
                            hint={`×${detail.clan.daily_income_multiplier} · ${formatCd(detail.clan.daily_income_per_member)}/member`}
                          />
                          <MetricTile
                            label="Ticket bonus"
                            value={
                              detail.clan.has_daily_ticket_bonus
                                ? `+${detail.clan.daily_ticket_bonus}/member/day`
                                : 'None'
                            }
                          />
                          <MetricTile
                            label="Total ELO"
                            value={detail.clan.total_elo != null ? formatCd(detail.clan.total_elo) : '—'}
                            hint={
                              detail.stats.avg_member_elo != null
                                ? `avg ${formatCd(detail.stats.avg_member_elo)}/member`
                                : undefined
                            }
                          />
                          <MetricTile
                            label="Member donations"
                            value={`${formatCd(detail.stats.total_member_donations)} CD`}
                          />
                          <MetricTile
                            label="Last daily income"
                            value={detail.clan.last_daily_income_date ?? 'Never'}
                          />
                          <MetricTile label="Created" value={formatShortDate(detail.clan.created_at)} />
                          <MetricTile
                            label="Pending joins"
                            value={String(detail.stats.pending_join_requests_count)}
                          />
                          <MetricTile label="Total XP" value={formatCd(detail.clan.xp)} />
                        </div>

                        {detail.clan.treasury_milestones && detail.clan.treasury_milestones.length > 0 ? (
                          <section>
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted m-0 mb-2">
                              Treasury milestones
                            </h3>
                            <ul className="space-y-1.5 list-none m-0 p-0">
                              {detail.clan.treasury_milestones.map((m) => {
                                const unlocked = detail.clan.bank_balance >= m.threshold
                                return (
                                  <li
                                    key={m.key}
                                    className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 text-sm px-3 py-2 rounded-lg border ${
                                      unlocked
                                        ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-100'
                                        : 'bg-surface-hover/30 border-border/60 text-muted'
                                    }`}
                                  >
                                    <span>{m.label}</span>
                                    <span className="text-xs sm:shrink-0">
                                      {unlocked ? '✓ Unlocked' : `${formatCd(detail.clan.bank_balance)} / ${formatCd(m.threshold)} CD`}
                                    </span>
                                  </li>
                                )
                              })}
                            </ul>
                          </section>
                        ) : null}

                        {detail.pending_join_requests.length > 0 ? (
                          <section>
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted m-0 mb-2">
                              Pending join requests
                            </h3>
                            <div className="space-y-2">
                              {detail.pending_join_requests.map((r) => (
                                <div
                                  key={r.id}
                                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 text-sm px-3 py-2 rounded-lg bg-amber-500/8 border border-amber-500/20"
                                >
                                  <span className="text-[#f5efe6]">
                                    {r.requester_username}{' '}
                                    <span className="text-muted text-xs">#{r.requester_id}</span>
                                  </span>
                                  <span className="text-xs text-muted sm:shrink-0">{formatDt(r.created_at)}</span>
                                </div>
                              ))}
                            </div>
                          </section>
                        ) : null}

                        {detail.leaderboard_rewards ? (
                          <section className="rounded-lg bg-surface-hover/25 border border-border/50 px-3 py-2.5 text-xs text-muted">
                            Leaderboard rewards: #{1} → {formatCd(detail.leaderboard_rewards.top1_per_category)} CD/day,
                            #{2} → {formatCd(detail.leaderboard_rewards.top2_per_category)} CD/day per category (
                            {detail.leaderboard_rewards.categories.map((c) => c.label).join(', ')}).{' '}
                            {detail.leaderboard_rewards.schedule} ({detail.leaderboard_rewards.timezone}).
                          </section>
                        ) : null}
                      </>
                    ) : null}

                    {detailTab === 'members' ? (
                      <>
                        <div className="md:hidden space-y-2">
                          {sortedMembers.map((m) => (
                            <div
                              key={m.user_id}
                              className="rounded-lg border border-border/60 bg-surface-hover/25 px-3 py-3 space-y-2"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-[#f5efe6] m-0 truncate">{m.username}</p>
                                  <p className="text-xs text-muted m-0">#{m.user_id}</p>
                                </div>
                                {m.role === 'leader' ? (
                                  <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-accent/20 text-accent border border-accent/30">
                                    Leader
                                  </span>
                                ) : (
                                  <span className="shrink-0 text-xs text-muted">Member</span>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="rounded-md bg-black/20 px-2 py-1.5">
                                  <p className="text-muted m-0">ELO</p>
                                  <p className="text-[#f5efe6] font-medium m-0 tabular-nums">{formatCd(m.elo)}</p>
                                </div>
                                <div className="rounded-md bg-black/20 px-2 py-1.5">
                                  <p className="text-muted m-0">Donated</p>
                                  <p className="text-amber-200/90 font-medium m-0 tabular-nums">
                                    {formatCd(m.donated_total)} CD
                                  </p>
                                </div>
                                <div className="col-span-2 rounded-md bg-black/20 px-2 py-1.5">
                                  <p className="text-muted m-0">Joined</p>
                                  <p className="text-[#f5efe6] m-0">{formatDt(m.joined_at)}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="hidden md:block overflow-x-auto rounded-lg border border-border/70">
                          <table className="w-full text-sm border-collapse min-w-[32rem]">
                            <thead>
                              <tr className="bg-surface-hover/50 text-muted text-xs">
                                <th className="px-3 py-2 text-left font-medium">Player</th>
                                <th className="px-3 py-2 text-left font-medium">Role</th>
                                <th className="px-3 py-2 text-right font-medium">ELO</th>
                                <th className="px-3 py-2 text-right font-medium">Donated</th>
                                <th className="px-3 py-2 text-left font-medium">Joined</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sortedMembers.map((m) => (
                                <tr key={m.user_id} className="border-t border-border/50">
                                  <td className="px-3 py-2.5 text-[#f5efe6]">
                                    {m.username}
                                    <span className="text-muted text-xs ml-1">#{m.user_id}</span>
                                  </td>
                                  <td className="px-3 py-2.5">
                                    {m.role === 'leader' ? (
                                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-accent/20 text-accent border border-accent/30">
                                        Leader
                                      </span>
                                    ) : (
                                      <span className="text-xs text-muted">Member</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5 text-right text-[#f5efe6] tabular-nums">
                                    {formatCd(m.elo)}
                                  </td>
                                  <td className="px-3 py-2.5 text-right text-amber-200/90 tabular-nums">
                                    {formatCd(m.donated_total)} CD
                                  </td>
                                  <td className="px-3 py-2.5 text-muted text-xs whitespace-nowrap">
                                    {formatDt(m.joined_at)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : null}

                    {detailTab === 'activity' ? (
                      <div className="space-y-5">
                        <ActivitySection
                          title="Recent donations"
                          empty="No donations recorded."
                          items={detail.recent_donations.map((d) => ({
                            key: `d-${d.id}`,
                            primary: `${d.username} donated ${formatCd(d.amount)} CD`,
                            secondary: formatDt(d.created_at),
                          }))}
                        />
                        <ActivitySection
                          title="Recent disbursements"
                          empty="No disbursements recorded."
                          items={detail.recent_disbursements.map((d) => ({
                            key: `b-${d.id}`,
                            primary: `${d.leader_username} → ${d.recipient_username}: ${formatCd(d.amount)} CD`,
                            secondary: formatDt(d.created_at),
                          }))}
                        />
                        <ActivitySection
                          title="Leaderboard payouts"
                          empty="No leaderboard payouts yet."
                          items={detail.recent_leaderboard_payouts.map((p, i) => ({
                            key: `p-${p.payout_date}-${p.category}-${i}`,
                            primary: `${payoutCategoryLabel(p.category)} ${rankMedal(p.rank_position)} · +${formatCd(p.amount)} CD`,
                            secondary: `${p.payout_date} · ${formatDt(p.paid_at)}`,
                          }))}
                        />
                        <ActivitySection
                          title="XP grants (daily login)"
                          empty="No XP grants yet."
                          items={detail.recent_xp_grants.map((g, i) => ({
                            key: `x-${g.user_id}-${g.claim_date}-${i}`,
                            primary: `${g.username} · streak day ${g.streak_day} · +${g.xp_amount} XP`,
                            secondary: g.claim_date,
                          }))}
                        />
                      </div>
                    ) : null}

                    {/* Danger zone */}
                    <section className="pt-2 border-t border-border/60">
                      {!disbandOpen ? (
                        <button
                          type="button"
                          onClick={() => setDisbandOpen(true)}
                          className="px-3 py-2 rounded-lg text-xs border border-error/40 text-error hover:bg-error/10"
                        >
                          Force disband clan…
                        </button>
                      ) : (
                        <div className="rounded-lg bg-error/8 border border-error/25 p-3 space-y-2">
                          <p className="text-sm text-error m-0">
                            Permanently delete <strong>{detail.clan.name}</strong>? Members (except leader) get a
                            24h rejoin cooldown.
                          </p>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <button
                              type="button"
                              disabled={disbandBusy}
                              onClick={() => void confirmDisband()}
                              className="px-3 py-2 rounded-lg text-xs bg-error text-white hover:bg-error/90 disabled:opacity-50"
                            >
                              {disbandBusy ? 'Disbanding…' : 'Confirm disband'}
                            </button>
                            <button
                              type="button"
                              disabled={disbandBusy}
                              onClick={() => setDisbandOpen(false)}
                              className="px-3 py-2 rounded-lg text-xs border border-border text-muted"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </section>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  subValue,
  accent,
  className = '',
}: {
  label: string
  value: string
  subValue?: string
  accent: string
  className?: string
}) {
  return (
    <div className={`rounded-xl bg-surface border border-border px-3 sm:px-4 py-2.5 sm:py-3 ${className}`}>
      <p className="text-[10px] sm:text-[11px] uppercase tracking-wide text-muted m-0">{label}</p>
      <p className={`text-base sm:text-lg font-bold m-0 mt-1 tabular-nums ${accent}`}>{value}</p>
      {subValue ? <p className="text-xs text-muted m-0 mt-0.5 tabular-nums">{subValue}</p> : null}
    </div>
  )
}

function RankPill({ label, rank }: { label: string; rank: number | null }) {
  if (rank == null) return null
  const tone =
    rank === 1
      ? 'bg-amber-500/15 text-amber-200 border-amber-500/30'
      : rank === 2
        ? 'bg-slate-400/15 text-slate-200 border-slate-400/30'
        : 'bg-surface-hover/60 text-muted border-border/60'
  return (
    <span className={`text-[10px] px-2 py-1 rounded-full border ${tone}`}>
      {label} {rankMedal(rank)}
    </span>
  )
}

function ProgressBar({
  label,
  value,
  max,
  tone,
}: {
  label: string
  value: number
  max: number
  tone: 'accent' | 'amber'
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  const bar = tone === 'accent' ? 'bg-accent' : 'bg-amber-400'
  return (
    <div>
      <div className="flex justify-between gap-2 text-[10px] sm:text-[11px] text-muted mb-1">
        <span className="min-w-0 break-words">{label}</span>
        <span className="shrink-0 tabular-nums">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-black/30 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function MetricTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-surface-hover/35 border border-border/50 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-muted m-0">{label}</p>
      <p className="text-sm font-semibold text-[#f5efe6] m-0 mt-0.5 tabular-nums">{value}</p>
      {hint ? <p className="text-[10px] text-muted m-0 mt-0.5">{hint}</p> : null}
    </div>
  )
}

function ActivitySection({
  title,
  empty,
  items,
}: {
  title: string
  empty: string
  items: { key: string; primary: string; secondary: string }[]
}) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted m-0 mb-2">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted m-0">{empty}</p>
      ) : (
        <ul className="space-y-1.5 list-none m-0 p-0">
          {items.map((item) => (
            <li
              key={item.key}
              className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 sm:gap-x-3 text-sm px-3 py-2.5 rounded-lg bg-surface-hover/30 border border-border/40"
            >
              <span className="text-[#f5efe6] break-words">{item.primary}</span>
              <span className="text-xs text-muted sm:shrink-0">{item.secondary}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
