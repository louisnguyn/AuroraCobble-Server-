import { useEffect, useState } from 'react'
import {
  fetchPokemonList,
  fetchPokemonDetail,
  pokemonSpriteUrl,
  fetchMoveSummary,
  type PokemonListEntry,
  type PokemonDetail,
  type MoveSummary,
} from '../pokemonApi'

const TYPE_COLORS: Record<string, string> = {
  normal: 'bg-[#a8a878]',
  fire: 'bg-[#f08030]',
  water: 'bg-[#6890f0]',
  electric: 'bg-[#f8d030]',
  grass: 'bg-[#78c850]',
  ice: 'bg-[#98d8d8]',
  fighting: 'bg-[#c03028]',
  poison: 'bg-[#a040a0]',
  ground: 'bg-[#e0c068]',
  flying: 'bg-[#a890f0]',
  psychic: 'bg-[#f85888]',
  bug: 'bg-[#a8b820]',
  rock: 'bg-[#b8a038]',
  ghost: 'bg-[#705898]',
  dragon: 'bg-[#7038f8]',
  dark: 'bg-[#705848]',
  steel: 'bg-[#b8b8d0]',
  fairy: 'bg-[#ee99ac]',
}

const STAT_LABELS: Record<keyof PokemonDetail['baseStats'], string> = {
  hp: 'HP',
  attack: 'Atk',
  defense: 'Def',
  specialAttack: 'SpA',
  specialDefense: 'SpD',
  speed: 'Spe',
}

const STAT_COLORS: Record<keyof PokemonDetail['baseStats'], string> = {
  hp: 'bg-[#ff5959]',
  attack: 'bg-[#f5ac78]',
  defense: 'bg-[#fae078]',
  specialAttack: 'bg-[#9db7f5]',
  specialDefense: 'bg-[#a7db8d]',
  speed: 'bg-[#fa92b2]',
}

function formatName(name: string): string {
  return name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function Wiki() {
  const [list, setList] = useState<PokemonListEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<PokemonDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [moveSummaries, setMoveSummaries] = useState<Record<string, MoveSummary | null>>({})

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchPokemonList(1025)
      .then((data) => {
        if (!cancelled) setList(data)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (selectedId == null) {
      setDetail(null)
      setMoveSummaries({})
      return
    }
    let cancelled = false
    setDetailLoading(true)
    setDetail(null)
    fetchPokemonDetail(selectedId)
      .then((d) => {
        if (!cancelled) setDetail(d ?? null)
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedId])

  const movesToShow =
    detail && detail.moves.length > 0 ? detail.moves.slice(0, 40) : detail?.moves ?? []

  useEffect(() => {
    if (!detail || movesToShow.length === 0) return
    let cancelled = false
    movesToShow.forEach((name) => {
      if (moveSummaries[name]) return
      fetchMoveSummary(name).then((summary) => {
        if (!cancelled) {
          setMoveSummaries((prev) => ({ ...prev, [name]: summary }))
        }
      })
    })
    return () => {
      cancelled = true
    }
  }, [detail?.id])

  const filtered =
    search.trim() === ''
      ? list
      : list.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))

  if (selectedId != null) {
    return (
      <div className="w-full max-w-[60rem] mx-auto space-y-4">
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className="flex items-center gap-2 text-muted hover:text-accent transition-colors"
        >
          ← Back to Pokédex
        </button>
        {detailLoading && !detail && (
          <div className="pixel-panel p-8 text-center text-muted">
            Loading…
          </div>
        )}
        {!detailLoading && detail && (
          <div className="pixel-panel overflow-hidden">
            <div className="p-4 sm:p-6 space-y-6">
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-start">
                <div className="flex-shrink-0 mx-auto sm:mx-0">
                  <img
                    src={detail.image || pokemonSpriteUrl(detail.id)}
                    alt={detail.name}
                    className="w-48 h-48 object-contain"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl font-semibold m-0">{formatName(detail.name)}</h1>
                  <p className="text-muted text-sm mt-1">#{String(detail.id).padStart(4, '0')}</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {detail.types.map((t) => (
                      <span
                        key={t}
                        className={`inline-block py-0.5 px-2 rounded text-sm font-medium text-white ${TYPE_COLORS[t] ?? 'bg-muted'}`}
                      >
                        {formatName(t)}
                      </span>
                    ))}
                  </div>
                  <p className="text-sm text-muted mt-3">
                    Height {detail.height / 10}m · Weight {detail.weight / 10}kg
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-muted uppercase tracking-wide mb-2">
                  Base stats
                </h3>
                <div className="space-y-2">
                  {(() => {
                    const values = Object.values(detail.baseStats)
                    const maxBaseStat = Math.max(...values, 1)
                    return (Object.keys(
                      STAT_LABELS,
                    ) as (keyof PokemonDetail['baseStats'])[]).map((key) => {
                      const value = detail.baseStats[key]
                      const width = `${(value / maxBaseStat) * 100}%`
                      return (
                        <div
                          key={key}
                          className="flex items-center gap-3 text-sm"
                        >
                          <span className="w-10 text-muted">{STAT_LABELS[key]}</span>
                          <div className="flex-1 h-5 rounded bg-bg/40 overflow-hidden">
                            <div
                              className={`${STAT_COLORS[key]} h-5`}
                              style={{ width }}
                            />
                          </div>
                          <span className="w-10 text-right font-medium">{value}</span>
                        </div>
                      )
                    })
                  })()}
                </div>
              </div>

              {detail.evolution.length > 0 && (
                <div className="w-full space-y-4">
                  <h3 className="text-sm font-semibold text-muted uppercase tracking-wide mb-2">
                    Evolution
                  </h3>
                  <div className="flex justify-center">
                    <div className="flex flex-wrap items-center justify-center gap-4 w-full">
                      {detail.evolution.map((stage, stageIdx) => {
                        const defaultForm = stage.forms[0]
                        return (
                          <div key={stageIdx} className="flex items-center gap-4">
                            <button
                              type="button"
                              onClick={() => setSelectedId(defaultForm.id)}
                              className={`flex flex-col items-center gap-1 rounded-lg p-2 transition-colors hover:bg-surface-hover ${
                                defaultForm.id === detail.id ? 'ring-2 ring-accent' : ''
                              }`}
                            >
                              <img
                                src={pokemonSpriteUrl(defaultForm.id)}
                                alt={defaultForm.name}
                                className="w-20 h-20 object-contain"
                              />
                              <span className="text-xs sm:text-sm font-medium max-w-[5rem] truncate text-center">
                                {formatName(defaultForm.name)}
                              </span>
                            </button>
                            {stageIdx < detail.evolution.length - 1 && (
                              <span className="text-muted text-lg sm:text-xl flex-shrink-0">→</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {detail.evolution.some((s) => s.forms.length > 1) && (
                    <>
                      <h3 className="text-sm font-semibold text-muted uppercase tracking-wide mb-2">
                        Forms
                      </h3>
                      <div className="flex flex-wrap justify-center gap-6 w-full">
                        {detail.evolution
                          .filter((stage) => stage.forms.length > 1)
                          .map((stage, stageIdx) => (
                            <div key={stageIdx} className="flex flex-col items-center gap-2">
                              <span className="text-xs text-muted">
                                {formatName(stage.forms[0].name.split('-')[0])}
                              </span>
                              <div className="flex flex-wrap items-center justify-center gap-2">
                                {stage.forms.map((form) => (
                                  <button
                                    key={form.id}
                                    type="button"
                                    onClick={() => setSelectedId(form.id)}
                                    className={`flex flex-col items-center gap-0.5 rounded-lg p-1.5 transition-colors hover:bg-surface-hover ${
                                      form.id === detail.id ? 'ring-2 ring-accent' : ''
                                    }`}
                                  >
                                    <img
                                      src={pokemonSpriteUrl(form.id)}
                                      alt={form.name}
                                      className="w-20 h-20 object-contain"
                                    />
                                    <span className="text-xs sm:text-sm font-medium max-w-[5rem] truncate text-center">
                                      {formatName(form.name)}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {detail.abilities.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-muted uppercase tracking-wide mb-2">
                    Abilities
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {detail.abilities.map((a) => (
                      <span
                        key={a}
                        className="inline-block py-0.5 px-2 rounded text-sm bg-surface-hover text-muted"
                      >
                        {formatName(a)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {movesToShow.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-muted uppercase tracking-wide mb-2">
                    Moves it can learn
                  </h3>
                  <div className="rounded bg-bg/40 border border-border/40">
                    <div className="flex items-center px-3 py-2 text-[10px] sm:text-xs text-muted bg-bg/80 border-b border-border/40 uppercase tracking-wide">
                      <span className="flex-1">Move</span>
                      <span className="w-20 text-center">Type</span>
                      <span className="w-10 text-center">Cat</span>
                      <span className="w-10 text-center">Pow</span>
                      <span className="w-10 text-center">Acc</span>
                    </div>
                    <div className="divide-y divide-border/40">
                      {movesToShow.map((m) => {
                        const summary = moveSummaries[m]
                        const typeName = summary?.type ?? null
                        const damageClass =
                          summary?.damageClass === 'physical'
                            ? 'Phys'
                            : summary?.damageClass === 'special'
                            ? 'Spec'
                            : summary?.damageClass === 'status'
                            ? 'Stat'
                            : '—'
                        return (
                          <div
                            key={m}
                            className="flex items-center px-3 py-1.5 text-xs sm:text-sm"
                          >
                            <span className="flex-1 font-medium truncate">
                              {formatName(m)}
                            </span>
                            <span className="w-20 flex justify-center">
                              {typeName ? (
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-[10px] sm:text-xs font-medium text-white ${
                                    TYPE_COLORS[typeName] ?? 'bg-surface-hover'
                                  }`}
                                >
                                  {formatName(typeName)}
                                </span>
                              ) : (
                                <span className="text-muted">—</span>
                              )}
                            </span>
                            <span className="w-10 text-center text-muted text-[10px] sm:text-xs">
                              {damageClass}
                            </span>
                            <span className="w-10 text-center text-[10px] sm:text-xs">
                              {summary?.power ?? '—'}
                            </span>
                            <span className="w-10 text-center text-[10px] sm:text-xs">
                              {summary?.accuracy ?? '—'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="w-full max-w-[60rem] mx-auto space-y-4">
      <header>
        <h1 className="text-2xl sm:text-3xl font-semibold m-0">Pokémon Database</h1>
        <p className="text-sm text-muted m-0 mt-1">
          Browse and search Pokémon. Data from PokéAPI.
        </p>
      </header>

      <input
        type="search"
        placeholder="Search by name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-sm pixel-field px-3 py-2.5 text-base placeholder:text-muted"
        aria-label="Search Pokémon"
      />

      {loading && (
        <div className="pixel-panel p-8 text-center text-muted">
          Loading Pokédex…
        </div>
      )}

      {!loading && (
        <p className="text-sm text-muted">
          {filtered.length} Pokémon{search.trim() ? ' matching search' : ''}
        </p>
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedId(p.id)}
              className="pixel-panel p-3 flex flex-col items-center gap-1 hover:bg-surface-hover hover:border-accent/50 transition-colors text-left"
            >
              <img
                src={pokemonSpriteUrl(p.id)}
                alt={p.name}
                className="w-16 h-16 sm:w-20 sm:h-20 object-contain"
              />
              <span className="text-xs font-medium text-muted">#{p.id}</span>
              <span className="text-sm font-medium truncate w-full text-center">
                {formatName(p.name)}
              </span>
            </button>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="pixel-panel p-6 text-center text-muted">
          No Pokémon found. Try a different search.
        </div>
      )}
    </div>
  )
}
