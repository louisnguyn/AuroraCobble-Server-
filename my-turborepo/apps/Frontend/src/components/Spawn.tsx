import { useEffect, useMemo, useState } from 'react'
import { fetchSpawnBoss, fetchSpawnPokemon } from '../api'
import type { SpawnBossResponse, SpawnPokemonResponse } from '../types'
import { CustomSelect } from './CustomSelect'
import { PageHeader, PageShell, PageTabBar } from './PageLayout.tsx'

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
  const percent = value * 100
  const decimals = percent < 1 ? 3 : percent < 10 ? 2 : 1
  return `${percent.toFixed(decimals)}%`
}

function prettyBiomes(value: string | null): string {
  const s = normalize(value)
  return stripMinecraftFormatting(s).replace(/_/g, ' ').replace(/\|/g, ' · ')
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
        <div className="pixel-panel-soft p-4 sm:p-6">
          <div className="flex flex-wrap gap-3 mb-4">
            <input
              type="text"
              value={bossSearch}
              onChange={(e) => setBossSearch(e.target.value)}
              placeholder="Search Boss..."
              className="min-w-[220px] flex-1 px-3 py-2.5 pixel-field text-base placeholder:text-muted/70"
            />
          </div>

          {bossLoading ? (
            <div className="py-10 text-center text-muted">Loading boss spawn data...</div>
          ) : bossError ? (
            <div className="p-3 text-error text-base bg-[#1a0f16] border-2 border-error/45 rounded-sm">{bossError}</div>
          ) : (bossData?.rows.length ?? 0) === 0 ? (
            <div className="py-10 text-center text-muted">No boss spawn data found.</div>
          ) : (
            <div className="overflow-x-auto pixel-well max-h-[60vh] overflow-y-auto">
              <table className="w-full text-base">
                <thead className="sticky top-0 z-10 bg-bg/40">
                  <tr className="bg-bg/40 border-b border-border">
                    <th className="text-left py-2 px-3 font-semibold">N.</th>
                    <th className="text-left py-2 px-3 font-semibold">Boss</th>
                    <th className="text-left py-2 px-3 font-semibold">Spawn Biomes</th>
                    <th className="text-left py-2 px-3 font-semibold">Normal Rate</th>
                    <th className="text-left py-2 px-3 font-semibold">Shiny Rate</th>
                    <th className="text-left py-2 px-3 font-semibold">Reward</th>
                  </tr>
                </thead>
                <tbody>
                  {bossData?.rows.map((row, idx) => (
                    <tr
                      key={row.id}
                      className="border-b border-border/50 align-top transition-colors hover:bg-accent/10"
                    >
                      <td className="py-2 px-3 text-muted">{idx + 1}</td>
                      <td className="py-2 px-3 font-medium text-[#e2e8f0]">
                        {stripMinecraftFormatting(normalize(row.boss_name))}
                      </td>
                      <td className="py-2 px-3 text-muted whitespace-pre-wrap">{prettyBiomes(row.spawn_biomes)}</td>
                      <td className="py-2 px-3 text-emerald-300 tabular-nums">
                        {formatRate(row.normal_rate)}
                      </td>
                      <td className="py-2 px-3 text-orange-400 tabular-nums">
                        {formatRate(row.shiny_rate)}
                      </td>
                      {(() => {
                        const title = stripMinecraftFormatting(normalize(row.reward))
                        const shown = title
                        return (
                          <td className="py-2 px-3 text-muted whitespace-pre-wrap break-words" title={title}>
                            {shown}
                          </td>
                        )
                      })()}
                    </tr>
                  ))}
                </tbody>
              </table>
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
