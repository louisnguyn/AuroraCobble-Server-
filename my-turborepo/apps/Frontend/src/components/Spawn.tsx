import { useEffect, useMemo, useState } from 'react'
import { fetchSpawnBoss, fetchSpawnPokemon } from '../api'
import type { SpawnBossResponse, SpawnPokemonResponse, SpawnPokemonRow } from '../types'
import { CustomSelect } from './CustomSelect'
import { PageHeader, PageShell, PageTabBar } from './PageLayout.tsx'
import { PokemonSprite } from './PokemonSprite.tsx'

type SpawnSection = 'pokemon' | 'boss'

function normalize(value: string | null): string {
  return value?.trim() || '—'
}

function stripMinecraftFormatting(value: string): string {
  // Removes color/formatting codes like §f, §a, §l...
  return value.replace(/§[0-9a-fk-or]/gi, '')
}

function formatRate(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  if (value <= 0) return '0%'
  const percent = value * 100
  if (percent >= 10) return `${percent.toFixed(1)}%`
  if (percent >= 1) return `${percent.toFixed(2)}%`
  // Sub-1% spawn rates (e.g. shiny 0.0001%) need more precision than 3 decimals
  const trimmed = percent.toFixed(8).replace(/\.?0+$/, '')
  return `${trimmed}%`
}

/**
 * `#cobblemon:is_hills` → Hills
 * `cobblemon:is_jungle` → Jungle
 * `minecraft:bamboo_jungle` → Bamboo Jungle
 * `betterend:flower_islets` → Flower Islets
 */
function formatLabelFromSlug(slug: string): string {
  let s = slug.trim()
  if (!s) return s
  s = s.replace(/^#/, '')
  s = s.replace(/^(minecraft|cobblemon|betterend|deeperdarker|byg|biomesoplenty|terralith):/i, '')
  // Tag tags: is_hills / is hills / is-jungle → drop the leading "is"
  s = s.replace(/^is[_\s-]+/i, '')
  return s
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

function parseBiomeList(value: string | null): string[] {
  const s = stripMinecraftFormatting(normalize(value))
  if (s === '—') return []
  return s
    .split(/[,·|;]+/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => formatLabelFromSlug(b))
}

/** `flower=eternal` → Eternal · plain `alolan` → Alolan */
function formatFormLabel(raw: string): string {
  const s = stripMinecraftFormatting(raw.trim())
  if (!s) return s
  const eq = s.lastIndexOf('=')
  const value = eq >= 0 ? s.slice(eq + 1).trim() : s
  return formatLabelFromSlug(value)
}

function parseFormLabels(raw: string | null): string[] {
  const s = normalize(raw)
  if (s === '—') return []
  try {
    const parsed = JSON.parse(s) as unknown
    if (Array.isArray(parsed)) {
      return parsed
        .filter((x): x is string => typeof x === 'string')
        .map(formatFormLabel)
        .filter(Boolean)
    }
    if (typeof parsed === 'string') return [formatFormLabel(parsed)].filter(Boolean)
  } catch {
    /* plain string */
  }
  return s
    .split(/[,;|/]+/)
    .map((part) => formatFormLabel(part))
    .filter(Boolean)
}

type ParsedCondition = {
  biomes: string[]
  flags: string[]
}

function parseSpawnCondition(raw: string | null): ParsedCondition {
  const empty: ParsedCondition = { biomes: [], flags: [] }
  const s = normalize(raw)
  if (s === '—') return empty
  try {
    const parsed = JSON.parse(s) as unknown
    const root =
      parsed && typeof parsed === 'object' && 'condition' in (parsed as object)
        ? (parsed as { condition: unknown }).condition
        : parsed
    if (!root || typeof root !== 'object') return empty
    const c = root as Record<string, unknown>
    const biomes = Array.isArray(c.biomes)
      ? c.biomes.filter((b): b is string => typeof b === 'string').map(formatLabelFromSlug)
      : []
    const flags: string[] = []
    if (typeof c.isRaining === 'boolean') flags.push(c.isRaining ? 'Raining' : 'Not raining')
    if (typeof c.canSeeSky === 'boolean') flags.push(c.canSeeSky ? 'Can see sky' : 'No sky')
    if (typeof c.minSkyLight === 'number' || typeof c.maxSkyLight === 'number') {
      const min = typeof c.minSkyLight === 'number' ? c.minSkyLight : '?'
      const max = typeof c.maxSkyLight === 'number' ? c.maxSkyLight : '?'
      flags.push(`Sky light ${min}–${max}`)
    }
    return { biomes, flags }
  } catch {
    return empty
  }
}

type ParsedBossReward = {
  item: string
  qty: number
  /** 0–1 fraction (1 = guaranteed). */
  chance: number
}

/**
 * Supports:
 * - `5 x Poke Ball 100% | 1 x Bottle Cap 1%`
 * - legacy `Poke Ball x5 (1)` / `Bottle Cap x1 (0.01)` separated by `;`
 */
function parseBossRewards(value: string | null): ParsedBossReward[] {
  const s = stripMinecraftFormatting(normalize(value))
  if (s === '—') return []
  return s
    .split(/[|;]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      // `5 x Poke Ball 100%` or `1 x Shiny Arceus 0.001%`
      const pct = part.match(/^(\d+)\s*[x×]\s*(.+?)\s+([\d.]+)\s*%\s*$/i)
      if (pct) {
        const chancePct = Number.parseFloat(pct[3]!)
        if (!Number.isFinite(chancePct)) return null
        return {
          qty: Number.parseInt(pct[1]!, 10),
          item: pct[2]!.trim(),
          chance: chancePct / 100,
        }
      }
      // legacy `Poke Ball x5 (1)` / `Item x3 (0.5)`
      const legacy = part.match(/^(.+?)\s+[x×](\d+)\s*\(([\d.]+)\)\s*$/i)
      if (!legacy) return null
      const chance = Number.parseFloat(legacy[3]!)
      if (!Number.isFinite(chance)) return null
      return {
        item: formatLabelFromSlug(legacy[1]!.trim()),
        qty: Number.parseInt(legacy[2]!, 10),
        chance,
      }
    })
    .filter((r): r is ParsedBossReward => r != null)
}

function formatRewardChance(chance: number): string {
  if (chance >= 1) return 'Guaranteed'
  const pct = chance * 100
  if (pct >= 10) return `${pct.toFixed(0)}%`
  if (pct >= 1) return `${pct.toFixed(1)}%`
  const trimmed = pct.toFixed(4).replace(/\.?0+$/, '')
  return `${trimmed}%`
}

function nameToSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/['.]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

function rarityPillClass(value: string | null): string {
  const v = stripMinecraftFormatting(normalize(value)).toLowerCase()
  if (v.includes('ultra')) return 'border-rose-500/35 bg-rose-950/30 text-rose-200'
  if (v.includes('mythic')) return 'border-orange-500/35 bg-orange-950/30 text-orange-200'
  if (v.includes('legend')) return 'border-amber-400/40 bg-amber-950/30 text-amber-200'
  if (v.includes('epic')) return 'border-purple-500/35 bg-purple-950/30 text-purple-200'
  if (v.includes('rare')) return 'border-amber-500/30 bg-amber-950/25 text-amber-300'
  if (v.includes('uncommon')) return 'border-emerald-500/30 bg-emerald-950/25 text-emerald-300'
  if (v.includes('common')) return 'border-white/15 bg-black/30 text-slate-300'
  return 'border-white/15 bg-black/30 text-slate-200'
}

function formatSpawnType(value: string | null): string {
  const s = stripMinecraftFormatting(normalize(value))
  if (s === '—') return s
  return formatLabelFromSlug(s)
}

function parseGenSort(generation: string): number {
  const m = generation.match(/\d+/)
  return m ? Number(m[0]) : Number.MAX_SAFE_INTEGER
}

function PokemonSpawnCard({ row }: { row: SpawnPokemonRow }) {
  const name = stripMinecraftFormatting(row.pokemon)
  const slug = nameToSlug(name)
  const rarity = stripMinecraftFormatting(normalize(row.rarity))
  const spawnType = formatSpawnType(row.spawn)
  const { biomes, flags } = parseSpawnCondition(row.condition)
  const forms = parseFormLabels(row.forms)
  const dex =
    row.dex_number != null
      ? `#${String(row.dex_number).padStart(3, '0')}`
      : row.generation
        ? stripMinecraftFormatting(row.generation)
        : 'Pokémon'

  return (
    <article className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/15 via-[#0f0a1a]/80 to-[#0f0a1a]/95 p-4 space-y-3 hover:border-emerald-400/35 transition-colors">
      <header className="flex items-center gap-3">
        <PokemonSprite
          speciesSlug={slug}
          speciesDisplay={name}
          className="w-14 h-14 sm:w-16 sm:h-16"
          centered={false}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wide text-emerald-300/80 m-0 font-semibold">
            {dex}
            {row.generation ? (
              <span className="text-muted font-medium normal-case tracking-normal">
                {' '}
                · {stripMinecraftFormatting(row.generation)}
              </span>
            ) : null}
          </p>
          <h3 className="text-base font-semibold text-[#f5efe6] m-0 truncate">{name}</h3>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {rarity !== '—' ? (
          <span
            className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-semibold capitalize ${rarityPillClass(row.rarity)}`}
          >
            {rarity}
          </span>
        ) : null}
        {spawnType !== '—' ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/25 bg-sky-950/25 px-2.5 py-1 text-xs">
            <span className="text-muted">Spawn</span>
            <span className="font-semibold text-sky-200">{spawnType}</span>
          </span>
        ) : null}
      </div>

      {biomes.length > 0 ? (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted m-0 mb-1.5">Spawn biomes</p>
          <div className="flex flex-wrap gap-1.5">
            {biomes.map((biome) => (
              <span
                key={biome}
                className="inline-block rounded-md border border-violet-500/25 bg-violet-950/25 px-2 py-0.5 text-[11px] text-violet-100/90"
              >
                {biome}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {flags.length > 0 ? (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted m-0 mb-1.5">Conditions</p>
          <div className="flex flex-wrap gap-1.5">
            {flags.map((flag) => (
              <span
                key={flag}
                className="inline-block rounded-md border border-cyan-500/25 bg-cyan-950/20 px-2 py-0.5 text-[11px] text-cyan-100/90"
              >
                {flag}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {forms.length > 0 ? (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted m-0 mb-1.5">Forms</p>
          <div className="flex flex-wrap gap-1.5">
            {forms.map((form) => (
              <span
                key={form}
                className="inline-block rounded-md border border-amber-500/25 bg-amber-950/20 px-2 py-0.5 text-[11px] text-amber-100/90 capitalize"
              >
                {form}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  )
}

export function Spawn() {
  const [section, setSection] = useState<SpawnSection>('pokemon')
  const [loading, setLoading] = useState(true)
  const [loadingFilters, setLoadingFilters] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<SpawnPokemonResponse | null>(null)
  const [allGenerations, setAllGenerations] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [generation, setGeneration] = useState('')

  const [bossSearch, setBossSearch] = useState('')
  const [bossLoading, setBossLoading] = useState(false)
  const [bossError, setBossError] = useState<string | null>(null)
  const [bossData, setBossData] = useState<SpawnBossResponse | null>(null)

  useEffect(() => {
    if (section !== 'pokemon') return
    setLoadingFilters(true)
    fetchSpawnPokemon({ limit: 5000 })
      .then((res) => {
        setAllGenerations(res.filters.generations ?? [])
      })
      .catch(() => {
        setAllGenerations([])
      })
      .finally(() => setLoadingFilters(false))
  }, [section])

  useEffect(() => {
    if (section !== 'pokemon') return
    setLoading(true)
    setError(null)
    fetchSpawnPokemon({ q: search.trim(), generation, limit: 5000 })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load spawn data'))
      .finally(() => setLoading(false))
  }, [section, search, generation])

  useEffect(() => {
    if (section !== 'boss') return
    setBossLoading(true)
    setBossError(null)
    fetchSpawnBoss({ q: bossSearch.trim(), limit: 2000 })
      .then((res) => setBossData(res))
      .catch((e) => setBossError(e instanceof Error ? e.message : 'Failed to load boss spawn data'))
      .finally(() => setBossLoading(false))
  }, [section, bossSearch])

  const generations = useMemo(() => {
    const list = allGenerations
    return [...list].sort((a, b) => parseGenSort(a) - parseGenSort(b) || a.localeCompare(b))
  }, [allGenerations])

  const generationOptions = useMemo(
    () => [{ label: 'All generations', value: '' }, ...generations.map((g) => ({ label: g, value: g }))],
    [generations]
  )

  return (
    <PageShell max="6xl">
      <PageHeader
        accent="emerald"
        eyebrow="World data"
        title="Spawn"
        description="Pokémon and boss spawn locations from the server."
      />

      <PageTabBar
        ariaLabel="Spawn section"
        tabs={[
          { id: 'pokemon' as const, label: 'Pokémon' },
          { id: 'boss' as const, label: 'Boss' },
        ]}
        active={section}
        onChange={setSection}
      />

      {section === 'boss' && (
        <div className="pixel-panel-soft p-4 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={bossSearch}
              onChange={(e) => setBossSearch(e.target.value)}
              placeholder="Search boss…"
              className="min-w-[220px] flex-1 px-3 py-2.5 pixel-field text-base placeholder:text-muted/70"
              aria-label="Search boss"
            />
            {!bossLoading && !bossError && bossData ? (
              <p className="text-sm text-muted m-0 tabular-nums">
                {bossData.rows.length} boss{bossData.rows.length === 1 ? '' : 'es'}
              </p>
            ) : null}
          </div>

          {bossLoading ? (
            <div className="py-10 text-center text-muted">Loading boss spawn data…</div>
          ) : bossError ? (
            <div className="p-3 text-error text-base bg-[#1a0f16] border-2 border-error/45 rounded-sm">{bossError}</div>
          ) : (bossData?.rows.length ?? 0) === 0 ? (
            <div className="py-10 text-center text-muted">No boss spawn data found.</div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 max-h-[70vh] overflow-y-auto pr-1">
              {bossData?.rows.map((row, idx) => {
                const bossName = stripMinecraftFormatting(normalize(row.boss_name))
                const biomes = parseBiomeList(row.spawn_biomes)
                const rewards = parseBossRewards(row.reward)
                const slug = nameToSlug(bossName)

                return (
                  <article
                    key={row.id}
                    className="rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-950/20 via-[#0f0a1a]/80 to-[#0f0a1a]/95 p-4 space-y-3 hover:border-amber-400/35 transition-colors"
                  >
                    <header className="flex items-center gap-3">
                      <PokemonSprite
                        speciesSlug={slug}
                        speciesDisplay={bossName}
                        className="w-14 h-14 sm:w-16 sm:h-16"
                        centered={false}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] uppercase tracking-wide text-amber-300/80 m-0 font-semibold">
                          Boss #{idx + 1}
                        </p>
                        <h3 className="text-base font-semibold text-[#f5efe6] m-0 truncate">{bossName}</h3>
                      </div>
                    </header>

                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-950/30 px-2.5 py-1 text-xs">
                        <span className="text-muted">Normal</span>
                        <span className="font-semibold text-emerald-300 tabular-nums">
                          {formatRate(row.normal_rate)}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-orange-500/30 bg-orange-950/25 px-2.5 py-1 text-xs">
                        <span className="text-muted">Shiny</span>
                        <span className="font-semibold text-orange-300 tabular-nums">
                          {formatRate(row.shiny_rate)}
                        </span>
                      </span>
                    </div>

                    {biomes.length > 0 ? (
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted m-0 mb-1.5">Spawn biomes</p>
                        <div className="flex flex-wrap gap-1.5">
                          {biomes.map((biome) => (
                            <span
                              key={biome}
                              className="inline-block rounded-md border border-violet-500/25 bg-violet-950/25 px-2 py-0.5 text-[11px] text-violet-100/90"
                            >
                              {biome}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {rewards.length > 0 ? (
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted m-0 mb-1.5">Rewards</p>
                        <ul className="list-none m-0 p-0 space-y-1.5">
                          {rewards.map((r, i) => (
                            <li
                              key={`${r.item}-${r.qty}-${i}`}
                              className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-[#0a0812]/60 px-2.5 py-1.5 text-xs"
                            >
                              <span className="text-[#e2e8f0] font-medium truncate">
                                {r.item}
                                <span className="text-muted font-normal"> ×{r.qty}</span>
                              </span>
                              <span
                                className={`shrink-0 tabular-nums font-semibold ${
                                  r.chance >= 1 ? 'text-emerald-300' : 'text-amber-300/90'
                                }`}
                              >
                                {formatRewardChance(r.chance)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : row.reward ? (
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted m-0 mb-1">Rewards</p>
                        <p className="text-xs text-muted m-0 break-words">
                          {stripMinecraftFormatting(normalize(row.reward))}
                        </p>
                      </div>
                    ) : null}
                  </article>
                )
              })}
            </div>
          )}
        </div>
      )}

      {section === 'pokemon' && (
        <div className="pixel-panel-soft p-4 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Pokémon…"
              className="min-w-[220px] flex-1 px-3 py-2.5 pixel-field text-base placeholder:text-muted/70"
              aria-label="Search Pokémon"
            />
            <CustomSelect
              value={generation}
              onChange={setGeneration}
              disabled={loadingFilters}
              options={generationOptions.map((o) => ({ value: o.value, label: o.label }))}
              className="min-w-[180px]"
              buttonClassName="min-w-[180px] pixel-field px-3 py-2.5 text-base text-[#ebe4d6] cursor-pointer"
            />
            {!loading && !error && data ? (
              <p className="text-sm text-muted m-0 tabular-nums">
                {data.rows.length} spawn{data.rows.length === 1 ? '' : 's'}
              </p>
            ) : null}
          </div>

          {loading ? (
            <div className="py-10 text-center text-muted">Loading spawn data…</div>
          ) : error ? (
            <div className="p-3 text-error text-base bg-[#1a0f16] border-2 border-error/45 rounded-sm">{error}</div>
          ) : (data?.rows.length ?? 0) === 0 ? (
            <div className="py-10 text-center text-muted">No spawn data found.</div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 max-h-[70vh] overflow-y-auto pr-1">
              {data?.rows.map((row) => (
                <PokemonSpawnCard key={row.id} row={row} />
              ))}
            </div>
          )}
        </div>
      )}
    </PageShell>
  )
}
