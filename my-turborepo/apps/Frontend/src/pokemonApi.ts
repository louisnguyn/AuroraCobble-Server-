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

/** One form in a species (e.g. deoxys, deoxys-attack, kyurem-black). */
export interface EvolutionForm {
  id: number
  name: string
}

/** One evolution stage = one species, possibly with multiple forms. */
export interface EvolutionStage {
  forms: EvolutionForm[]
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
  evolution: EvolutionStage[]
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

/**
 * Pokémon Showdown HOME sprites (same art as the teambuilder).
 * https://play.pokemonshowdown.com/sprites/home/
 */
export function showdownHomeSpriteUrl(speciesSlug: string): string {
  const s = speciesSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
  return `https://play.pokemonshowdown.com/sprites/home/${encodeURIComponent(s)}.png`
}

/** Fetch full Pokémon details for wiki. Cached by id/name. */
const detailCache = new Map<string, PokemonDetail>()

const evolutionCache = new Map<number, EvolutionStage[]>()
const speciesVarietiesCache = new Map<number, EvolutionForm[]>()

async function fetchSpeciesVarieties(speciesId: number): Promise<EvolutionForm[]> {
  if (speciesVarietiesCache.has(speciesId)) return speciesVarietiesCache.get(speciesId) ?? []
  try {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${speciesId}`)
    if (!res.ok) {
      speciesVarietiesCache.set(speciesId, [])
      return []
    }
    const data = (await res.json()) as {
      varieties?: Array<{
        pokemon?: { name?: string; url?: string }
      }>
    }
    const forms: EvolutionForm[] = (data.varieties ?? [])
      .map((v) => {
        const url = v.pokemon?.url ?? ''
        const name = v.pokemon?.name ?? ''
        const idStr = url.split('/').filter(Boolean).pop()
        const id = idStr ? parseInt(idStr, 10) : NaN
        return name && !Number.isNaN(id) ? { id, name } : null
      })
      .filter((f): f is EvolutionForm => f != null)
    speciesVarietiesCache.set(speciesId, forms)
    return forms
  } catch {
    speciesVarietiesCache.set(speciesId, [])
    return []
  }
}

async function fetchEvolutionChainForSpecies(speciesId: number): Promise<EvolutionStage[]> {
  if (evolutionCache.has(speciesId)) return evolutionCache.get(speciesId) ?? []
  try {
    const speciesRes = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${speciesId}`)
    if (!speciesRes.ok) {
      evolutionCache.set(speciesId, [])
      return []
    }
    const speciesData = (await speciesRes.json()) as {
      evolution_chain?: { url?: string }
    }
    const chainUrl = speciesData.evolution_chain?.url
    if (!chainUrl) {
      evolutionCache.set(speciesId, [])
      return []
    }
    const chainRes = await fetch(chainUrl)
    if (!chainRes.ok) {
      evolutionCache.set(speciesId, [])
      return []
    }
    type ChainNode = {
      species?: { name?: string; url?: string }
      evolves_to?: ChainNode[]
    }
    const chainData = (await chainRes.json()) as { chain?: ChainNode }
    const speciesUrls: string[] = []
    function walk(node: ChainNode | undefined) {
      if (!node?.species?.url) return
      speciesUrls.push(node.species.url)
      for (const child of node.evolves_to ?? []) walk(child)
    }
    walk(chainData.chain)
    const stages: EvolutionStage[] = []
    for (const url of speciesUrls) {
      const idStr = url.split('/').filter(Boolean).pop()
      const sid = idStr ? parseInt(idStr, 10) : NaN
      if (Number.isNaN(sid)) continue
      const forms = await fetchSpeciesVarieties(sid)
      if (forms.length > 0) stages.push({ forms })
    }
    evolutionCache.set(speciesId, stages)
    return stages
  } catch {
    evolutionCache.set(speciesId, [])
    return []
  }
}

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
      species?: { url?: string }
      sprites?: { other?: { 'official-artwork'?: { front_default?: string } }; front_default?: string }
      types?: Array<{ type?: { name?: string } }>
      stats?: Array<{ base_stat: number; stat?: { name?: string } }>
      abilities?: Array<{ ability?: { name?: string } }>
      moves?: Array<{
        move?: { name?: string }
      }>
    }
    const speciesUrl = data.species?.url ?? ''
    const speciesIdStr = speciesUrl.split('/').filter(Boolean).pop()
    const speciesId = speciesIdStr ? parseInt(speciesIdStr, 10) : data.id
    const speciesIdNum = Number.isNaN(speciesId) ? data.id : speciesId
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
    const evolution = await fetchEvolutionChainForSpecies(speciesIdNum)
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
      evolution,
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
