import { useEffect, useState } from 'react'
import { fetchUsageStats } from '../api'
import { fetchPokemonInfo } from '../pokemonApi'
import type { UsageStatsResponse, FormatUsage, SpeciesUsage } from '../types'

const FORMAT_ORDER = ['singles', 'doubles', 'triples'] as const
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

function SpeciesCard({ s, rank }: { s: SpeciesUsage; rank: number }) {
  const [info, setInfo] = useState<{ image: string; types: string[] } | null | 'loading'>('loading')
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    setInfo('loading')
    fetchPokemonInfo(s.name).then((data) => {
      if (!cancelled) setInfo(data)
    })
    return () => {
      cancelled = true
    }
  }, [s.name])

  return (
    <div className="mb-3 rounded-lg bg-surface border border-border hover:border-accent/60 transition-colors">
      <button
        type="button"
        className="w-full flex items-center gap-4 px-4 py-3 sm:px-5 sm:py-4 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="w-10 text-sm font-semibold text-muted">#{rank}</div>
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="w-16 h-16 md:w-32 md:h-32 lg:w-50 lg:h-50 shrink-0 rounded-xl bg-surface-hover flex items-center justify-center overflow-hidden">
            {info === 'loading' ? (
              <span className="text-muted text-xs">…</span>
            ) : info?.image ? (
              <img src={info.image} alt={s.name} className="w-full h-full object-contain" />
            ) : (
              <span className="text-muted text-xs" title="No sprite">
                ?
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div className="font-semibold truncate text-[0.95rem] sm:text-base">
              {s.name}
            </div>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {info && info !== 'loading' && info.types.length > 0 ? (
                info.types.map((t) => (
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
          <div className="text-[11px] text-muted">{s.count} games</div>
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-border text-xs sm:text-sm">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <h4 className="font-semibold text-[0.8rem] text-muted uppercase tracking-wide">Moves</h4>
              <TopItems items={s.moves ?? {}} max={10} />
            </div>
            <div className="space-y-1">
              <h4 className="font-semibold text-[0.8rem] text-muted uppercase tracking-wide">Teammates</h4>
              <TopItems items={s.teammates ?? {}} max={8} />
            </div>
            <div className="space-y-1">
              <h4 className="font-semibold text-[0.8rem] text-muted uppercase tracking-wide">Items</h4>
              <TopItems items={s.items ?? {}} max={6} />
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
      )}
    </div>
  )
}

export function UsageStats() {
  const [data, setData] = useState<UsageStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formatId, setFormatId] = useState<FormatId>('singles')

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchUsageStats()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  const panelClass = 'p-8 text-center rounded-lg bg-surface border border-border'

  if (loading) return <div className={panelClass}>Loading usage stats…</div>
  if (error) return <div className={`${panelClass} text-error`}>Error: {error}</div>
  if (!data || Object.keys(data).length === 0) {
    return <div className={`${panelClass} text-muted`}>No usage stats yet. Sync from the server to see data.</div>
  }

  const formats = data.formats ?? {}
  const format = getFormatById(formats, formatId)
  const displayName = getFormatDisplayName(formatId)
  const tiers = format?.tiers ?? {}
  const tierKeys = Object.keys(tiers)

  return (
    <div className="w-full max-w-[1200px] mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold m-0 mb-1">{data.seasonName ?? 'Usage Stats'}</h1>
        {data.timestamp && (
          <p className="text-sm text-muted m-0">Updated: {new Date(data.timestamp).toLocaleString()}</p>
        )}
        {data.serverId && <p className="text-sm text-muted m-0">Server: {data.serverId}</p>}
      </header>

      <div className="flex flex-wrap gap-1 mb-5" role="tablist" aria-label="Format">
        {FORMAT_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={formatId === id}
            className={`py-2 px-4 rounded-md border text-sm font-medium cursor-pointer transition-colors ${
              formatId === id
                ? 'text-accent bg-surface-hover border-accent'
                : 'border-border bg-surface text-muted hover:text-[#e6edf3] hover:bg-surface-hover'
            }`}
            onClick={() => setFormatId(id)}
          >
            {getFormatDisplayName(id)}
          </button>
        ))}
      </div>

      {tierKeys.length === 0 ? (
        <div className="mb-6 rounded-lg p-6 bg-surface border border-border text-center">
          <p className="text-muted m-0">No data for {displayName} yet.</p>
        </div>
      ) : (
        tierKeys.map((tierKey) => {
          const tier = tiers[tierKey]
          const species = tier?.species ?? []
          const sorted = [...species].sort((a, b) => b.usagePercent - a.usagePercent)

          return (
            <div key={tierKey} className="mb-6 rounded-lg p-4 bg-surface border border-border">
              <h3 className="text-[0.95rem] font-medium m-0 mb-3 text-muted">
                ELO {tier?.minElo ?? 0} – {tier?.maxElo ?? '∞'} · {tier?.totalBattles ?? 0} battles
              </h3>
              <div className="flex flex-col gap-3">
                {sorted.map((s, i) => (
                  <SpeciesCard key={s.name} s={s} rank={i + 1} />
                ))}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
