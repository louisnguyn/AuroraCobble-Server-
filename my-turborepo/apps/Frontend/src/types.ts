// CobbleRanked API response types

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
  /** Open-ended tier bands use `null` (e.g. 1500+). */
  maxElo: number | null
  totalBattles: number
  totalPokemon?: number
  species?: SpeciesUsage[]
}

export interface SpeciesUsage {
  name: string
  usagePercent: number
  /** Older CobbleRanked payloads included counts; tier usage may omit this. */
  count?: number
  /** Win rate for this species in the tier (percent). */
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

/** GET /leaderboard/display-settings — admin-controlled public PvP table filter per format. */
export interface LeaderboardDisplaySettings {
  hideZeroMatchPlayers: {
    singles: boolean
    doubles: boolean
  }
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

/** @deprecated Use LeaderboardPlayer when data comes from formats[].players */
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

/** POST /battle-replay — CobbleRanked Web API */
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

/** POST /match-result — CobbleRanked Web API */
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
  players?: MatchResultPlayer[]
  [key: string]: unknown
}

export interface RankedFeedListResponse<T> {
  items: T[]
}

export interface SpawnPokemonRow {
  id: number
  generation: string | null
  generation_number: number | null
  dex_number: number | null
  pokemon: string
  source: string | null
  spawn: string | null
  rarity: string | null
  condition: string | null
  forms: string | null
}

export interface SpawnPokemonResponse {
  rows: SpawnPokemonRow[]
  filters: {
    generations: string[]
    sources: string[]
  }
}

export interface SpawnBossRow {
  id: number
  created_at: string | null
  boss_name: string | null
  spawn_biomes: string | null
  normal_rate: number | null
  shiny_rate: number | null
  reward: string | null
}

export interface SpawnBossResponse {
  rows: SpawnBossRow[]
}

/** GET /minecraft/cobbledollars-leaderboard, GET /minecraft/pco-leaderboard, GET /leaderboard/website-cobbledollars */
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
