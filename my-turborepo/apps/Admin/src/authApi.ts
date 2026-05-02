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
  /** Set when staff verified this account was online on the Minecraft server (username = IGN). */
  minecraft_verified_at?: string | null
  /** LuckPerms primary group mirrored on the site. */
  minecraft_role?: string | null
}

export async function fetchAdminUsers(): Promise<{ users: AdminUser[] }> {
  return fetchJson<{ users: AdminUser[] }>('/admin/users')
}

export async function patchAdminUser(
  userId: number,
  body: { email?: string; username?: string; is_admin?: boolean }
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

export async function grantAdminUserMinecraftRole(
  userId: number,
  roleKey: string
): Promise<{ user: AdminUser }> {
  return fetchJson<{ user: AdminUser }>(`/admin/users/${userId}/minecraft-role`, {
    method: 'POST',
    body: JSON.stringify({ roleKey }),
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
  round: 'qualifying' | 'quarter' | 'semi' | 'final' | 'third'
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
    subtitle?: string
    prizes?: unknown[]
    is_published?: boolean
    /** Length 4, permutation of 0–3: QF slot i gets winner of qual-(value). */
    qf_qual_feed?: number[]
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

export async function adminMinecraftRankedadminElo(body: {
  action: 'add' | 'remove'
  amount: number
  minecraft_username: string
  format: 'singles' | 'doubles'
}): Promise<{ ok: boolean; command?: string; output?: string; error?: string }> {
  return fetchJson(`/admin/minecraft/rankedadmin-elo`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
