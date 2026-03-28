// CobbleRanked API response types (shared with Frontend)

export interface UsageStatsResponse {
  serverId?: string
  seasonName?: string
  timestamp?: string
  formats?: Record<string, FormatUsage>
}

export interface FormatUsage {
  format: string
  tiers?: Record<string, TierUsage>
}

export interface TierUsage {
  minElo: number
  maxElo: number
  totalBattles: number
  totalPokemon: number
  species?: SpeciesUsage[]
}

export interface SpeciesUsage {
  name: string
  usagePercent: number
  count: number
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

/** GET /minecraft/cobbledollars-leaderboard */
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
