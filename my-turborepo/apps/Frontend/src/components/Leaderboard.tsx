import { useEffect, useState } from 'react'
import { fetchLeaderboard } from '../api'
import type { LeaderboardResponse, LeaderboardPlayer } from '../types'
import './Leaderboard.css'

function getPlayersFromResponse(data: LeaderboardResponse): LeaderboardPlayer[] {
  const formats = data.formats
  if (!formats || typeof formats !== 'object') return []
  for (const key of Object.keys(formats)) {
    const format = formats[key]
    if (format && Array.isArray(format.players) && format.players.length > 0) {
      return format.players
    }
  }
  return []
}

export function Leaderboard() {
  const [data, setData] = useState<LeaderboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchLeaderboard()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="panel loading">Loading leaderboard…</div>
  if (error) return <div className="panel error">Error: {error}</div>
  if (!data || Object.keys(data).length === 0) {
    return <div className="panel empty">No leaderboard yet. Sync from the server to see data.</div>
  }

  const players = getPlayersFromResponse(data)
  if (players.length === 0) {
    return <div className="panel empty">No leaderboard entries yet.</div>
  }

  return (
    <div className="leaderboard">
      <header className="leaderboard-header">
        <h1>{data.seasonName ?? 'Leaderboard'}</h1>
        {data.timestamp && (
          <p className="muted">Updated: {new Date(data.timestamp).toLocaleString()}</p>
        )}
        {data.serverId && <p className="muted">Server: {data.serverId}</p>}
      </header>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>ELO</th>
              <th>Tier</th>
              <th>W</th>
              <th>L</th>
              <th>Matches</th>
              <th>Win %</th>
              <th>Streak</th>
              <th>Best</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.uuid}>
                <td className="rank">{p.rank}</td>
                <td className="name">{p.playerName}</td>
                <td className="num">{p.elo}</td>
                <td className="tier">{p.tier}</td>
                <td className="num">{p.wins}</td>
                <td className="num">{p.losses}</td>
                <td className="num">{p.matches}</td>
                <td className="num">{p.winRate.toFixed(1)}%</td>
                <td className="num">{p.currentStreak}</td>
                <td className="num">{p.bestStreak}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
