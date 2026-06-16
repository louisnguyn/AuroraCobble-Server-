import { useEffect, useMemo, useState } from 'react'
import { fetchSpawnBoss, fetchSpawnPokemon } from '../api'
import type { SpawnBossResponse, SpawnPokemonResponse } from '../types'
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

function formatLabelFromSlug(slug: string): string {
  return slug
    .replace(/^minecraft:/i, '')
    .replace(/^cobblemon:/i, '')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

function parseBiomeList(value: string | null): string[] {
  const s = stripMinecraftFormatting(normalize(value))
  if (s === '—') return []
  return s
    .split(/[·|]/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => formatLabelFromSlug(b.replace(/_/g, ' ')))
}

type ParsedBossReward = {
  item: string
  qty: number
  chance: number
}

function parseBossRewards(value: string | null): ParsedBossReward[] {
  const s = stripMinecraftFormatting(normalize(value))
  if (s === '—') return []
  return s
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^(.+?)\s+x(\d+)\s*\(([\d.]+)\)\s*$/i)
      if (!m) return null
      const chance = Number.parseFloat(m[3]!)
      if (!Number.isFinite(chance)) return null
      return {
        item: formatLabelFromSlug(m[1]!.trim()),
        qty: Number.parseInt(m[2]!, 10),
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
  return `${pct.toFixed(2)}%`
}

function bossNameToSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/['.]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

function rarityColor(value: string | null): string {
  const v = stripMinecraftFormatting(normalize(value)).toLowerCase()
  if (v === '—') return 'text-muted'
  if (v.includes('common')) return 'text-muted'
  if (v.includes('uncommon')) return 'text-emerald-300'
  if (v.includes('rare')) return 'text-amber-400'
  if (v.includes('epic')) return 'text-purple-300'
  if (v.includes('legend')) return 'text-amber-300'
  if (v.includes('mythic')) return 'text-orange-400'
  // fallback
  return 'text-[#e2e8f0]'
}

function truncateWithTitle(text: string, maxLen: number): { shown: string; title: string } {
  const t = stripMinecraftFormatting(text)
  if (t.length <= maxLen) return { shown: t, title: t }
  return { shown: t.slice(0, maxLen).trimEnd() + '…', title: t }
}

function parseGenSort(generation: string): number {
  const m = generation.match(/\d+/)
  return m ? Number(m[0]) : Number.MAX_SAFE_INTEGER
}

export function Spawn() {
  const [section, setSection] = useState<SpawnSection>('pokemon')
  const [loading, setLoading] = useState(true)
  const [loadingFilters, setLoadingFilters] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<SpawnPokemonResponse | null>(null)
  const [allGenerations, setAllGenerations] = useState<string[]>([])
  const [allSources, setAllSources] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [generation, setGeneration] = useState('')
  const [source, setSource] = useState('')

  const [bossSearch, setBossSearch] = useState('')
  const [bossLoading, setBossLoading] = useState(false)
  const [bossError, setBossError] = useState<string | null>(null)
  const [bossData, setBossData] = useState<SpawnBossResponse | null>(null)

  useEffect(() => {
    if (section !== 'pokemon') return
    setLoadingFilters(true)
    fetchSpawnPokemon({ limit: 2000 })
      .then((res) => {
        setAllGenerations(res.filters.generations ?? [])
        setAllSources(res.filters.sources ?? [])
      })
      .catch(() => {
        setAllGenerations([])
        setAllSources([])
      })
      .finally(() => setLoadingFilters(false))
  }, [section])

  useEffect(() => {
    if (section !== 'pokemon') return
    setLoading(true)
    setError(null)
    fetchSpawnPokemon({ q: search.trim(), generation, source, limit: 2000 })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load spawn data'))
      .finally(() => setLoading(false))
  }, [section, search, generation, source])

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

  const sources = useMemo(() => {
    const list = allSources
    return [...list].sort((a, b) => a.localeCompare(b))
  }, [allSources])
  const generationOptions = useMemo(
    () => [{ label: 'All generations', value: '' }, ...generations.map((g) => ({ label: g, value: g }))],
    [generations]
  )
  const sourceOptions = useMemo(
    () => [{ label: 'All sources', value: '' }, ...sources.map((s) => ({ label: s, value: s }))],
    [sources]
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
                const slug = bossNameToSlug(bossName)

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
                        <p className="text-xs text-muted m-0 break-words">{stripMinecraftFormatting(normalize(row.reward))}</p>
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
        <div className="pixel-panel-soft p-4 sm:p-6">
          <div className="flex flex-wrap gap-3 mb-4">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Pokemon..."
              className="min-w-[220px] flex-1 px-3 py-2.5 pixel-field text-base placeholder:text-muted/70"
            />
            <CustomSelect
              value={generation}
              onChange={setGeneration}
              disabled={loadingFilters}
              options={generationOptions.map((o) => ({ value: o.value, label: o.label }))}
              className="min-w-[180px]"
              buttonClassName="min-w-[180px] pixel-field px-3 py-2.5 text-base text-[#ebe4d6] cursor-pointer"
            />
            <CustomSelect
              value={source}
              onChange={setSource}
              disabled={loadingFilters}
              options={sourceOptions.map((o) => ({ value: o.value, label: o.label }))}
              className="min-w-[180px]"
              buttonClassName="min-w-[180px] pixel-field px-3 py-2.5 text-base text-[#ebe4d6] cursor-pointer"
            />
          </div>

          {loading ? (
            <div className="py-10 text-center text-muted">Loading spawn data...</div>
          ) : error ? (
            <div className="p-3 text-error text-base bg-[#1a0f16] border-2 border-error/45 rounded-sm">{error}</div>
          ) : (data?.rows.length ?? 0) === 0 ? (
            <div className="py-10 text-center text-muted">No spawn data found.</div>
          ) : (
            <div className="overflow-x-auto pixel-well max-h-[60vh] overflow-y-auto">
              <table className="w-full text-base">
                <thead>
                  <tr className="bg-bg/40 border-b border-border sticky top-0 z-10">
                    <th className="text-left py-2 px-3 font-semibold">N.</th>
                    <th className="text-left py-2 px-3 font-semibold">Pokemon</th>
                    <th className="text-left py-2 px-3 font-semibold">Source</th>
                    <th className="text-left py-2 px-3 font-semibold">Spawn</th>
                    <th className="text-left py-2 px-3 font-semibold">Rarity</th>
                    <th className="text-left py-2 px-3 font-semibold">Condition</th>
                    <th className="text-left py-2 px-3 font-semibold">Forms</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border/50 align-top transition-colors hover:bg-accent/10"
                    >
                      <td className="py-2 px-3 text-muted tabular-nums">{row.dex_number ?? '—'}</td>
                      <td className="py-2 px-3 font-medium text-[#e2e8f0]">{stripMinecraftFormatting(row.pokemon)}</td>
                      <td className="py-2 px-3 text-muted whitespace-pre-wrap">{stripMinecraftFormatting(normalize(row.source))}</td>
                      <td className="py-2 px-3 text-muted whitespace-pre-wrap">
                        {(() => {
                          const { shown, title } = truncateWithTitle(normalize(row.spawn), 140)
                          return <span title={title}>{shown}</span>
                        })()}
                      </td>
                      <td className={`py-2 px-3 ${rarityColor(row.rarity)} whitespace-pre-wrap`}>
                        {stripMinecraftFormatting(normalize(row.rarity))}
                      </td>
                      <td className="py-2 px-3 text-muted whitespace-pre-wrap">
                        {(() => {
                          const { shown, title } = truncateWithTitle(normalize(row.condition), 120)
                          return <span title={title}>{shown}</span>
                        })()}
                      </td>
                      <td className="py-2 px-3 text-muted whitespace-pre-wrap">
                        {(() => {
                          const { shown, title } = truncateWithTitle(normalize(row.forms), 120)
                          return <span title={title}>{shown}</span>
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </PageShell>
  )
}
