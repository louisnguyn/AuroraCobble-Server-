const API_BASE = import.meta.env.VITE_API_URL ?? ''

export interface AuthUser {
  id: number
  email: string
  username: string
  is_admin: boolean
}

export interface AuthResponse {
  token: string
  user: AuthUser
}

const TOKEN_KEY = 'aurora_admin_token'

function buildUrl(path: string): string {
  const base = API_BASE.replace(/\/$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  return `${base}${p}`
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

async function fetchJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = buildUrl(path)
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  const token = getToken()
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`
  }
  const res = await fetch(url, { ...options, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string })?.error ?? `Request failed: ${res.status}`)
  }
  return data as T
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  return fetchJson<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function fetchMe(): Promise<{ user: AuthUser }> {
  return fetchJson<{ user: AuthUser }>('/auth/me')
}

// Admin APIs (require admin token)
export interface AdminUser {
  id: number
  email: string
  username: string
  is_admin: boolean
  created_at: string
}

export async function fetchAdminUsers(): Promise<{ users: AdminUser[] }> {
  return fetchJson<{ users: AdminUser[] }>('/admin/users')
}

export interface UserCurrencyRow {
  id: number
  currency_type: string
  balance: number
  updated_at: string
}

export async function fetchAdminUserCurrency(userId: number): Promise<{ currencies: UserCurrencyRow[] }> {
  return fetchJson<{ currencies: UserCurrencyRow[] }>(`/admin/users/${userId}/currency`)
}

export async function grantCurrency(userId: number, currencyType: string, amount: number): Promise<UserCurrencyRow> {
  return fetchJson<UserCurrencyRow>(`/admin/users/${userId}/currency`, {
    method: 'POST',
    body: JSON.stringify({ currency_type: currencyType, amount }),
  })
}

export interface AdminHistoryEntry {
  id: number
  poolId: number
  poolName: string
  rewardType: string
  pulledAt: string
  fulfilledAt: string | null
}

export async function fetchAdminUserHistory(userId: number, limit?: number): Promise<{ history: AdminHistoryEntry[] }> {
  const q = limit != null ? `?limit=${limit}` : ''
  return fetchJson<{ history: AdminHistoryEntry[] }>(`/admin/users/${userId}/history${q}`)
}

export async function setPullFulfilled(pullId: number, fulfilled: boolean): Promise<{ id: number; fulfilled_at: string | null }> {
  return fetchJson<{ id: number; fulfilled_at: string | null }>(`/admin/pulls/${pullId}/fulfilled`, {
    method: 'PATCH',
    body: JSON.stringify({ fulfilled }),
  })
}

export async function deleteAdminPull(pullId: number): Promise<{ ok: boolean; id: number }> {
  return fetchJson<{ ok: boolean; id: number }>(`/admin/pulls/${pullId}`, {
    method: 'DELETE',
  })
}

export type MinecraftDashboardResponse = {
  ok: true
  source: 'query' | 'status'
  online: number
  maxPlayers: number
  motd?: string
  version?: string
  protocol?: number
  latencyMs?: number
  note?: string
  software?: string
  plugins?: string[]
  mapName?: string
  reportedHost?: string
  reportedPort?: number
  srvTarget?: string
  faviconDataUri?: string
  players: {
    name: string
    status: 'online' | 'offline'
    streakDays: number
    lastSeenOnline: string | null
    offlineSeconds: number | null
  }[]
  /** True when Supabase table minecraft_player_presence exists and sync worked */
  presenceTracking?: boolean
  rosterAccountCount?: number
  rosterExtraFromEnv?: number
  rosterFromServerWhitelist?: number
  rosterWebsiteUsers?: number
  rosterNote?: string
}

export async function fetchMinecraftDashboard(): Promise<MinecraftDashboardResponse> {
  const url = buildUrl('/admin/minecraft/dashboard')
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`
  }
  const res = await fetch(url, { headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(
      (data as { error?: string })?.error ?? `Request failed: ${res.status}`
    ) as Error & { hint?: string }
    if (typeof (data as { hint?: string }).hint === 'string') {
      err.hint = (data as { hint: string }).hint
    }
    throw err
  }
  return data as MinecraftDashboardResponse
}
