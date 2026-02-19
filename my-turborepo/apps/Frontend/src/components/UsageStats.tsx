import { useEffect, useState } from 'react'
import { fetchUsageStats } from '../api'
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

function SpeciesRow({ s, rank }: { s: SpeciesUsage; rank: number }) {
  return (
    <tr>
      <td className="py-2 px-3 w-10 text-muted border-b border-border text-left">{rank}</td>
      <td className="py-2 px-3 font-medium border-b border-border text-left">{s.name}</td>
      <td className="py-2 px-3 w-20 border-b border-border text-left">{s.usagePercent.toFixed(1)}%</td>
      <td className="py-2 px-3 w-20 border-b border-border text-left">{s.count}</td>
      <td className="py-2 px-3 border-b border-border text-left">
        <TopItems items={s.abilities ?? {}} formatLabel max={3} />
      </td>
      <td className="py-2 px-3 border-b border-border text-left">
        <TopItems items={s.items ?? {}} />
      </td>
      <td className="py-2 px-3 border-b border-border text-left">
        <TopItems items={s.moves ?? {}} />
      </td>
      <td className="py-2 px-3 border-b border-border text-left">
        <TopItems items={s.natures ?? {}} formatLabel max={3} />
      </td>
      <td className="py-2 px-3 border-b border-border text-left max-w-[12rem] overflow-hidden text-ellipsis whitespace-nowrap">
        <TopItems items={s.evSpreads ?? {}} max={2} />
      </td>
      <td className="py-2 px-3 border-b border-border text-left">
        <TopItems items={s.teammates ?? {}} />
      </td>
    </tr>
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
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="text-left py-2 px-3 font-semibold text-muted border-b border-border">#</th>
                      <th className="text-left py-2 px-3 font-semibold text-muted border-b border-border">Pokémon</th>
                      <th className="text-left py-2 px-3 font-semibold text-muted border-b border-border">Usage %</th>
                      <th className="text-left py-2 px-3 font-semibold text-muted border-b border-border">Count</th>
                      <th className="text-left py-2 px-3 font-semibold text-muted border-b border-border">Abilities</th>
                      <th className="text-left py-2 px-3 font-semibold text-muted border-b border-border">Items</th>
                      <th className="text-left py-2 px-3 font-semibold text-muted border-b border-border">Moves</th>
                      <th className="text-left py-2 px-3 font-semibold text-muted border-b border-border">Natures</th>
                      <th className="text-left py-2 px-3 font-semibold text-muted border-b border-border">EV spreads</th>
                      <th className="text-left py-2 px-3 font-semibold text-muted border-b border-border">Teammates</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((s, i) => (
                      <SpeciesRow key={s.name} s={s} rank={i + 1} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
