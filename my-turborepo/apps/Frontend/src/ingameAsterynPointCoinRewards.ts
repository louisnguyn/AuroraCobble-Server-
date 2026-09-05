/** Max in-game leaderboard rank eligible for Point → Coin conversion. */
export const INGAME_AP_TO_WEBSITE_COIN_MAX_RANK = 20

/**
 * Website Asteryn Coins granted per in-game Asteryn Point leaderboard rank.
 * Must match apps/Backend/src/ingameAsterynPointCoinRewards.ts
 */
export function websiteCoinRewardForIngameApRank(rank: number): number | null {
  if (!Number.isInteger(rank) || rank < 1) return null
  if (rank === 1) return 50
  if (rank === 2) return 48
  if (rank === 3) return 45
  if (rank >= 4 && rank <= 5) return 40
  if (rank >= 6 && rank <= 8) return 35
  if (rank >= 9 && rank <= 10) return 30
  if (rank >= 11 && rank <= 15) return 20
  if (rank >= 16 && rank <= INGAME_AP_TO_WEBSITE_COIN_MAX_RANK) return 10
  return null
}

export const INGAME_AP_TO_WEBSITE_COIN_TABLE: ReadonlyArray<{ label: string; coins: number }> = [
  { label: '1', coins: 50 },
  { label: '2', coins: 48 },
  { label: '3', coins: 45 },
  { label: '4–5', coins: 40 },
  { label: '6–8', coins: 35 },
  { label: '9–10', coins: 30 },
  { label: '11–15', coins: 20 },
  { label: '16–20', coins: 10 },
]
