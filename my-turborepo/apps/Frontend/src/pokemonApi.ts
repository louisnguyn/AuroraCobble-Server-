/**
 * PokéAPI client with in-memory cache for species sprite + types.
 * https://pokeapi.co/docs/v2
 */

export interface PokemonInfo {
  image: string
  types: string[]
}

/** Minimal entry for list (id + name from /pokemon list) */
export interface PokemonListEntry {
  id: number
  name: string
}

/** Full details for wiki/detail view */
export interface PokemonDetail {
  id: number
  name: string
  image: string
  types: string[]
  height: number // decimetres
  weight: number // hectograms
  baseStats: { hp: number; attack: number; defense: number; specialAttack: number; specialDefense: number; speed: number }
  abilities: string[]
  moves: string[]
}

export interface MoveSummary {
  type: string | null
  power: number | null
  accuracy: number | null
  damageClass: string | null
}

/** Fetch list of Pokémon (id + name). Default limit 1025 (all current species). */
export async function fetchPokemonList(limit = 1025): Promise<PokemonListEntry[]> {
  const res = await fetch(`https://pokeapi.co/api/v2/pokemon?limit=${limit}`)
  if (!res.ok) return []
  const data = (await res.json()) as { results?: Array<{ name: string; url: string }> }
  const results = data.results ?? []
  return results.map((r, i) => {
    const id = i + 1
    const fromUrl = r.url.split('/').filter(Boolean).pop()
    const numId = fromUrl ? parseInt(fromUrl, 10) : id
    return { id: Number.isNaN(numId) ? id : numId, name: r.name }
  })
}

/** Official artwork sprite URL by id (no API call). */
export function pokemonSpriteUrl(id: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`
}

/** Fetch full Pokémon details for wiki. Cached by id/name. */
const detailCache = new Map<string, PokemonDetail>()

export async function fetchPokemonDetail(idOrName: string | number): Promise<PokemonDetail | null> {
  const key = String(idOrName).toLowerCase()
  if (detailCache.has(key)) return detailCache.get(key) ?? null
  try {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(key)}`)
    if (!res.ok) return null
    const data = (await res.json()) as {
      id: number
      name: string
      height: number
      weight: number
      sprites?: { other?: { 'official-artwork'?: { front_default?: string } }; front_default?: string }
      types?: Array<{ type?: { name?: string } }>
      stats?: Array<{ base_stat: number; stat?: { name?: string } }>
      abilities?: Array<{ ability?: { name?: string } }>
      moves?: Array<{
        move?: { name?: string }
      }>
    }
    const image =
      data.sprites?.other?.['official-artwork']?.front_default ?? data.sprites?.front_default ?? ''
    const types = (data.types ?? []).map((t) => t.type?.name ?? '').filter(Boolean)
    const statMap: Record<string, number> = {}
    ;(data.stats ?? []).forEach((s) => {
      const name = s.stat?.name ?? ''
      if (name) statMap[name] = s.base_stat
    })
    const abilities = (data.abilities ?? []).map((a) => a.ability?.name ?? '').filter(Boolean)
    const moves = (data.moves ?? [])
      .map((m) => m.move?.name ?? '')
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
    const detail: PokemonDetail = {
      id: data.id,
      name: data.name,
      image,
      types,
      height: data.height ?? 0,
      weight: data.weight ?? 0,
      baseStats: {
        hp: statMap['hp'] ?? 0,
        attack: statMap['attack'] ?? 0,
        defense: statMap['defense'] ?? 0,
        specialAttack: statMap['special-attack'] ?? 0,
        specialDefense: statMap['special-defense'] ?? 0,
        speed: statMap['speed'] ?? 0,
      },
      abilities,
      moves,
    }
    detailCache.set(key, detail)
    detailCache.set(String(data.id), detail)
    return detail
  } catch {
    return null
  }
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

const moveSummaryCache = new Map<string, MoveSummary | null>()
const itemCache = new Map<string, string | null>() // item name -> image URL or null

/** Slugify a generic name for PokéAPI (moves/items). */
function toApiSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['.]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

/** Fetch move summary (type, power, accuracy, damage class) from PokéAPI. Cached. */
export async function fetchMoveSummary(moveName: string): Promise<MoveSummary | null> {
  const key = toApiSlug(moveName)
  if (moveSummaryCache.has(key)) return moveSummaryCache.get(key) ?? null

  try {
    const res = await fetch(`https://pokeapi.co/api/v2/move/${encodeURIComponent(key)}`)
    if (!res.ok) {
      moveSummaryCache.set(key, null)
      return null
    }
    const data = (await res.json()) as {
      type?: { name?: string }
      power?: number | null
      accuracy?: number | null
      damage_class?: { name?: string }
    }
    const summary: MoveSummary = {
      type: data.type?.name ?? null,
      power: data.power ?? null,
      accuracy: data.accuracy ?? null,
      damageClass: data.damage_class?.name ?? null,
    }
    moveSummaryCache.set(key, summary)
    return summary
  } catch {
    moveSummaryCache.set(key, null)
    return null
  }
}

/** Fetch move type from PokéAPI; returns null on 404 or error. Cached. */
export async function fetchMoveType(moveName: string): Promise<string | null> {
  const summary = await fetchMoveSummary(moveName)
  return summary?.type ?? null
}

/** Fetch item sprite URL from PokéAPI; returns null on 404 or error. Cached. */
export async function fetchItemImage(itemName: string): Promise<string | null> {
  const key = toApiSlug(itemName)
  if (itemCache.has(key)) return itemCache.get(key) ?? null

  try {
    const res = await fetch(`https://pokeapi.co/api/v2/item/${encodeURIComponent(key)}`)
    if (!res.ok) {
      itemCache.set(key, null)
      return null
    }
    const data = (await res.json()) as { sprites?: { default?: string } }
    const url = data.sprites?.default ?? null
    itemCache.set(key, url)
    return url
  } catch {
    itemCache.set(key, null)
    return null
  }
}
