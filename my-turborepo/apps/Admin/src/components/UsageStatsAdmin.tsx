import { useEffect, useState } from 'react'
import { fetchUsageStats } from '../api'
import type { UsageStatsResponse } from '../types'
import { sortTierEntries } from '../usageStatsNormalize'

export function UsageStatsAdmin() {
  const [data, setData] = useState<UsageStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchUsageStats()
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="rounded-lg bg-surface border border-border p-8 text-center text-muted">
        Loading…
      </div>
    )
  }
  if (error) {
    return (
      <div className="rounded-lg bg-surface border border-border p-6 text-error">
        {error}
      </div>
    )
  }

  const formats = data?.formats ?? {}
  const formatNames = Object.keys(formats)
  const hasMeta = Boolean(data?.seasonName ?? data?.serverId ?? data?.timestamp)

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold m-0">Usage stats by format</h2>
      {data && hasMeta && (
        <div className="rounded-lg bg-surface border border-border px-4 py-3 text-sm text-muted space-y-1">
          {data.seasonName ? (
            <p className="m-0 text-slate-200 font-medium">{data.seasonName}</p>
          ) : null}
          {data.serverId ? <p className="m-0">Server: {data.serverId}</p> : null}
          {data.timestamp ? (
            <p className="m-0">Updated: {new Date(data.timestamp).toLocaleString()}</p>
          ) : null}
        </div>
      )}
      {formatNames.length === 0 ? (
        <div className="rounded-lg bg-surface border border-border p-8 text-center text-muted">
          {hasMeta
            ? 'No format breakdown in the last sync. If CobbleRanked changed its JSON shape, ensure the API is on the latest version.'
            : 'No usage data. POST /usage-stats from CobbleRanked (or wait for DB hydrate after deploy).'}
        </div>
      ) : (
        <div className="space-y-4">
          {formatNames.map((formatName) => {
            const format = formats[formatName]
            const tiers = format?.tiers ?? {}
            const tierEntries = sortTierEntries(Object.entries(tiers))
            const totalBattles = tierEntries.reduce((s, [, t]) => s + (t.totalBattles ?? 0), 0)
            const totalPokemon = tierEntries.reduce((s, [, t]) => s + (t.totalPokemon ?? 0), 0)
            return (
              <div
                key={formatName}
                className="rounded-lg bg-surface border border-border p-4"
              >
                <h3 className="font-semibold m-0 mb-2">{formatName}</h3>
                <div className="flex flex-wrap gap-4 text-sm text-muted">
                  <span>Tiers: {tierEntries.length}</span>
                  <span>Battles: {totalBattles.toLocaleString()}</span>
                  <span>Pokémon records: {totalPokemon.toLocaleString()}</span>
                </div>
                {tierEntries.length > 0 && (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-muted border-b border-border/60">
                          <th className="py-1.5 pr-4">Tier (ELO)</th>
                          <th className="py-1.5 text-right">Battles</th>
                          <th className="py-1.5 text-right">Species</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tierEntries.map(([tierName, tier]) => (
                          <tr key={tierName} className="border-b border-border/40">
                            <td className="py-1.5 pr-4">
                              {tierName} ({tier.minElo}–{tier.maxElo == null ? '∞' : tier.maxElo})
                            </td>
                            <td className="py-1.5 text-right">
                              {(tier.totalBattles ?? 0).toLocaleString()}
                            </td>
                            <td className="py-1.5 text-right">
                              {(tier.species?.length ?? tier.totalPokemon ?? 0).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
