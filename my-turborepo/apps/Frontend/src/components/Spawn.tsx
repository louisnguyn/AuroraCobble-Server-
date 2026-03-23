import { useEffect, useMemo, useState } from 'react'
import { Dropdown, type DropdownChangeEvent } from 'primereact/dropdown'
import { fetchSpawnPokemon } from '../api'
import type { SpawnPokemonResponse } from '../types'

type SpawnSection = 'pokemon' | 'boss'

function normalize(value: string | null): string {
  return value?.trim() || '—'
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
    <div className="w-full max-w-6xl mx-auto space-y-6">
      <div className="rounded-2xl bg-surface/80 border border-border p-4 sm:p-6">
        <h1 className="text-2xl font-semibold m-0 mb-3 text-[#e2e8f0]">Spawn</h1>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSection('pokemon')}
            className={`py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              section === 'pokemon'
                ? 'bg-accent/20 text-accent border border-accent/40'
                : 'bg-[#0f0a1a]/50 text-muted border border-border hover:text-[#e2e8f0] hover:bg-surface-hover'
            }`}
          >
            Pokemon
          </button>
          <button
            type="button"
            onClick={() => setSection('boss')}
            className={`py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              section === 'boss'
                ? 'bg-accent/20 text-accent border border-accent/40'
                : 'bg-[#0f0a1a]/50 text-muted border border-border hover:text-[#e2e8f0] hover:bg-surface-hover'
            }`}
          >
            Boss
          </button>
        </div>
      </div>

      {section === 'boss' && (
        <div className="rounded-2xl bg-surface/80 border border-border p-8 text-center text-muted">
          Boss spawn section coming next. Send the boss data format and I will wire it in.
        </div>
      )}

      {section === 'pokemon' && (
        <div className="rounded-2xl bg-surface/80 border border-border p-4 sm:p-6">
          <div className="flex flex-wrap gap-3 mb-4">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Pokemon..."
              className="min-w-[220px] flex-1 px-3 py-2 rounded-xl bg-[#0f0a1a] border border-border text-sm text-[#e2e8f0] placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
            />
            <Dropdown
              value={generation}
              onChange={(e: DropdownChangeEvent) => setGeneration(String(e.value ?? ''))}
              options={generationOptions}
              optionLabel="label"
              optionValue="value"
              className="spawn-dropdown min-w-[180px]"
              panelClassName="spawn-dropdown-panel"
              placeholder="All generations"
              showClear={generation !== ''}
              loading={loadingFilters}
            />
            <Dropdown
              value={source}
              onChange={(e: DropdownChangeEvent) => setSource(String(e.value ?? ''))}
              options={sourceOptions}
              optionLabel="label"
              optionValue="value"
              className="spawn-dropdown min-w-[180px]"
              panelClassName="spawn-dropdown-panel"
              placeholder="All sources"
              showClear={source !== ''}
              loading={loadingFilters}
            />
          </div>

          {loading ? (
            <div className="py-10 text-center text-muted">Loading spawn data...</div>
          ) : error ? (
            <div className="p-3 rounded-lg bg-error/15 border border-error/30 text-error text-sm">{error}</div>
          ) : (data?.rows.length ?? 0) === 0 ? (
            <div className="py-10 text-center text-muted">No spawn data found.</div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-bg/40 border-b border-border">
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
                      <td className="py-2 px-3 text-muted">{row.dex_number ?? '—'}</td>
                      <td className="py-2 px-3 font-medium text-[#e2e8f0]">{row.pokemon}</td>
                      <td className="py-2 px-3 text-muted">{normalize(row.source)}</td>
                      <td className="py-2 px-3 text-muted whitespace-pre-wrap">{normalize(row.spawn)}</td>
                      <td className="py-2 px-3 text-muted">{normalize(row.rarity)}</td>
                      <td className="py-2 px-3 text-muted whitespace-pre-wrap">{normalize(row.condition)}</td>
                      <td className="py-2 px-3 text-muted whitespace-pre-wrap">{normalize(row.forms)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
