import type { LeaderboardDisplaySettings } from './types'

export function hideZeroMatchForFormat(
  settings: LeaderboardDisplaySettings,
  formatId: 'singles' | 'doubles'
): boolean {
  return settings.hideZeroMatchPlayers[formatId]
}
