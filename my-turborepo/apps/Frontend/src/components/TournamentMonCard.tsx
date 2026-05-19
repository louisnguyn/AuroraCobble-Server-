import { PokemonSprite } from './PokemonSprite.tsx'

export type ParsedMon = {
  species?: string
  speciesSlug?: string
  item?: string
  ability?: string | null
  teraType?: string | null
  moves?: string[]
}

export function TournamentMonCard({ mon }: { mon: ParsedMon }) {
  const slug = (mon.speciesSlug || mon.species || '').trim()

  return (
    <article className="pixel-panel-soft p-4 space-y-2">
      <div className="flex gap-3 items-start">
        <PokemonSprite
          speciesSlug={slug}
          speciesDisplay={mon.species}
          className="w-20 h-20"
          emptyClassName="w-20 h-20 rounded-lg bg-surface-hover shrink-0"
        />
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
