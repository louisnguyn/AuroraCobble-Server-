import { useEffect, useRef, useState } from 'react'
import { speciesDisplayToSlug } from '../pokepasteParse'
import { fetchPokemonSpriteImage, showdownHomeSpriteUrl } from '../pokemonApi'

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
  const [src, setSrc] = useState<string | null>(() => (slug ? showdownHomeSpriteUrl(slug) : null))
  const fallbackStep = useRef(0)

  useEffect(() => {
    fallbackStep.current = 0
    if (!slug) {
      setSrc(null)
      return
    }
    setSrc(showdownHomeSpriteUrl(slug))
  }, [slug, speciesDisplay])

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
      src={src ?? showdownHomeSpriteUrl(slug)}
      alt=""
      className={`${className} object-contain shrink-0 rounded-lg bg-surface-hover/50${centered ? ' mx-auto' : ''}`}
      loading="lazy"
      onError={() => {
        if (fallbackStep.current > 0) return
        fallbackStep.current = 1
        void fetchPokemonSpriteImage(slug, speciesDisplay).then((url) => {
          if (url) setSrc(url)
        })
      }}
    />
  )
}
