import { useEffect, useState } from 'react'
import { fetchUsageStats } from '../api'
import {
  fetchPokemonInfo,
  fetchMoveType,
  fetchItemImage,
  toPokeApiName,
} from '../pokemonApi'
import { usePokemonSpriteSrc } from '../usePokemonSpriteSrc'
import type { UsageStatsResponse, FormatUsage, SpeciesUsage } from '../types'
import { sortTierEntries } from '../usageStatsNormalize'
import { PageEmptyState, PageHeader, PageSection, PageShell, PageTabBar } from './PageLayout.tsx'

const FORMAT_ORDER = ['singles', 'doubles', 'triples'] as const

/** Showdown pixel (Gen 5–9) → HOME → PokéAPI game sprites. */
function SpeciesSpriteImg({
  name,
  className,
  alt = '',
}: {
  name: string
  className?: string
  alt?: string
}) {
  const slug = name.trim() ? toPokeApiName(name) : ''
  const { src, onError } = usePokemonSpriteSrc(slug)

  if (!slug) {
    return (
      <span
        className={`inline-block w-full h-full min-h-[1.5rem] rounded bg-surface-hover shrink-0 ${className ?? ''}`}
        aria-hidden
      />
    )
  }
  return (
    <img
      src={src ?? undefined}
      alt={alt}
      className={className}
      loading="lazy"
      onError={onError}
    />
  )
}
type FormatId = (typeof FORMAT_ORDER)[number]

function getFormatDisplayName(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1).toLowerCase()
}

function getFormatById(formats: Record<string, FormatUsage>, id: string): FormatUsage | undefined {
  const key = Object.keys(formats).find((k) => k.toLowerCase() === id)
  return key ? formats[key] : undefined
}

function formatKey(key: string): string {
  return key
    .replace(/^cobblemon\.(ability|nature)\./, '')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase())
}

function TopItems({
  items,
  formatLabel = false,
  max = 5,
}: {
  items: Record<string, number>
  formatLabel?: boolean
  max?: number
}) {
  const entries = Object.entries(items)
    .filter(([, pct]) => pct > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
  if (entries.length === 0) return <span className="text-muted">—</span>
  return (
    <span className="flex flex-wrap gap-1.5">
      {entries.map(([name, pct]) => (
        <span
          key={name}
          className="inline-block py-0.5 px-1.5 bg-surface-hover rounded text-xs"
        >
          {formatLabel ? formatKey(name) : name} <em className="not-italic text-muted ml-0.5">{pct.toFixed(0)}%</em>
        </span>
      ))}
    </span>
  )
}

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

/** Moves with type-based colors from PokéAPI */
function MoveTags({ items, max = 10 }: { items: Record<string, number>; max?: number }) {
  const entries = Object.entries(items)
    .filter(([, pct]) => pct > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
  const [types, setTypes] = useState<Record<string, string | null>>({})
  const namesKey = entries.map(([n]) => n).join(',')

  useEffect(() => {
    let cancelled = false
    entries.forEach(([name]) => {
      fetchMoveType(name).then((typeName) => {
        if (!cancelled) setTypes((prev) => ({ ...prev, [name]: typeName }))
      })
    })
    return () => {
      cancelled = true
    }
  }, [namesKey])

  if (entries.length === 0) return <span className="text-muted">—</span>
  return (
    <span className="flex flex-wrap gap-1.5">
      {entries.map(([name, pct]) => (
        <span
          key={name}
          className={`inline-block py-0.5 px-1.5 rounded text-xs font-medium text-white ${TYPE_COLORS[types[name] ?? ''] ?? 'bg-surface-hover text-[#e6edf3]'}`}
        >
          {name} <em className="not-italic opacity-90 ml-0.5">{pct.toFixed(0)}%</em>
        </span>
      ))}
    </span>
  )
}

/** Teammates with Pokémon sprite + name + % */
function TeammateTags({ items, max = 8 }: { items: Record<string, number>; max?: number }) {
  const entries = Object.entries(items)
    .filter(([, pct]) => pct > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
  if (entries.length === 0) return <span className="text-muted">—</span>
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([name, pct]) => (
        <TeammateRow key={name} name={name} pct={pct} />
      ))}
    </div>
  )
}

/** Items with icon + name + % from PokéAPI */
function ItemTags({ items, max = 6 }: { items: Record<string, number>; max?: number }) {
  const entries = Object.entries(items)
    .filter(([, pct]) => pct > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
  if (entries.length === 0) return <span className="text-muted">—</span>
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([name, pct]) => (
        <ItemRow key={name} name={name} pct={pct} />
      ))}
    </div>
  )
}

function ItemRow({ name, pct }: { name: string; pct: number }) {
  const [image, setImage] = useState<string | null | 'loading'>('loading')

  useEffect(() => {
    let cancelled = false
    fetchItemImage(name).then((url) => {
      if (!cancelled) setImage(url ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [name])

  return (
    <div className="flex items-center gap-2 py-1 px-2 rounded-lg bg-surface-hover">
      <div className="w-7 h-7 shrink-0 rounded bg-surface flex items-center justify-center overflow-hidden">
        {image === 'loading' ? (
          <span className="text-muted text-[10px]">…</span>
        ) : image ? (
          <img src={image} alt={name} className="w-full h-full object-contain" />
        ) : (
          <span className="text-muted text-[10px]">?</span>
        )}
      </div>
      <span className="text-xs font-medium truncate max-w-[120px]">{name}</span>
      <span className="text-xs text-muted shrink-0">{pct.toFixed(0)}%</span>
    </div>
  )
}

function TeammateRow({ name, pct }: { name: string; pct: number }) {
  return (
    <div className="flex items-center gap-2 py-1 px-2 rounded-lg bg-surface-hover">
      <div className="w-8 h-8 lg:w-10 lg:h-10 shrink-0 rounded bg-surface flex items-center justify-center overflow-hidden">
        <SpeciesSpriteImg name={name} className="w-full h-full object-contain pokemon-sprite" alt={name} />
      </div>
      <span className="text-xs font-medium truncate max-w-[100px]">{name}</span>
      <span className="text-xs text-muted shrink-0">{pct.toFixed(0)}%</span>
    </div>
  )
}

/** Large sprite used on the detail header */
function DetailSprite({ name }: { name: string }) {
  return (
    <div className="w-20 h-20 md:w-28 md:h-28 rounded-2xl bg-surface-hover flex items-center justify-center overflow-hidden">
      <SpeciesSpriteImg name={name} className="w-full h-full object-contain pokemon-sprite" alt={name} />
    </div>
  )
}

function SpeciesCard({
  s,
  rank,
  onOpenDetail,
}: {
  s: SpeciesUsage
  rank: number
  onOpenDetail?: (s: SpeciesUsage, rank: number) => void
}) {
  const [types, setTypes] = useState<string[] | null | 'loading'>('loading')

  useEffect(() => {
    let cancelled = false
    setTypes('loading')
    fetchPokemonInfo(s.name).then((data) => {
      if (!cancelled) setTypes(data?.types?.length ? data.types : [])
    })
    return () => {
      cancelled = true
    }
  }, [s.name])

  return (
    <div className="mb-3 pixel-panel hover:brightness-110 transition-[filter] duration-150">
      <button
        type="button"
        className="w-full flex items-center gap-4 px-4 py-3 sm:px-5 sm:py-4 text-left"
        onClick={() => onOpenDetail?.(s, rank)}
      >
        <div className="w-10 text-sm font-semibold text-muted">#{rank}</div>
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="w-16 h-16 md:w-32 md:h-32 lg:w-50 lg:h-50 shrink-0 rounded-xl bg-surface-hover flex items-center justify-center overflow-hidden">
            <SpeciesSpriteImg
              name={s.name}
              className="w-full h-full object-contain pokemon-sprite"
              alt={s.name}
            />
          </div>
          <div className="min-w-0">
            <div className="font-semibold truncate text-[0.95rem] sm:text-base">
              {s.name}
            </div>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {types === 'loading' ? (
                <span className="text-muted text-xs">…</span>
              ) : types && types.length > 0 ? (
                types.map((t) => (
                  <span
                    key={t}
                    className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium capitalize text-white ${
                      TYPE_COLORS[t] ?? 'bg-muted'
                    }`}
                  >
                    {t}
                  </span>
                ))
              ) : (
                <span className="text-muted text-xs">—</span>
              )}
            </div>
          </div>
        </div>
        <div className="w-28 text-right">
          <div className="text-sm sm:text-base font-semibold text-accent">
            {s.usagePercent.toFixed(1)}
            <span className="text-xs align-top">%</span>
          </div>
          <div className="text-[11px] text-muted">
            {s.count != null ? `${s.count} games` : s.winRate != null ? `${s.winRate.toFixed(1)}% WR` : '—'}
          </div>
        </div>
      </button>
    </div>
  )
}

export function UsageStats() {
  const [data, setData] = useState<UsageStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formatId, setFormatId] = useState<FormatId>('singles')
  const [selected, setSelected] = useState<{
    species: SpeciesUsage
    rank: number
    tierLabel: string
    tierMinElo: number
    tierMaxElo: number | typeof Infinity
    tierBattles: number
  } | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchUsageStats()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <PageShell max="6xl">
        <PageHeader accent="sky" eyebrow="Meta analysis" title="Usage Stats" description="Loading competitive usage data…" />
      </PageShell>
    )
  }
  if (error) {
    return (
      <PageShell max="6xl">
        <PageHeader accent="sky" eyebrow="Meta analysis" title="Usage Stats" />
        <PageEmptyState className="text-error border-error/40">{error}</PageEmptyState>
      </PageShell>
    )
  }
  if (!data || Object.keys(data).length === 0) {
    return (
      <PageShell max="6xl">
        <PageHeader accent="sky" eyebrow="Meta analysis" title="Usage Stats" />
        <PageEmptyState>No usage stats yet. Sync from the server to see data.</PageEmptyState>
      </PageShell>
    )
  }

  const formats = data.formats ?? {}
  const format = getFormatById(formats, formatId)
  const displayName = getFormatDisplayName(formatId)
  const tiers = format?.tiers ?? {}
  const sortedTierEntries = sortTierEntries(Object.entries(tiers))

  if (selected) {
    const s = selected.species
    return (
      <PageShell max="6xl" className="space-y-4">
        <button
          type="button"
          className="pixel-btn text-sm py-2 px-4"
          onClick={() => setSelected(null)}
        >
          ← Back to {displayName} usage
        </button>
        <PageSection padded className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <DetailSprite name={s.name} />
              <div>
                <h2 className="text-2xl sm:text-3xl font-semibold m-0">{s.name}</h2>
                <p className="text-sm text-muted m-0 mt-1">
                  {displayName} · ELO {selected.tierMinElo} –{' '}
                  {selected.tierMaxElo === Infinity ? '∞' : selected.tierMaxElo} · {selected.tierBattles} battles
                </p>
              </div>
            </div>
            <div className="flex gap-6 text-right text-sm sm:text-base">
              <div>
                <div className="text-[0.7rem] uppercase tracking-wide text-muted">Usage Rank</div>
                <div className="font-semibold text-emerald-400">#{selected.rank}</div>
              </div>
              <div>
                <div className="text-[0.7rem] uppercase tracking-wide text-muted">Usage Percent</div>
                <div className="font-semibold text-accent">
                  {s.usagePercent.toFixed(1)}
                  <span className="text-xs align-top ml-0.5">%</span>
                </div>
              </div>
              {s.winRate != null ? (
                <div>
                  <div className="text-[0.7rem] uppercase tracking-wide text-muted">Species win rate</div>
                  <div className="font-semibold text-sky-400 tabular-nums">{s.winRate.toFixed(1)}%</div>
                </div>
              ) : null}
            </div>
          </div>
          <div className="rounded-lg p-4 bg-surface border border-border text-xs sm:text-sm">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <h4 className="font-semibold text-[0.8rem] text-muted uppercase tracking-wide">Moves</h4>
              <MoveTags items={s.moves ?? {}} max={10} />
            </div>
            <div className="space-y-1">
              <h4 className="font-semibold text-[0.8rem] text-muted uppercase tracking-wide">Teammates</h4>
              <TeammateTags items={s.teammates ?? {}} max={8} />
            </div>
            <div className="space-y-1">
              <h4 className="font-semibold text-[0.8rem] text-muted uppercase tracking-wide">Items</h4>
              <ItemTags items={s.items ?? {}} max={6} />
            </div>
            <div className="space-y-1">
              <h4 className="font-semibold text-[0.8rem] text-muted uppercase tracking-wide">Abilities</h4>
              <TopItems items={s.abilities ?? {}} formatLabel max={4} />
            </div>
            <div className="space-y-1">
              <h4 className="font-semibold text-[0.8rem] text-muted uppercase tracking-wide">
                EV spreads (HP, Atk, Def, SpA, SpD, Spe)
              </h4>
              <TopItems items={s.evSpreads ?? {}} max={4} />
            </div>
            <div className="space-y-1">
              <h4 className="font-semibold text-[0.8rem] text-muted uppercase tracking-wide">Natures</h4>
              <TopItems items={s.natures ?? {}} formatLabel max={5} />
            </div>
          </div>
          </div>
        </PageSection>
      </PageShell>
    )
  }

  return (
    <PageShell max="6xl">
      <PageHeader
        accent="sky"
        eyebrow="Meta analysis"
        title={data.seasonName ?? 'Usage Stats'}
        description={
          <>
            {data.timestamp ? (
              <span className="block">Updated: {new Date(data.timestamp).toLocaleString()}</span>
            ) : null}
            {data.serverId ? <span className="block mt-1">Server: {data.serverId}</span> : null}
          </>
        }
      />

      <PageTabBar
        ariaLabel="Format"
        tabs={FORMAT_ORDER.map((id) => ({ id, label: getFormatDisplayName(id) }))}
        active={formatId}
        onChange={setFormatId}
      />

      {sortedTierEntries.length === 0 ? (
        <PageEmptyState>No data for {displayName} yet.</PageEmptyState>
      ) : (
        sortedTierEntries.map(([tierKey, tier]) => {
          const species = tier?.species ?? []
          const sorted = [...species].sort((a, b) => b.usagePercent - a.usagePercent)

          return (
            <div key={tierKey} className="mb-6 rounded-lg p-4 bg-surface border border-border">
              <h3 className="text-[0.95rem] font-medium m-0 mb-3 text-muted">
                ELO {tier?.minElo ?? 0} – {tier?.maxElo == null ? '∞' : tier.maxElo} · {tier?.totalBattles ?? 0} battles
              </h3>
              <div className="flex flex-col gap-3">
                {sorted.map((s, i) => (
                  <SpeciesCard
                    key={s.name}
                    s={s}
                    rank={i + 1}
                    onOpenDetail={(species, rank) =>
                      setSelected({
                        species,
                        rank,
                        tierLabel: tierKey,
                        tierMinElo: tier?.minElo ?? 0,
                        tierMaxElo: tier?.maxElo == null ? Infinity : tier.maxElo,
                        tierBattles: tier?.totalBattles ?? 0,
                      })
                    }
                  />
                ))}
              </div>
            </div>
          )
        })
      )}
    </PageShell>
  )
}
