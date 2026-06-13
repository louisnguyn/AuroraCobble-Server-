import { speciesDisplayToSlug } from '../pokepasteParse'
import { usePokemonSpriteSrc } from '../usePokemonSpriteSrc'

export function PokemonSprite({
  speciesSlug,
  speciesDisplay,
  className = 'w-16 h-16',
  emptyClassName,
  centered = true,
}: {
  speciesSlug?: string
  speciesDisplay?: string
  className?: string
  emptyClassName?: string
  /** When false, sprite stays left-aligned (team cards). Default true for thumbs/grids. */
  centered?: boolean
}) {
  const slug =
    speciesSlug?.trim().toLowerCase() ||
    (speciesDisplay?.trim() ? speciesDisplayToSlug(speciesDisplay) : '')
  const { src, onError } = usePokemonSpriteSrc(slug, { speciesDisplay })

  if (!slug) {
    return (
      <div
        className={
          emptyClassName ??
          `${className} rounded-lg bg-surface-hover shrink-0${centered ? ' mx-auto' : ''}`
        }
        aria-hidden
      />
    )
  }

  return (
    <img
      src={src ?? undefined}
      alt=""
      className={`${className} pokemon-sprite object-contain shrink-0 rounded-lg bg-surface-hover/50${centered ? ' mx-auto' : ''}`}
      loading="lazy"
      onError={onError}
    />
  )
}
