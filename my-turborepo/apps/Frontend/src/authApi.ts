const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

export interface AuthUser {
  id: number
  email: string
  username: string
}

export interface AuthResponse {
  token: string
  user: AuthUser
}

function getToken(): string | null {
  return localStorage.getItem('aurora_token')
}

export function setToken(token: string): void {
  localStorage.setItem('aurora_token', token)
}

export function clearToken(): void {
  localStorage.removeItem('aurora_token')
}

export function getStoredToken(): string | null {
  return getToken()
}

async function fetchApi<T>(
  path: string,
  options: RequestInit & { skipAuth?: boolean } = {}
): Promise<T> {
  const { skipAuth, ...init } = options
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  }
  const token = skipAuth ? null : getToken()
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`
  }
  const res = await fetch(`${API_BASE.replace(/\/$/, '')}${path}`, { ...init, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string })?.error ?? `Request failed: ${res.status}`)
  }
  return data as T
}

export async function signup(email: string, password: string, username: string): Promise<AuthResponse> {
  return fetchApi<AuthResponse>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, username }),
    skipAuth: true,
  })
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  return fetchApi<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    skipAuth: true,
  })
}

export async function fetchMe(): Promise<{ user: AuthUser }> {
  return fetchApi<{ user: AuthUser }>('/auth/me')
}

// Gacha
export interface GachaPool {
  id: number
  name: string
  type: string
  config: Record<string, unknown> | null
  starts_at: string | null
  ends_at: string | null
  created_at: string
  updated_at: string
}

export interface GachaRewardResult {
  reward: { id: number; reward_type: string }
  newBalance: number
}

export async function fetchGachaPools(): Promise<{ pools: GachaPool[] }> {
  return fetchApi<{ pools: GachaPool[] }>('/gacha/pools')
}

export async function fetchPoolCurrency(poolId: number): Promise<{ balance: number; currencyType: string }> {
  return fetchApi<{ balance: number; currencyType: string }>(`/gacha/pools/${poolId}/currency`)
}

export async function gachaPull(poolId: number): Promise<GachaRewardResult> {
  return fetchApi<GachaRewardResult>('/gacha/pull', {
    method: 'POST',
    body: JSON.stringify({ poolId }),
  })
}

export async function fetchUserCurrencies(): Promise<{ currencies: { currency_type: string; balance: number }[] }> {
  return fetchApi<{ currencies: { currency_type: string; balance: number }[] }>('/user/currency')
}
