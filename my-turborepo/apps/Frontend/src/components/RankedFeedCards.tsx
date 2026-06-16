import { useMemo, useState, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import { humanizeBattleLogLines } from '../battleReplayHumanize'
import { ignNamesMatch } from '../ignMatch'
import type { BattleReplayPayload, MatchResultPayload } from '../types'
import { summarizeBattleReplayAi } from '../authApi'

export function formatRankedTs(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : iso
}

export function MatchResultCard({
  m,
  viewerIgn,
  showPokemonTeams = true,
}: {
  m: MatchResultPayload
  viewerIgn?: string | null
  showPokemonTeams?: boolean
}) {
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
          {formatRankedTs(m.timestamp)}
        </time>
      </div>
      {m.durationSeconds != null ? <p className="text-xs text-muted m-0">{m.durationSeconds}s</p> : null}
      <ul className="list-none m-0 p-0 space-y-2">
        {players.map((p, idx) => {
          const isYou = viewerIgn && ignNamesMatch(viewerIgn, p.playerName ?? '')
          const delta = p.eloChange
          const deltaStr = delta == null ? '' : `${delta >= 0 ? '+' : ''}${delta}`
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
              {showPokemonTeams && p.team && p.team.length > 0 ? (
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

const replayMarkdownComponents: Components = {
  h1: ({ children }) => (
    <h3 className="text-lg font-semibold text-[#e2e8f0] mt-4 mb-2 first:mt-0">{children}</h3>
  ),
  h2: ({ children }) => (
    <h3 className="text-base font-semibold text-[#e2e8f0] mt-4 mb-2 first:mt-0 border-b border-border/35 pb-1">
      {children}
    </h3>
  ),
  h3: ({ children }) => (
    <h4 className="text-sm font-semibold text-[#e2e8f0] mt-3 mb-1.5">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="my-2 text-[#e2e8f0]/90 leading-relaxed first:mt-0 last:mb-0">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="my-2 ml-4 list-disc space-y-1.5 text-[#e2e8f0]/90 marker:text-accent/70">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 ml-4 list-decimal space-y-1.5 text-[#e2e8f0]/90 marker:text-accent/70">{children}</ol>
  ),
  li: ({ children }) => <li className="[&>p]:my-1 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-[#f5efe6]">{children}</strong>,
  em: ({ children }) => <em className="italic text-[#f8f4ec]">{children}</em>,
}

export function BattleReplayCard({ r, viewerIgn }: { r: BattleReplayPayload; viewerIgn?: string | null }) {
  const players = r.players ?? []
  const log = r.battleLog ?? []
  const story = useMemo(() => humanizeBattleLogLines(log, players), [log, players])
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const runAiSummary = () => {
    setAiBusy(true)
    setAiError(null)
    void summarizeBattleReplayAi(r)
      .then(({ summary }) => setAiSummary(summary))
      .catch((e) => setAiError(e instanceof Error ? e.message : 'Summary failed'))
      .finally(() => setAiBusy(false))
  }

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
          <span className="text-xs text-muted tabular-nums">{formatRankedTs(r.timestamp)}</span>
        </summary>
        <div className="border-t border-border/50 px-4 py-3 space-y-3 text-sm">
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

          <div className="rounded-lg border border-border/50 bg-surface/30 px-3 py-2 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted m-0">AI summary</p>
              <button
                type="button"
                disabled={aiBusy}
                onClick={(e) => {
                  e.stopPropagation()
                  runAiSummary()
                }}
                className="text-xs font-medium px-2.5 py-1 rounded-md bg-accent/20 text-accent border border-accent/35 hover:bg-accent/30 disabled:opacity-50"
              >
                {aiBusy ? 'Generating…' : aiSummary ? 'Regenerate' : 'Summarize battle'}
              </button>
            </div>
            <p className="text-[0.65rem] text-muted m-0 leading-snug">
              Short AI recap: Pokémon remaining per trainer and whether the match looks ELO-buffing (forfeit, stall, etc.).
            </p>
            {aiError ? <p className="text-xs text-rose-400 m-0">{aiError}</p> : null}
            {aiSummary ? (
              <div className="mt-1 max-h-[min(26rem,50vh)] overflow-y-auto rounded border border-border/40 bg-[#0f0d0b]/45 p-3 text-[0.8125rem] font-sans leading-relaxed [&>*:first-child]:mt-0">
                <ReactMarkdown components={replayMarkdownComponents}>{aiSummary}</ReactMarkdown>
              </div>
            ) : (
              !aiBusy && (
                <p className="text-xs text-muted m-0">Click to fetch an AI-readable recap (requires API key on server).</p>
              )
            )}
          </div>

          {log.length > 0 ? (
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
                <p className="text-xs text-muted m-0">No play-by-play available for this replay.</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted m-0">No replay data for this match.</p>
          )}
        </div>
      </details>
    </article>
  )
}

export function RankedFeedSubTab({
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
