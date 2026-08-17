import type { BattleReplayPayload, MatchResultPayload } from './types'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

export interface AuthUser {
  id: number
  email: string
  username: string
  is_admin: boolean
  /** LuckPerms group mirrored from backend (badge in UI). */
  minecraft_role?: string
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

export async function fetchMe(): Promise<{ user: AuthUser; token?: string }> {
  return fetchJson<{ user: AuthUser; token?: string }>('/auth/me')
}

export interface LeaderboardDisplaySettings {
  hideZeroMatchPlayers: {
    singles: boolean
    doubles: boolean
  }
}

export async function adminFetchLeaderboardDisplaySettings(): Promise<LeaderboardDisplaySettings> {
  return fetchJson<LeaderboardDisplaySettings>('/admin/leaderboard/display-settings')
}

export async function adminUpdateLeaderboardDisplaySettings(
  body: LeaderboardDisplaySettings
): Promise<LeaderboardDisplaySettings> {
  return fetchJson<LeaderboardDisplaySettings>('/admin/leaderboard/display-settings', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

// Admin APIs (require admin token)
export interface AdminUser {
  id: number
  email: string
  username: string
  is_admin: boolean
  created_at: string
  /** Set when staff verified this account was online on the Minecraft server (username = IGN). */
  minecraft_verified_at?: string | null
  /** LuckPerms primary group mirrored on the site. */
  minecraft_role?: string | null
  /** Official Minecraft (`premium`) or cracked launcher (`crack`). */
  minecraft_client?: 'premium' | 'crack' | null
}

export async function fetchAdminUsers(q?: string): Promise<{ users: AdminUser[] }> {
  const qs = typeof q === 'string' && q.length > 0 ? `?q=${encodeURIComponent(q)}` : ''
  return fetchJson<{ users: AdminUser[] }>(`/admin/users${qs}`)
}

export async function patchAdminUser(
  userId: number,
  body: {
    email?: string
    username?: string
    is_admin?: boolean
    minecraft_client?: 'premium' | 'crack' | null
  }
): Promise<{ user: AdminUser }> {
  return fetchJson<{ user: AdminUser }>(`/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function verifyUserIngame(userId: number): Promise<{ user: AdminUser }> {
  return fetchJson<{ user: AdminUser }>(`/admin/users/${userId}/verify-ingame`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function revokeUserIngameVerification(userId: number): Promise<{ user: AdminUser }> {
  return fetchJson<{ user: AdminUser }>(`/admin/users/${userId}/revoke-ingame-verification`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function fetchAdminMinecraftRoles(): Promise<{ keys: string[] }> {
  return fetchJson<{ keys: string[] }>('/admin/minecraft-roles')
}

export async function fetchAdminUserOwnedRoles(userId: number): Promise<{
  ownedRoles: string[]
  ownedInventory: { key: string; kind: string; active: boolean }[]
  activeDisplayRole: string
  highestShopRank: string
  highestVip: string
}> {
  return fetchJson(`/admin/users/${userId}/owned-roles`)
}

/** Grant rank/VIP into the player's inventory (does not change in-game display). */
export async function grantAdminUserMinecraftRole(
  userId: number,
  roleKey: string
): Promise<{
  user: AdminUser
  grantedRoleKey: string
  ownedRoles: string[]
  ownedInventory: { key: string; kind: string; active: boolean }[]
  activeDisplayRole: string
  highestShopRank: string
  highestVip: string
}> {
  return fetchJson(`/admin/users/${userId}/minecraft-role`, {
    method: 'POST',
    body: JSON.stringify({ roleKey }),
  })
}

export async function removeAdminUserOwnedRole(
  userId: number,
  roleKey: string
): Promise<{
  ok: boolean
  removedRoleKey: string
  ownedRoles: string[]
  ownedInventory: { key: string; kind: string; active: boolean }[]
  activeDisplayRole: string
  highestShopRank: string
  highestVip: string
}> {
  return fetchJson(`/admin/users/${userId}/owned-roles/${encodeURIComponent(roleKey)}`, {
    method: 'DELETE',
  })
}

export async function adminResetUserPassword(userId: number, newPassword: string): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/admin/users/${userId}/password`, {
    method: 'POST',
    body: JSON.stringify({ new_password: newPassword }),
  })
}

export async function deleteAdminUser(userId: number): Promise<{ ok: boolean; id: number }> {
  return fetchJson<{ ok: boolean; id: number }>(`/admin/users/${userId}`, {
    method: 'DELETE',
  })
}

export type AdminVerificationRequest = {
  id: number
  user_id: number
  message: string | null
  status: string
  created_at: string
  resolved_at: string | null
  resolved_by_user_id: number | null
  admin_note: string | null
  user_email: string | null
  user_username: string | null
  user_minecraft_verified_at: string | null
}

export async function fetchAdminVerificationRequests(params?: {
  status?: 'pending' | 'approved' | 'rejected' | 'all'
}): Promise<{ requests: AdminVerificationRequest[] }> {
  const sp = new URLSearchParams()
  if (params?.status) sp.set('status', params.status)
  const q = sp.toString()
  return fetchJson<{ requests: AdminVerificationRequest[] }>(
    `/admin/verification-requests${q ? `?${q}` : ''}`
  )
}

export async function approveVerificationRequest(id: number): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/admin/verification-requests/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function rejectVerificationRequest(
  id: number,
  adminNote?: string
): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/admin/verification-requests/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ ...(adminNote?.trim() ? { admin_note: adminNote.trim() } : {}) }),
  })
}

export type AdminRoleGrantRequest = {
  id: number
  user_id: number
  requested_role: string
  message: string | null
  status: string
  created_at: string
  resolved_at: string | null
  resolved_by_user_id: number | null
  admin_note: string | null
  user_email: string | null
  user_username: string | null
  user_minecraft_role: string | null
}

export async function fetchAdminRoleRequests(params?: {
  status?: 'pending' | 'approved' | 'rejected' | 'all'
}): Promise<{ requests: AdminRoleGrantRequest[] }> {
  const sp = new URLSearchParams()
  if (params?.status) sp.set('status', params.status)
  const q = sp.toString()
  return fetchJson<{ requests: AdminRoleGrantRequest[] }>(`/admin/role-requests${q ? `?${q}` : ''}`)
}

export async function approveRoleRequest(id: number): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/admin/role-requests/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function rejectRoleRequest(id: number, adminNote?: string): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/admin/role-requests/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ ...(adminNote?.trim() ? { admin_note: adminNote.trim() } : {}) }),
  })
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

export type BulkCobbleGrantResult = {
  ok: boolean
  currency: string
  amount_per_user: number
  granted: number
  requested: number
  failures: Array<{ user_id: number; error: string }>
}

export async function bulkGrantCobbledollars(body: {
  user_ids: number[]
  amount: number
  note?: string
}): Promise<BulkCobbleGrantResult> {
  return fetchJson<BulkCobbleGrantResult>('/admin/cobbledollars/bulk-grant', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export type BulkTicketGrantResult = {
  ok: boolean
  currency_type: string
  amount_per_user: number
  granted: number
  requested: number
  failures: Array<{ user_id: number; error: string }>
}

export async function bulkGrantTickets(body: {
  user_ids: number[]
  currency_type: string
  amount: number
  note?: string
}): Promise<BulkTicketGrantResult> {
  return fetchJson<BulkTicketGrantResult>('/admin/tickets/bulk-grant', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export type GrantableInventoryItem = { key: string; label: string }

export async function fetchGrantableInventoryItems(): Promise<{ items: GrantableInventoryItem[] }> {
  return fetchJson<{ items: GrantableInventoryItem[] }>('/admin/inventory/grantable-items')
}

export type BulkInventoryGrantResult = {
  ok: boolean
  item_key: string
  label: string
  amount_per_user: number
  granted: number
  requested: number
  failures: Array<{ user_id: number; error: string }>
}

export async function bulkGrantInventory(body: {
  user_ids: number[]
  item_key: string
  amount: number
  note?: string
}): Promise<BulkInventoryGrantResult> {
  return fetchJson<BulkInventoryGrantResult>('/admin/inventory/bulk-grant', {
    method: 'POST',
    body: JSON.stringify(body),
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

export async function deleteAllAdminUserGachaHistory(
  userId: number
): Promise<{ ok: boolean; deleted: number }> {
  return fetchJson<{ ok: boolean; deleted: number }>(`/admin/users/${userId}/history`, {
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
    /** Distinct UTC days seen online at least once (lifetime; from admin dashboard sync). */
    totalUtcDaysSeen?: number
    /** Successful daily claim count (lifetime), from user_daily_login_claims. */
    totalClaimDays?: number
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

export type AsterynPointMigrateMatch = {
  ign: string
  amount: number
  userId: number
  websiteName: string
  walletAfter?: number
}

export type AsterynPointMigratePlan = {
  ok: boolean
  applied: boolean
  boardCount: number
  totalCredit: number
  matched: AsterynPointMigrateMatch[]
  unmatched: { ign: string; amount: number }[]
  leaderboardError: string | null
  bankCleared?: boolean
  bankClearOutput?: string | null
  bankClearError?: string | null
}

export async function previewAsterynPointMigrate(): Promise<AsterynPointMigratePlan> {
  return fetchJson('/admin/minecraft/asterynpoint/migrate')
}

export async function applyAsterynPointMigrate(): Promise<AsterynPointMigratePlan> {
  return fetchJson('/admin/minecraft/asterynpoint/migrate', {
    method: 'POST',
    body: JSON.stringify({ apply: true }),
  })
}

export async function refreshAdminPokemonShop(): Promise<{
  ok: boolean
  windowStart: string
  windowEnd: string
  refreshHours: number
  offers: { slot: number; category: string; species: string; shiny: boolean; listPrice: number; label: string }[]
}> {
  return fetchJson('/admin/pokemon-shop/refresh', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

// --- Tournaments (admin API; public bracket lives on the main site) ---

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

export async function adminParsePokepaste(raw: string): Promise<{ team: unknown[]; count: number }> {
  return fetchJson<{ team: unknown[]; count: number }>('/admin/tournaments/parse-pokepaste', {
    method: 'POST',
    body: JSON.stringify({ raw }),
  })
}

export async function adminListTournaments(): Promise<{ tournaments: unknown[] }> {
  return fetchJson<{ tournaments: unknown[] }>('/admin/tournaments')
}

export async function adminCreateTournament(body: {
  slug: string
  title: string
  subtitle?: string
  prizes?: unknown[]
  is_published?: boolean
  /** 12 = qualifiers + QF; 8 = start at quarter-finals only. */
  bracket_size?: 8 | 12 | 16
}): Promise<{ tournament: unknown }> {
  return fetchJson<{ tournament: unknown }>('/admin/tournaments', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function adminPatchTournament(
  id: number,
  body: {
    title?: string
    slug?: string
    subtitle?: string
    prizes?: unknown[]
    is_published?: boolean
    /** Length 4, permutation of 0–3: QF slot i gets winner of qual-(value). */
    qf_qual_feed?: number[]
    bracket_size?: 8 | 12 | 16
  }
): Promise<{ tournament: unknown }> {
  return fetchJson<{ tournament: unknown }>(`/admin/tournaments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function adminUpsertParticipant(
  tournamentId: number,
  seedRank: number,
  body: { display_name: string; pokepaste_raw: string }
): Promise<{ participant: unknown }> {
  return fetchJson<{ participant: unknown }>(`/admin/tournaments/${tournamentId}/participants/${seedRank}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export async function adminFetchBracket(tournamentId: number): Promise<{
  tournament: unknown
  participants: unknown[]
  bracket: TournamentBracketMatch[]
}> {
  return fetchJson(`/admin/tournaments/${tournamentId}/bracket`)
}

export async function adminSetMatchWinner(
  tournamentId: number,
  matchKey: string,
  winnerParticipantId: number
): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(
    `/admin/tournaments/${tournamentId}/matches/${encodeURIComponent(matchKey)}/winner`,
    {
      method: 'PUT',
      body: JSON.stringify({ winner_participant_id: winnerParticipantId }),
    }
  )
}

export interface AdminTournamentPredictionSettings {
  tournamentId: number | null
  predictionsLockedAt: string | null
  maxStake: number
  minStake: number
  championWinMultiplier: number
  runnerUpWinMultiplier: number
}

export async function adminFetchTournamentPredictionSettings(): Promise<{
  settings: AdminTournamentPredictionSettings | null
  tournament: { id: number; slug: string; title: string } | null
  tournaments: { id: number; slug: string; title: string; is_published?: boolean }[]
}> {
  return fetchJson('/admin/tournament-prediction/settings')
}

export interface AdminTournamentPredictionBetEntry {
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

export interface AdminTournamentPredictionPickSummary {
  participantId: number
  displayName: string
  seedRank: number
  totalStake: number
  betCount: number
}

export async function adminFetchTournamentPredictionBets(tournamentId: number): Promise<{
  tournament: { id: number; slug: string; title: string }
  entries: AdminTournamentPredictionBetEntry[]
  summary: {
    champion: AdminTournamentPredictionPickSummary[]
    runnerUp: AdminTournamentPredictionPickSummary[]
    totalEntries: number
    totalStaked: number
  }
}> {
  return fetchJson(
    `/admin/tournament-prediction/bets?tournamentId=${encodeURIComponent(String(tournamentId))}`
  )
}

export async function adminUpdateTournamentPredictionSettings(body: {
  tournamentId: number | null
  predictionsLockedAt?: string | null
  maxStake: number
  minStake?: number
  championWinMultiplier?: number
  runnerUpWinMultiplier?: number
}): Promise<{ ok: boolean }> {
  return fetchJson('/admin/tournament-prediction/settings', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export async function adminClearMatchWinner(tournamentId: number, matchKey: string): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(
    `/admin/tournaments/${tournamentId}/matches/${encodeURIComponent(matchKey)}/winner`,
    { method: 'DELETE' }
  )
}

export type CobbleRankedFeedEnvelope<T> = {
  key: string
  needsAttention: boolean
  attentionReasons: string[]
  item: T
}

export async function fetchAdminCobbleRankedFeed(params?: { limit?: number }): Promise<{
  matches: CobbleRankedFeedEnvelope<MatchResultPayload>[]
  replays: CobbleRankedFeedEnvelope<BattleReplayPayload>[]
  reviewedKeys: string[]
}> {
  const sp = new URLSearchParams()
  if (params?.limit != null) sp.set('limit', String(params.limit))
  const q = sp.toString()
  return fetchJson(`/admin/cobble-ranked/feed${q ? `?${q}` : ''}`)
}

export async function deleteAllAdminCobbleRankedFeed(): Promise<{
  ok: boolean
  matchCount: number
  replayCount: number
}> {
  return fetchJson(`/admin/cobble-ranked/feed`, { method: 'DELETE' })
}

export async function setAdminCobbleRankedReview(body: {
  item_key: string
  feed_kind: 'match_result' | 'battle_replay'
  reviewed: boolean
}): Promise<{ ok: boolean; item_key: string; reviewed: boolean }> {
  return fetchJson(`/admin/cobble-ranked/review`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function setAdminCobbleRankedReviewBundle(body: {
  reviewed: boolean
  entries: { item_key: string; feed_kind: 'match_result' | 'battle_replay' }[]
}): Promise<{ ok: boolean; reviewed: boolean; count: number }> {
  return fetchJson(`/admin/cobble-ranked/review-bundle`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function adminSummarizeBattleReplay(replay: BattleReplayPayload): Promise<{ summary: string }> {
  return fetchJson<{ summary: string }>('/admin/ranked-replay/ai-summary', {
    method: 'POST',
    body: JSON.stringify({ replay }),
  })
}

export async function adminMinecraftRankedadminElo(body: {
  action: 'add' | 'remove'
  amount: number
  minecraft_username: string
  format: 'singles' | 'doubles'
  /** Shown in staff history and Discord (successful changes). */
  reason: string
  /** Website user whose username matches IGN (sent when using account search in admin). */
  user_id?: number
}): Promise<{ ok: boolean; error?: string }> {
  return fetchJson(`/admin/minecraft/rankedadmin-elo`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** Battle Tower / SBF mod admin RCON (`sbf admin …`). */
export async function adminMinecraftFacilityAdmin(
  body:
    | { action: 'force_win'; minecraft_username: string }
    | {
        action: 'set_stage'
        minecraft_username: string
        stage: number
        mode: 'tower' | 'classic'
      }
): Promise<{ ok: boolean; error?: string; command?: string; output?: string }> {
  return fetchJson(`/admin/minecraft/facility-admin`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function adminMinecraftNightMarket(
  body:
    | { action: 'open'; minutes: number; location?: string }
    | { action: 'close'; location?: string }
): Promise<{
  ok: boolean
  error?: string
  command?: string
  output?: string
  location?: string
  minutes?: number
}> {
  return fetchJson(`/admin/minecraft/nightmarket`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function adminMinecraftWorldHunt(body: { pokemon: string }): Promise<{
  ok: boolean
  error?: string
  command?: string
  output?: string
  pokemon?: string
}> {
  return fetchJson('/admin/minecraft/world-hunt', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function fetchAdminSkindexCatalog(): Promise<{
  skins: { id: string; species: string[] }[]
}> {
  return fetchJson('/admin/minecraft/skindex/catalog')
}

export async function adminMinecraftSkindexGive(body: {
  player: string
  skinId: string
}): Promise<{
  ok: boolean
  error?: string
  command?: string
  output?: string
  player?: string
  skinId?: string
}> {
  return fetchJson('/admin/minecraft/skindex/give', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export type SiteMaintenance = {
  enabled: boolean
  message: string
  updatedAt: string | null
}

export async function adminFetchSiteMaintenance(): Promise<SiteMaintenance> {
  return fetchJson(`/admin/site-maintenance`)
}

export async function adminUpdateSiteMaintenance(
  body: { enabled: boolean; message: string }
): Promise<SiteMaintenance> {
  return fetchJson(`/admin/site-maintenance`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export type MaintenanceState = {
  ok: boolean
  error?: string
  command?: string
  output?: string
  /** null when the mod's status output could not be parsed. */
  enabled?: boolean | null
  statusRaw?: string
  allowedRaw?: string
}

export async function adminFetchMaintenance(): Promise<MaintenanceState> {
  return fetchJson(`/admin/minecraft/maintenance`)
}

export async function adminSetMaintenance(
  body:
    | { action: 'on' | 'off' }
    | { action: 'allow_add' | 'allow_remove'; player: string }
    | { action: 'set_message'; message: string }
): Promise<MaintenanceState> {
  return fetchJson(`/admin/minecraft/maintenance`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export type RankedBattleStaffEvent = {
  id: number
  created_at: string
  staff_user_id: number
  staff_username: string | null
  event_kind: 'elo_add' | 'elo_remove' | 'feed_review' | 'feed_clear'
  minecraft_username: string | null
  elo_amount: number | null
  elo_format: string | null
  elo_ok: boolean | null
  elo_error: string | null
  review_item_key: string | null
  review_feed_kind: string | null
  review_reviewed: boolean | null
  staff_reason: string | null
}

export async function fetchRankedBattleStaffHistory(params?: {
  limit?: number
}): Promise<{ events: RankedBattleStaffEvent[] }> {
  const sp = new URLSearchParams()
  if (params?.limit != null) sp.set('limit', String(params.limit))
  const q = sp.toString()
  return fetchJson(`/admin/ranked-battle/staff-history${q ? `?${q}` : ''}`)
}

/** Public-profile achievement badges (definitions + grants). */
/** Must match backend `ACHIEVEMENT_TIERS` / DB check. */
export type ProfileAchievementTier =
  | 'violet'
  | 'rose'
  | 'gold'
  | 'mythic'
  | 'legend'

export type ProfileAchievementDefinition = {
  id: number
  slug: string
  title: string
  description: string
  tier: ProfileAchievementTier
  sort_order: number
  active: boolean
  created_at: string
  updated_at: string
}

export type ProfileAchievementGrantRow = {
  grant_id: number
  achievement_id: number
  granted_at: string
  slug: string
  title: string
  tier: string
  definition_active: boolean
}

export async function adminFetchAchievementDefinitions(): Promise<{ definitions: ProfileAchievementDefinition[] }> {
  return fetchJson('/admin/profile-achievement-definitions')
}

export async function adminCreateAchievementDefinition(body: {
  title: string
  description: string
  tier: ProfileAchievementTier
  slug?: string
  sort_order?: number
  active?: boolean
}): Promise<{ definition: ProfileAchievementDefinition }> {
  return fetchJson('/admin/profile-achievement-definitions', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function adminPatchAchievementDefinition(
  id: number,
  body: Partial<{
    title: string
    description: string
    tier: ProfileAchievementTier
    sort_order: number
    active: boolean
  }>
): Promise<{ definition: ProfileAchievementDefinition }> {
  return fetchJson(`/admin/profile-achievement-definitions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function adminFetchAchievementGrants(params: {
  user_id?: number
  username?: string
}): Promise<{ user_id: number; grants: ProfileAchievementGrantRow[] }> {
  const sp = new URLSearchParams()
  if (params.user_id != null) sp.set('user_id', String(params.user_id))
  if (params.username?.trim()) sp.set('username', params.username.trim())
  const qs = sp.toString()
  return fetchJson(`/admin/profile-achievement-grants${qs ? `?${qs}` : ''}`)
}

export async function adminGrantProfileAchievement(body: {
  username?: string
  target_user_id?: number
  achievement_id?: number
  slug?: string
}): Promise<{ ok: boolean }> {
  return fetchJson('/admin/profile-achievement-grants', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function adminRevokeProfileAchievementGrant(grantId: number): Promise<{ ok: boolean }> {
  return fetchJson(`/admin/profile-achievement-grants/${grantId}`, {
    method: 'DELETE',
  })
}

export type BattlePassLpResponse = {
  ok: boolean
  command?: string
  output?: string
  error?: string
  /** False if RCON succeeded but the grant table could not be updated (run SQL migration). */
  dbPersisted?: boolean
}

export type BattlePassGrantListItem = {
  id: number
  minecraft_username: string
  kind: 'premium' | 'party'
  granted_at: string
  updated_at: string
  website_user_id: number | null
  website_username: string | null
  website_email: string | null
  granted_by_user_id: number | null
  granted_by_username: string | null
}

export async function fetchBattlePassGrants(kind: 'premium' | 'party'): Promise<{
  grants: BattlePassGrantListItem[]
}> {
  return fetchJson<{ grants: BattlePassGrantListItem[] }>(
    `/admin/minecraft/battlepass-grants?kind=${encodeURIComponent(kind)}`
  )
}

/** Premium battle pass — grant and revoke are separate from party. */
export async function adminBattlePassPremium(body: {
  minecraft_username: string
  grant: boolean
  /** Website user whose username matches IGN (for audit list). */
  user_id?: number
}): Promise<BattlePassLpResponse> {
  return fetchJson<BattlePassLpResponse>('/admin/minecraft/battlepass-premium', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** Party creation access — separate from premium. */
export async function adminBattlePassParty(body: {
  minecraft_username: string
  grant: boolean
  user_id?: number
}): Promise<BattlePassLpResponse> {
  return fetchJson<BattlePassLpResponse>('/admin/minecraft/battlepass-party', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** Public battle restrictions document (edited in Admin, shown on website). */
export type BattleRestrictionsDocument = {
  updated_at: string
  /** Plain text, e.g. "National Dex OU — Singles" (shown on public page). */
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

export async function fetchAdminBattleRestrictions(): Promise<BattleRestrictionsDocument> {
  return fetchJson('/admin/battle-restrictions')
}

export async function putAdminBattleRestrictions(
  body: Omit<BattleRestrictionsDocument, 'updated_at'>
): Promise<BattleRestrictionsDocument> {
  return fetchJson('/admin/battle-restrictions', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export async function uploadBattleRestrictionImage(file: File): Promise<string> {
  const url = buildUrl('/admin/battle-restrictions/upload-image')
  const headers: HeadersInit = {}
  const token = getToken()
  if (token) {
    ;(headers as Record<string, string>)['Authorization'] = `Bearer ${token}`
  }
  const body = new FormData()
  body.append('image', file)
  const res = await fetch(url, { method: 'POST', headers, body })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string })?.error ?? `Upload failed: ${res.status}`)
  }
  return (data as { url: string }).url
}

// --- Admin clans ---

export interface AdminClanTreasuryMilestone {
  key: string
  threshold: number
  label: string
  kind: 'income' | 'tickets'
}

export interface AdminClanSummary {
  id: number
  name: string
  bio: string | null
  avatar_url: string
  leader_id: number
  leader_username: string
  leader_email: string | null
  member_count: number
  max_members: number
  bank_balance: number
  total_elo: number | null
  xp: number
  level: number
  xp_in_level: number
  xp_per_level: number
  daily_income_per_day: number
  daily_income_multiplier?: number
  daily_income_per_member?: number
  has_daily_ticket_bonus?: boolean
  daily_ticket_bonus?: number
  next_member_unlock_treasury?: number | null
  treasury_milestone?: number
  treasury_milestones?: AdminClanTreasuryMilestone[]
  created_at: string
}

export interface AdminClansSummary {
  total_clans: number
  total_members: number
  total_treasury: number
  total_elo: number
  avg_level: number
}

export interface AdminClanMember {
  user_id: number
  username: string
  role: string
  donated_total: number
  joined_at: string
  /** Null when the player has no ranked PvP matches. */
  elo: number | null
}

export interface AdminClanJoinRequest {
  id: number
  requester_id: number
  requester_username: string
  created_at: string
}

export interface AdminClanLeaderboardPayout {
  payout_date: string
  category: string
  amount: number
  paid_at: string
  rank_position: number
}

export interface AdminClanXpGrant {
  user_id: number
  username: string
  claim_date: string
  streak_day: number
  xp_amount: number
  created_at: string
}

export interface AdminClanAdminXpGrant {
  id: number
  admin_user_id: number
  admin_username: string
  xp_amount: number
  note: string | null
  created_at: string
}

export interface AdminClanDonation {
  id: number
  user_id: number
  username: string
  amount: number
  created_at: string
}

export interface AdminClanDisbursement {
  id: number
  leader_id: number
  leader_username: string
  recipient_id: number
  recipient_username: string
  amount: number
  created_at: string
}

export interface AdminClanDetailStats {
  total_member_donations: number
  recent_donations_count: number
  recent_disbursements_total: number
  pending_join_requests_count: number
  avg_member_elo: number | null
}

export interface AdminClanDetail {
  clan: AdminClanSummary & {
    last_daily_income_date: string | null
    leaderboard_ranks: {
      top_treasury: number | null
      top_total_elo: number | null
      top_level: number | null
    }
    leaderboard_daily_bonus: number
    daily_income_multiplier: number
    daily_income_per_member: number
    has_daily_ticket_bonus: boolean
    daily_ticket_bonus: number
  }
  members: AdminClanMember[]
  pending_join_requests: AdminClanJoinRequest[]
  recent_leaderboard_payouts: AdminClanLeaderboardPayout[]
  recent_xp_grants: AdminClanXpGrant[]
  recent_admin_xp_grants: AdminClanAdminXpGrant[]
  recent_donations: AdminClanDonation[]
  recent_disbursements: AdminClanDisbursement[]
  stats: AdminClanDetailStats
  leaderboard_rewards?: {
    top1_per_category: number
    top2_per_category: number
    categories: { key: string; label: string }[]
    timezone: string
    schedule: string
  }
}

export async function fetchAdminClans(q?: string): Promise<{
  clans: AdminClanSummary[]
  count: number
  summary: AdminClansSummary
}> {
  const qs =
    typeof q === 'string' && q.trim().length > 0 ? `?q=${encodeURIComponent(q.trim())}` : ''
  return fetchJson<{ clans: AdminClanSummary[]; count: number; summary: AdminClansSummary }>(
    `/admin/clans${qs}`
  )
}

export async function fetchAdminClanDetail(clanId: number): Promise<AdminClanDetail> {
  return fetchJson<AdminClanDetail>(`/admin/clans/${clanId}`)
}

export async function adminDisbandClan(clanId: number): Promise<{ ok: true }> {
  return fetchJson<{ ok: true }>(`/admin/clans/${clanId}/disband`, { method: 'POST', body: '{}' })
}

export async function adminGrantClanXp(
  clanId: number,
  amount: number,
  note?: string
): Promise<{
  ok: true
  granted: number
  xp: number
  level: number
  xp_in_level: number
  xp_per_level: number
}> {
  return fetchJson(`/admin/clans/${clanId}/grant-xp`, {
    method: 'POST',
    body: JSON.stringify({ amount, note: note?.trim() || undefined }),
  })
}
