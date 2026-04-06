import { useEffect, useRef, useState } from 'react'
import { fetchPokemonInfo, showdownHomeSpriteUrl } from '../pokemonApi'

export type ParsedMon = {
  species?: string
  speciesSlug?: string
  item?: string
  ability?: string | null
  teraType?: string | null
  moves?: string[]
}

export function TournamentMonCard({ mon }: { mon: ParsedMon }) {
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
    <article className="pixel-panel-soft p-4 space-y-2">
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
          <h3 className="text-base font-semibold text-[#f5efe6] m-0">{mon.species ?? 'Pokémon'}</h3>
          {mon.item ? <p className="text-sm text-amber-200/90 m-0 mt-1">Item: {mon.item}</p> : null}
          {mon.ability ? <p className="text-xs text-muted m-0">Ability: {mon.ability}</p> : null}
          {mon.teraType ? (
            <p className="text-xs text-amber-300/90 m-0">Tera: {mon.teraType}</p>
          ) : null}
        </div>
      </div>
      {mon.moves && mon.moves.length > 0 ? (
        <ul className="m-0 pl-4 text-sm text-[#f5efe6]/90 space-y-0.5 list-disc">
          {mon.moves.map((mv, i) => (
            <li key={i}>{mv}</li>
          ))}
        </ul>
      ) : null}
    </article>
  )
}
