import type { FormatUsage, SpeciesUsage, TierUsage, UsageStatsResponse } from './types'

function pickMeta(o: Record<string, unknown>): Pick<UsageStatsResponse, 'serverId' | 'seasonName' | 'timestamp'> {
  return {
    serverId: typeof o.serverId === 'string' ? o.serverId : undefined,
    seasonName:
      typeof o.seasonName === 'string'
        ? o.seasonName
        : typeof o.season === 'string'
          ? o.season
          : typeof o.season_name === 'string'
            ? o.season_name
            : undefined,
    timestamp:
      typeof o.timestamp === 'string'
        ? o.timestamp
        : typeof o.updatedAt === 'string'
          ? o.updatedAt
          : typeof o.updated_at === 'string'
            ? o.updated_at
            : undefined,
  }
}

function normalizeSpecies(raw: unknown, fallbackName?: string): SpeciesUsage | null {
  if (raw == null || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const name =
    (typeof o.name === 'string' && o.name.trim()) ||
    (typeof o.species === 'string' && o.species.trim()) ||
    (fallbackName && fallbackName.trim()) ||
    ''
  if (!name) return null
  const usagePercent = Number(o.usagePercent ?? o.usage_percent ?? o.percent ?? o.usage ?? 0)
  const countRaw = o.count
  const count = countRaw != null && Number.isFinite(Number(countRaw)) ? Number(countRaw) : undefined
  const winRateRaw = o.winRate ?? o.win_rate
  const winRate = winRateRaw != null && Number.isFinite(Number(winRateRaw)) ? Number(winRateRaw) : undefined
  const base: SpeciesUsage = {
    name,
    usagePercent: Number.isFinite(usagePercent) ? usagePercent : 0,
  }
  if (count !== undefined) base.count = count
  if (winRate !== undefined) base.winRate = winRate
  if (o.abilities && typeof o.abilities === 'object') base.abilities = o.abilities as Record<string, number>
  if (o.items && typeof o.items === 'object') base.items = o.items as Record<string, number>
  if (o.moves && typeof o.moves === 'object') base.moves = o.moves as Record<string, number>
  if (o.natures && typeof o.natures === 'object') base.natures = o.natures as Record<string, number>
  if (o.evSpreads && typeof o.evSpreads === 'object') base.evSpreads = o.evSpreads as Record<string, number>
  if (o.teammates && typeof o.teammates === 'object') base.teammates = o.teammates as Record<string, number>
  return base
}

function normalizeSpeciesList(raw: unknown): SpeciesUsage[] {
  if (raw == null) return []
  if (Array.isArray(raw)) {
    return raw.map((x) => normalizeSpecies(x)).filter((x): x is SpeciesUsage => x != null)
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const out: SpeciesUsage[] = []
    for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
      const s = normalizeSpecies(v, key)
      if (s) out.push(s)
    }
    return out
  }
  return []
}

function normalizeTierUsage(raw: unknown, _keyHint: string): TierUsage | null {
  if (raw == null || typeof raw !== 'object') return null
  const t = raw as Record<string, unknown>
  const minElo = Number(t.minElo ?? t.min_elo ?? t.minELO ?? 0)
  const maxRaw = t.maxElo ?? t.max_elo ?? t.maxELO
  const maxElo =
    maxRaw === null || maxRaw === undefined || maxRaw === 'null'
      ? null
      : Number.isFinite(Number(maxRaw))
        ? Number(maxRaw)
        : null
  const totalBattles = Number(t.totalBattles ?? t.total_battles ?? t.battles ?? t.totalBattlesCount ?? 0)
  const totalPokemonRaw = t.totalPokemon ?? t.total_pokemon
  const totalPokemon =
    totalPokemonRaw != null && Number.isFinite(Number(totalPokemonRaw)) ? Number(totalPokemonRaw) : undefined
  const species = normalizeSpeciesList(t.species ?? t.pokemon ?? t.speciesUsage)
  const tier: TierUsage = {
    minElo: Number.isFinite(minElo) ? minElo : 0,
    maxElo,
    totalBattles: Number.isFinite(totalBattles) ? totalBattles : 0,
    species,
  }
  if (totalPokemon !== undefined) tier.totalPokemon = totalPokemon
  return tier
}

function tierSortKey(t: TierUsage): number {
  return t.minElo ?? 0
}

function normalizeTiersRecord(tiers: Record<string, unknown>): Record<string, TierUsage> {
  const rec: Record<string, TierUsage> = {}
  for (const [k, v] of Object.entries(tiers)) {
    const tier = normalizeTierUsage(v, k)
    if (tier) rec[k] = tier
  }
  return rec
}

function normalizeTiersFromArray(arr: unknown[]): Record<string, TierUsage> {
  const rec: Record<string, TierUsage> = {}
  for (const item of arr) {
    const tier = normalizeTierUsage(item, '')
    if (!tier) continue
    const maxLabel = tier.maxElo == null ? 'inf' : String(tier.maxElo)
    const key = `${tier.minElo}-${maxLabel}`
    rec[key] = tier
  }
  return rec
}

function normalizeFormatUsage(raw: unknown): FormatUsage {
  if (raw == null || typeof raw !== 'object') return { tiers: {} }
  const fo = raw as Record<string, unknown>
  const format = typeof fo.format === 'string' ? fo.format : typeof fo.id === 'string' ? fo.id : undefined
  const tiersRaw = fo.tiers ?? fo.Tiers
  const tiers: Record<string, TierUsage> = Array.isArray(tiersRaw)
    ? normalizeTiersFromArray(tiersRaw)
    : tiersRaw && typeof tiersRaw === 'object' && !Array.isArray(tiersRaw)
      ? normalizeTiersRecord(tiersRaw as Record<string, unknown>)
      : {}
  return { ...(format ? { format } : {}), tiers }
}

function normalizeFormatsFromObject(formats: Record<string, unknown>): Record<string, FormatUsage> {
  const rec: Record<string, FormatUsage> = {}
  for (const [k, v] of Object.entries(formats)) {
    rec[k] = normalizeFormatUsage(v)
  }
  return rec
}

function normalizeFormatsFromArray(arr: unknown[]): Record<string, FormatUsage> {
  const rec: Record<string, FormatUsage> = {}
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue
    const e = item as Record<string, unknown>
    const id =
      (typeof e.format === 'string' && e.format.trim()) ||
      (typeof e.id === 'string' && e.id.trim()) ||
      (typeof e.name === 'string' && e.name.trim()) ||
      `format_${Object.keys(rec).length}`
    rec[id] = normalizeFormatUsage(e)
  }
  return rec
}

/**
 * CobbleRanked `/usage-stats` payloads vary by version. Normalize to `UsageStatsResponse` with `formats` as
 * `Record<string, FormatUsage>` and each `tiers` as `Record<string, TierUsage>` so UIs render consistently.
 */
export function normalizeUsageStatsResponse(raw: unknown): UsageStatsResponse {
  if (raw == null || typeof raw !== 'object') {
    return {}
  }
  let o = raw as Record<string, unknown>
  if (o.data && typeof o.data === 'object' && !Array.isArray(o.data)) {
    o = o.data as Record<string, unknown>
  }

  const meta = pickMeta(o)
  const formatsRaw =
    o.formats ?? o.formatUsages ?? o.format_usages ?? o.usageByFormat ?? o.usage_formats ?? o.usageFormats

  let formats: Record<string, FormatUsage> = {}
  if (Array.isArray(formatsRaw)) {
    formats = normalizeFormatsFromArray(formatsRaw)
  } else if (formatsRaw && typeof formatsRaw === 'object' && !Array.isArray(formatsRaw)) {
    formats = normalizeFormatsFromObject(formatsRaw as Record<string, unknown>)
  }

  return {
    ...meta,
    formats,
  }
}

/** Sort tier entries low → high ELO for stable tables. */
export function sortTierEntries(entries: [string, TierUsage][]): [string, TierUsage][] {
  return [...entries].sort((a, b) => tierSortKey(a[1]) - tierSortKey(b[1]))
}
