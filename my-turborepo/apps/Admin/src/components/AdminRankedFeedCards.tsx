import { useMemo, useState, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import { humanizeBattleLogLines } from '../battleReplayHumanize'
import { adminSummarizeBattleReplay } from '../authApi'
import type { BattleReplayPayload, MatchResultPayload } from '../types'

export function formatRankedTs(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : iso
}

export function AdminMatchResultCard({ m }: { m: MatchResultPayload }) {
  const players = m.players ?? []
  return (
    <article className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 space-y-2 text-slate-200">
      <div className="flex flex-wrap items-baseline justify-between gap-2 gap-y-1">
        <h3 className="text-sm font-semibold m-0 text-slate-100">
          {m.matchType ?? 'Ranked'} · {m.format ?? '?'}
          {m.endReason ? <span className="text-slate-500 font-normal"> · {m.endReason}</span> : null}
        </h3>
        <time className="text-xs text-slate-500 tabular-nums" dateTime={m.timestamp}>
          {formatRankedTs(m.timestamp)}
        </time>
      </div>
      {m.durationSeconds != null ? (
        <p className="text-xs text-slate-500 m-0">{m.durationSeconds}s</p>
      ) : null}
      {m.turnCount != null ? <p className="text-xs text-slate-500 m-0">Turns: {m.turnCount}</p> : null}
      <ul className="list-none m-0 p-0 space-y-2">
        {players.map((p, idx) => {
          const delta = p.eloChange
          const deltaStr = delta == null ? '' : `${delta >= 0 ? '+' : ''}${delta}`
          return (
            <li
              key={`${p.uuid ?? p.playerName ?? idx}-${idx}`}
              className={`rounded-lg border border-white/10 px-3 py-2 text-sm ${
                p.isWinner ? 'bg-emerald-950/30' : 'bg-black/30'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono font-medium text-slate-100">
                  {p.playerName ?? 'Unknown'}
                  {p.isWinner ? (
                    <span className="ml-2 text-xs font-semibold text-emerald-400">W</span>
                  ) : (
                    <span className="ml-2 text-xs text-slate-500">L</span>
                  )}
                </span>
                {delta != null ? (
                  <span
                    className={`tabular-nums text-xs font-semibold ${
                      delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-rose-400' : 'text-slate-400'
                    }`}
                  >
                    ELO {p.eloBefore ?? '—'} → {p.eloAfter ?? '—'} ({deltaStr})
                  </span>
                ) : null}
              </div>
              {p.team && p.team.length > 0 ? (
                <p className="text-xs text-slate-500 m-0 mt-1.5 leading-relaxed">
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

const adminReplayMarkdownComponents: Components = {
  h1: ({ children }) => (
    <h3 className="text-lg font-semibold text-slate-100 mt-4 mb-2 first:mt-0">{children}</h3>
  ),
  h2: ({ children }) => (
    <h3 className="text-base font-semibold text-slate-100 mt-4 mb-2 first:mt-0 border-b border-white/10 pb-1">
      {children}
    </h3>
  ),
  h3: ({ children }) => (
    <h4 className="text-sm font-semibold text-slate-100 mt-3 mb-1.5">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="my-2 text-slate-200/95 leading-relaxed first:mt-0 last:mb-0">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="my-2 ml-4 list-disc space-y-1.5 text-slate-200/95 marker:text-cyan-300/70">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 ml-4 list-decimal space-y-1.5 text-slate-200/95 marker:text-cyan-300/70">{children}</ol>
  ),
  li: ({ children }) => <li className="[&>p]:my-1 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-slate-50">{children}</strong>,
  em: ({ children }) => <em className="italic text-slate-100">{children}</em>,
}

export function AdminBattleReplayCard({ r }: { r: BattleReplayPayload }) {
  const players = r.players ?? []
  const log = r.battleLog ?? []
  const story = useMemo(() => humanizeBattleLogLines(log, players), [log, players])
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const runAi = () => {
    setAiBusy(true)
    setAiError(null)
    void adminSummarizeBattleReplay(r)
      .then(({ summary }) => setAiSummary(summary))
      .catch((e) => setAiError(e instanceof Error ? e.message : 'Summary failed'))
      .finally(() => setAiBusy(false))
  }

  return (
    <article className="rounded-xl border border-white/10 bg-black/25 overflow-hidden">
      <details className="group">
        <summary className="cursor-pointer list-none px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden flex flex-wrap items-center justify-between gap-2 gap-y-1 hover:bg-white/[0.04]">
          <span className="text-sm font-semibold text-slate-100">
            {r.format ?? 'Battle'} · {r.turnCount != null ? `${r.turnCount} turns` : 'Replay'}
            {r.endReason ? <span className="text-slate-500 font-normal"> · {r.endReason}</span> : null}
          </span>
          <span className="text-xs text-slate-500 tabular-nums">{formatRankedTs(r.timestamp)}</span>
        </summary>
        <div className="border-t border-white/10 px-4 py-3 space-y-3 text-sm">
          <ul className="list-none m-0 p-0 space-y-1">
            {players.map((p, idx) => (
              <li key={`${p.uuid ?? p.playerName ?? idx}-${idx}`} className="text-xs font-mono text-slate-200">
                {p.playerName}
                {p.isWinner ? <span className="text-emerald-400/90 ml-1">(win)</span> : null}
                {p.team && p.team.length > 0 ? (
                  <span className="text-slate-500 font-sans ml-1">— {p.team.join(', ')}</span>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500 m-0">
                AI summary (OpenAI)
              </p>
              <button
                type="button"
                disabled={aiBusy}
                onClick={(e) => {
                  e.stopPropagation()
                  runAi()
                }}
                className="text-xs font-medium px-2.5 py-1 rounded-md bg-cyan-500/15 text-cyan-200 border border-cyan-400/35 hover:bg-cyan-500/25 disabled:opacity-50"
              >
                {aiBusy ? 'Generating…' : aiSummary ? 'Regenerate' : 'Summarize'}
              </button>
            </div>
            <p className="text-[0.65rem] text-slate-500 m-0 leading-snug">
              Short recap: Pokémon left per trainer and ELO-buffing % (forfeit, Protect stall, etc.).
            </p>
            {aiError ? <p className="text-xs text-rose-400 m-0">{aiError}</p> : null}
            {aiSummary ? (
              <div className="mt-1 max-h-[min(26rem,50vh)] overflow-y-auto rounded border border-white/10 bg-black/35 p-3 text-[0.8125rem] font-sans leading-relaxed [&>*:first-child]:mt-0">
                <ReactMarkdown components={adminReplayMarkdownComponents}>{aiSummary}</ReactMarkdown>
              </div>
            ) : (
              !aiBusy && (
                <p className="text-xs text-slate-500 m-0">
                  Runs on the backend (same OPENAI_API_KEY as Team AI).
                </p>
              )
            )}
          </div>

          {log.length > 0 ? (
            <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500 m-0 mb-2">
                Play-by-play
              </p>
              {story.length > 0 ? (
                <ol className="list-decimal m-0 pl-5 space-y-1.5 text-[0.8125rem] leading-snug text-slate-200/95">
                  {story.map((s, i) => (
                    <li key={`${i}-${s.slice(0, 24)}`} className="marker:text-slate-500">
                      {s}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-xs text-slate-500 m-0">No play-by-play available for this replay.</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500 m-0">No replay data for this match.</p>
          )}
        </div>
      </details>
    </article>
  )
}

export function AdminSubTab({
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
      className={`py-2.5 px-4 rounded-xl text-sm font-medium transition-all border ${
        active
          ? 'border-cyan-400/45 text-cyan-100 bg-cyan-500/10 ring-1 ring-cyan-400/25'
          : 'border-white/10 text-slate-400 bg-black/15 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}
