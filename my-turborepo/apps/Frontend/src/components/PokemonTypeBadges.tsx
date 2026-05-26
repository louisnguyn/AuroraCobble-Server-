import { useEffect, useState } from 'react'
import { fetchPokemonInfo } from '../pokemonApi.ts'
import { speciesDisplayToSlug } from '../pokepasteParse.ts'
import { TypeBadge } from './TypeBadge.tsx'

export function PokemonTypeBadges({
  speciesSlug,
  speciesDisplay,
  teraType,
  types: typesProp,
}: {
  speciesSlug?: string
  speciesDisplay?: string
  teraType?: string | null
  /** When stored on team JSON (optional). */
  types?: string[]
}) {
  const [fetchedTypes, setFetchedTypes] = useState<string[] | null>(
    typesProp?.length ? typesProp : null
  )

  const lookup =
    speciesSlug?.trim() ||
    (speciesDisplay?.trim() ? speciesDisplayToSlug(speciesDisplay) : '')

  useEffect(() => {
    if (typesProp?.length) {
      setFetchedTypes(typesProp)
      return
    }
    if (!lookup) {
      setFetchedTypes([])
      return
    }
    let cancelled = false
    setFetchedTypes(null)
    fetchPokemonInfo(lookup)
      .then((info) => {
        if (!cancelled) setFetchedTypes(info?.types?.length ? info.types : [])
      })
      .catch(() => {
        if (!cancelled) setFetchedTypes([])
      })
    return () => {
      cancelled = true
    }
  }, [lookup, typesProp])

  const speciesTypes = fetchedTypes ?? []
  const showTera = Boolean(teraType?.trim())
  const loading = fetchedTypes === null && !typesProp?.length && Boolean(lookup)

  if (!loading && speciesTypes.length === 0 && !showTera) return null

  return (
    <div className="team-mon-types" aria-label="Types">
      {loading || speciesTypes.length > 0 ? (
        <div className="team-mon-types-row team-mon-types-row--species">
          {loading ? (
            <>
              <span className="type-badge type-badge--skeleton" aria-hidden />
              <span className="type-badge type-badge--skeleton" aria-hidden />
            </>
          ) : (
            speciesTypes.map((t) => <TypeBadge key={`${t}-species`} type={t} />)
          )}
        </div>
      ) : null}
      {showTera ? (
        <div className="team-mon-types-row team-mon-types-row--tera">
          <span className="team-mon-tera-label">Tera</span>
          <TypeBadge type={teraType!} title={`Tera Type: ${teraType!.trim()}`} />
        </div>
      ) : null}
    </div>
  )
}
