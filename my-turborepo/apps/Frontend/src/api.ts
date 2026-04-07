import { getStoredToken } from './authApi'

const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

const apiOrigin = API_BASE.replace(/\/$/, '')

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${apiOrigin}${path}`)
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

export async function fetchBattleTowerLeaderboard(params?: { mode?: string; top?: 10 | 25 | 50 | 100 }) {
  const sp = new URLSearchParams()
  if (params?.mode) sp.set('mode', params.mode)
  if (params?.top != null) sp.set('top', String(params.top))
  const q = sp.toString()
  return get<import('./types').BattleTowerLeaderboardResponse>(
    `/minecraft/battle-tower-leaderboard${q ? `?${q}` : ''}`
  )
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

export type TeamAnalysisLanguage = 'en' | 'vi'

export async function analyzeTeamWithAI(
  pokepaste: string,
  opts?: { language?: TeamAnalysisLanguage }
): Promise<{ analysis: string }> {
  const token = getStoredToken()
  if (!token) {
    throw new Error('LOGIN_REQUIRED')
  }
  const language = opts?.language === 'vi' ? 'vi' : 'en'
  const res = await fetch(`${apiOrigin}/team/analyze-ai`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(language === 'vi' ? { 'X-Client-Locale': 'vi' } : {}),
    },
    body: JSON.stringify({ pokepaste, language }),
  })
  const data = (await res.json().catch(() => null)) as
    | { analysis?: string; error?: string; code?: string; next_allowed_at?: string }
    | null

  if (res.status === 429 && data?.code === 'team_ai_cooldown') {
    const err = new Error('TEAM_AI_COOLDOWN') as Error & { nextAllowedAt?: string }
    err.nextAllowedAt =
      typeof data.next_allowed_at === 'string' ? data.next_allowed_at : undefined
    throw err
  }

  if (!res.ok) {
    const msg =
      data && typeof data.error === 'string' ? data.error : `API ${res.status}: ${res.statusText}`
    throw new Error(msg)
  }

  const analysis = data && typeof data.analysis === 'string' ? data.analysis : ''
  if (!analysis) {
    throw new Error('Empty analysis response')
  }
  return { analysis }
}
