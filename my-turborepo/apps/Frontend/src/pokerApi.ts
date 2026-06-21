import { getStoredToken } from './authApi'

const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

export type PokemonRegion = 'kanto' | 'johto' | 'hoenn' | 'sinnoh'
export type PokemonRarity = 'rare' | 'paradox' | 'ultra_beast' | 'mythical' | 'legendary'
export type HoldemPhase = 'lobby' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'hand_over'

export type PokemonCardData = {
  rank: string
  suit: string
  region: PokemonRegion
  pokemon: string
  slug: string
  rarity: PokemonRarity
  shiny: boolean
  hidden?: boolean
}

export type HoldemSeat = {
  userId: number
  username: string
  chips: number
  ready: boolean
  hole: PokemonCardData[]
  folded: boolean
  allIn: boolean
  betRound: number
  betHand: number
  lastAction?: string
  handLabel?: string
  isDealer?: boolean
  isSmallBlind?: boolean
  isBigBlind?: boolean
}

export type HoldemRoomState = {
  code: string
  name: string
  phase: HoldemPhase
  hostUserId: number
  hasPassword: boolean
  settings: {
    maxPlayers: number
    buyIn: number
    smallBlind: number
    bigBlind: number
  }
  seats: (HoldemSeat | null)[]
  community: PokemonCardData[]
  pot: number
  currentBet: number
  minRaise: number
  activeSeat: number | null
  dealerSeat: number | null
  turnEndsAt: number | null
  handNumber: number
  message: string
  lastResults: string[]
  variant: string
}

export type HoldemConfig = {
  minBuyIn: number
  maxBuyIn: number
  defaultBuyIn: number
  defaultSmallBlind: number
  defaultBigBlind: number
  minPlayers: number
  maxPlayers: number
  actionSeconds: number
  variant: string
  handNames: Record<string, string>
}

export const REGION_LABEL: Record<PokemonRegion, string> = {
  kanto: 'Kanto',
  johto: 'Johto',
  hoenn: 'Hoenn',
  sinnoh: 'Sinnoh',
}

export const REGION_DOT: Record<PokemonRegion, string> = {
  kanto: '🟥',
  johto: '🟦',
  hoenn: '🟩',
  sinnoh: '🟨',
}

export const RARITY_LABEL: Record<PokemonRarity, string> = {
  rare: 'Rare',
  paradox: 'Paradox',
  ultra_beast: 'Ultra Beast',
  mythical: 'Mythical',
  legendary: 'Legendary',
}

export function rankDisplay(rank: string): string {
  return rank === 'T' ? '10' : rank
}

async function pokerFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken()
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string>),
  }
  if (token) {
    ;(headers as Record<string, string>)['Authorization'] = `Bearer ${token}`
  }
  const res = await fetch(`${API_BASE.replace(/\/$/, '')}${path}`, { ...init, headers })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`)
  return data
}

export function fetchPokerConfig(): Promise<HoldemConfig> {
  return pokerFetch<HoldemConfig>('/poker/config')
}

export function fetchPokerRoom(): Promise<{ room: HoldemRoomState | null }> {
  return pokerFetch<{ room: HoldemRoomState | null }>('/poker/room')
}

export function pokerWsUrl(token: string): string {
  // Dev: always use Vite /api proxy so WS upgrade matches HTTP API routing.
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${window.location.host}/api/poker/ws?token=${encodeURIComponent(token)}`
  }

  const base = API_BASE.replace(/\/$/, '')
  if (base.startsWith('http://') || base.startsWith('https://')) {
    const u = new URL(base)
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
    u.pathname = `${u.pathname.replace(/\/$/, '')}/poker/ws`.replace(/^\/\//, '/')
    u.search = `token=${encodeURIComponent(token)}`
    return u.toString()
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}${base}/poker/ws?token=${encodeURIComponent(token)}`
}

export function formatCobble(n: number): string {
  return n.toLocaleString()
}

export const PHASE_LABEL: Record<HoldemPhase, string> = {
  lobby: 'Lobby',
  preflop: 'Pre-flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
  showdown: 'Showdown',
  hand_over: 'Hand complete',
}

export type HoldemAction = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in'
