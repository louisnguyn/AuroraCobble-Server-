import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchPublicTournament,
  fetchPublishedTournaments,
  type PublishedTournamentSummary,
  type TournamentBracketMatch,
  type TournamentBracketSlot,
} from '../authApi'
import { fetchPokemonInfo, showdownHomeSpriteUrl } from '../pokemonApi'

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
        className="rounded-lg border border-sky-500/35 bg-sky-950/40 px-2 py-2 text-center leading-snug shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
        role="status"
        aria-label={`Pending: winner of ${label}`}
      >
        <span className="block text-[10px] font-semibold uppercase tracking-wider text-sky-400/85 mb-1">
          Pending
        </span>
        <span className="text-xs text-sky-100/90">Winner of {label}</span>
      </div>
    )
  }
  if (slot.kind === 'loser_of') {
    const label = formatPendingMatchLabel(slot.matchKey ?? '')
    return (
      <div
        className="rounded-lg border border-sky-500/35 bg-sky-950/40 px-2 py-2 text-center leading-snug shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
        role="status"
        aria-label={`Pending: loser of ${label}`}
      >
        <span className="block text-[10px] font-semibold uppercase tracking-wider text-sky-400/85 mb-1">
          Pending
        </span>
        <span className="text-xs text-sky-100/90">Loser of {label}</span>
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
      <div className={`text-xs font-semibold truncate mb-1 ${won ? 'text-emerald-200' : 'text-sky-300'}`}>
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
}: {
  m: TournamentBracketMatch
  onOpenPlayer: (id: number) => void
}) {
  return (
    <div className="rounded-xl border border-sky-400/25 bg-sky-950/20 p-2 space-y-1 w-full min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-sky-200/70 font-semibold m-0 text-center">{m.label}</p>
      <PlayerSlot slot={m.left} winnerId={m.winnerParticipantId} onOpen={onOpenPlayer} />
      <PlayerSlot slot={m.right} winnerId={m.winnerParticipantId} onOpen={onOpenPlayer} />
    </div>
  )
}

export function Tournament({
  slug: initialSlug,
  onOpenPlayer,
  onSlugChange,
}: {
  slug: string
  onOpenPlayer: (participantId: number) => void
  onSlugChange?: (slug: string) => void
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
        <h1 className="text-2xl font-semibold text-[#e2e8f0] m-0">Tournament</h1>
        <p className="text-sm text-muted m-0">
          Qualifying (seeds 5–12) → Quarter-finals (seeds 1–4 enter) → Semi-finals → Final & 3rd place. Click a player
          for team details.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="flex flex-col gap-1 text-xs text-muted min-w-[min(100%,280px)] sm:max-w-md">
            Bracket
            <select
              value={slugInput.trim().toLowerCase()}
              onChange={(e) => {
                const s = e.target.value
                setSlugInput(s)
                onSlugChange?.(s)
              }}
              className="pixel-field px-3 py-2.5 text-base w-full"
            >
              <option value="">Choose a tournament…</option>
              {slugInput.trim() &&
              !catalog.some((c) => c.slug.toLowerCase() === slugInput.trim().toLowerCase()) ? (
                <option value={slugInput.trim().toLowerCase()}>
                  {slugInput.trim()} (not in list — may be unpublished)
                </option>
              ) : null}
              {catalog.map((t) => (
                <option key={t.slug} value={t.slug.toLowerCase()}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => load()}
            disabled={!slugInput.trim() || loading}
            className="py-2 px-4 pixel-btn disabled:opacity-50 disabled:pointer-events-none text-base"
          >
            Refresh
          </button>
        </div>
        {catalogErr ? <p className="text-xs text-amber-400 m-0">Tournament list: {catalogErr}</p> : null}
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
        <div className="relative rounded-3xl border border-sky-500/20 overflow-hidden bg-gradient-to-br from-sky-950/40 via-[#0c4a6e]/25 to-slate-950/80 p-4 sm:p-6">
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.07] text-4xl sm:text-6xl font-black text-sky-100 tracking-widest select-none"
            aria-hidden
          >
            AURORA COBBLE
          </div>
          <div className="relative space-y-6 w-full min-w-0">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-sky-100 m-0">{data.tournament.title}</h2>
                {data.tournament.subtitle ? (
                  <p className="text-sm text-sky-200/80 m-0 mt-1">{data.tournament.subtitle}</p>
                ) : null}
                <p className="text-xs text-sky-300/60 m-0 mt-2">
                  Updated {new Date(data.tournament.updatedAt).toLocaleString()} · auto-refresh ~20s
                </p>
              </div>
              {prizes.length > 0 ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-sm shrink-0">
                  <p className="text-xs font-semibold text-amber-200 m-0 mb-2">Prizes</p>
                  <ul className="m-0 pl-4 space-y-1 text-amber-100/90">
                    {prizes.map((p: unknown, i: number) => (
                      <li key={i}>{typeof p === 'string' ? p : JSON.stringify(p)}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <section className="w-full min-w-0">
              <h3 className="text-sm font-semibold text-sky-200 m-0 mb-3">Qualifying (seeds 5–12)</h3>
              {/*
                Space goes *between* cards: equal columns + wide column-gap (not a lump of empty space on the right).
                md+ = four across; smaller screens = 2×2 with the same gap logic.
              */}
              <div className="grid w-full min-w-0 grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-4 sm:gap-x-6 sm:gap-y-5 md:gap-x-8 md:gap-y-5 lg:gap-x-10">
                {byRound('qualifying').map((m) => (
                  <MatchCard key={m.key} m={m} onOpenPlayer={onOpenPlayer} />
                ))}
              </div>
            </section>

            <section className="w-full min-w-0">
              <h3 className="text-sm font-semibold text-sky-200 m-0 mb-3">Quarter-finals</h3>
              <div className="grid w-full min-w-0 grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-4 sm:gap-x-6 sm:gap-y-5 md:gap-x-8 md:gap-y-5 lg:gap-x-10">
                {byRound('quarter').map((m) => (
                  <MatchCard key={m.key} m={m} onOpenPlayer={onOpenPlayer} />
                ))}
              </div>
            </section>

            <section className="w-full min-w-0">
              <div className="max-w-4xl mx-auto">
                <h3 className="text-sm font-semibold text-sky-200 m-0 mb-3 text-center">Semi-finals</h3>
                <div className="grid w-full min-w-0 grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 sm:gap-x-8">
                  {byRound('semi').map((m) => (
                    <MatchCard key={m.key} m={m} onOpenPlayer={onOpenPlayer} />
                  ))}
                </div>
              </div>
            </section>

            <section className="w-full min-w-0">
              <div className="flex flex-wrap gap-6 sm:gap-8 items-start justify-center">
                <div className="w-full max-w-md min-w-0">
                  <h3 className="text-sm font-semibold text-amber-200 m-0 mb-3 flex items-center justify-center gap-2">
                    <span aria-hidden>🏆</span> Final
                  </h3>
                  <div className="grid grid-cols-1 gap-2 sm:gap-3 w-full min-w-0">
                    {byRound('final').map((m) => (
                      <MatchCard key={m.key} m={m} onOpenPlayer={onOpenPlayer} />
                    ))}
                  </div>
                </div>
                <div className="w-full max-w-md min-w-0">
                  <h3 className="text-sm font-semibold text-slate-300 m-0 mb-3 text-center">3rd place</h3>
                  <div className="grid grid-cols-1 gap-2 sm:gap-3 w-full min-w-0">
                    {byRound('third').map((m) => (
                      <MatchCard key={m.key} m={m} onOpenPlayer={onOpenPlayer} />
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
