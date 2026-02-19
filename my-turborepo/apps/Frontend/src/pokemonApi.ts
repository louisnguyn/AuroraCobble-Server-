/**
 * PokéAPI client with in-memory cache for species sprite + types.
 * https://pokeapi.co/docs/v2
 */

export interface PokemonInfo {
  image: string
  types: string[]
}

const cache = new Map<string, PokemonInfo | null>()

/** Convert display name to PokéAPI slug (e.g. "Mr. Mime" -> "mr-mime", "Farfetch'd" -> "farfetchd") */
export function toPokeApiName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['.]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-$|-$/g, '') || name.toLowerCase()
}

/** Fetch sprite and types from PokéAPI; returns null on 404 or error. Results are cached. */
export async function fetchPokemonInfo(name: string): Promise<PokemonInfo | null> {
  const key = toPokeApiName(name)
  if (cache.has(key)) return cache.get(key) ?? null

  try {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(key)}`)
    if (!res.ok) {
      cache.set(key, null)
      return null
    }
    const data = (await res.json()) as {
      sprites?: {
        other?: { 'official-artwork'?: { front_default?: string } }
        front_default?: string
      }
      types?: Array<{ type?: { name?: string } }>
    }
    const image =
      data.sprites?.other?.['official-artwork']?.front_default ?? data.sprites?.front_default ?? ''
    const types = (data.types ?? []).map((t) => t.type?.name ?? '').filter(Boolean)
    const info: PokemonInfo = { image, types }
    cache.set(key, info)
    return info
  } catch {
    cache.set(key, null)
    return null
  }
}
