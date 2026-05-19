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
    <article className="pixel-panel-soft w-full max-w-lg mx-auto p-4 sm:p-5">
      <div className="grid grid-cols-[7rem_1fr] gap-5 sm:gap-6 items-center">
        <PokemonSprite
          speciesSlug={slug}
          speciesDisplay={mon.species}
          centered={false}
          className="w-28 h-28"
          emptyClassName="w-28 h-28 rounded-lg bg-surface-hover/40 shrink-0"
        />

        <div className="flex justify-center min-w-0">
          <div className="w-full max-w-[15rem] text-left">
            <h3 className="text-base font-semibold text-[#f5efe6] m-0 leading-tight">
              {mon.species ?? 'Pokemon'}
            </h3>

            <div className="mt-2 space-y-1 text-sm leading-snug">
              {mon.item ? (
                <p className="m-0">
                  <span className="text-slate-500">Item </span>
                  <span className="text-amber-200/95">{mon.item}</span>
                </p>
              ) : null}
              {mon.ability ? (
                <p className="m-0">
                  <span className="text-slate-500">Ability </span>
                  <span className="text-[#e8e4dc]/90">{mon.ability}</span>
                </p>
              ) : null}
              {mon.teraType ? (
                <p className="m-0">
                  <span className="text-slate-500">Tera </span>
                  <span className="text-amber-200/95">{mon.teraType}</span>
                </p>
              ) : null}
            </div>

            {mon.moves && mon.moves.length > 0 ? (
              <ul className="m-0 mt-3 pl-4 text-sm text-[#f5efe6]/90 space-y-1 list-disc leading-snug">
                {mon.moves.map((mv, i) => (
                  <li key={i}>{mv}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  )
}
