import { useEffect, useState } from 'react'
import { fetchUsageStats } from '../api'
import type { UsageStatsResponse, SpeciesUsage } from '../types'
import './UsageStats.css'

/** Format cobblemon.ability.x or cobblemon.nature.x for display */
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
  if (entries.length === 0) return <span className="muted">—</span>
  return (
    <span className="top-items">
      {entries.map(([name, pct]) => (
        <span key={name} className="tag">
          {formatLabel ? formatKey(name) : name} <em>{pct.toFixed(0)}%</em>
        </span>
      ))}
    </span>
  )
}

function SpeciesRow({ s, rank }: { s: SpeciesUsage; rank: number }) {
  return (
    <tr>
      <td className="rank">{rank}</td>
      <td className="name">{s.name}</td>
      <td className="num">{s.usagePercent.toFixed(1)}%</td>
      <td className="num">{s.count}</td>
      <td className="items">
        <TopItems items={s.abilities ?? {}} formatLabel max={3} />
      </td>
      <td className="items">
        <TopItems items={s.items ?? {}} />
      </td>
      <td className="items">
        <TopItems items={s.moves ?? {}} />
      </td>
      <td className="items">
        <TopItems items={s.natures ?? {}} formatLabel max={3} />
      </td>
      <td className="items ev-spreads">
        <TopItems items={s.evSpreads ?? {}} max={2} />
      </td>
      <td className="items">
        <TopItems items={s.teammates ?? {}} />
      </td>
    </tr>
  )
}

export function UsageStats() {
  const [data, setData] = useState<UsageStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchUsageStats()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="panel loading">Loading usage stats…</div>
  if (error) return <div className="panel error">Error: {error}</div>
  if (!data || Object.keys(data).length === 0) {
    return <div className="panel empty">No usage stats yet. Sync from the server to see data.</div>
  }

  const formats = data.formats ?? {}
  const formatNames = Object.keys(formats)

  return (
    <div className="usage-stats">
      <header className="stats-header">
        <h1>{data.seasonName ?? 'Usage Stats'}</h1>
        {data.timestamp && (
          <p className="muted">Updated: {new Date(data.timestamp).toLocaleString()}</p>
        )}
        {data.serverId && <p className="muted">Server: {data.serverId}</p>}
      </header>

      {formatNames.map((formatKey) => {
        const format = formats[formatKey]
        const tiers = format?.tiers ?? {}
        const tierKeys = Object.keys(tiers)
        if (tierKeys.length === 0) return null

        return (
          <section key={formatKey} className="format-section">
            <h2>{format?.format ?? formatKey}</h2>
            {tierKeys.map((tierKey) => {
              const tier = tiers[tierKey]
              const species = tier?.species ?? []
              const sorted = [...species].sort((a, b) => b.usagePercent - a.usagePercent)

              return (
                <div key={tierKey} className="tier-block">
                  <h3>
                    ELO {tier?.minElo ?? 0} – {tier?.maxElo ?? '∞'} · {tier?.totalBattles ?? 0} battles
                  </h3>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Pokémon</th>
                          <th>Usage %</th>
                          <th>Count</th>
                          <th>Abilities</th>
                          <th>Items</th>
                          <th>Moves</th>
                          <th>Natures</th>
                          <th>EV spreads</th>
                          <th>Teammates</th>
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
            })}
          </section>
        )
      })}
    </div>
  )
}
