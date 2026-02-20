import { useEffect, useState } from 'react'
import { fetchLeaderboard } from '../api'
import type { LeaderboardResponse, LeaderboardFormat, LeaderboardPlayer } from '../types'

const FORMAT_ORDER = ['singles', 'doubles', 'triples'] as const
type FormatId = (typeof FORMAT_ORDER)[number]

const TIER_COLOR_CLASS: Record<string, string> = {
  copper: 'text-copper',
  silver: 'text-silver',
  gold: 'text-gold',
  emerald: 'text-emerald',
  diamond: 'text-diamond',
  netherite: 'text-netherite',
}

function getFormatDisplayName(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1).toLowerCase()
}

function getFormatById(formats: Record<string, LeaderboardFormat>, id: string): LeaderboardFormat | undefined {
  const key = Object.keys(formats).find((k) => k.toLowerCase() === id)
  return key ? formats[key] : undefined
}

const RANK_TIERS_BY_ELO: { minElo: number; displayName: string; slug: string }[] = [
  { minElo: 1350, displayName: 'Netherite', slug: 'netherite' },
  { minElo: 1250, displayName: 'Diamond', slug: 'diamond' },
  { minElo: 1175, displayName: 'Emerald', slug: 'emerald' },
  { minElo: 1100, displayName: 'Gold', slug: 'gold' },
  { minElo: 1050, displayName: 'Silver', slug: 'silver' },
  { minElo: 0, displayName: 'Copper', slug: 'copper' },
]

function getTier(elo: number): { displayName: string; slug: string } {
  const tier = RANK_TIERS_BY_ELO.find((t) => elo >= t.minElo)
  return tier ?? { displayName: 'Copper', slug: 'copper' }
}

export function Leaderboard() {
  const [data, setData] = useState<LeaderboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formatId, setFormatId] = useState<FormatId>('singles')

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchLeaderboard()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  const panelClass = 'p-8 text-center rounded-lg bg-surface border border-border'

  if (loading) return <div className={panelClass}>Loading leaderboard…</div>
  if (error) return <div className={`${panelClass} text-error`}>Error: {error}</div>
  if (!data || Object.keys(data).length === 0) {
    return <div className={`${panelClass} text-muted`}>No leaderboard yet. Sync from the server to see data.</div>
  }

  const formats = data.formats ?? {}
  const format = getFormatById(formats, formatId)
  const players: LeaderboardPlayer[] = format?.players ?? []

  return (
    <div className="w-full max-w-[800px] mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold m-0 mb-1">{data.seasonName ?? 'Leaderboard'}</h1>
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

      {players.length === 0 ? (
        <div className={`${panelClass} text-muted`}>
          No leaderboard entries for {getFormatDisplayName(formatId)} yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="text-left py-2.5 px-3 font-semibold text-muted border-b border-border">Rank</th>
                <th className="text-left py-2.5 px-3 font-semibold text-muted border-b border-border">Player</th>
                <th className="text-left py-2.5 px-3 font-semibold text-muted border-b border-border">ELO</th>
                <th className="text-left py-2.5 px-3 font-semibold text-muted border-b border-border">Tier</th>
                <th className="text-left py-2.5 px-3 font-semibold text-muted border-b border-border">W</th>
                <th className="text-left py-2.5 px-3 font-semibold text-muted border-b border-border">L</th>
                <th className="text-left py-2.5 px-3 font-semibold text-muted border-b border-border">Matches</th>
                <th className="text-left py-2.5 px-3 font-semibold text-muted border-b border-border">Win %</th>
                <th className="text-left py-2.5 px-3 font-semibold text-muted border-b border-border">Streak</th>
                <th className="text-left py-2.5 px-3 font-semibold text-muted border-b border-border">Best</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => {
                const tier = getTier(p.elo)
                return (
                  <tr key={p.uuid} className="hover:bg-surface-hover/50">
                    <td className="py-2.5 px-3 w-16 text-muted border-b border-border">{p.rank}</td>
                    <td className="py-2.5 px-3 font-medium border-b border-border">{p.playerName}</td>
                    <td className="py-2.5 px-3 w-16 border-b border-border">{p.elo}</td>
                    <td className={`py-2.5 px-3 text-xs font-semibold border-b border-border ${TIER_COLOR_CLASS[tier.slug] ?? 'text-muted'}`}>
                      {tier.displayName}
                    </td>
                    <td className="py-2.5 px-3 w-16 border-b border-border">{p.wins}</td>
                    <td className="py-2.5 px-3 w-16 border-b border-border">{p.losses}</td>
                    <td className="py-2.5 px-3 w-16 border-b border-border">{p.matches}</td>
                    <td className="py-2.5 px-3 w-16 border-b border-border">{p.winRate.toFixed(1)}%</td>
                    <td className="py-2.5 px-3 w-16 border-b border-border">{p.currentStreak}</td>
                    <td className="py-2.5 px-3 w-16 border-b border-border">{p.bestStreak}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
