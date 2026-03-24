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

export async function changePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean }> {
  return fetchApi<{ ok: boolean }>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  })
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

export interface PoolReward {
  id: number
  reward_type: string
  weight: number
}

export async function fetchPoolRewards(poolId: number): Promise<{ rewards: PoolReward[] }> {
  return fetchApi<{ rewards: PoolReward[] }>(`/gacha/pools/${poolId}/rewards`)
}

export interface GachaHistoryEntry {
  id: number
  poolId: number
  poolName: string
  rewardType: string
  pulledAt: string
  /** Set when claimed in-game or marked fulfilled by admin */
  fulfilledAt?: string | null
  /** Server says this row can use Claim (RCON + parsable species + not fulfilled) */
  claimable?: boolean
}

export async function fetchGachaHistory(limit?: number): Promise<{ history: GachaHistoryEntry[] }> {
  const q = limit != null ? `?limit=${limit}` : ''
  return fetchApi<{ history: GachaHistoryEntry[] }>(`/gacha/history${q}`)
}

export async function gachaPull(poolId: number): Promise<GachaRewardResult> {
  return fetchApi<GachaRewardResult>('/gacha/pull', {
    method: 'POST',
    body: JSON.stringify({ poolId }),
  })
}

export async function claimGachaPull(pullId: number): Promise<{ ok: boolean; message?: string }> {
  return fetchApi<{ ok: boolean; message?: string }>(`/gacha/pulls/${pullId}/claim`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function fetchUserCurrencies(): Promise<{ currencies: { currency_type: string; balance: number }[] }> {
  return fetchApi<{ currencies: { currency_type: string; balance: number }[] }>('/user/currency')
}

export interface UserPvpRank {
  rank: number | null
  status: 'ranked' | 'unranked'
  format?: string
  minecraftUsername?: string
  elo?: number | null
  updatedAt?: string
}

export async function fetchUserPvpRank(): Promise<UserPvpRank> {
  return fetchApi<UserPvpRank>('/user/pvp-rank')
}

/** Move website Cobble$ (user_currency cobbledollars) into the Minecraft server via RCON. */
export async function depositCobbledollars(amount: number): Promise<{ newBalance: number }> {
  return fetchApi<{ newBalance: number }>('/user/cobbledollars/deposit', {
    method: 'POST',
    body: JSON.stringify({ amount }),
  })
}

export interface DailyLoginStatus {
  date: string
  timeZone: string
  eligible: boolean
  streak: {
    nextDay: number
    nextReward: {
      day: number
      kind: string
      amount: number
      label: string
      itemKey?: string
    }
  }
  claim: {
    status: string | null
    claimedAt: string | null
    selectedReward: string | null
    error: string | null
    streakDay: number | null
  } | null
}

export async function fetchDailyLoginStatus(): Promise<DailyLoginStatus> {
  return fetchApi<DailyLoginStatus>('/user/daily-login/status')
}

export async function claimDailyLoginReward(): Promise<{
  ok: boolean
  date: string
  streakDay: number
  reward: string
  message: string
}> {
  return fetchApi<{
    ok: boolean
    date: string
    streakDay: number
    reward: string
    message: string
  }>('/user/daily-login/claim', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function fetchUserInventory(): Promise<{ inventory: { item_key: string; quantity: number }[] }> {
  return fetchApi<{ inventory: { item_key: string; quantity: number }[] }>('/user/inventory')
}

export async function claimInventoryItem(itemKey: string, quantity = 1): Promise<{
  ok: boolean
  itemKey: string
  label: string
  quantityClaimed: number
  remaining: number
}> {
  return fetchApi<{
    ok: boolean
    itemKey: string
    label: string
    quantityClaimed: number
    remaining: number
  }>('/user/inventory/claim', {
    method: 'POST',
    body: JSON.stringify({ itemKey, quantity }),
  })
}

export interface ShopItem {
  itemKey: string
  label: string
  cost: number
}

export async function fetchShopItems(): Promise<{ currency: string; items: ShopItem[] }> {
  return fetchApi<{ currency: string; items: ShopItem[] }>('/shop/items')
}

export async function buyShopItem(itemKey: string, quantity = 1): Promise<{
  ok: boolean
  itemKey: string
  quantityPurchased: number
  totalCost: number
  newBalance: number
  newInventoryQuantity: number
}> {
  return fetchApi<{
    ok: boolean
    itemKey: string
    quantityPurchased: number
    totalCost: number
    newBalance: number
    newInventoryQuantity: number
  }>('/shop/buy', {
    method: 'POST',
    body: JSON.stringify({ itemKey, quantity }),
  })
}

export interface PokemonShopOffer {
  slot: number
  category: string
  species: string
  shiny: boolean
  price: number
  label: string
  purchased: boolean
  claimed: boolean
}

export interface PokemonShopOffersResponse {
  refreshHours: number
  windowStart: string
  windowEnd: string
  offers: PokemonShopOffer[]
}

export interface PokemonShopPurchase {
  id: number
  species: string
  category: string
  shiny: boolean
  price: number
  purchasedAt: string
  claimedAt: string | null
  claimable: boolean
}

export async function fetchPokemonShopOffers(): Promise<PokemonShopOffersResponse> {
  return fetchApi<PokemonShopOffersResponse>('/pokemon-shop/offers')
}

export async function buyPokemonShopOffer(slot: number): Promise<{
  ok: boolean
  slot: number
  species: string
  shiny: boolean
  price: number
  newBalance: number
}> {
  return fetchApi<{
    ok: boolean
    slot: number
    species: string
    shiny: boolean
    price: number
    newBalance: number
  }>('/pokemon-shop/buy', {
    method: 'POST',
    body: JSON.stringify({ slot }),
  })
}

export async function fetchPokemonShopPurchases(limit?: number): Promise<{ purchases: PokemonShopPurchase[] }> {
  const q = limit != null ? `?limit=${limit}` : ''
  return fetchApi<{ purchases: PokemonShopPurchase[] }>(`/pokemon-shop/purchases${q}`)
}

export async function claimPokemonShopPurchase(id: number): Promise<{ ok: boolean; message: string }> {
  return fetchApi<{ ok: boolean; message: string }>(`/pokemon-shop/purchases/${id}/claim`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export interface ExchangeRate {
  to_currency: string
  cost_tickets: number
  label: string
}

export async function fetchExchangeRates(): Promise<{ rates: ExchangeRate[] }> {
  return fetchApi<{ rates: ExchangeRate[] }>('/user/exchange-rates')
}

export async function exchangeTickets(toCurrency: string): Promise<{
  to_currency: string
  cost_tickets: number
  new_tickets_balance: number
}> {
  return fetchApi<{ to_currency: string; cost_tickets: number; new_tickets_balance: number }>('/user/exchange', {
    method: 'POST',
    body: JSON.stringify({ to_currency: toCurrency }),
  })
}
