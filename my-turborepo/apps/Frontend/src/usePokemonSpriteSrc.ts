import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchPokemonSpriteImage, showdownSpriteFallbackUrls } from './pokemonApi'

/** Load Showdown pixel → HOME sprites, then PokéAPI / optional static fallback. */
export function usePokemonSpriteSrc(
  slug: string,
  opts?: {
    shiny?: boolean
    speciesDisplay?: string
    finalFallback?: string
    /** Override default Showdown URL list (e.g. gacha shiny strip). */
    urls?: string[]
    onExhausted?: () => void
  }
) {
  const urls = useMemo(
    () =>
      opts?.urls ??
      (slug ? showdownSpriteFallbackUrls(slug, { shiny: opts?.shiny }) : []),
    [slug, opts?.shiny, opts?.urls]
  )
  const [src, setSrc] = useState<string | null>(() => urls[0] ?? opts?.finalFallback ?? null)
  const stepRef = useRef(0)

  useEffect(() => {
    stepRef.current = 0
    setSrc(slug || urls.length ? urls[0] ?? opts?.finalFallback ?? null : opts?.finalFallback ?? null)
  }, [slug, urls, opts?.finalFallback])

  const onError = () => {
    stepRef.current += 1
    if (stepRef.current < urls.length) {
      setSrc(urls[stepRef.current] ?? null)
      return
    }
    if (opts?.finalFallback && stepRef.current === urls.length) {
      stepRef.current += 1
      setSrc(opts.finalFallback)
      return
    }
    if (stepRef.current <= urls.length) {
      stepRef.current = urls.length + 1
      void fetchPokemonSpriteImage(slug, opts?.speciesDisplay).then((url) => {
        if (url) setSrc(url)
        else opts?.onExhausted?.()
      })
    }
  }

  return { src: src ?? urls[0] ?? opts?.finalFallback ?? null, onError }
}
