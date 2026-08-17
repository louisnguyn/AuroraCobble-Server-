import { getStoredToken } from './authApi'
import { normalizeUsageStatsResponse } from './usageStatsNormalize.js'

const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

const apiOrigin = API_BASE.replace(/\/$/, '')

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${apiOrigin}${path}`)
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`)
  return res.json() as Promise<T>
}

export type SiteMaintenance = {
  enabled: boolean
  message: string
  updatedAt: string | null
}

export async function fetchSiteMaintenance() {
  return get<SiteMaintenance>('/site-maintenance')
}

export async function fetchUsageStats() {
  const raw = await get<unknown>('/usage-stats')
  return normalizeUsageStatsResponse(raw)
}

export async function fetchLeaderboard() {
  return get<import('./types').LeaderboardResponse>('/leaderboard')
}

export async function fetchLeaderboardDisplaySettings() {
  return get<import('./types').LeaderboardDisplaySettings>('/leaderboard/display-settings')
}

export async function fetchCobbleDollarsLeaderboard() {
  return get<import('./types').CobbleDollarsLeaderboardResponse>('/minecraft/cobbledollars-leaderboard')
}

/** PCO top 10 — same response shape as Cobble$ (RCON `pco top`). */
export async function fetchPcoLeaderboard() {
  return get<import('./types').CobbleDollarsLeaderboardResponse>('/minecraft/pco-leaderboard')
}

/** In-game Asteryn Point top 20 — RCON `asterynpoint leaderboard`. Same JSON shape (`top10` may have up to 20). */
export async function fetchAsterynPointLeaderboard() {
  return get<import('./types').CobbleDollarsLeaderboardResponse>('/minecraft/asterynpoint-leaderboard')
}

/** World Hunt event board — RCON `hunt event`. */
export async function fetchWorldHuntLeaderboard() {
  return get<import('./types').WorldHuntLeaderboardResponse>('/minecraft/world-hunt-leaderboard')
}

/** Website wallet Asteryn Point top 10 (`user_currency` on the API host). Same shape as in-game economy boards. */
export async function fetchWebsiteCobbledollarsLeaderboard() {
  return get<import('./types').CobbleDollarsLeaderboardResponse>('/leaderboard/website-asterynpoints')
}

export async function fetchAchievementLeaderboard() {
  return get<import('./types').AchievementLeaderboardResponse>('/leaderboard/achievements')
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

export async function fetchBattleReplays(params?: { limit?: number }) {
  const sp = new URLSearchParams()
  if (params?.limit != null) sp.set('limit', String(params.limit))
  const q = sp.toString()
  return get<import('./types').RankedFeedListResponse<import('./types').BattleReplayPayload>>(
    `/battle-replays${q ? `?${q}` : ''}`
  )
}

export async function fetchMatchResults(params?: { limit?: number }) {
  const sp = new URLSearchParams()
  if (params?.limit != null) sp.set('limit', String(params.limit))
  const q = sp.toString()
  return get<import('./types').RankedFeedListResponse<import('./types').MatchResultPayload>>(
    `/match-results${q ? `?${q}` : ''}`
  )
}

export async function fetchSpawnPokemon(params?: { q?: string; generation?: string; limit?: number }) {
  const sp = new URLSearchParams()
  if (params?.q) sp.set('q', params.q)
  if (params?.generation) sp.set('generation', params.generation)
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

/** Upload team text to pokepast.es via backend proxy; returns shareable URL. */
export async function createTeamPokepasteLink(body: {
  paste: string
  title?: string
  author?: string
}): Promise<{ url: string }> {
  const res = await fetch(`${apiOrigin}/team/pokepaste-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null
  if (!res.ok) {
    throw new Error(data?.error ?? `PokePaste failed (${res.status})`)
  }
  if (!data?.url?.trim()) {
    throw new Error('PokePaste did not return a link')
  }
  return { url: data.url.trim() }
}

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

  if (res.status === 403 && data?.code === 'team_ai_verification_required') {
    throw new Error('TEAM_AI_VERIFICATION_REQUIRED')
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
