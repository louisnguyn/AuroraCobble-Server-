import type { TeamBuildSlot } from './pokepasteParse'
import type { BattleReplayPayload, MatchResultPayload } from './types'

const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

export interface AuthUser {
  id: number
  email: string
  username: string
  is_admin?: boolean
  /** Staff confirmed this user was online on Minecraft (website username = IGN). Required for Team AI (non-admin). */
  minecraft_verified_at?: string | null
  /** LuckPerms parent group mirrored on the site (e.g. member, pro). */
  minecraft_role?: string
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

/** Force English API responses. */
function clientLocaleViHeaders(): HeadersInit {
  return {}
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

export async function fetchMe(): Promise<{ user: AuthUser; token?: string }> {
  return fetchApi<{ user: AuthUser; token?: string }>('/auth/me')
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean }> {
  return fetchApi<{ ok: boolean }>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  })
}

export type VerificationRequestRow = {
  id: number
  message: string | null
  status: string
  created_at: string
  resolved_at: string | null
  admin_note: string | null
}

export type VerificationStatusResponse = {
  verified: boolean
  pending: VerificationRequestRow | null
  lastResolved: VerificationRequestRow | null
}

export async function fetchVerificationStatus(): Promise<VerificationStatusResponse> {
  return fetchApi<VerificationStatusResponse>('/user/verification-request')
}

export async function submitVerificationRequest(message?: string): Promise<{ request: VerificationRequestRow }> {
  return fetchApi<{ request: VerificationRequestRow }>('/user/verification-request', {
    method: 'POST',
    body: JSON.stringify({ ...(message?.trim() ? { message: message.trim() } : {}) }),
  })
}

export interface SavedTeamRow {
  id: number
  name: string
  team_json: TeamBuildSlot[]
  /** Saved Team Builder AI markdown analysis, if any */
  ai_analysis?: string | null
  updated_at: string
}

export async function fetchSavedTeams(): Promise<{ teams: SavedTeamRow[] }> {
  return fetchApi<{ teams: SavedTeamRow[] }>('/user/saved-teams')
}

export async function createSavedTeam(body: {
  name: string
  team: TeamBuildSlot[]
  ai_analysis?: string | null
}): Promise<{ team: SavedTeamRow }> {
  return fetchApi<{ team: SavedTeamRow }>('/user/saved-teams', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateSavedTeam(
  id: number,
  body: { name?: string; team?: TeamBuildSlot[]; ai_analysis?: string | null }
): Promise<{ team: SavedTeamRow }> {
  return fetchApi<{ team: SavedTeamRow }>(`/user/saved-teams/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteSavedTeam(id: number): Promise<{ ok: boolean }> {
  return fetchApi<{ ok: boolean }>(`/user/saved-teams/${id}`, {
    method: 'DELETE',
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
  cobbledollarsReward?: {
    amount: number
    newBalance: number | null
  }
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
    headers: clientLocaleViHeaders(),
  })
}

export async function claimGachaPull(pullId: number): Promise<{ ok: boolean; message?: string }> {
  return fetchApi<{ ok: boolean; message?: string }>(`/gacha/pulls/${pullId}/claim`, {
    method: 'POST',
    body: JSON.stringify({}),
    headers: clientLocaleViHeaders(),
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
  tier?: string
  updatedAt?: string
}

export async function fetchUserPvpRank(): Promise<UserPvpRank> {
  return fetchApi<UserPvpRank>('/user/pvp-rank')
}

export async function summarizeBattleReplayAi(replay: BattleReplayPayload): Promise<{ summary: string }> {
  return fetchApi<{ summary: string }>('/user/ranked-replay/ai-summary', {
    method: 'POST',
    body: JSON.stringify({ replay }),
  })
}

export async function fetchUserRankedHistory(params?: { limit?: number }): Promise<{
  matchResults: MatchResultPayload[]
  battleReplays: BattleReplayPayload[]
}> {
  const sp = new URLSearchParams()
  if (params?.limit != null) sp.set('limit', String(params.limit))
  const q = sp.toString()
  return fetchApi<{ matchResults: MatchResultPayload[]; battleReplays: BattleReplayPayload[] }>(
    `/user/ranked-history${q ? `?${q}` : ''}`
  )
}

export interface TournamentPredictionParticipant {
  id: number
  seedRank: number
  displayName: string
}

export interface TournamentPredictionEntry {
  id: number
  stake_champion: number
  pick_champion_participant_id: number | null
  stake_runner_up: number
  pick_runner_up_participant_id: number | null
  result_champion: string
  result_runner_up: string
  payout_champion: number | null
  payout_runner_up: number | null
  resolved_at: string | null
}

export interface TournamentPredictionStatus {
  active: boolean
  windowOpen?: boolean
  tournament?: { id: number; slug: string; title: string; subtitle?: string | null } | null
  predictionsLockedAt?: string | null
  maxStake?: number
  minStake?: number
  championWinMultiplier?: number
  runnerUpWinMultiplier?: number
  participants?: TournamentPredictionParticipant[]
  resultsReady?: boolean
  championParticipantId?: number | null
  runnerUpParticipantId?: number | null
  entry?: TournamentPredictionEntry | null
}

export interface TournamentPredictionHistoryRow {
  id: number
  tournamentId: number
  tournamentTitle: string
  tournamentSlug: string
  isCurrentEvent: boolean
  stakeChampion: number
  pickChampionLabel: string | null
  resultChampion: string
  payoutChampion: number | null
  stakeRunnerUp: number
  pickRunnerUpLabel: string | null
  resultRunnerUp: string
  payoutRunnerUp: number | null
  totalStake: number
  createdAt: string
  resolvedAt: string | null
}

export async function fetchTournamentPrediction(): Promise<TournamentPredictionStatus> {
  return fetchApi<TournamentPredictionStatus>('/user/tournament-prediction')
}

export async function fetchTournamentPredictionHistory(): Promise<{
  history: TournamentPredictionHistoryRow[]
}> {
  return fetchApi<{ history: TournamentPredictionHistoryRow[] }>('/user/tournament-prediction/history')
}

export interface TournamentPredictionBetEntry {
  id: number
  userId: number
  username: string
  stakeChampion: number
  pickChampionParticipantId: number | null
  pickChampionLabel: string | null
  resultChampion: string
  payoutChampion: number | null
  stakeRunnerUp: number
  pickRunnerUpParticipantId: number | null
  pickRunnerUpLabel: string | null
  resultRunnerUp: string
  payoutRunnerUp: number | null
  totalStake: number
  createdAt: string
  resolvedAt: string | null
}

export interface TournamentPredictionPickSummary {
  participantId: number
  displayName: string
  seedRank: number
  totalStake: number
  betCount: number
}

export interface TournamentPredictionBetsSummary {
  champion: TournamentPredictionPickSummary[]
  runnerUp: TournamentPredictionPickSummary[]
  totalEntries: number
  totalStaked: number
}

export async function fetchTournamentPredictionLedger(): Promise<{
  active: boolean
  tournament: { id: number; slug: string; title: string } | null
  entries: TournamentPredictionBetEntry[]
  summary: TournamentPredictionBetsSummary | null
}> {
  return fetchApi<{
    active: boolean
    tournament: { id: number; slug: string; title: string } | null
    entries: TournamentPredictionBetEntry[]
    summary: TournamentPredictionBetsSummary | null
  }>('/user/tournament-prediction/ledger', { skipAuth: true })
}

export async function submitTournamentPrediction(body: {
  pickChampionParticipantId: number
  stakeChampion: number
  pickRunnerUpParticipantId: number
  stakeRunnerUp: number
}): Promise<{ ok: boolean; newBalance: number; tournamentId: number }> {
  return fetchApi<{ ok: boolean; newBalance: number; tournamentId: number }>(
    '/user/tournament-prediction',
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  )
}

/** Move website Cobble$ (user_currency cobbledollars) into the Minecraft server via RCON. */
export async function depositCobbledollars(amount: number): Promise<{ newBalance: number }> {
  return fetchApi<{ newBalance: number }>('/user/cobbledollars/deposit', {
    method: 'POST',
    body: JSON.stringify({ amount }),
  })
}

/** Transfer website Cobble$ to another website account username. */
export async function transferCobbledollars(
  toUsername: string,
  amount: number
): Promise<{ ok: boolean; toUsername: string; amount: number; newBalance: number }> {
  return fetchApi<{ ok: boolean; toUsername: string; amount: number; newBalance: number }>(
    '/user/cobbledollars/transfer',
    {
      method: 'POST',
      body: JSON.stringify({ toUsername, amount }),
    }
  )
}

export interface CobbledollarLedgerRow {
  id: number
  delta: number
  balance_after: number
  kind: string
  detail: string | null
  created_at: string
}

/** Last website Cobble$ movements (deposit, shop, rewards, etc.). */
export async function fetchCobbledollarsLedger(
  limit = 10
): Promise<{ transactions: CobbledollarLedgerRow[] }> {
  const n = typeof limit === 'number' && Number.isFinite(limit) ? Math.floor(limit) : 10
  const clamped = Math.min(Math.max(n, 1), 50)
  return fetchApi<{ transactions: CobbledollarLedgerRow[] }>(
    `/user/cobbledollars/ledger?limit=${clamped}`
  )
}

export interface TicketCurrencyLedgerRow {
  id: number
  currency_type: string
  delta: number
  balance_after: number
  kind: string
  detail: string | null
  created_at: string
}

/** Last website ticket-wallet movements (daily bonus, leaderboard, exchange, staff grants). */
export async function fetchTicketsLedger(
  limit = 10
): Promise<{ transactions: TicketCurrencyLedgerRow[] }> {
  const n = typeof limit === 'number' && Number.isFinite(limit) ? Math.floor(limit) : 10
  const clamped = Math.min(Math.max(n, 1), 50)
  return fetchApi<{ transactions: TicketCurrencyLedgerRow[] }>(
    `/user/tickets/ledger?limit=${clamped}`
  )
}

export interface DailyLoginStatus {
  date: string
  timeZone: string
  eligible: boolean
  /** Extra Cobble$ / tickets from `users.minecraft_role` (LuckPerms mirror). */
  dailyRankBonus?: {
    minecraftRole: string
    /** Flat Cobble$ added every claim (on top of streak Cobble on days 1–6). */
    flatCobbleBonusPerClaim: number
    ticketBonusPerClaim: number
    /** Total Cobble$ from this claim (streak + rank flat), or rank-only if next reward is item. */
    nextClaimCobbleTotal: number | null
  }
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
  /** Successful daily claims all-time (one per local day max). Omitted if backend is older. */
  totalClaimDays?: number
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
  dailyRankBonus?: { flatCobbleBonus: number; ticketBonus: number }
}> {
  return fetchApi<{
    ok: boolean
    date: string
    streakDay: number
    reward: string
    message: string
    dailyRankBonus?: { flatCobbleBonus: number; ticketBonus: number }
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
  /** List price before rank discount. */
  cost: number
  /** Actual Cobble$ charged for 1 unit after rank discount. */
  discountedCost: number
}

export interface BattlePassShopItem extends ShopItem {
  battlePassKind: 'premium' | 'party'
  owned: boolean
}

export async function fetchShopItems(): Promise<{
  currency: string
  shopDiscountPercent: number
  items: ShopItem[]
  battlePassItems: BattlePassShopItem[]
}> {
  return fetchApi<{
    currency: string
    shopDiscountPercent: number
    items: ShopItem[]
    battlePassItems: BattlePassShopItem[]
  }>('/shop/items')
}

export async function buyShopItem(itemKey: string, quantity = 1): Promise<{
  ok: boolean
  itemKey: string
  quantityPurchased: number
  totalCost: number
  shopDiscountPercent: number
  newBalance: number
  newInventoryQuantity?: number
  battlePassKind?: 'premium' | 'party'
  dbPersisted?: boolean
}> {
  return fetchApi<{
    ok: boolean
    itemKey: string
    quantityPurchased: number
    totalCost: number
    shopDiscountPercent: number
    newBalance: number
    newInventoryQuantity?: number
    battlePassKind?: 'premium' | 'party'
    dbPersisted?: boolean
  }>('/shop/buy', {
    method: 'POST',
    body: JSON.stringify({ itemKey, quantity }),
    headers: clientLocaleViHeaders(),
  })
}

export type RoleWebsitePerks = {
  shopDiscountPercent: number
  dailyFlatCobble: number
  dailyTickets: number
}

export type RoleCatalogEntry = {
  key: string
  label: string
  cost?: number
  purchasable: boolean
  perks: RoleWebsitePerks
}

export async function fetchRoleCatalog(): Promise<{
  currency: string
  defaultRole: string
  memberPerks: RoleWebsitePerks
  purchasable: RoleCatalogEntry[]
  grantOnly: RoleCatalogEntry[]
}> {
  return fetchApi<{
    currency: string
    defaultRole: string
    memberPerks: RoleWebsitePerks
    purchasable: RoleCatalogEntry[]
    grantOnly: RoleCatalogEntry[]
  }>('/roles/catalog')
}

export async function buyRank(roleKey: string): Promise<{
  ok: boolean
  roleKey: string
  cost: number
  newBalance: number
}> {
  return fetchApi<{ ok: boolean; roleKey: string; cost: number; newBalance: number }>('/roles/buy', {
    method: 'POST',
    body: JSON.stringify({ roleKey }),
    headers: clientLocaleViHeaders(),
  })
}

export type RoleGrantRequestRow = {
  id: number
  requested_role: string
  message: string | null
  status: string
  created_at: string
  resolved_at: string | null
  admin_note: string | null
}

export async function fetchRoleRequestStatus(): Promise<{
  currentRole: string
  pending: RoleGrantRequestRow | null
  lastResolved: RoleGrantRequestRow | null
  grantOnlyRoleKeys: string[]
}> {
  return fetchApi<{
    currentRole: string
    pending: RoleGrantRequestRow | null
    lastResolved: RoleGrantRequestRow | null
    grantOnlyRoleKeys: string[]
  }>('/user/role-request')
}

export async function submitRoleGrantRequest(
  requestedRole: string,
  message?: string
): Promise<{ request: RoleGrantRequestRow }> {
  return fetchApi<{ request: RoleGrantRequestRow }>('/user/role-request', {
    method: 'POST',
    body: JSON.stringify({
      requestedRole,
      ...(message?.trim() ? { message: message.trim() } : {}),
    }),
  })
}

export interface PokemonShopOffer {
  slot: number
  category: string
  species: string
  shiny: boolean
  /** Catalog price before rank discount. */
  listPrice: number
  /** Cobble$ charged after rank discount. */
  price: number
  label: string
  /** Any user bought this slot for the current window (global stock = 1). */
  soldOut: boolean
  /** This account bought this slot in the current window. */
  purchasedByYou: boolean
  /** Your purchase for this slot is claimed in-game (only if purchasedByYou). */
  claimed: boolean
}

export interface PokemonShopOffersResponse {
  refreshHours: number
  shopDiscountPercent: number
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
  listPrice: number
  shopDiscountPercent: number
  newBalance: number
}> {
  return fetchApi<{
    ok: boolean
    slot: number
    species: string
    shiny: boolean
    price: number
    listPrice: number
    shopDiscountPercent: number
    newBalance: number
  }>('/pokemon-shop/buy', {
    method: 'POST',
    body: JSON.stringify({ slot }),
    headers: clientLocaleViHeaders(),
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
    headers: clientLocaleViHeaders(),
  })
}

// --- Tournaments (public bracket; admin lives in apps/Admin) ---

export interface PublishedTournamentSummary {
  slug: string
  title: string
  updatedAt: string
  /** Omit = treat as 12 (legacy listings). */
  bracketSize?: 8 | 12 | 16
}

export async function fetchPublishedTournaments(): Promise<{ tournaments: PublishedTournamentSummary[] }> {
  const base = API_BASE.replace(/\/$/, '')
  const res = await fetch(`${base}/tournaments`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed: ${res.status}`)
  return data as { tournaments: PublishedTournamentSummary[] }
}

export interface TournamentBracketSlot {
  kind: 'participant' | 'tbd' | 'winner_of' | 'loser_of'
  id?: number
  name?: string
  teamPreview?: { species?: string; speciesSlug?: string }[]
  matchKey?: string
}

export interface TournamentBracketMatch {
  key: string
  round: 'round_of_16' | 'qualifying' | 'quarter' | 'semi' | 'final' | 'third'
  label: string
  left: TournamentBracketSlot
  right: TournamentBracketSlot
  winnerParticipantId: number | null
  canSetWinner: boolean
}

export async function fetchPublicTournament(slug: string): Promise<{
  tournament: {
    slug: string
    title: string
    subtitle: string | null
    prizes: unknown
    updatedAt: string
    /** QF slot i faces winner of qual qfQualFeed[i] (0–3). */
    qfQualFeed?: [number, number, number, number]
    bracketSize?: 8 | 12 | 16
  }
  bracket: TournamentBracketMatch[]
}> {
  const base = API_BASE.replace(/\/$/, '')
  const res = await fetch(`${base}/tournaments/${encodeURIComponent(slug)}`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed: ${res.status}`)
  return data as Awaited<ReturnType<typeof fetchPublicTournament>>
}

export type PublicProfileAchievement = {
  id: string
  title: string
  description: string
  tier:
    | 'silver'
    | 'cyan'
    | 'emerald'
    | 'violet'
    | 'rose'
    | 'gold'
    | 'crimson'
    | 'mythic'
}

export type PublicProfile = {
  username: string
  bio: string | null
  avatarUrl: string | null
  minecraftRole: string
  memberSince: string
  achievements: PublicProfileAchievement[]
  pvp: {
    rank: number | null
    tier: string | null
    elo: number | null
    format: string | null
  }
}

export async function fetchPublicProfile(username: string): Promise<{ profile: PublicProfile }> {
  const seg = encodeURIComponent(username.trim())
  return fetchApi<{ profile: PublicProfile }>(`/public/profile/${seg}`, { skipAuth: true })
}

export async function patchMyPublicProfile(patch: {
  bio?: string | null
  avatar_url?: string | null
}): Promise<{ profile: PublicProfile }> {
  return fetchApi<{ profile: PublicProfile }>('/user/my-public-profile', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

/** Upload PNG/JPEG/WebP/GIF (max ~2 MB) to site storage; server sets profile avatar URL. */
export async function uploadProfileAvatar(file: File): Promise<{ profile: PublicProfile }> {
  const token = getToken()
  if (!token) throw new Error('Login required')
  const form = new FormData()
  form.append('avatar', file)
  const base = API_BASE.replace(/\/$/, '')
  const res = await fetch(`${base}/user/profile-avatar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `Upload failed: ${res.status}`)
  }
  return data as { profile: PublicProfile }
}

/** Server-sanitized HTML + PokéAPI slugs for tags (public GET). */
export type BattleRestrictionsDocument = {
  updated_at: string
  format_label: string
  player_restrictions_html: string
  pokemon_slugs: string[]
  pokemon_notes_html: string
  pokemon_blacklist_slugs: string[]
  pokemon_blacklist_notes_html: string
  move_slugs: string[]
  move_notes_html: string
  ability_slugs: string[]
  ability_notes_html: string
  item_slugs: string[]
  item_notes_html: string
}

export async function fetchBattleRestrictions(): Promise<BattleRestrictionsDocument> {
  return fetchApi<BattleRestrictionsDocument>('/battle-restrictions', { skipAuth: true })
}

export async function fetchTournamentParticipantTeam(
  slug: string,
  participantId: number
): Promise<{
  participant: {
    id: number
    seedRank: number
    displayName: string
    team: unknown
    pvpRank: number | null
    pvpElo: number | null
    pvpFormat: string | null
  }
}> {
  const base = API_BASE.replace(/\/$/, '')
  const res = await fetch(`${base}/tournaments/${encodeURIComponent(slug)}/participants/${participantId}`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed: ${res.status}`)
  return data as Awaited<ReturnType<typeof fetchTournamentParticipantTeam>>
}

// --- Clans ---

export interface ClanPublic {
  id: number
  name: string
  bio: string | null
  avatar_url: string
  leader_id: number
  leader_username: string
  member_count: number
  max_members: number
  bank_balance: number
  total_donated: number
  daily_income_per_day: number
  daily_income_multiplier: number
  daily_income_per_member: number
  has_daily_ticket_bonus: boolean
  daily_ticket_bonus: number
  next_member_unlock_donation: number | null
  donate_milestone: number
  multiplier_threshold_50: number
  multiplier_threshold_100: number
  created_at: string
}

export interface ClanMemberRow {
  user_id: number
  username: string
  role: string
  donated_total: number
  joined_at: string
}

export interface ClanJoinRequestRow {
  id: number
  requester_id: number
  requester_username: string
  created_at: string
}

export interface MyClanResponse {
  clan: (ClanPublic & {
    my_role: string
    my_donated_total: number
    members: ClanMemberRow[]
  }) | null
  pending_join_requests: ClanJoinRequestRow[]
  my_pending_join_requests: Array<{ id: number; clan_id: number; created_at: string }>
}

export async function fetchClans(params?: { q?: string; limit?: number }): Promise<{
  rows: ClanPublic[]
  create_cost: number
}> {
  const sp = new URLSearchParams()
  if (params?.q?.trim()) sp.set('q', params.q.trim())
  if (params?.limit) sp.set('limit', String(params.limit))
  const q = sp.toString()
  return fetchApi(`/clans${q ? `?${q}` : ''}`, { skipAuth: true })
}

export async function fetchMyClan(): Promise<MyClanResponse> {
  return fetchApi<MyClanResponse>('/clans/mine')
}

export async function createClan(form: FormData): Promise<{ ok: boolean; new_balance: number; clan: ClanPublic }> {
  const base = API_BASE.replace(/\/$/, '')
  const headers: HeadersInit = {}
  const token = getStoredToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${base}/clans/create`, { method: 'POST', headers, body: form })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string })?.error ?? `Request failed: ${res.status}`)
  return data as { ok: boolean; new_balance: number; clan: ClanPublic }
}

export async function donateToClan(
  clanId: number,
  amount: number
): Promise<{ ok: boolean; new_balance: number; clan: ClanPublic }> {
  return fetchApi(`/clans/${clanId}/donate`, {
    method: 'POST',
    body: JSON.stringify({ amount }),
  })
}

export async function requestJoinClan(clanId: number): Promise<{
  ok: boolean
  request: { id: number; clan_id: number; created_at: string }
}> {
  return fetchApi(`/clans/${clanId}/join-request`, { method: 'POST', body: '{}' })
}

export async function acceptClanJoinRequest(requestId: number): Promise<{ ok: boolean; clan_id: number }> {
  return fetchApi(`/clans/join-requests/${requestId}/accept`, { method: 'POST', body: '{}' })
}

export async function rejectClanJoinRequest(requestId: number): Promise<{ ok: boolean }> {
  return fetchApi(`/clans/join-requests/${requestId}/reject`, { method: 'POST', body: '{}' })
}

export async function disburseClanFunds(
  clanId: number,
  username: string,
  amount: number
): Promise<{ ok: boolean; bank_balance: number }> {
  return fetchApi(`/clans/${clanId}/disburse`, {
    method: 'POST',
    body: JSON.stringify({ username, amount }),
  })
}

export async function leaveClan(): Promise<{ ok: boolean }> {
  return fetchApi('/clans/leave', { method: 'POST', body: '{}' })
}
