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
  let res: Response
  try {
    res = await fetch(`${API_BASE.replace(/\/$/, '')}${path}`, { ...init, headers })
  } catch {
    throw new Error(
      `Cannot reach the API at ${API_BASE.replace(/\/$/, '')}. Check that the backend is running (local: port 3001) or VITE_API_URL / Cloudflare BACKEND_URL is set correctly.`
    )
  }
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
  reward: { id: number; reward_type: string; label?: string }
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
  rewardLabel?: string
  pulledAt: string
  /** Set when claimed in-game or marked fulfilled by admin */
  fulfilledAt?: string | null
  /** Server says this row can use Claim (RCON give item/pokemon + not fulfilled) */
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

/** Move website Asteryn Point (user_currency asterynpoints) into the Minecraft server via RCON. */
export async function depositCobbledollars(amount: number): Promise<{ newBalance: number }> {
  return fetchApi<{ newBalance: number }>('/user/asterynpoints/deposit', {
    method: 'POST',
    body: JSON.stringify({ amount }),
  })
}

/** Transfer website Asteryn Point to another website account username. */
export async function transferCobbledollars(
  toUsername: string,
  amount: number
): Promise<{ ok: boolean; toUsername: string; amount: number; newBalance: number }> {
  return fetchApi<{ ok: boolean; toUsername: string; amount: number; newBalance: number }>(
    '/user/asterynpoints/transfer',
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

/** Last website Asteryn Point movements (deposit, shop, rewards, etc.). */
export async function fetchCobbledollarsLedger(
  limit = 10
): Promise<{ transactions: CobbledollarLedgerRow[] }> {
  const n = typeof limit === 'number' && Number.isFinite(limit) ? Math.floor(limit) : 10
  const clamped = Math.min(Math.max(n, 1), 50)
  return fetchApi<{ transactions: CobbledollarLedgerRow[] }>(
    `/user/asterynpoints/ledger?limit=${clamped}`
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
  /** VIP Point (+1 if VIP+) + rank tickets (1–5) + rank/VIP items for daily claim. */
  dailyRankBonus?: {
    minecraftRole: string
    vipTier?: string
    flatCobbleBonusPerClaim: number
    ticketBonusPerClaim: number
    nextClaimCobbleTotal: number | null
    items?: { key: string; amount: number; label: string }[]
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
  clanXp?: {
    granted: number
    totalXp: number
    level: number
    xpInLevel: number
    xpPerLevel: number
    streakDay: number
  }
}> {
  return fetchApi<{
    ok: boolean
    date: string
    streakDay: number
    reward: string
    message: string
    dailyRankBonus?: { flatCobbleBonus: number; ticketBonus: number }
    clanXp?: {
      granted: number
      totalXp: number
      level: number
      xpInLevel: number
      xpPerLevel: number
      streakDay: number
    }
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
  shopEventDiscountPercent: number
  items: ShopItem[]
  battlePassItems: BattlePassShopItem[]
}> {
  return fetchApi<{
    currency: string
    shopDiscountPercent: number
    shopEventDiscountPercent: number
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
  dailyItems?: { key: string; amount: number; label: string }[]
}

export type RoleCatalogEntry = {
  key: string
  label: string
  /** Sale price (after event discount when active). */
  cost?: number
  /** List price before event discount. */
  listCost?: number | null
  purchasable: boolean
  perks: RoleWebsitePerks
  /** User already owns this rank (bought / claimed / granted). */
  owned?: boolean
  /** This is the only rank the user can buy next. */
  canBuyNow?: boolean
  /** Cannot buy yet — must upgrade previous tiers first. */
  locked?: boolean
  /** Human-readable profile badge requirement, if any (VIP). */
  badgeRequirementLabel?: string | null
  /** User meets badge requirements (VIP). */
  meetsBadgeRequirement?: boolean
  /** No Asteryn Point cost — free claim on the shop ladder. */
  freeRank?: boolean
  /** Currently active in-game display rank. */
  active?: boolean
  /** User can switch this owned rank as the in-game display. */
  canActivate?: boolean
}

export type VipCatalogEntry = {
  key: string
  label: string
  owned: boolean
  canClaimNow: boolean
  locked: boolean
  badgeRequirementLabel: string | null
  meetsBadgeRequirement: boolean
  canActivate: boolean
  active: boolean
  perks?: RoleWebsitePerks
}

export type OwnedRoleInventoryEntry = {
  key: string
  kind: 'shop' | 'vip' | 'grant' | 'other'
  active: boolean
}

export async function fetchRoleCatalog(): Promise<{
  currency: string
  shopEventDiscountPercent: number
  currentRole: string
  activeDisplayRole: string
  highestShopRank: string
  shopProgressRoleKey: string
  highestVip: string
  nextPurchasableRoleKey: string | null
  ownedRoles: string[]
  ownedInventory: OwnedRoleInventoryEntry[]
  websiteVipTier: string
  nextVipClaimKey: string | null
  mythicBadgeCount: number
  goldBadgeCount: number
  legendBadgeCount: number
  profileBadgeCounts: { mythic: number; gold: number; legend: number }
  purchasableTierOrder: string[]
  vipTierOrder: string[]
  defaultRole: string
  memberPerks: RoleWebsitePerks
  purchasable: RoleCatalogEntry[]
  grantOnly: RoleCatalogEntry[]
  vip: VipCatalogEntry[]
}> {
  return fetchApi('/roles/catalog')
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

export async function activateOwnedRank(roleKey: string): Promise<{
  ok: boolean
  roleKey: string
  alreadyActive?: boolean
  lpGroup?: string
}> {
  return fetchApi('/roles/activate', {
    method: 'POST',
    body: JSON.stringify({ roleKey }),
    headers: clientLocaleViHeaders(),
  })
}

export async function claimVipTier(tierKey: string): Promise<{
  ok: boolean
  tierKey: string
  websiteVipTier: string
}> {
  return fetchApi('/roles/vip/claim', {
    method: 'POST',
    body: JSON.stringify({ tierKey }),
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
  shopEventDiscountPercent: number
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
    | 'mythic'
    | 'legend'
}

export type PublicProfileClan = {
  id: number
  name: string
  avatarUrl: string
  level: number
  role: 'leader' | 'member'
  memberCount: number
  maxMembers: number
  leaderboardRanks: {
    top_treasury: number | null
    top_total_elo: number | null
    top_level: number | null
  }
}

export type PublicProfile = {
  username: string
  bio: string | null
  avatarUrl: string | null
  minecraftRole: string
  memberSince: string
  achievements: PublicProfileAchievement[]
  clan: PublicProfileClan | null
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
  total_elo: number | null
  xp: number
  level: number
  xp_in_level: number
  xp_per_level: number
  daily_income_per_day: number
  daily_income_multiplier: number
  daily_income_per_member: number
  has_daily_ticket_bonus: boolean
  daily_ticket_bonus: number
  next_member_unlock_treasury: number | null
  treasury_milestone: number
  treasury_milestones: {
    key: string
    threshold: number
    label: string
    kind: 'income' | 'tickets'
  }[]
  /** Treasury bonus for holding #1 on a leaderboard category (per category, daily). */
  leaderboard_daily_reward_top1: number
  /** Treasury bonus for holding #2 on a leaderboard category (per category, daily). */
  leaderboard_daily_reward_top2: number
  /** Max Cobble$ leaders can pay out from treasury per calendar day (Asia/Ho_Chi_Minh). */
  treasury_daily_disburse_max?: number
  /** Cobble$ already paid out from treasury today (leader view). */
  treasury_daily_disbursed_today?: number
  /** Cobble$ still available for treasury payouts today (leader view). */
  treasury_daily_disburse_remaining?: number
  created_at: string
}

export interface ClanMemberRow {
  user_id: number
  username: string
  role: string
  donated_total: number
  joined_at: string
  /** Highest singles/doubles ELO from live ladder; null if unranked (0 matches). */
  elo: number | null
}

export interface ClanLeaderboardEntry {
  rank: number
  id: number
  name: string
  avatar_url: string
  leader_username: string
  member_count: number
  bank_balance: number
  total_elo: number | null
  xp: number
  level: number
}

export interface ClanJoinRequestRow {
  id: number
  requester_id: number
  requester_username: string
  created_at: string
}

export interface ClanLeaderboardRewardsMeta {
  top1_per_category: number
  top2_per_category: number
  categories: { key: 'top_treasury' | 'top_average_elo' | 'top_level'; label: string }[]
  timezone: string
  schedule: string
}

export interface ClanLeaderboardPayoutRow {
  payout_date: string
  category: 'top_treasury' | 'top_average_elo' | 'top_level'
  amount: number
  paid_at: string
  rank_position?: number
}

export interface ClanDonationRow {
  id: number
  user_id: number
  username: string
  amount: number
  created_at: string
}

export interface ClanDisbursementRow {
  id: number
  leader_id: number
  leader_username: string
  recipient_id: number
  recipient_username: string
  amount: number
  created_at: string
}

export interface MyClanResponse {
  clan: (ClanPublic & {
    my_role: string
    my_donated_total: number
    members: ClanMemberRow[]
    leaderboard_ranks: {
      top_treasury: number | null
      top_total_elo: number | null
      top_level: number | null
    }
    /** Extra daily treasury from leaderboard placement (#1 and #2 on each category). */
    leaderboard_daily_treasury_bonus: number
    recent_leaderboard_payouts: ClanLeaderboardPayoutRow[]
    recent_donations: ClanDonationRow[]
    recent_disbursements: ClanDisbursementRow[]
  }) | null
  pending_join_requests: ClanJoinRequestRow[]
  my_pending_join_requests: Array<{ id: number; clan_id: number; created_at: string }>
  /** ISO timestamp when user can request to join another clan after leaving. */
  rejoin_available_at: string | null
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

export async function fetchClanLeaderboards(params?: { limit?: number }): Promise<{
  top_treasury: ClanLeaderboardEntry[]
  top_total_elo: ClanLeaderboardEntry[]
  top_level: ClanLeaderboardEntry[]
  rewards?: ClanLeaderboardRewardsMeta
}> {
  const sp = new URLSearchParams()
  if (params?.limit) sp.set('limit', String(params.limit))
  const q = sp.toString()
  return fetchApi<{ top_treasury: ClanLeaderboardEntry[]; top_total_elo: ClanLeaderboardEntry[]; top_level: ClanLeaderboardEntry[]; rewards?: ClanLeaderboardRewardsMeta }>(
    `/clans/leaderboards${q ? `?${q}` : ''}`,
    { skipAuth: true }
  )
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

export async function updateClan(
  clanId: number,
  form: FormData
): Promise<{ ok: boolean; clan: NonNullable<MyClanResponse['clan']> }> {
  const base = API_BASE.replace(/\/$/, '')
  const headers: HeadersInit = {}
  const token = getStoredToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${base}/clans/${clanId}`, { method: 'PATCH', headers, body: form })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string })?.error ?? `Request failed: ${res.status}`)
  return data as { ok: boolean; clan: NonNullable<MyClanResponse['clan']> }
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

export async function leaveClan(): Promise<{ ok: boolean; rejoin_available_at?: string }> {
  return fetchApi<{ ok: boolean; rejoin_available_at?: string }>('/clans/leave', { method: 'POST', body: '{}' })
}

export async function disbandClan(): Promise<{ ok: boolean }> {
  return fetchApi<{ ok: boolean }>('/clans/disband', { method: 'POST', body: '{}' })
}

export async function kickClanMember(
  clanId: number,
  username: string
): Promise<{ ok: boolean; kicked_username: string }> {
  return fetchApi(`/clans/${clanId}/kick`, {
    method: 'POST',
    body: JSON.stringify({ username }),
  })
}

export async function transferClanLeadership(
  clanId: number,
  username: string
): Promise<{ ok: boolean; new_leader_username: string; new_leader_id: number }> {
  return fetchApi(`/clans/${clanId}/transfer-leader`, {
    method: 'POST',
    body: JSON.stringify({ username }),
  })
}
