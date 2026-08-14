// CobbleRanked API response types (shared with Frontend)

export interface UsageStatsResponse {
  serverId?: string
  seasonName?: string
  timestamp?: string
  formats?: Record<string, FormatUsage>
}

export interface FormatUsage {
  format?: string
  tiers?: Record<string, TierUsage>
}

export interface TierUsage {
  minElo: number
  maxElo: number | null
  totalBattles: number
  totalPokemon?: number
  species?: SpeciesUsage[]
}

export interface SpeciesUsage {
  name: string
  usagePercent: number
  count?: number
  winRate?: number
  abilities?: Record<string, number>
  items?: Record<string, number>
  moves?: Record<string, number>
  natures?: Record<string, number>
  evSpreads?: Record<string, number>
  teammates?: Record<string, number>
}

export interface LeaderboardResponse {
  serverId?: string
  seasonName?: string
  timestamp?: string
  formats?: Record<string, LeaderboardFormat>
  entries?: LeaderboardEntry[]
  [key: string]: unknown
}

export interface LeaderboardFormat {
  format: string
  players?: LeaderboardPlayer[]
}

export interface LeaderboardPlayer {
  rank: number
  uuid: string
  playerName: string
  elo: number
  tier: string
  wins: number
  losses: number
  matches: number
  winRate: number
  currentStreak: number
  bestStreak: number
}

export interface LeaderboardEntry {
  rank?: number
  name?: string
  playerName?: string
  elo?: number
  rating?: number
  wins?: number
  losses?: number
  [key: string]: unknown
}

/** GET /minecraft/cobbledollars-leaderboard, /minecraft/pco-leaderboard, /leaderboard/website-cobbledollars */
export interface CobbleDollarsLeaderboardResponse {
  ok: boolean
  disabled?: boolean
  top10: { name: string; balance: number }[]
  error: string | null
  updatedAt: string | null
}

/** GET /minecraft/battle-tower-leaderboard */
export interface BattleTowerLeaderboardRow {
  rank: number
  name: string
  floor?: number
  streak?: number
  legendary?: boolean
  detail?: string
}

export interface BattleTowerLeaderboardResponse {
  ok: boolean
  disabled?: boolean
  mode: string
  top: number
  floorRows: BattleTowerLeaderboardRow[]
  streakRows: BattleTowerLeaderboardRow[]
  fallbackFloorLines: string[]
  fallbackStreakLines: string[]
  error: string | null
  updatedAt: string | null
}

/** GET /leaderboard/achievements */
export interface AchievementLeaderboardRow {
  rank: number
  userId: number
  username: string
  badgeCount: number
  score: number
  legend: number
  mythic: number
  gold: number
}

export interface AchievementLeaderboardResponse {
  ok: boolean
  rows: AchievementLeaderboardRow[]
  error: string | null
}

export interface MatchResultPokemon {
  species: string
  ability?: string
  item?: string
  moves?: string[]
  nature?: string
  evSpread?: string
}

export interface MatchResultPlayer {
  uuid?: string
  playerName?: string
  eloBefore?: number
  eloAfter?: number
  eloChange?: number
  isWinner?: boolean
  faintedCount?: number
  team?: MatchResultPokemon[]
}

export interface MatchResultPayload {
  matchId?: string
  serverId?: string
  seasonName?: string
  format?: string
  matchType?: string
  timestamp?: string
  durationSeconds?: number
  endReason?: string
  turnCount?: number
  players?: MatchResultPlayer[]
  [key: string]: unknown
}

export interface BattleReplayPlayer {
  uuid?: string
  playerName?: string
  team?: string[]
  isWinner?: boolean
}

export interface BattleReplayPayload {
  matchId?: string
  serverId?: string
  seasonName?: string
  format?: string
  timestamp?: string
  turnCount?: number
  players?: BattleReplayPlayer[]
  battleLog?: string[]
  endReason?: string
  [key: string]: unknown
}
