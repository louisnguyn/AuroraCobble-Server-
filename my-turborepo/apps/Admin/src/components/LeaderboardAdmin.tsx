import { useEffect, useState } from 'react'
import { fetchLeaderboard } from '../api'
import type { LeaderboardResponse, LeaderboardPlayer } from '../types'

export function LeaderboardAdmin() {
  const [data, setData] = useState<LeaderboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [format, setFormat] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchLeaderboard()
      .then((d) => {
        if (!cancelled) {
          setData(d)
          const first = d.formats ? Object.keys(d.formats)[0] : ''
          setFormat((f) => f || first)
        }
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

  const formats = data?.formats ? Object.keys(data.formats) : []
  const players: LeaderboardPlayer[] =
    (format && data?.formats?.[format]?.players) ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <h2 className="text-xl font-semibold m-0">Leaderboard</h2>
        {formats.length > 1 && (
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className="rounded-lg bg-surface border border-border px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {formats.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="rounded-lg bg-surface border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg/40">
                <th className="text-left py-3 px-4 font-semibold">Rank</th>
                <th className="text-left py-3 px-4 font-semibold">Player</th>
                <th className="text-right py-3 px-4 font-semibold">ELO</th>
                <th className="text-left py-3 px-4 font-semibold">Tier</th>
                <th className="text-right py-3 px-4 font-semibold">W / L</th>
                <th className="text-right py-3 px-4 font-semibold">Win%</th>
                <th className="text-right py-3 px-4 font-semibold">Streak</th>
              </tr>
            </thead>
            <tbody>
              {players.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted">
                    No players in this format.
                  </td>
                </tr>
              ) : (
                players.map((p) => (
                  <tr key={p.uuid} className="border-b border-border/60 hover:bg-surface-hover/50">
                    <td className="py-2 px-4">{p.rank}</td>
                    <td className="py-2 px-4 font-medium">{p.playerName}</td>
                    <td className="py-2 px-4 text-right">{p.elo}</td>
                    <td className="py-2 px-4">{p.tier}</td>
                    <td className="py-2 px-4 text-right">
                      {p.wins} / {p.losses}
                    </td>
                    <td className="py-2 px-4 text-right">
                      {typeof p.winRate === 'number' ? `${(p.winRate * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-2 px-4 text-right">{p.currentStreak ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
