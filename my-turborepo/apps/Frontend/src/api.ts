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

export async function fetchCobbleDollarsLeaderboard() {
  return get<import('./types').CobbleDollarsLeaderboardResponse>('/minecraft/cobbledollars-leaderboard')
}

export async function fetchSpawnPokemon(params?: { q?: string; generation?: string; source?: string; limit?: number }) {
  const sp = new URLSearchParams()
  if (params?.q) sp.set('q', params.q)
  if (params?.generation) sp.set('generation', params.generation)
  if (params?.source) sp.set('source', params.source)
  if (params?.limit) sp.set('limit', String(params.limit))
  const q = sp.toString()
  return get<import('./types').SpawnPokemonResponse>(`/spawn/pokemon${q ? `?${q}` : ''}`)
}

export async function fetchSpawnBoss(params?: { q?: string; limit?: number }) {
  const sp = new URLSearchParams()
  if (params?.q) sp.set('q', params.q)
  if (params?.limit) sp.set('limit', String(params.limit))
  const q = sp.toString()
  return get<import('./types').SpawnBossResponse>(`/spawn/boss${q ? `?${q}` : ''}`)
}
