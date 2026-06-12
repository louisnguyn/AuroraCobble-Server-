import { useCallback, useEffect, useState } from 'react'
import { buildTournamentShareUrl, normalizeTournamentSlug, setTournamentPath } from '../tournamentShare.ts'
import {
  fetchPublicTournament,
  fetchPublishedTournaments,
  type PublishedTournamentSummary,
  type TournamentBracketMatch,
  type TournamentBracketSlot,
} from '../authApi'
import { PokemonSprite } from './PokemonSprite.tsx'
import { CustomSelect } from './CustomSelect'
import { PageHeader, PageShell } from './PageLayout.tsx'
import { formatBracketMatchKeyLabel } from '../bracketLabels.ts'
import { TournamentOverview } from './TournamentOverview.tsx'
import { TournamentPlacementsBanner } from './TournamentPlacements.tsx'
import { computeTournamentBracketSummary } from '../tournamentBracketSummary.ts'

function bracketGridRowsForSize(bracketSize?: 8 | 12 | 16): number {
  return bracketSize === 16 ? 16 : 8
}

function bracketMatchGridRow(matchIndex: number, matchCount: number, gridRows: number): string {
  const span = gridRows / matchCount
  const start = 2 + matchIndex * span
  return `${start} / ${start + span}`
}

function podiumGridRows(gridRows: number): { champion: string; bronze: string } {
  const half = gridRows / 2
  return { champion: `2 / ${2 + half}`, bronze: `${2 + half} / ${2 + gridRows}` }
}

function isBottomRightBracketSlot(
  match: TournamentBracketMatch,
  side: 'left' | 'right',
  bracket: TournamentBracketMatch[],
): boolean {
  if (side !== 'right') return false
  const third = bracket.find((m) => m.round === 'third')
  if (third) return match.key === third.key
  const final = bracket.find((m) => m.round === 'final')
  return final != null && match.key === final.key
}

function MonThumb({
  speciesSlug,
  speciesDisplay,
  size = 'md',
}: {
  speciesSlug?: string
  speciesDisplay?: string
  size?: 'md' | 'lg' | 'xl'
}) {
  const dim = size === 'xl' ? 'w-12 h-12' : size === 'lg' ? 'w-9 h-9' : 'w-7 h-7'
  return (
    <PokemonSprite
      speciesSlug={speciesSlug}
      speciesDisplay={speciesDisplay ?? speciesSlug}
      className={dim}
      emptyClassName={`inline-block ${dim} rounded bg-surface-hover shrink-0`}
    />
  )
}

function PlayerSlot({
  slot,
  winnerId,
  onOpen,
  size = 'default',
}: {
  slot: TournamentBracketSlot
  winnerId: number | null
  onOpen?: (participantId: number) => void
  size?: 'default' | 'large'
}) {
  if (slot.kind === 'tbd') {
    return (
      <div className="rounded-lg border border-dashed border-border/80 bg-surface/40 px-2 py-1.5 flex items-center justify-center text-xs text-muted">
        TBD
      </div>
    )
  }
  if (slot.kind === 'winner_of') {
    const label = formatBracketMatchKeyLabel(slot.matchKey ?? '')
    const line = `Winner of ${label}`
    return (
      <div
        className="tournament-pending-slot"
        role="status"
        aria-label={`Pending: ${line}`}
        title={line}
      >
        <span className="tournament-pending-slot-badge">Pending</span>
        <span className="tournament-pending-slot-label">{line}</span>
      </div>
    )
  }
  if (slot.kind === 'loser_of') {
    const label = formatBracketMatchKeyLabel(slot.matchKey ?? '')
    const line = `Loser of ${label}`
    return (
      <div
        className="tournament-pending-slot"
        role="status"
        aria-label={`Pending: ${line}`}
        title={line}
      >
        <span className="tournament-pending-slot-badge">Pending</span>
        <span className="tournament-pending-slot-label">{line}</span>
      </div>
    )
  }
  const id = slot.id!
  const won = winnerId === id
  const preview = Array.isArray(slot.teamPreview) ? slot.teamPreview : []
  const roster = preview.slice(0, 6)
  const large = size === 'large'
  const thumbSize = large ? 'lg' : 'md'
  const shell = won
    ? 'border-emerald-500/60 bg-emerald-500/10 ring-1 ring-emerald-500/30'
    : 'border-border bg-surface/80'

  return (
    <button
      type="button"
      onClick={() => onOpen?.(id)}
      className={`tournament-player-slot w-full text-left rounded-lg border transition-all hover:border-accent/50 hover:bg-surface-hover/80 ${large ? 'tournament-player-slot--large' : ''} ${shell}`}
    >
      <span className={`tournament-player-slot-name ${won ? 'text-emerald-200' : 'text-cyan-200/90'}`}>
        {slot.name}
      </span>
      <div className="tournament-player-slot-roster">
        {roster.map((m, i) => (
          <MonThumb
            key={`${id}-${i}`}
            size={thumbSize}
            speciesSlug={m.speciesSlug || m.species}
            speciesDisplay={m.species}
          />
        ))}
      </div>
    </button>
  )
}

function matchWinnerName(m: TournamentBracketMatch): string | null {
  const w = m.winnerParticipantId
  if (w == null) return null
  if (m.left.kind === 'participant' && m.left.id === w) return m.left.name ?? null
  if (m.right.kind === 'participant' && m.right.id === w) return m.right.name ?? null
  return null
}

function MatchCard({
  m,
  bracket,
  onOpenPlayer,
  onComparePair,
  variant = 'default',
  showLabel = true,
}: {
  m: TournamentBracketMatch
  bracket: TournamentBracketMatch[]
  onOpenPlayer: (id: number) => void
  onComparePair?: (participantIdA: number, participantIdB: number) => void
  variant?: 'default' | 'champion' | 'bronze'
  showLabel?: boolean
}) {
  const canCompare =
    onComparePair &&
    m.left.kind === 'participant' &&
    m.right.kind === 'participant' &&
    m.left.id != null &&
    m.right.id != null

  const shellClass =
    variant === 'champion'
      ? 'tournament-match-card--champion'
      : variant === 'bronze'
        ? 'tournament-match-card--bronze'
        : ''

  return (
    <div
      className={`tournament-match-card rounded-xl border border-violet-800/30 bg-[#141426]/70 p-2 space-y-1 w-full ${shellClass}`}
    >
      {showLabel ? (
        <p className="text-[10px] uppercase tracking-wider text-[#c8c3e6]/85 font-semibold m-0 text-center">{m.label}</p>
      ) : null}
      <PlayerSlot slot={m.left} winnerId={m.winnerParticipantId} onOpen={onOpenPlayer} />
      <PlayerSlot
        slot={m.right}
        winnerId={m.winnerParticipantId}
        onOpen={onOpenPlayer}
        size={isBottomRightBracketSlot(m, 'right', bracket) ? 'large' : 'default'}
      />
      {canCompare ? (
        <button
          type="button"
          onClick={() => onComparePair!(m.left.id!, m.right.id!)}
          className="w-full mt-1 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-accent border border-accent/35 rounded-lg bg-accent/5 hover:bg-accent/15 hover:border-accent/55 transition-colors"
        >
          Compare both teams
        </button>
      ) : null}
    </div>
  )
}

function BracketStageColumn({
  column,
  gridRows,
  title,
  matches,
  bracket,
  onOpenPlayer,
  onComparePair,
}: {
  column: number
  gridRows: number
  title: string
  matches: TournamentBracketMatch[]
  bracket: TournamentBracketMatch[]
  onOpenPlayer: (id: number) => void
  onComparePair?: (participantIdA: number, participantIdB: number) => void
}) {
  if (matches.length === 0) return null
  const count = matches.length
  return (
    <section className="tournament-bracket-stage" style={{ display: 'contents' }} aria-label={title}>
      <div className="tournament-bracket-stage-head" style={{ gridColumn: column, gridRow: 1 }}>
        <h3 className="tournament-bracket-stage-title">{title}</h3>
      </div>
      {matches.map((m, i) => (
        <div
          key={m.key}
          className="tournament-bracket-match-slot"
          style={{ gridColumn: column, gridRow: bracketMatchGridRow(i, count, gridRows) }}
        >
          <MatchCard m={m} bracket={bracket} onOpenPlayer={onOpenPlayer} onComparePair={onComparePair} />
        </div>
      ))}
    </section>
  )
}

function PodiumStageColumn({
  column,
  gridRows,
  finalMatches,
  thirdMatches,
  bracket,
  onOpenPlayer,
  onComparePair,
}: {
  column: number
  gridRows: number
  finalMatches: TournamentBracketMatch[]
  thirdMatches: TournamentBracketMatch[]
  bracket: TournamentBracketMatch[]
  onOpenPlayer: (id: number) => void
  onComparePair?: (participantIdA: number, participantIdB: number) => void
}) {
  if (finalMatches.length === 0 && thirdMatches.length === 0) return null
  const final = finalMatches[0]
  const third = thirdMatches[0]
  const champion = final ? matchWinnerName(final) : null
  const bronze = third ? matchWinnerName(third) : null
  const podiumRows = podiumGridRows(gridRows)

  return (
    <section className="tournament-bracket-stage tournament-bracket-stage--podium" style={{ display: 'contents' }} aria-label="Finals">
      <div className="tournament-bracket-stage-head" style={{ gridColumn: column, gridRow: 1 }}>
        <h3 className="tournament-bracket-stage-title">Finals</h3>
      </div>
      {finalMatches.length > 0 ? (
        <div
          className="tournament-podium-block tournament-podium-block--champion"
          style={{ gridColumn: column, gridRow: podiumRows.champion }}
        >
          <div className="tournament-podium-head">
            <span className="tournament-podium-icon" aria-hidden>
              🏆
            </span>
            <div className="tournament-podium-head-text">
              <h3 className="tournament-podium-title">Champion</h3>
              <p className="tournament-podium-label">Final</p>
            </div>
          </div>
          {champion ? (
            <p className="tournament-podium-winner tournament-podium-winner--gold" role="status">
              {champion}
            </p>
          ) : (
            <p className="tournament-podium-pending">Winner TBD</p>
          )}
          {finalMatches.map((m) => (
            <MatchCard
              key={m.key}
              m={m}
              bracket={bracket}
              variant="champion"
              showLabel={false}
              onOpenPlayer={onOpenPlayer}
              onComparePair={onComparePair}
            />
          ))}
        </div>
      ) : null}
      {thirdMatches.length > 0 ? (
        <div
          className="tournament-podium-block tournament-podium-block--bronze"
          style={{ gridColumn: column, gridRow: podiumRows.bronze }}
        >
          <div className="tournament-podium-head">
            <span className="tournament-podium-icon" aria-hidden>
              🥉
            </span>
            <div className="tournament-podium-head-text">
              <h3 className="tournament-podium-title">3rd place</h3>
              <p className="tournament-podium-label">Bronze match</p>
            </div>
          </div>
          {bronze ? (
            <p className="tournament-podium-winner tournament-podium-winner--bronze" role="status">
              {bronze}
            </p>
          ) : (
            <p className="tournament-podium-pending">Winner TBD</p>
          )}
          {thirdMatches.map((m) => (
            <MatchCard
              key={m.key}
              m={m}
              bracket={bracket}
              variant="bronze"
              showLabel={false}
              onOpenPlayer={onOpenPlayer}
              onComparePair={onComparePair}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}

export function Tournament({
  slug: initialSlug,
  onOpenPlayer,
  onSlugChange,
  onOpenPredictions,
  comparePickFirst,
  onCancelComparePick,
  onComparePair,
}: {
  slug: string
  onOpenPlayer: (participantId: number) => void
  onSlugChange?: (slug: string) => void
  onOpenPredictions?: () => void
  /** When set, the next participant slot opens compare view with this id as the first team. */
  comparePickFirst?: number
  onCancelComparePick?: () => void
  onComparePair?: (participantIdA: number, participantIdB: number) => void
}) {
  const [slugInput, setSlugInput] = useState(initialSlug)
  useEffect(() => {
    setSlugInput(initialSlug)
  }, [initialSlug])
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchPublicTournament>> | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [catalog, setCatalog] = useState<PublishedTournamentSummary[]>([])
  const [catalogErr, setCatalogErr] = useState<string | null>(null)
  const [shareCopied, setShareCopied] = useState(false)
  useEffect(() => {
    setCatalogErr(null)
    fetchPublishedTournaments()
      .then((r) => setCatalog(r.tournaments ?? []))
      .catch((e) => setCatalogErr(e instanceof Error ? e.message : 'Could not load tournament list'))
  }, [])

  const load = useCallback(() => {
    const s = normalizeTournamentSlug(slugInput)
    if (!s) {
      setData(null)
      setErr(null)
      setLoading(false)
      return
    }
    setErr(null)
    setLoading(true)
    fetchPublicTournament(s)
      .then(setData)
      .catch((e) => {
        setData(null)
        setErr(e instanceof Error ? e.message : 'Failed to load')
      })
      .finally(() => setLoading(false))
  }, [slugInput])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const s = slugInput.trim().toLowerCase()
    if (!s) return
    const t = setInterval(load, 20000)
    return () => clearInterval(t)
  }, [load, slugInput])

  const byRound = (r: TournamentBracketMatch['round']) => data?.bracket.filter((m) => m.round === r) ?? []

  const r16Matches = byRound('round_of_16')
  const qualMatches = byRound('qualifying')
  const quarterMatches = byRound('quarter')
  const semiMatches = byRound('semi')
  const finalMatches = byRound('final')
  const thirdMatches = byRound('third')
  const hasPodium = finalMatches.length > 0 || thirdMatches.length > 0
  const bracketSize = data?.tournament.bracketSize
  const bracketGridRows = bracketGridRowsForSize(bracketSize)
  /** Fixed columns on mobile (horizontal scroll); fluid columns on desktop — see index.css. */
  const bracketColWidth = bracketSize === 16 ? '20.5rem' : '17.25rem'
  const bracketColCount =
    (r16Matches.length > 0 ? 1 : 0) +
    (qualMatches.length > 0 ? 1 : 0) +
    2 +
    (hasPodium ? 1 : 0)

  const prizes = Array.isArray(data?.tournament.prizes) ? data!.tournament.prizes : []
  const bracketSummary =
    data?.bracket != null
      ? computeTournamentBracketSummary(data.bracket, data.tournament.bracketSize)
      : null
  const shareLink = data?.tournament.slug ? buildTournamentShareUrl(data.tournament.slug) : ''

  const onCopyShare = async () => {
    if (!shareLink || !data?.tournament.slug) return
    try {
      await navigator.clipboard.writeText(shareLink)
      setTournamentPath(normalizeTournamentSlug(data.tournament.slug))
      setShareCopied(true)
      window.setTimeout(() => setShareCopied(false), 2000)
    } catch {
      setShareCopied(false)
    }
  }

  return (
    <PageShell max="7xl">
      <PageHeader
        accent="violet"
        eyebrow="Events"
        title="Tournament"
        description={
          bracketSummary && data?.tournament ? undefined : catalog.length > 0
            ? `Choose a tournament below — ${catalog.length} bracket${catalog.length === 1 ? '' : 's'} available with live results, team sheets, and head-to-head compare.`
            : 'Choose a tournament to view the bracket, team sheets, and match results.'
        }
        footer={
          bracketSummary && data?.tournament ? <TournamentOverview summary={bracketSummary} /> : undefined
        }
      >
        {comparePickFirst != null ? (
          <div
            className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-accent/40 bg-accent/5 border-l-4 border-l-accent"
            role="status"
          >
            <p className="text-sm text-[#f5efe6] m-0">
              Comparing teams: pick <strong className="text-accent">another player</strong> on the bracket. Same slot again
              cancels.
            </p>
            {onCancelComparePick ? (
              <button type="button" onClick={onCancelComparePick} className="shrink-0 py-1.5 px-3 text-sm pixel-btn">
                Cancel
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="flex flex-col gap-1 text-xs text-muted min-w-[min(100%,280px)] sm:max-w-md">
            Bracket
            <CustomSelect
              value={slugInput.trim().toLowerCase()}
              onChange={(s) => {
                setSlugInput(s)
                onSlugChange?.(s)
              }}
              options={[
                { value: '', label: 'Choose a tournament…' },
                ...(slugInput.trim() &&
                !catalog.some((c) => c.slug.toLowerCase() === slugInput.trim().toLowerCase())
                  ? [
                      {
                        value: slugInput.trim().toLowerCase(),
                        label: `${slugInput.trim()} (custom slug)`,
                      },
                    ]
                  : []),
                ...catalog.map((t) => ({
                  value: t.slug.toLowerCase(),
                  label:
                    t.title +
                    (t.bracketSize === 8
                      ? ' · 8p'
                      : t.bracketSize === 16
                        ? ' · 16p'
                        : t.bracketSize === 12
                          ? ' · 12p'
                          : ''),
                })),
              ]}
              className="w-full"
              buttonClassName="pixel-field px-3 py-2.5 text-base w-full"
            />
          </label>
          <button
            type="button"
            onClick={() => load()}
            disabled={!slugInput.trim() || loading}
            className="py-2 px-4 pixel-btn disabled:opacity-50 disabled:pointer-events-none text-base"
          >
            Refresh
          </button>
          {onOpenPredictions ? (
            <button
              type="button"
              onClick={onOpenPredictions}
              className="py-2 px-4 pixel-btn-primary text-base"
            >
              Predictions
            </button>
          ) : null}
        </div>
        {catalogErr ? <p className="text-xs text-cyan-400 m-0">Tournament list: {catalogErr}</p> : null}
        {catalog.length === 0 && !catalogErr ? (
          <p className="text-xs text-muted m-0">No tournaments are available at this time.</p>
        ) : null}
      </PageHeader>

      {!slugInput.trim() ? (
        <p className="text-muted text-sm">Select a tournament to view the bracket.</p>
      ) : loading && !data ? (
        <p className="text-muted">Loading bracket…</p>
      ) : err ? (
        <p className="text-error text-sm">{err}</p>
      ) : data ? (
        <div className="tournament-panel relative rounded-3xl border border-violet-900/35 bg-gradient-to-br from-[#17172a]/95 via-[#1d1a36]/55 to-[#0b0b12] p-4 sm:p-6">
          <div className="tournament-panel-watermark" aria-hidden>
            <img src="/logo_icon.png" alt="" className="tournament-panel-watermark-img" draggable={false} />
          </div>
          <div className="tournament-panel-brand-mark site-brand-mark" aria-hidden>
            <img src="/logo_icon.png" alt="" draggable={false} />
            <span>AuroraCobble</span>
          </div>
          <div className="relative z-[1] space-y-6 w-full min-w-0 pb-10">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              <div className="flex items-start gap-4 min-w-0">
                <img
                  src="/logo_icon.png"
                  alt=""
                  className="tournament-title-logo shrink-0"
                  draggable={false}
                  aria-hidden
                />
                <div className="min-w-0">
                <h2 className="text-xl font-bold text-[#f5efe6] m-0">{data.tournament.title}</h2>
                {data.tournament.subtitle ? (
                  <p className="text-sm text-[#d9cec0]/85 m-0 mt-1">{data.tournament.subtitle}</p>
                ) : null}
                <p className="text-xs text-[#a29ac5]/75 m-0 mt-2">
                  Updated {new Date(data.tournament.updatedAt).toLocaleString()} · auto-refresh ~20s
                </p>
                <button
                  type="button"
                  onClick={() => void onCopyShare()}
                  className="mt-3 py-1.5 px-3 pixel-btn text-sm font-semibold"
                >
                  {shareCopied ? 'Copied link' : 'Copy share link'}
                </button>
                </div>
              </div>
              {prizes.length > 0 ? (
                <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 px-4 py-3 text-sm shrink-0">
                  <p className="text-xs font-semibold text-cyan-200 m-0 mb-2">Prizes</p>
                  <ul className="m-0 pl-4 space-y-1 text-cyan-100/90">
                    {prizes.map((p: unknown, i: number) => (
                      <li key={i}>{typeof p === 'string' ? p : JSON.stringify(p)}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <TournamentPlacementsBanner bracket={data.bracket} onOpenPlayer={onOpenPlayer} />

            <p className="tournament-bracket-scroll-hint m-0 sm:hidden" aria-hidden>
              Swipe sideways to view all rounds →
            </p>
            <div
              className="tournament-bracket-outer"
              role="region"
              aria-label="Tournament bracket — scroll horizontally on small screens"
              tabIndex={0}
            >
              <div
                className="tournament-bracket-track"
                style={{
                  ['--bracket-col-count' as string]: String(bracketColCount),
                  ['--bracket-grid-rows' as string]: String(bracketGridRows),
                  ['--bracket-col-width' as string]: bracketColWidth,
                }}
              >
                {(() => {
                  let col = 1
                  const nodes = []
                  if (r16Matches.length > 0) {
                    nodes.push(
                      <BracketStageColumn
                        key="r16"
                        column={col++}
                        gridRows={bracketGridRows}
                        title="Round of 16"
                        matches={r16Matches}
                        bracket={data.bracket}
                        onOpenPlayer={onOpenPlayer}
                        onComparePair={onComparePair}
                      />
                    )
                  }
                  if (qualMatches.length > 0) {
                    nodes.push(
                      <BracketStageColumn
                        key="qual"
                        column={col++}
                        gridRows={bracketGridRows}
                        title="Qualifying"
                        matches={qualMatches}
                        bracket={data.bracket}
                        onOpenPlayer={onOpenPlayer}
                        onComparePair={onComparePair}
                      />
                    )
                  }
                  nodes.push(
                    <BracketStageColumn
                      key="quarter"
                      column={col++}
                      gridRows={bracketGridRows}
                      title="Quarter-finals"
                      matches={quarterMatches}
                      bracket={data.bracket}
                      onOpenPlayer={onOpenPlayer}
                      onComparePair={onComparePair}
                    />,
                    <BracketStageColumn
                      key="semi"
                      column={col++}
                      gridRows={bracketGridRows}
                      title="Semi-finals"
                      matches={semiMatches}
                      bracket={data.bracket}
                      onOpenPlayer={onOpenPlayer}
                      onComparePair={onComparePair}
                    />
                  )
                  if (hasPodium) {
                    nodes.push(
                      <PodiumStageColumn
                        key="podium"
                        column={col++}
                        gridRows={bracketGridRows}
                        finalMatches={finalMatches}
                        thirdMatches={thirdMatches}
                        bracket={data.bracket}
                        onOpenPlayer={onOpenPlayer}
                        onComparePair={onComparePair}
                      />
                    )
                  }
                  return nodes
                })()}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  )
}
