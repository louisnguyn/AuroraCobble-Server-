const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE.replace(/\/$/, '')}${path}`)
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`)
  return res.json() as Promise<T>
}

export async function fetchUsageStats() {
  return get<import('./types').UsageStatsResponse>('/usage-stats')
}

export async function fetchLeaderboard() {
  return get<import('./types').LeaderboardResponse>('/leaderboard')
}
