import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchPublicTournament,
  fetchPublishedTournaments,
  type PublishedTournamentSummary,
  type TournamentBracketMatch,
  type TournamentBracketSlot,
} from '../authApi'
import { fetchPokemonInfo, showdownHomeSpriteUrl } from '../pokemonApi'
import { CustomSelect } from './CustomSelect'

/** Internal keys (qual-0, qf-2, …) → viewer labels (Qualifier 1, Quarter-final 3, …). */
function formatPendingMatchLabel(matchKey: string): string {
  const q = /^qual-(\d+)$/.exec(matchKey)
  if (q) return `Qualifier ${parseInt(q[1], 10) + 1}`
  const f = /^qf-(\d+)$/.exec(matchKey)
  if (f) return `Quarter-final ${parseInt(f[1], 10) + 1}`
  const s = /^sf-(\d+)$/.exec(matchKey)
  if (s) return `Semi-final ${parseInt(s[1], 10) + 1}`
  if (matchKey === 'final') return 'Final'
  if (matchKey === 'third') return '3rd place'
  return matchKey
}

function MonThumb({ speciesSlug }: { speciesSlug?: string }) {
  const slug = speciesSlug?.trim() ?? ''
  const [src, setSrc] = useState<string | null>(() => (slug ? showdownHomeSpriteUrl(slug) : null))
  const fallbackAttempted = useRef(false)

  useEffect(() => {
    fallbackAttempted.current = false
    if (!slug) {
      setSrc(null)
      return
    }
    setSrc(showdownHomeSpriteUrl(slug))
  }, [slug])

  if (!slug) {
    return <span className="inline-block w-7 h-7 rounded bg-surface-hover shrink-0" aria-hidden />
  }
  return (
    <img
      src={src ?? showdownHomeSpriteUrl(slug)}
      alt=""
      className="w-7 h-7 object-contain shrink-0 [image-rendering:auto]"
      loading="lazy"
      onError={() => {
        if (fallbackAttempted.current) return
        fallbackAttempted.current = true
        void fetchPokemonInfo(slug.toLowerCase()).then((info) => {
          if (info?.image) setSrc(info.image)
        })
      }}
    />
  )
}

function PlayerSlot({
  slot,
  winnerId,
  onOpen,
}: {
  slot: TournamentBracketSlot
  winnerId: number | null
  onOpen?: (participantId: number) => void
}) {
  if (slot.kind === 'tbd') {
    return (
      <div className="rounded-lg border border-dashed border-border/80 bg-surface/40 px-2 py-1.5 flex items-center justify-center text-xs text-muted">
        TBD
      </div>
    )
  }
  if (slot.kind === 'winner_of') {
    const label = formatPendingMatchLabel(slot.matchKey ?? '')
    return (
      <div
        className="rounded-lg border border-violet-900/40 bg-[#171724]/90 px-2 py-2 text-center leading-snug shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
        role="status"
        aria-label={`Pending: winner of ${label}`}
      >
        <span className="block text-[10px] font-semibold uppercase tracking-wider text-cyan-300/90 mb-1">
          Pending
        </span>
        <span className="text-xs text-[#f0ebe3]/90">Winner of {label}</span>
      </div>
    )
  }
  if (slot.kind === 'loser_of') {
    const label = formatPendingMatchLabel(slot.matchKey ?? '')
    return (
      <div
        className="rounded-lg border border-violet-900/40 bg-[#171724]/90 px-2 py-2 text-center leading-snug shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
        role="status"
        aria-label={`Pending: loser of ${label}`}
      >
        <span className="block text-[10px] font-semibold uppercase tracking-wider text-cyan-300/90 mb-1">
          Pending
        </span>
        <span className="text-xs text-[#f0ebe3]/90">Loser of {label}</span>
      </div>
    )
  }
  const id = slot.id!
  const won = winnerId === id
  const preview = Array.isArray(slot.teamPreview) ? slot.teamPreview : []
  return (
    <button
      type="button"
      onClick={() => onOpen?.(id)}
      className={`w-full text-left rounded-lg border px-2 py-1.5 transition-all hover:border-accent/50 hover:bg-surface-hover/80 ${
        won ? 'border-emerald-500/60 bg-emerald-500/10 ring-1 ring-emerald-500/30' : 'border-border bg-surface/80'
      }`}
    >
      <div className={`text-xs font-semibold truncate mb-1 ${won ? 'text-emerald-200' : 'text-cyan-200/90'}`}>
        {slot.name}
      </div>
      <div className="flex w-full min-w-0 flex-nowrap items-center justify-between">
        {preview.slice(0, 6).map((m, i) => (
          <MonThumb key={`${id}-${i}`} speciesSlug={m.speciesSlug || m.species} />
        ))}
      </div>
    </button>
  )
}

function MatchCard({
  m,
  onOpenPlayer,
  onComparePair,
}: {
  m: TournamentBracketMatch
  onOpenPlayer: (id: number) => void
  onComparePair?: (participantIdA: number, participantIdB: number) => void
}) {
  const canCompare =
    onComparePair &&
    m.left.kind === 'participant' &&
    m.right.kind === 'participant' &&
    m.left.id != null &&
    m.right.id != null

  return (
    <div className="rounded-xl border border-violet-800/30 bg-[#141426]/70 p-2 space-y-1 w-full min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-[#c8c3e6]/85 font-semibold m-0 text-center">{m.label}</p>
      <PlayerSlot slot={m.left} winnerId={m.winnerParticipantId} onOpen={onOpenPlayer} />
      <PlayerSlot slot={m.right} winnerId={m.winnerParticipantId} onOpen={onOpenPlayer} />
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
  useEffect(() => {
    setCatalogErr(null)
    fetchPublishedTournaments()
      .then((r) => setCatalog(r.tournaments ?? []))
      .catch((e) => setCatalogErr(e instanceof Error ? e.message : 'Could not load tournament list'))
  }, [])

  const load = useCallback(() => {
    const s = slugInput.trim().toLowerCase()
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

  const prizes = Array.isArray(data?.tournament.prizes) ? data!.tournament.prizes : []

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 pb-12">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-[#f5efe6] m-0">Tournament</h1>
        <p className="text-sm text-muted m-0">
          {!data?.tournament ? (
            <>
              Twelve-player brackets use a qualifying round (seeds 5–12); eight-player brackets start at quarter-finals
              (1 vs 8 … 4 vs 5). Select a bracket to see the layout.
            </>
          ) : data.tournament.bracketSize === 8 ? (
            <>
              Eight-player bracket: quarter-finals first (seeds 1 vs 8, 2 vs 7, 3 vs 6, 4 vs 5) → semi-finals → final & 3rd
              place — no qualifiers.
            </>
          ) : (
            <>
              Twelve-player bracket: qualifying (seeds 5–12) → quarter-finals → semi-finals → final & 3rd place.
            </>
          )}{' '}
          Click a player for team details. Use <span className="text-[#f5efe6]/90">Compare both teams</span> when both
          slots are filled.
        </p>
        {comparePickFirst != null ? (
          <div
            className="flex flex-wrap items-center justify-between gap-3 p-3 pixel-panel-soft border-l-4 border-accent"
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
                        label: `${slugInput.trim()} (not in list — may be unpublished)`,
                      },
                    ]
                  : []),
                ...catalog.map((t) => ({
                  value: t.slug.toLowerCase(),
                  label:
                    t.title +
                    (t.bracketSize === 8 ? ' · 8p' : t.bracketSize === 12 ? ' · 12p' : ''),
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
          <p className="text-xs text-muted m-0">No published tournaments yet — admins can publish one from the admin app.</p>
        ) : null}
      </header>

      {!slugInput.trim() ? (
        <p className="text-muted text-sm">Select a tournament to view the bracket.</p>
      ) : loading && !data ? (
        <p className="text-muted">Loading bracket…</p>
      ) : err ? (
        <p className="text-error text-sm">{err}</p>
      ) : data ? (
        <div className="relative rounded-3xl border border-violet-900/35 overflow-hidden bg-gradient-to-br from-[#17172a]/95 via-[#1d1a36]/55 to-[#0b0b12] p-4 sm:p-6">
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.09] text-6xl sm:text-8xl md:text-9xl font-black text-cyan-300 tracking-widest select-none -rotate-[18deg]"
            aria-hidden
          >
            AURORA COBBLE
          </div>
          <div className="relative space-y-6 w-full min-w-0">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-[#f5efe6] m-0">{data.tournament.title}</h2>
                {data.tournament.subtitle ? (
                  <p className="text-sm text-[#d9cec0]/85 m-0 mt-1">{data.tournament.subtitle}</p>
                ) : null}
                <p className="text-xs text-[#a29ac5]/75 m-0 mt-2">
                  Updated {new Date(data.tournament.updatedAt).toLocaleString()} · auto-refresh ~20s
                </p>
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

            {byRound('qualifying').length > 0 ? (
              <section className="w-full min-w-0">
                <h3 className="text-sm font-semibold text-[#d9cec0] m-0 mb-3">Qualifying (seeds 5–12)</h3>
                {/*
                  Space goes *between* cards: equal columns + wide column-gap (not a lump of empty space on the right).
                  md+ = four across; smaller screens = 2×2 with the same gap logic.
                */}
                <div className="grid w-full min-w-0 grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-4 sm:gap-x-6 sm:gap-y-5 md:gap-x-8 md:gap-y-5 lg:gap-x-10">
                  {byRound('qualifying').map((m) => (
                    <MatchCard key={m.key} m={m} onOpenPlayer={onOpenPlayer} onComparePair={onComparePair} />
                  ))}
                </div>
              </section>
            ) : null}

            <section className="w-full min-w-0">
              <h3 className="text-sm font-semibold text-[#d9cec0] m-0 mb-3">
                Quarter-finals
                {data.tournament.bracketSize === 8 ? (
                  <span className="block text-xs font-normal text-muted mt-1">
                    Seeds 1 vs 8, 2 vs 7, 3 vs 6, 4 vs 5 (eight-player mode)
                  </span>
                ) : null}
              </h3>
              <div className="grid w-full min-w-0 grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-4 sm:gap-x-6 sm:gap-y-5 md:gap-x-8 md:gap-y-5 lg:gap-x-10">
                {byRound('quarter').map((m) => (
                  <MatchCard key={m.key} m={m} onOpenPlayer={onOpenPlayer} onComparePair={onComparePair} />
                ))}
              </div>
            </section>

            <section className="w-full min-w-0">
              <div className="max-w-4xl mx-auto">
                <h3 className="text-sm font-semibold text-[#d9cec0] m-0 mb-3 text-center">Semi-finals</h3>
                <div className="grid w-full min-w-0 grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 sm:gap-x-8">
                  {byRound('semi').map((m) => (
                    <MatchCard key={m.key} m={m} onOpenPlayer={onOpenPlayer} onComparePair={onComparePair} />
                  ))}
                </div>
              </div>
            </section>

            <section className="w-full min-w-0">
              <div className="flex flex-wrap gap-6 sm:gap-8 items-start justify-center">
                <div className="w-full max-w-md min-w-0">
                  <h3 className="text-sm font-semibold text-cyan-200 m-0 mb-3 flex items-center justify-center gap-2">
                    <span aria-hidden>🏆</span> Final
                  </h3>
                  <div className="grid grid-cols-1 gap-2 sm:gap-3 w-full min-w-0">
                    {byRound('final').map((m) => (
                      <MatchCard key={m.key} m={m} onOpenPlayer={onOpenPlayer} onComparePair={onComparePair} />
                    ))}
                  </div>
                </div>
                <div className="w-full max-w-md min-w-0">
                  <h3 className="text-sm font-semibold text-slate-300 m-0 mb-3 text-center">3rd place</h3>
                  <div className="grid grid-cols-1 gap-2 sm:gap-3 w-full min-w-0">
                    {byRound('third').map((m) => (
                      <MatchCard key={m.key} m={m} onOpenPlayer={onOpenPlayer} onComparePair={onComparePair} />
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  )
}
