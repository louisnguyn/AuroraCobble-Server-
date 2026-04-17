import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { humanizeBattleLogLines } from '../battleReplayHumanize'
import { fetchBattleReplays, fetchMatchResults } from '../api'
import { useAuth } from '../contexts/AuthContext'
import { ignNamesMatch } from '../ignMatch'
import type { BattleReplayPayload, MatchResultPayload } from '../types'

type FeedTab = 'matches' | 'replays'

function FeedSubTab({
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

function formatTs(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : iso
}

function MatchResultCard({ m, viewerIgn }: { m: MatchResultPayload; viewerIgn?: string | null }) {
  const players = m.players ?? []
  return (
    <article
      className={`pixel-panel-soft px-4 py-3 space-y-2 ${
        viewerIgn && players.some((p) => ignNamesMatch(viewerIgn, p.playerName ?? ''))
          ? 'ring-2 ring-accent/40'
          : ''
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 gap-y-1">
        <h3 className="text-sm font-semibold m-0 text-[#e2e8f0]">
          {m.matchType ?? 'Ranked'} · {m.format ?? '?'}
          {m.endReason ? <span className="text-muted font-normal"> · {m.endReason}</span> : null}
        </h3>
        <time className="text-xs text-muted tabular-nums" dateTime={m.timestamp}>
          {formatTs(m.timestamp)}
        </time>
      </div>
      <p className="text-xs text-muted m-0">
        {m.matchId ? (
          <>
            Match <span className="font-mono text-[#e2e8f0]/90">{m.matchId}</span>
            {m.durationSeconds != null ? ` · ${m.durationSeconds}s` : ''}
          </>
        ) : m.durationSeconds != null ? (
          <>{m.durationSeconds}s</>
        ) : (
          '—'
        )}
        {m.serverId ? ` · ${m.serverId}` : ''}
      </p>
      <ul className="list-none m-0 p-0 space-y-2">
        {players.map((p, idx) => {
          const isYou = viewerIgn && ignNamesMatch(viewerIgn, p.playerName ?? '')
          const delta = p.eloChange
          const deltaStr =
            delta == null ? '' : `${delta >= 0 ? '+' : ''}${delta}`
          return (
            <li
              key={`${p.uuid ?? p.playerName ?? idx}-${idx}`}
              className={`rounded-lg border border-border/60 px-3 py-2 text-sm ${
                p.isWinner ? 'bg-emerald-950/25' : 'bg-surface/40'
              } ${isYou ? 'ring-1 ring-accent/50' : ''}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono font-medium text-[#e2e8f0]">
                  {p.playerName ?? 'Unknown'}
                  {p.isWinner ? (
                    <span className="ml-2 text-xs font-semibold text-emerald-400/95">W</span>
                  ) : (
                    <span className="ml-2 text-xs text-muted">L</span>
                  )}
                </span>
                {delta != null ? (
                  <span
                    className={`tabular-nums text-xs font-semibold ${
                      delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-rose-400' : 'text-muted'
                    }`}
                  >
                    ELO {p.eloBefore ?? '—'} → {p.eloAfter ?? '—'} ({deltaStr})
                  </span>
                ) : null}
              </div>
              {p.team && p.team.length > 0 ? (
                <p className="text-xs text-muted m-0 mt-1.5 leading-relaxed">
                  {p.team.map((t) => t.species).join(' · ')}
                </p>
              ) : null}
            </li>
          )
        })}
      </ul>
    </article>
  )
}

function BattleReplayCard({ r, viewerIgn }: { r: BattleReplayPayload; viewerIgn?: string | null }) {
  const players = r.players ?? []
  const log = r.battleLog ?? []
  const story = useMemo(() => humanizeBattleLogLines(log, players), [log, players])
  const summaryYou =
    viewerIgn && players.some((p) => ignNamesMatch(viewerIgn, p.playerName ?? '')) ? 'ring-2 ring-accent/40' : ''
  return (
    <article className={`pixel-panel-soft overflow-hidden ${summaryYou}`}>
      <details className="group">
        <summary className="cursor-pointer list-none px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden flex flex-wrap items-center justify-between gap-2 gap-y-1 hover:bg-surface-hover/30">
          <span className="text-sm font-semibold text-[#e2e8f0]">
            {r.format ?? 'Battle'} · {r.turnCount != null ? `${r.turnCount} turns` : 'Replay'}
            {r.endReason ? <span className="text-muted font-normal"> · {r.endReason}</span> : null}
          </span>
          <span className="text-xs text-muted tabular-nums">{formatTs(r.timestamp)}</span>
        </summary>
        <div className="border-t border-border/50 px-4 py-3 space-y-3 text-sm">
          <p className="text-xs text-muted m-0">
            {r.matchId ? (
              <>
                <span className="font-mono text-[#e2e8f0]/90">{r.matchId}</span>
                {r.serverId ? ` · ${r.serverId}` : ''}
              </>
            ) : (
              r.serverId ?? '—'
            )}
          </p>
          <ul className="list-none m-0 p-0 space-y-1">
            {players.map((p, idx) => (
              <li
                key={`${p.uuid ?? p.playerName ?? idx}-${idx}`}
                className={`text-xs font-mono ${
                  viewerIgn && ignNamesMatch(viewerIgn, p.playerName ?? '') ? 'text-accent' : 'text-[#e2e8f0]/90'
                }`}
              >
                {p.playerName}
                {p.isWinner ? <span className="text-emerald-400/90 ml-1">(win)</span> : null}
                {p.team && p.team.length > 0 ? (
                  <span className="text-muted font-sans ml-1">— {p.team.join(', ')}</span>
                ) : null}
              </li>
            ))}
          </ul>
          {log.length > 0 ? (
            <>
              <div className="rounded-lg border border-border/50 bg-surface/30 px-3 py-2">
                <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted m-0 mb-2">
                  Play-by-play
                </p>
                {story.length > 0 ? (
                  <ol className="list-decimal m-0 pl-5 space-y-1.5 text-[0.8125rem] leading-snug text-[#e2e8f0]/95">
                    {story.map((s, i) => (
                      <li key={`${i}-${s.slice(0, 24)}`} className="marker:text-muted">
                        {s}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-xs text-muted m-0">
                    No short summary could be built from this log format. Use the technical log below.
                  </p>
                )}
              </div>
              <details className="rounded-lg border border-border/40 bg-black/25">
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted hover:text-[#e2e8f0]/90">
                  Technical log (Showdown / Cobblemon protocol)
                </summary>
                <pre className="m-0 max-h-72 overflow-auto border-t border-border/40 p-3 text-[11px] leading-snug font-mono text-slate-400 whitespace-pre-wrap break-words">
                  {log.join('\n')}
                </pre>
              </details>
            </>
          ) : (
            <p className="text-xs text-muted m-0">No battle log lines in payload.</p>
          )}
        </div>
      </details>
    </article>
  )
}

export function RankedApiFeed() {
  const { user } = useAuth()
  const viewerIgn = user?.username?.trim() ?? null

  const [tab, setTab] = useState<FeedTab>('matches')
  const [matches, setMatches] = useState<MatchResultPayload[]>([])
  const [replays, setReplays] = useState<BattleReplayPayload[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    return Promise.all([fetchMatchResults({ limit: 50 }), fetchBattleReplays({ limit: 50 })])
      .then(([m, r]) => {
        setMatches(Array.isArray(m.items) ? m.items : [])
        setReplays(Array.isArray(r.items) ? r.items : [])
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const panelClass = 'p-8 text-center pixel-panel'

  if (loading) return <div className={panelClass}>Loading ranked feed…</div>
  if (error) return <div className={`${panelClass} text-error`}>Error: {error}</div>

  return (
    <section className="space-y-5" aria-labelledby="ranked-feed-heading">
      <h2 id="ranked-feed-heading" className="sr-only">
        Ranked match feed
      </h2>
      <div className="flex flex-wrap gap-2 items-center justify-between gap-y-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Ranked feed">
          <FeedSubTab active={tab === 'matches'} onClick={() => setTab('matches')}>
            Match results
          </FeedSubTab>
          <FeedSubTab active={tab === 'replays'} onClick={() => setTab('replays')}>
            Battle replays
          </FeedSubTab>
        </div>
        <button type="button" onClick={() => void load()} className="pixel-btn py-2 px-4 text-base">
          Refresh
        </button>
      </div>
      <p className="text-sm text-muted m-0 max-w-3xl leading-relaxed">
        Per-match ELO and teams; battle replays include a readable play-by-play plus the raw protocol log. From
        CobbleRanked{' '}
        <a
          href="https://www.gashistudios.site/docs/cobbleranked/configuration/api/"
          className="text-accent underline-offset-2 hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          Web API
        </a>
        . Point <code className="text-xs text-[#e2e8f0]/90">endpoint.baseUrl</code> at this site&apos;s API base and
        enable <code className="text-xs text-[#e2e8f0]/90">sync.dataTypes.matchResults</code> /{' '}
        <code className="text-xs text-[#e2e8f0]/90">battleReplays</code>.
      </p>

      {tab === 'matches' ? (
        matches.length === 0 ? (
          <div className={`${panelClass} text-muted text-sm`}>
            No match results stored yet. After the next ranked battle sync, entries appear here.
          </div>
        ) : (
          <div className="space-y-3 max-w-4xl">
            {matches.map((m, i) => (
              <MatchResultCard key={`${m.matchId ?? 'm'}-${m.timestamp ?? i}-${i}`} m={m} viewerIgn={viewerIgn} />
            ))}
          </div>
        )
      ) : replays.length === 0 ? (
        <div className={`${panelClass} text-muted text-sm`}>
          No battle replays stored yet. Turn on battle replay sync in the mod to populate this list.
        </div>
      ) : (
        <div className="space-y-3 max-w-4xl">
          {replays.map((r, i) => (
            <BattleReplayCard key={`${r.matchId ?? 'r'}-${r.timestamp ?? i}-${i}`} r={r} viewerIgn={viewerIgn} />
          ))}
        </div>
      )}
    </section>
  )
}
