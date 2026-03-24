import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { fetchMinecraftDashboard, type MinecraftDashboardResponse } from '../authApi'

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: ReactNode
  sub?: string
  accent?: 'emerald' | 'violet' | 'amber' | 'sky'
}) {
  /* Static classes so Tailwind always emits them (dynamic strings can break + layout). */
  const accentBg =
    accent === 'emerald'
      ? 'bg-gradient-to-br from-emerald-500/20 to-teal-600/10'
      : accent === 'amber'
        ? 'bg-gradient-to-br from-amber-500/20 to-orange-600/10'
        : accent === 'sky'
          ? 'bg-gradient-to-br from-sky-500/20 to-blue-600/10'
          : 'bg-gradient-to-br from-violet-500/20 to-indigo-600/10'

  return (
    <div
      className={`relative z-0 min-h-[5.5rem] overflow-hidden rounded-2xl border border-white/10 ${accentBg} p-4 shadow-lg shadow-black/20`}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400 m-0">{label}</p>
      <p className="text-2xl font-bold tracking-tight text-white m-0 mt-1 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-slate-500 m-0 mt-1">{sub}</p>}
    </div>
  )
}

function DetailGrid({ data }: { data: MinecraftDashboardResponse }) {
  const rows: { k: string; v: string }[] = []
  if (data.version) rows.push({ k: 'Version', v: data.version })
  if (data.software) rows.push({ k: 'Software / platform', v: data.software })
  if (data.mapName) rows.push({ k: 'World / map', v: data.mapName })
  if (data.reportedHost || data.reportedPort != null) {
    rows.push({
      k: 'Reported host',
      v: `${data.reportedHost ?? '—'}${data.reportedPort != null ? `:${data.reportedPort}` : ''}`,
    })
  }
  if (data.srvTarget) rows.push({ k: 'SRV', v: data.srvTarget })
  if (data.protocol != null) rows.push({ k: 'Protocol', v: String(data.protocol) })

  if (rows.length === 0) return null

  return (
    <div className="rounded-2xl border border-white/10 bg-surface/40 backdrop-blur-sm p-5">
      <h3 className="text-sm font-semibold text-violet-200/90 m-0 mb-4 flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
        Server metadata
      </h3>
      <dl className="m-0 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
        {rows.map(({ k, v }) => (
          <div key={k}>
            <dt className="text-xs text-slate-500 m-0">{k}</dt>
            <dd className="text-sm text-slate-200 m-0 mt-0.5 font-mono break-all">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

type Filter = 'all' | 'online' | 'offline'

function formatOfflineDuration(seconds: number | null): string {
  if (seconds == null || seconds < 0) return '—'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  // Always include hours when ≥1 day; use hours+minutes when <1 day
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return s > 0 ? `${s}s` : '<1m'
}

export function MinecraftDashboard() {
  const [data, setData] = useState<MinecraftDashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    setHint(null)
    fetchMinecraftDashboard()
      .then(setData)
      .catch((e: Error & { hint?: string }) => {
        setData(null)
        setError(e.message || 'Failed to load')
        if (e.hint) setHint(e.hint)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    if (!data?.players) return []
    const q = search.trim().toLowerCase()
    let list = data.players
    if (filter !== 'all') list = list.filter((p) => p.status === filter)
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q))
    return list
  }, [data?.players, filter, search])

  const counts = useMemo(() => {
    if (!data?.players.length) return { on: 0, off: 0 }
    let on = 0,
      off = 0
    for (const p of data.players) {
      if (p.status === 'online') on++
      else off++
    }
    return { on, off }
  }, [data?.players])

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white m-0 bg-gradient-to-r from-white via-violet-100 to-indigo-200 bg-clip-text text-transparent">
            Server Dashboard
          </h1>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 border border-white/10 shadow-lg shadow-violet-900/40 disabled:opacity-50 transition-all"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {loading && !data && (
        <div className="rounded-2xl border border-white/10 bg-surface/50 p-16 text-center text-slate-400 animate-pulse">
          Connecting to your server…
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-950/30 p-6 text-red-200">
          <p className="font-semibold m-0">{error}</p>
          {hint && <p className="text-sm text-red-300/80 m-0 mt-2">{hint}</p>}
        </div>
      )}

      {data && (
        <>
          {/* Hero */}
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-950/90 via-[#1e1b4b]/90 to-slate-950/90 p-6 sm:p-8 shadow-2xl shadow-indigo-950/50">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(139,92,246,0.25),transparent)] pointer-events-none" />
            {/* Grid (not flex) avoids flex-1 + nested grid overlap bugs on narrow / lg layouts */}
            <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start lg:gap-10">
              <div className="flex min-w-0 items-start gap-5">
                {data.faviconDataUri ? (
                  <div className="shrink-0 rounded-2xl border border-white/20 bg-black/30 p-2 shadow-inner">
                    <img
                      src={data.faviconDataUri}
                      alt=""
                      width={72}
                      height={72}
                      className="rounded-xl [image-rendering:pixelated]"
                    />
                  </div>
                ) : (
                  <div className="shrink-0 w-[88px] h-[88px] rounded-2xl border border-dashed border-white/20 bg-white/5 flex items-center justify-center text-slate-500 text-xs text-center p-2">
                    No icon
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-widest text-violet-300/80 m-0">Your server</p>
                  <p className="text-xl sm:text-2xl font-bold text-white m-0 mt-1 line-clamp-3">
                    {data.motd || 'Minecraft server'}
                  </p>
                  <p className="text-sm text-slate-400 m-0 mt-2">
                    {data.source === 'query' ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-emerald-300 text-xs font-medium border border-emerald-500/30">
                        Full UDP query + ping
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-amber-200 text-xs font-medium border border-amber-500/30">
                        Server list ping (sample players if crowded)
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="min-w-0">
                <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-3">
                  <StatCard
                    label="Players online"
                    value={
                      <>
                        {data.online}
                        <span className="text-lg font-normal text-slate-400"> / {data.maxPlayers}</span>
                      </>
                    }
                    accent="emerald"
                  />
                  <StatCard
                    label="Ping"
                    value={data.latencyMs != null ? `${data.latencyMs} ms` : '—'}
                    sub="Round-trip"
                    accent="sky"
                  />
                  <StatCard label="Protocol" value={data.protocol ?? '—'} accent="violet" />
                  <StatCard
                    label="Accounts"
                    value={data.rosterAccountCount ?? data.players.length}
                    sub="In merged roster"
                    accent="amber"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Stats row 2 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-white/10 bg-surface/40 backdrop-blur-sm p-5">
              <h3 className="text-sm font-semibold text-violet-200/90 m-0 mb-3">Message of the day</h3>
              <p className="text-lg text-slate-100 m-0 leading-snug">{data.motd || '—'}</p>
            </div>
            <DetailGrid data={data} />
          </div>

          {data.plugins && data.plugins.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-surface/40 backdrop-blur-sm p-5">
              <h3 className="text-sm font-semibold text-violet-200/90 m-0 mb-4">
                Plugins / mods ({data.plugins.length})
              </h3>
              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-1">
                {data.plugins.map((line, i) => (
                  <span
                    key={`${i}-${line.slice(0, 48)}`}
                    className="inline-block max-w-full truncate rounded-lg border border-indigo-500/25 bg-indigo-950/40 px-3 py-1.5 text-xs font-mono text-indigo-100/90"
                    title={line}
                  >
                    {line}
                  </span>
                ))}
              </div>
            </div>
          )}

          {data.note && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-950/20 px-4 py-3 text-sm text-amber-100/90">
              {data.note}
            </div>
          )}

          {data.rosterNote && (
            <div className="rounded-xl border border-violet-500/25 bg-violet-950/30 px-4 py-3 text-sm text-violet-100/90">
              {data.rosterNote}
            </div>
          )}

          {data.presenceTracking === false && (
            <div className="rounded-xl border border-slate-500/25 bg-slate-950/40 px-4 py-3 text-xs text-slate-400">
              Streak & offline time need the <code className="text-slate-300">minecraft_player_presence</code> table in
              Supabase — run <code className="text-slate-300">supabase/minecraft_player_presence.sql</code>.
            </div>
          )}

          {data.cobbledollarsRconError && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-950/20 px-4 py-3 text-xs text-amber-100/90 leading-relaxed break-words">
              <strong className="text-amber-200">Cobble$ (RCON)</strong> — {data.cobbledollarsRconError}
            </div>
          )}

          <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-950/40 to-orange-950/20 p-5 shadow-lg shadow-black/15">
            <h3 className="text-sm font-semibold text-amber-200/95 m-0 flex items-center gap-2 mb-4">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_8px_#fbbf24]" />
              Top 10 Cobble$ <span className="font-normal text-amber-100/50">(in-game leaderboard)</span>
            </h3>
            {(data.cobbledollarsTop10?.length ?? 0) > 0 ? (
              <ol className="m-0 list-none p-0 space-y-2">
                {data.cobbledollarsTop10!.map((row, i) => (
                  <li
                    key={`${row.name}-${row.balance}-${i}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/20 px-4 py-2.5"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-xs font-bold tabular-nums text-amber-300">
                        {i + 1}
                      </span>
                      <span className="font-mono text-sm text-white truncate" title={row.name}>
                        {row.name}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-amber-100">
                      {Number(row.balance).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="rounded-xl border border-amber-500/10 bg-black/25 px-4 py-3 text-sm text-amber-100/70 leading-relaxed">
                {data.cobbledollarsRconError ? (
                  <p className="m-0">RCON did not return a usable leaderboard (see Cobble$ error above).</p>
                ) : (
                  <p className="m-0">
                    No balances parsed from <code className="text-amber-200/90">cobbledollars leaderboard</code> RCON
                    output. Check the Cobble$ error above or server logs if this persists.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Players */}
          <div className="rounded-2xl border border-white/10 bg-surface/30 backdrop-blur-md overflow-hidden shadow-xl shadow-black/20">
            <div className="border-b border-white/10 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-white m-0">Accounts & status</h3>
                <p className="text-xs text-slate-500 m-0 mt-1">
                  {counts.on} online · {counts.off} offline
                  {data.presenceTracking ? (
                    <span className="text-slate-600"> · streak = consecutive UTC days seen online</span>
                  ) : null}
                  {data.rosterFromServerWhitelist != null && data.rosterFromServerWhitelist > 0 && (
                    <> · {data.rosterFromServerWhitelist} from whitelist</>
                  )}
                  {data.rosterWebsiteUsers != null && data.rosterWebsiteUsers > 0 && (
                    <> · {data.rosterWebsiteUsers} from website</>
                  )}
                  {data.rosterExtraFromEnv != null && data.rosterExtraFromEnv > 0 && (
                    <> · {data.rosterExtraFromEnv} from env</>
                  )}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <input
                  type="search"
                  placeholder="Search name…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 min-w-[200px]"
                />
                <div className="flex rounded-xl border border-white/10 p-0.5 bg-black/20">
                  {(['all', 'online', 'offline'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                        filter === f
                          ? 'bg-violet-600 text-white shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {filtered.length === 0 ? (
              <p className="m-0 p-10 text-center text-slate-500">No players match your search or filter.</p>
            ) : (
              <div className="overflow-x-auto max-h-[min(70vh,32rem)] overflow-y-auto">
                {/* table + table-fixed: header and body share the same column widths (grid per-row auto cols did not) */}
                <table className="w-full min-w-[520px] border-collapse table-fixed">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="w-[34%] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Player
                      </th>
                      <th className="w-[16%] px-2 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Status
                      </th>
                      <th className="w-[14%] px-2 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Day streak
                      </th>
                      <th className="w-[36%] px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Offline for
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filtered.map((p) => (
                      <tr key={`${p.name}-${p.status}`} className="hover:bg-white/[0.03] transition-colors">
                        <td className="px-5 py-3 align-middle">
                          <div className="flex items-center gap-3 min-w-0">
                            <span
                              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
                                p.status === 'online'
                                  ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/40'
                                  : 'bg-slate-700/50 text-slate-400 ring-1 ring-slate-500/30'
                              }`}
                            >
                              {p.name.charAt(0).toUpperCase()}
                            </span>
                            <p className="font-mono text-base text-white m-0 truncate">{p.name}</p>
                          </div>
                        </td>
                        <td className="px-3 py-3 align-middle text-center">
                          <span
                            className={`inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                              p.status === 'online'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : 'bg-slate-700/80 text-slate-400 border border-slate-500/40'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full shrink-0 ${p.status === 'online' ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-slate-500'}`}
                            />
                            {p.status}
                          </span>
                        </td>
                        <td className="px-2 py-3 align-middle text-center text-sm text-violet-200/90 font-semibold tabular-nums">
                          {p.streakDays > 0 ? `${p.streakDays}d` : '—'}
                        </td>
                        <td className="px-4 py-3 align-middle text-center text-sm text-slate-300 tabular-nums">
                          {p.status === 'online' ? '—' : formatOfflineDuration(p.offlineSeconds)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
