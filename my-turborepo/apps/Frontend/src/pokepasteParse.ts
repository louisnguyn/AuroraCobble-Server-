/**
 * Parse Showdown / PokePaste-style paste into structured team JSON.
 * Mirrors apps/Backend/src/pokepasteParse.ts.
 */

export type ParsedPokemon = {
  species: string
  speciesSlug: string
  item: string
  ability: string | null
  teraType: string | null
  moves: string[]
  firstLine: string
}

/** Builder / API payload (no synthetic first line). */
export type TeamBuildSlot = Omit<ParsedPokemon, 'firstLine'>

export function speciesDisplayToSlug(speciesLine: string): string {
  let s = speciesLine.trim()
  const paren = s.indexOf(' (')
  if (paren >= 0) s = s.slice(0, paren).trim()
  return s
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

function speciesToSlug(speciesLine: string): string {
  return speciesDisplayToSlug(speciesLine)
}

function parseOneBlock(block: string): ParsedPokemon | null {
  const lines = block.split(/\r?\n/).map((l) => l.trim())
  const first = lines[0]
  if (!first) return null
  const atMatch = first.match(/^(.+?)\s+@\s*(.+)$/)
  if (!atMatch) return null
  const speciesPart = atMatch[1]!.trim()
  const item = atMatch[2]!.trim()
  let ability: string | null = null
  let teraType: string | null = null
  const moves: string[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!
    const ab = line.match(/^Ability:\s*(.+)$/i)
    if (ab) {
      ability = ab[1]!.trim()
      continue
    }
    const tt = line.match(/^Tera Type:\s*(.+)$/i)
    if (tt) {
      teraType = tt[1]!.trim()
      continue
    }
    const mv = line.match(/^-\s*(.+)$/)
    if (mv) moves.push(mv[1]!.trim())
  }
  return {
    species: speciesPart,
    speciesSlug: speciesToSlug(speciesPart),
    item,
    ability,
    teraType,
    moves,
    firstLine: first,
  }
}

function splitBlocks(raw: string): string[] {
  const t = raw.replace(/\r\n/g, '\n').trim()
  if (!t) return []
  const byDouble = t
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
  if (byDouble.length > 1) return byDouble
  const blocks: string[] = []
  const lines = t.split('\n')
  let cur: string[] = []
  const headerRe = /^[A-Za-z0-9][^\n@]*@[^\n]+$/
  for (const line of lines) {
    if (headerRe.test(line.trim()) && cur.length > 0) {
      blocks.push(cur.join('\n'))
      cur = [line]
    } else {
      cur.push(line)
    }
  }
  if (cur.length) blocks.push(cur.join('\n'))
  return blocks.filter((b) => b.trim())
}

export function parsePokepaste(raw: string): ParsedPokemon[] {
  const blocks = splitBlocks(raw)
  const out: ParsedPokemon[] = []
  for (const b of blocks) {
    const p = parseOneBlock(b)
    if (p) out.push(p)
  }
  return out
}

export function parsedPokemonToSlot(p: ParsedPokemon): TeamBuildSlot {
  return {
    species: p.species,
    speciesSlug: p.speciesSlug,
    item: p.item,
    ability: p.ability,
    teraType: p.teraType,
    moves: [...p.moves],
  }
}

export function teamSlotToParsed(s: TeamBuildSlot): ParsedPokemon | null {
  if (!s.species.trim()) return null
  const species = s.species.trim()
  const item = s.item.trim() || 'Nothing'
  return {
    species,
    speciesSlug: s.speciesSlug.trim() || speciesDisplayToSlug(species),
    item,
    ability: s.ability?.trim() ? s.ability.trim() : null,
    teraType: s.teraType?.trim() ? s.teraType.trim() : null,
    moves: s.moves.map((m) => m.trim()).filter(Boolean),
    firstLine: `${species} @ ${item}`,
  }
}

export function emptyTeamSlots(): TeamBuildSlot[] {
  const empty = (): TeamBuildSlot => ({
    species: '',
    speciesSlug: '',
    item: '',
    ability: null,
    teraType: null,
    moves: [],
  })
  return Array.from({ length: 6 }, empty)
}

/** Pad moves to four rows in the UI — export strips empties. */
export function normalizeSlotMovesForForm(moves: string[]): [string, string, string, string] {
  const m = [...moves, '', '', '', ''].slice(0, 4)
  return [m[0]!, m[1]!, m[2]!, m[3]!]
}

/** PokéAPI / builder slug → species line as PokePaste & Showdown expect (for sprite lookup). */
const SHOWDOWN_SPECIES_NAMES: Record<string, string> = {
  'mr-mime': 'Mr. Mime',
  'mr-mime-galar': 'Mr. Mime-Galar',
  'mr-rime': 'Mr. Rime',
  'mime-jr': 'Mime Jr.',
  'type-null': 'Type: Null',
  'ho-oh': 'Ho-Oh',
  'porygon-z': 'Porygon-Z',
  'nidoran-m': 'Nidoran-M',
  'nidoran-f': 'Nidoran-F',
  'jangmo-o': 'Jangmo-o',
  'hakamo-o': 'Hakamo-o',
  'kommo-o': 'Kommo-o',
  'tapu-koko': 'Tapu Koko',
  'tapu-lele': 'Tapu Lele',
  'tapu-bulu': 'Tapu Bulu',
  'tapu-fini': 'Tapu Fini',
}

export function toShowdownSpeciesName(species: string, speciesSlug?: string): string {
  const slug = (speciesSlug?.trim() || speciesDisplayToSlug(species)).toLowerCase()
  if (SHOWDOWN_SPECIES_NAMES[slug]) return SHOWDOWN_SPECIES_NAMES[slug]!
  return slug
    .split('-')
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join('-')
}

/**
 * pokepast.es only parses pastes with CRLF line breaks (\r\n between lines, \r\n\r\n between Pokémon).
 * LF-only exports get pokemon id 0 → broken /img/pokemon/0-0.png sprites.
 */
export function normalizePasteForPokepaste(paste: string): string {
  return paste.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')
}

export function teamSlotsToPaste(slots: TeamBuildSlot[]): string {
  const blocks: string[] = []
  const nl = '\r\n'
  for (const s of slots) {
    if (!s.species.trim()) continue
    const species = toShowdownSpeciesName(s.species, s.speciesSlug)
    const item = s.item.trim() || 'Nothing'
    let block = `${species} @ ${item}${nl}`
    if (s.ability?.trim()) block += `Ability: ${s.ability.trim()}${nl}`
    if (s.teraType?.trim()) block += `Tera Type: ${s.teraType.trim()}${nl}`
    for (const mv of s.moves) {
      if (mv.trim()) block += `- ${mv.trim()}${nl}`
    }
    blocks.push(block.replace(/\r\n+$/, ''))
  }
  return blocks.join(`${nl}${nl}`)
}
