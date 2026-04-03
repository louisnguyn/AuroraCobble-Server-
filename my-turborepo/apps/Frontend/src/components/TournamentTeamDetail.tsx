import { useEffect, useRef, useState } from 'react'
import { fetchTournamentParticipantTeam } from '../authApi'
import { fetchPokemonInfo, showdownHomeSpriteUrl } from '../pokemonApi'

type ParsedMon = {
  species?: string
  speciesSlug?: string
  item?: string
  ability?: string | null
  teraType?: string | null
  moves?: string[]
}

function MonCard({ mon }: { mon: ParsedMon }) {
  const rawSlug = (mon.speciesSlug || mon.species || '').trim()
  const slug = rawSlug.toLowerCase()
  const [art, setArt] = useState<string | null>(() => (slug ? showdownHomeSpriteUrl(slug) : null))
  const fallbackAttempted = useRef(false)

  useEffect(() => {
    fallbackAttempted.current = false
    if (!slug) {
      setArt(null)
      return
    }
    setArt(showdownHomeSpriteUrl(slug))
  }, [slug])

  return (
    <article className="rounded-xl border border-border bg-surface/80 p-4 space-y-2">
      <div className="flex gap-3 items-start">
        {slug ? (
          <img
            src={art ?? showdownHomeSpriteUrl(slug)}
            alt=""
            className="w-20 h-20 object-contain shrink-0 rounded-lg bg-surface-hover/50"
            onError={() => {
              if (fallbackAttempted.current) return
              fallbackAttempted.current = true
              void fetchPokemonInfo(slug).then((i) => {
                if (i?.image) setArt(i.image)
              })
            }}
          />
        ) : (
          <div className="w-20 h-20 rounded-lg bg-surface-hover shrink-0" />
        )}
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-[#e2e8f0] m-0">{mon.species ?? 'Pokémon'}</h3>
          {mon.item ? <p className="text-sm text-amber-200/90 m-0 mt-1">Item: {mon.item}</p> : null}
          {mon.ability ? <p className="text-xs text-muted m-0">Ability: {mon.ability}</p> : null}
          {mon.teraType ? (
            <p className="text-xs text-violet-300 m-0">Tera: {mon.teraType}</p>
          ) : null}
        </div>
      </div>
      {mon.moves && mon.moves.length > 0 ? (
        <ul className="m-0 pl-4 text-sm text-[#e2e8f0]/90 space-y-0.5 list-disc">
          {mon.moves.map((mv, i) => (
            <li key={i}>{mv}</li>
          ))}
        </ul>
      ) : null}
    </article>
  )
}

export function TournamentTeamDetail({
  slug,
  participantId,
  onBack,
}: {
  slug: string
  participantId: number
  onBack: () => void
}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchTournamentParticipantTeam>> | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    fetchTournamentParticipantTeam(slug, participantId)
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Failed'))
  }, [slug, participantId])

  const team = (data?.participant.team as ParsedMon[]) ?? []

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6 pb-12">
      <button
        type="button"
        onClick={onBack}
        className="text-sm text-accent hover:underline"
      >
        ← Back to bracket
      </button>
      {err ? <p className="text-error">{err}</p> : null}
      {data ? (
        <>
          <header>
            <h1 className="text-2xl font-semibold text-[#e2e8f0] m-0">{data.participant.displayName}</h1>
            <p className="text-sm text-muted m-0 mt-1">Seed #{data.participant.seedRank}</p>
          </header>
          <div className="space-y-4">
            {team.map((mon, i) => (
              <MonCard key={i} mon={mon} />
            ))}
          </div>
        </>
      ) : !err ? (
        <p className="text-muted">Loading…</p>
      ) : null}
    </div>
  )
}
