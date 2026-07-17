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
  pp?: number | null
  priority?: number | null
  desc?: string | null
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

/** Slug for Showdown filenames: kebab-case, PokéAPI-compatible segment. */
function sanitizeShowdownSpeciesSlug(speciesSlug: string): string {
  return speciesSlug
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Map PokéAPI / common slugs → Play Showdown sprite basename
 * (https://play.pokemonshowdown.com/sprites/home/).
 */
const SHOWDOWN_SPRITE_SLUG_ALIASES: Record<string, string> = {
  'mr-mime': 'mrmime',
  'mr-mime-galar': 'mrmime-galar',
  'mr-rime': 'mrrime',
  'mime-jr': 'mimejr',
  'type-null': 'typenull',
  'ho-oh': 'hooh',
  'jangmo-o': 'jangmoo',
  'hakamo-o': 'hakamoo',
  'kommo-o': 'kommoo',
  'nidoran-m': 'nidoranm',
  'nidoran-f': 'nidoranf',
  'basculin-blue-striped': 'basculin-bluestriped',
  'basculin-white-striped': 'basculin-whitestriped',
}

/** Local custom sprites (tournament / server-exclusive forms). Served from Frontend public/. */
const CUSTOM_POKEMON_SPRITE_URLS: Record<string, string> = {
  'floette-ange': '/sprites/pokemon/floette-ange.png',
}

function customPokemonSpriteUrl(speciesSlug: string): string | null {
  const s = sanitizeShowdownSpeciesSlug(speciesSlug)
  return CUSTOM_POKEMON_SPRITE_URLS[s] ?? null
}

/** Filename slug for Showdown sprite paths (not always == PokéAPI name). */
function showdownSpriteSlug(speciesSlug: string): string {
  let s = sanitizeShowdownSpeciesSlug(speciesSlug)
  // "galarian-moltres" / display order → Showdown "moltres-galar"
  if (s.startsWith('galarian-')) {
    s = `${s.slice('galarian-'.length)}-galar`
  } else if (s.endsWith('galar') && !s.endsWith('-galar')) {
    // Cobblemon / rewards: "moltresgalar" → "moltres-galar"
    s = `${s.slice(0, -'galar'.length)}-galar`
  }
  s = s.replace(/-mega-x$/g, '-megax').replace(/-mega-y$/g, '-megay')
  s = s.replace(/^tapu-([a-z]+)$/g, 'tapu$1')
  return SHOWDOWN_SPRITE_SLUG_ALIASES[s] ?? s
}

/**
 * Showdown basename variants — PokéAPI uses hyphens (iron-valiant) but Showdown
 * often omits them (ironvaliant). Form suffixes like -galar / -megax keep hyphens.
 */
export function showdownSpriteSlugCandidates(speciesSlug: string): string[] {
  const primary = showdownSpriteSlug(speciesSlug)
  const compact = primary.replace(/-/g, '')
  return compact !== primary ? [primary, compact] : [primary]
}

const SHOWDOWN_SPRITE_BASE = 'https://play.pokemonshowdown.com/sprites'

function showdownFolderSpriteUrl(folder: string, slug: string): string {
  return `${SHOWDOWN_SPRITE_BASE}/${folder}/${encodeURIComponent(slug)}.png`
}

/**
 * Ordered Showdown URLs: Gen 5 pixel → Gen 6 pixel → HOME, trying slug variants.
 * Covers species through Gen 9 (Showdown adds SV pixel art to the gen5 folder).
 */
export function showdownSpriteFallbackUrls(
  speciesSlug: string,
  opts?: { shiny?: boolean }
): string[] {
  const shiny = opts?.shiny ?? false
  const slugs = showdownSpriteSlugCandidates(speciesSlug)
  const urls: string[] = []

  const custom = customPokemonSpriteUrl(speciesSlug)
  if (custom) urls.push(custom)

  const pixelFolders = shiny ? (['gen5-shiny'] as const) : (['gen5', 'gen6'] as const)
  for (const folder of pixelFolders) {
    for (const slug of slugs) {
      urls.push(showdownFolderSpriteUrl(folder, slug))
    }
  }

  const homeFolder = shiny ? 'home-shiny' : 'home'
  for (const slug of slugs) {
    urls.push(showdownFolderSpriteUrl(homeFolder, slug))
  }

  return [...new Set(urls)]
}

/**
 * Pokémon Showdown Gen 5 pixel front sprites (B/W style).
 * https://play.pokemonshowdown.com/sprites/gen5/
 */
export function showdownGen5SpriteUrl(speciesSlug: string): string {
  return showdownSpriteFallbackUrls(speciesSlug)[0] ?? showdownFolderSpriteUrl('gen5', showdownSpriteSlug(speciesSlug))
}

/** Shiny Gen 5 pixel PNG. */
export function showdownGen5ShinySpriteUrl(speciesSlug: string): string {
  return (
    showdownSpriteFallbackUrls(speciesSlug, { shiny: true })[0] ??
    showdownFolderSpriteUrl('gen5-shiny', showdownSpriteSlug(speciesSlug))
  )
}

/** Primary app sprite — Gen 5 pixel art. */
export function showdownSpriteUrl(speciesSlug: string): string {
  return showdownGen5SpriteUrl(speciesSlug)
}

/** Primary app shiny sprite — Gen 5 pixel art. */
export function showdownShinySpriteUrl(speciesSlug: string): string {
  return showdownGen5ShinySpriteUrl(speciesSlug)
}

/**
 * Pokémon Showdown static HOME front sprites (PNG).
 * https://play.pokemonshowdown.com/sprites/home/
 */
export function showdownHomeSpriteUrl(speciesSlug: string): string {
  const s = showdownSpriteSlug(speciesSlug)
  return `https://play.pokemonshowdown.com/sprites/home/${encodeURIComponent(s)}.png`
}

/** Shiny static HOME PNG. */
export function showdownHomeShinySpriteUrl(speciesSlug: string): string {
  const s = showdownSpriteSlug(speciesSlug)
  return `https://play.pokemonshowdown.com/sprites/home-shiny/${encodeURIComponent(s)}.png`
}

/** @deprecated Use showdownHomeSpriteUrl — same PNG URL. */
export function showdownHomePngSpriteUrl(speciesSlug: string): string {
  return showdownHomeSpriteUrl(speciesSlug)
}

/** @deprecated Use showdownHomeShinySpriteUrl — same PNG URL. */
export function showdownHomeShinyPngSpriteUrl(speciesSlug: string): string {
  return showdownHomeShinySpriteUrl(speciesSlug)
}

/** Fetch full Pokémon details for wiki. Cached by id/name. */
const detailCache = new Map<string, PokemonDetail>()

const evolutionCache = new Map<number, EvolutionStage[]>()
const speciesVarietiesCache = new Map<number, EvolutionForm[]>()

/** Gen 9 overworld ride / traversal varieties — not battle forms, hide in Wiki. */
function isTraversalOnlyForm(pokemonName: string): boolean {
  return (
    /-(?:limited|sprinting|swimming|gliding)-build$/.test(pokemonName) ||
    /-(?:low-power|drive|aquatic|glide)-mode$/.test(pokemonName)
  )
}

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
      .filter((f) => !isTraversalOnlyForm(f.name))
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
      sprites?: {
        other?: { 'official-artwork'?: { front_default?: string } }
        front_default?: string
        versions?: Record<string, Record<string, { front_default?: string | null }>>
      }
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
    const image = extractPokeApiSprite(data)
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

/** Best pixel / game sprite from a PokéAPI pokemon payload (Gen 9 → Gen 5 → HOME → art). */
function extractPokeApiSprite(data: {
  id?: number
  sprites?: {
    front_default?: string | null
    other?: {
      home?: { front_default?: string | null }
      'official-artwork'?: { front_default?: string | null }
    }
    versions?: Record<string, Record<string, { front_default?: string | null }>>
  }
}): string {
  const s = data.sprites
  const id = data.id ?? 0
  const versions = s?.versions ?? {}
  return (
    versions['generation-ix']?.['scarlet-violet']?.front_default ??
    versions['generation-viii']?.['brilliant-diamond-shining-pearl']?.front_default ??
    versions['generation-vii']?.['ultra-sun-ultra-moon']?.front_default ??
    versions['generation-vi']?.['omegaruby-alphasapphire']?.front_default ??
    versions['generation-v']?.['black-white']?.front_default ??
    s?.other?.home?.front_default ??
    s?.front_default ??
    s?.other?.['official-artwork']?.front_default ??
    (id > 0 ? pokemonSpriteUrl(id) : '') ??
    ''
  )
}

/** Try PokéAPI game sprites using slug and/or display name (when Showdown sprites 404). */
export async function fetchPokemonSpriteImage(
  speciesSlug?: string | null,
  speciesDisplay?: string | null
): Promise<string | null> {
  const candidates: string[] = []
  const slug = speciesSlug?.trim().toLowerCase()
  const display = speciesDisplay?.trim()
  if (slug) candidates.push(slug)
  if (display) {
    candidates.push(
      display
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
    )
    candidates.push(toPokeApiName(display))
  }
  for (const key of [...new Set(candidates.filter(Boolean))]) {
    const info = await fetchPokemonInfo(key)
    if (info?.image) return info.image
  }
  return null
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
      id?: number
      sprites?: {
        other?: { 'official-artwork'?: { front_default?: string } }
        front_default?: string
        versions?: Record<string, Record<string, { front_default?: string | null }>>
      }
      types?: Array<{ type?: { name?: string } }>
    }
    const image = extractPokeApiSprite(data)
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

/** Slug for resource names (items, moves) — matches PokéAPI `/item/{slug}` paths. */
export function pokeApiResourceSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['.]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

const POKEAPI_ITEMS_RAW_BASE =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items'

/**
 * Raw GitHub URLs for an item icon: root `items/` first, then [`items/gen9/`](https://github.com/PokeAPI/sprites/tree/master/sprites/items/gen9)
 * when Gen 9 assets are only in the subfolder.
 */
export function pokeApiItemSpriteCandidates(itemName: string): string[] {
  const slug = pokeApiResourceSlug(itemName.trim())
  if (!slug) return []
  const enc = encodeURIComponent(slug)
  return [`${POKEAPI_ITEMS_RAW_BASE}/${enc}.png`, `${POKEAPI_ITEMS_RAW_BASE}/gen9/${enc}.png`]
}

/**
 * First candidate URL (`sprites/items/{slug}.png`). Prefer {@link pokeApiItemSpriteCandidates} when you need Gen 9 fallback paths.
 */
export function pokeApiItemSpriteUrl(itemName: string): string {
  return pokeApiItemSpriteCandidates(itemName)[0] ?? ''
}

/** PokéAPI item index entry (`name` is API slug, e.g. `leftovers`). */
export interface ItemListEntry {
  name: string
}

/**
 * Slugs that appear under [`sprites/items/gen9/`](https://github.com/PokeAPI/sprites/tree/master/sprites/items/gen9).
 * Merged into the picker if missing from the PokéAPI index so Gen 9–heavy names still appear in the list.
 */
const ITEM_GEN9_SPRITE_FOLDER_SLUGS: readonly string[] = [
  'ability-shield',
  'absolite-z',
  'barbaracite',
  'baxcalibrite',
  'booster-energy',
  'chandelurite',
  'chesnaughtite',
  'chimechite',
  'clear-amulet',
  'clefablite',
  'cornerstone-mask',
  'covert-cloak',
  'crabominite',
  'darkranite',
  'delphoxite',
  'dragalgite',
  'dragoninite',
  'drampanite',
  'eelektrossite',
  'emboarite',
  'excadrite',
  'fairy-feather',
  'falinksite',
  'feraligite',
  'floettite',
  'froslassite',
  'garchompite-z',
  'glimmoranite',
  'golisopite',
  'golurkite',
  'greninjite',
  'hawluchanite',
  'hearthflame-mask',
  'heatranite',
  'loaded-dice',
  'lucarionite-z',
  'magearnite',
  'malamarite',
  'meganiumite',
  'meowsticite',
  'mirror-herb',
  'punching-glove',
  'pyroarite',
  'raichunite-x',
  'raichunite-y',
  'scolipite',
  'scovillainite',
  'scraftinite',
  'skarmorite',
  'staraptite',
  'starminite',
  'tatsugirinite',
  'victreebelite',
  'wellspring-mask',
  'zeraorite',
  'zygardite',
]

let itemListCache: ItemListEntry[] | null = null

/** PokéAPI ability index entry (`name` is slug, e.g. `intimidate`). */
export interface AbilityListEntry {
  name: string
}

/** PokéAPI move index entry (`name` is slug, e.g. `earthquake`). */
export interface MoveListEntry {
  name: string
}

let abilityListCache: AbilityListEntry[] | null = null
let moveListCache: MoveListEntry[] | null = null

/**
 * All ability slugs from PokéAPI (paginated). Cached for the session.
 */
export async function fetchAbilityList(): Promise<AbilityListEntry[]> {
  if (abilityListCache) return abilityListCache
  const out: AbilityListEntry[] = []
  try {
    let url: string | null = 'https://pokeapi.co/api/v2/ability?limit=500'
    while (url) {
      const res = await fetch(url)
      if (!res.ok) break
      const data = (await res.json()) as {
        next?: string | null
        results?: Array<{ name: string }>
      }
      for (const r of data.results ?? []) {
        if (r?.name) out.push({ name: r.name })
      }
      url = typeof data.next === 'string' ? data.next : null
    }
    out.sort((a, b) => a.name.localeCompare(b.name))
    abilityListCache = out
    return out
  } catch {
    return []
  }
}

/**
 * All move slugs from PokéAPI (paginated). Cached for the session.
 */
export async function fetchMoveList(): Promise<MoveListEntry[]> {
  if (moveListCache) return moveListCache
  const out: MoveListEntry[] = []
  try {
    let url: string | null = 'https://pokeapi.co/api/v2/move?limit=500'
    while (url) {
      const res = await fetch(url)
      if (!res.ok) break
      const data = (await res.json()) as {
        next?: string | null
        results?: Array<{ name: string }>
      }
      for (const r of data.results ?? []) {
        if (r?.name) out.push({ name: r.name })
      }
      url = typeof data.next === 'string' ? data.next : null
    }
    out.sort((a, b) => a.name.localeCompare(b.name))
    moveListCache = out
    return out
  } catch {
    return []
  }
}

/** Tera types in Poképaste-style Title Case (incl. Stellar for Gen 9). */
export const TERA_TYPE_OPTIONS: readonly string[] = [
  'Normal',
  'Fire',
  'Water',
  'Electric',
  'Grass',
  'Ice',
  'Fighting',
  'Poison',
  'Ground',
  'Flying',
  'Psychic',
  'Bug',
  'Rock',
  'Ghost',
  'Dragon',
  'Dark',
  'Steel',
  'Fairy',
  'Stellar',
]

/**
 * All item slugs from PokéAPI (paginated), plus any Gen 9 sprite-folder slugs not returned by the index.
 * Cached in memory for the session.
 */
export async function fetchItemList(): Promise<ItemListEntry[]> {
  if (itemListCache) return itemListCache
  const out: ItemListEntry[] = []
  try {
    let url: string | null = 'https://pokeapi.co/api/v2/item?limit=500'
    while (url) {
      const res = await fetch(url)
      if (!res.ok) break
      const data = (await res.json()) as {
        next?: string | null
        results?: Array<{ name: string }>
      }
      for (const r of data.results ?? []) {
        if (r?.name) out.push({ name: r.name })
      }
      url = typeof data.next === 'string' ? data.next : null
    }
    const seen = new Set(out.map((x) => x.name))
    for (const name of ITEM_GEN9_SPRITE_FOLDER_SLUGS) {
      if (!seen.has(name)) {
        seen.add(name)
        out.push({ name })
      }
    }
    out.sort((a, b) => a.name.localeCompare(b.name))
    itemListCache = out
    return out
  } catch {
    return []
  }
}

/** Fetch move summary — Showdown dex first (PvP-accurate), then PokéAPI. Cached. */
export async function fetchMoveSummary(moveName: string): Promise<MoveSummary | null> {
  const key = pokeApiResourceSlug(moveName)
  if (moveSummaryCache.has(key)) return moveSummaryCache.get(key) ?? null

  try {
    const { getShowdownMove, resolveShowdownMoveId, showdownMoveToSummary } = await import('./showdownData')
    const showdownId = await resolveShowdownMoveId(key)
    const showdownMove = await getShowdownMove(showdownId)
    if (showdownMove) {
      const summary: MoveSummary = showdownMoveToSummary(showdownMove)
      moveSummaryCache.set(key, summary)
      if (showdownId !== key) moveSummaryCache.set(showdownId, summary)
      return summary
    }
  } catch {
    /* Showdown static data unavailable — fall back to PokéAPI */
  }

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
      pp?: number | null
      priority?: number | null
      damage_class?: { name?: string }
      flavor_text_entries?: Array<{ flavor_text?: string; language?: { name?: string } }>
    }
    const enFlavor = (data.flavor_text_entries ?? []).find((e) => e.language?.name === 'en')
    const summary: MoveSummary = {
      type: data.type?.name ?? null,
      power: data.power ?? null,
      accuracy: data.accuracy ?? null,
      damageClass: data.damage_class?.name ?? null,
      pp: data.pp ?? null,
      priority: data.priority ?? null,
      desc: enFlavor?.flavor_text?.replace(/\s+/g, ' ').trim() ?? null,
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
  const key = pokeApiResourceSlug(itemName)
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
