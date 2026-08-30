// Backend serves CobbleRanked sync at /usage-stats and /api/usage-stats (same for leaderboard, etc.). Set VITE_API_URL in .env.
import { normalizeUsageStatsResponse } from './usageStatsNormalize.js'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

function buildUrl(path: string): string {
  const base = API_BASE.replace(/\/$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  return `${base}${p}`
}

async function get<T>(path: string): Promise<T> {
  const url = buildUrl(path)
  let res: Response
  let text: string
  try {
    res = await fetch(url, { mode: 'cors' })
    text = await res.text()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/failed to fetch|network|CORS/i.test(msg))
      throw new Error(
        `Cannot reach the API at ${url}. Check: (1) VITE_API_URL in .env (e.g. https://your-backend.onrender.com, no trailing slash). (2) CORS allows your origin. (3) On Render.com, wait ~30s for cold start and retry.`
      )
    throw err
  }
  if (!res.ok) {
    if (text.startsWith('<') || text.startsWith('<!'))
      throw new Error(
        `Backend returned HTML (${res.status}). On Render.com, wait for cold start and try again. Check VITE_API_URL in .env.`
      )
    throw new Error(`API ${res.status}: ${res.statusText}`)
  }
  if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) {
    throw new Error(
      `API returned non-JSON from ${url}. Check VITE_API_URL. On Render, wait for cold start and retry.`
    )
  }
  return JSON.parse(text) as T
}

export async function fetchUsageStats() {
  const raw = await get<unknown>('/usage-stats')
  return normalizeUsageStatsResponse(raw)
}

export async function fetchLeaderboard() {
  return get<import('./types').LeaderboardResponse>('/leaderboard')
}

export async function fetchCobbleDollarsLeaderboard() {
  return get<import('./types').CobbleDollarsLeaderboardResponse>('/minecraft/cobbledollars-leaderboard')
}

export async function fetchPcoLeaderboard() {
  return get<import('./types').CobbleDollarsLeaderboardResponse>('/minecraft/pco-leaderboard')
}

/** In-game Asteryn Coin top 20 — RCON `asterynpoint leaderboard`. */
export async function fetchAsterynPointLeaderboard() {
  return get<import('./types').CobbleDollarsLeaderboardResponse>('/minecraft/asterynpoint-leaderboard')
}

/** World Hunt event board — RCON `hunt event`. */
export async function fetchWorldHuntLeaderboard() {
  return get<import('./types').WorldHuntLeaderboardResponse>('/minecraft/world-hunt-leaderboard')
}

/** Endless Tower board — RCON `stellarbattlefactory leaderboardtext`. */
export async function fetchTowerLeaderboard() {
  return get<import('./types').TowerLeaderboardResponse>('/minecraft/tower-leaderboard')
}

/** Website wallet Asteryn Coin top 10 — same JSON shape as in-game economy boards. */
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
