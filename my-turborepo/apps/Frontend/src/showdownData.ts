/**
 * Pokémon Showdown dex data (pokedex, moves, learnsets).
 * Static JSON is served from /showdown-data/ (see packages/pokemon-showdown-data).
 */

export interface ShowdownBaseStats {
  hp: number
  atk: number
  def: number
  spa: number
  spd: number
  spe: number
}

export interface ShowdownPokemon {
  num: number
  name: string
  types: string[]
  baseStats: ShowdownBaseStats
  abilities: Record<string, string>
  heightm?: number
  weightkg?: number
  desc?: string
  shortDesc?: string
}

export interface ShowdownMove {
  num: number
  name: string
  type: string
  category: 'Physical' | 'Special' | 'Status' | string
  basePower: number
  accuracy: number | true
  pp: number
  priority: number
  desc?: string
  shortDesc?: string
  target?: string
}

export interface ShowdownLearnsetEntry {
  learnset?: Record<string, string[]>
  eventOnly?: boolean
}

type PokedexMap = Record<string, ShowdownPokemon>
type MovesMap = Record<string, ShowdownMove>
type LearnsetsMap = Record<string, ShowdownLearnsetEntry>

const SHOWDOWN_DATA_BASE = '/showdown-data'

let pokedexPromise: Promise<PokedexMap> | null = null
let movesPromise: Promise<MovesMap> | null = null
let learnsetsPromise: Promise<LearnsetsMap> | null = null
let speciesSlugIndexPromise: Promise<Map<string, string>> | null = null
let moveSlugIndexPromise: Promise<Map<string, string>> | null = null

export interface ShowdownMoveSummary {
  type: string
  power: number | null
  accuracy: number | null
  damageClass: string
  pp: number
  priority: number
  desc: string | null
}

async function fetchJson<T>(file: string): Promise<T> {
  const res = await fetch(`${SHOWDOWN_DATA_BASE}/${file}`)
  if (!res.ok) throw new Error(`Showdown data ${file}: ${res.status}`)
  return (await res.json()) as T
}

export function loadShowdownPokedex(): Promise<PokedexMap> {
  pokedexPromise ??= fetchJson<PokedexMap>('pokedex.json')
  return pokedexPromise
}

export function loadShowdownMoves(): Promise<MovesMap> {
  movesPromise ??= fetchJson<MovesMap>('moves.json')
  return movesPromise
}

export function loadShowdownLearnsets(): Promise<LearnsetsMap> {
  learnsetsPromise ??= fetchJson<LearnsetsMap>('learnsets.json')
  return learnsetsPromise
}

function registerSlugAliases(index: Map<string, string>, id: string) {
  index.set(id, id)
  const compact = id.replace(/-/g, '')
  if (compact !== id) index.set(compact, id)
}

/** PokéAPI-style slug → Showdown dex id (e.g. mr-mime → mrmime). */
export async function resolveShowdownSpeciesId(speciesSlug: string): Promise<string> {
  const slug = speciesSlug.trim().toLowerCase()
  if (!slug) return slug
  const index = await getShowdownSpeciesSlugIndex()
  return index.get(slug) ?? index.get(slug.replace(/-/g, '')) ?? slug.replace(/-/g, '')
}

/** PokéAPI / learnset slug → Showdown moves.json key (e.g. aerial-ace → aerialace). */
export async function resolveShowdownMoveId(moveSlug: string): Promise<string> {
  const slug = moveSlug.trim().toLowerCase().replace(/\s+/g, '-').replace(/'/g, '')
  if (!slug) return slug
  const index = await getShowdownMoveSlugIndex()
  return index.get(slug) ?? index.get(slug.replace(/-/g, '')) ?? slug.replace(/-/g, '')
}

async function getShowdownSpeciesSlugIndex(): Promise<Map<string, string>> {
  if (speciesSlugIndexPromise) return speciesSlugIndexPromise
  speciesSlugIndexPromise = (async () => {
    const [pokedex, learnsets] = await Promise.all([loadShowdownPokedex(), loadShowdownLearnsets()])
    const index = new Map<string, string>()
    for (const id of Object.keys(pokedex)) registerSlugAliases(index, id)
    for (const id of Object.keys(learnsets)) registerSlugAliases(index, id)
    return index
  })()
  return speciesSlugIndexPromise
}

async function getShowdownMoveSlugIndex(): Promise<Map<string, string>> {
  if (moveSlugIndexPromise) return moveSlugIndexPromise
  moveSlugIndexPromise = (async () => {
    const moves = await loadShowdownMoves()
    const index = new Map<string, string>()
    for (const id of Object.keys(moves)) registerSlugAliases(index, id)
    return index
  })()
  return moveSlugIndexPromise
}

export async function getShowdownPokemon(speciesSlug: string): Promise<ShowdownPokemon | null> {
  const id = await resolveShowdownSpeciesId(speciesSlug)
  const pokedex = await loadShowdownPokedex()
  return pokedex[id] ?? null
}

/** Legal abilities for a species (e.g. Blaze, Solar Power). */
export async function getShowdownPokemonAbilities(speciesSlug: string): Promise<string[]> {
  const pokemon = await getShowdownPokemon(speciesSlug)
  if (!pokemon?.abilities) return []
  const names = Object.values(pokemon.abilities).filter(
    (a): a is string => typeof a === 'string' && a.trim() !== '',
  )
  return [...new Set(names)].sort((a, b) => a.localeCompare(b))
}

export async function getShowdownMove(moveSlug: string): Promise<ShowdownMove | null> {
  const id = await resolveShowdownMoveId(moveSlug)
  if (!id) return null
  const moves = await loadShowdownMoves()
  return moves[id] ?? null
}

/** Move slugs a species can learn (Showdown learnset keys). */
export async function getShowdownLearnableMoveSlugs(speciesSlug: string): Promise<string[]> {
  const id = await resolveShowdownSpeciesId(speciesSlug)
  const learnsets = await loadShowdownLearnsets()
  const entry = learnsets[id]
  const learnset = entry?.learnset
  if (!learnset) return []
  return Object.keys(learnset).sort((a, b) => a.localeCompare(b))
}

/** Display names for learnable moves (e.g. "Aerial Ace") — for team builder pickers. */
export async function getShowdownLearnableMoveNames(speciesSlug: string): Promise<string[]> {
  const id = await resolveShowdownSpeciesId(speciesSlug)
  const [learnsets, moves, index] = await Promise.all([
    loadShowdownLearnsets(),
    loadShowdownMoves(),
    getShowdownMoveSlugIndex(),
  ])
  const learnset = learnsets[id]?.learnset
  if (!learnset) return []
  return Object.keys(learnset)
    .map((slug) => {
      const moveId = index.get(slug) ?? slug
      return moves[moveId]?.name ?? slug
    })
    .sort((a, b) => a.localeCompare(b))
}

export interface ShowdownSlotValidation {
  invalidAbility: string | null
  invalidMoves: string[]
}

function moveDisplayNameToLearnsetId(
  displayName: string,
  movesMap: MovesMap,
  moveIndex: Map<string, string>,
): string | null {
  const trimmed = displayName.trim()
  if (!trimmed) return null

  const slugCandidates = [
    trimmed.toLowerCase().replace(/\s+/g, '-').replace(/'/g, ''),
    trimmed.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-'),
  ]

  for (const candidate of slugCandidates) {
    const id = moveIndex.get(candidate) ?? moveIndex.get(candidate.replace(/-/g, '')) ?? candidate.replace(/-/g, '')
    if (movesMap[id]) return id
  }

  const lower = trimmed.toLowerCase()
  for (const [id, move] of Object.entries(movesMap)) {
    if (move.name.toLowerCase() === lower) return id
  }
  return null
}

/** Check ability + moves against Showdown learnsets (team builder save). */
export async function validateShowdownSlot(params: {
  speciesSlug: string
  ability: string | null
  moves: string[]
}): Promise<ShowdownSlotValidation> {
  const speciesSlug = params.speciesSlug.trim()
  if (!speciesSlug) return { invalidAbility: null, invalidMoves: [] }

  const [learnableSlugs, abilities, movesMap, moveIndex] = await Promise.all([
    getShowdownLearnableMoveSlugs(speciesSlug),
    getShowdownPokemonAbilities(speciesSlug),
    loadShowdownMoves(),
    getShowdownMoveSlugIndex(),
  ])

  const learnableSlugSet = new Set(learnableSlugs)
  const abilityLower = new Set(abilities.map((a) => a.toLowerCase()))

  let invalidAbility: string | null = null
  const ability = params.ability?.trim()
  if (ability && abilities.length > 0 && !abilityLower.has(ability.toLowerCase())) {
    invalidAbility = ability
  }

  const invalidMoves: string[] = []
  if (learnableSlugs.length > 0) {
    for (const moveName of params.moves) {
      const trimmed = moveName.trim()
      if (!trimmed) continue
      const moveId = moveDisplayNameToLearnsetId(trimmed, movesMap, moveIndex)
      if (!moveId || !learnableSlugSet.has(moveId)) {
        invalidMoves.push(trimmed)
      }
    }
  }

  return { invalidAbility, invalidMoves }
}

export function showdownMoveToSummary(move: ShowdownMove): ShowdownMoveSummary {
  const accuracy = move.accuracy === true ? 100 : move.accuracy
  const damageClass =
    move.category === 'Physical'
      ? 'physical'
      : move.category === 'Special'
        ? 'special'
        : move.category === 'Status'
          ? 'status'
          : move.category.toLowerCase()
  return {
    type: move.type.toLowerCase(),
    power: move.category === 'Status' ? null : move.basePower,
    accuracy,
    damageClass,
    pp: move.pp,
    priority: move.priority,
    desc: move.shortDesc ?? move.desc ?? null,
  }
}

/** Batch-resolve move stats from one loaded moves.json (for wiki learnsets). */
export async function getShowdownMoveSummaries(
  moveSlugs: string[],
): Promise<Record<string, ShowdownMoveSummary | null>> {
  const [moves, index] = await Promise.all([loadShowdownMoves(), getShowdownMoveSlugIndex()])
  const out: Record<string, ShowdownMoveSummary | null> = {}
  for (const raw of moveSlugs) {
    const id = index.get(raw) ?? index.get(raw.replace(/-/g, '')) ?? raw.replace(/-/g, '')
    const move = moves[id]
    out[raw] = move ? showdownMoveToSummary(move) : null
  }
  return out
}
