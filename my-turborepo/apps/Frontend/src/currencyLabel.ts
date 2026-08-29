/** Display name for the website wallet (`user_currency` type `asterynpoints`). */
export const WEBSITE_CURRENCY_LABEL = 'Asteryn Coins'

/** Singular (stake messages, per-line labels). */
export const WEBSITE_CURRENCY_SINGULAR = 'Asteryn Coin'

/** In-game mod currency (separate from website wallet). */
export const INGAME_ASTERYN_POINT_LABEL = 'Asteryn Points'

export const INGAME_ASTERYN_POINT_SINGULAR = 'Asteryn Point'

/** Short label when space is tight (leaderboards, pills). */
export const WEBSITE_CURRENCY_SHORT = 'AC'

/** DB / API currency_type key (not Minecraft in-game Cobble$). */
export const ASTERYN_POINTS_CURRENCY = 'asterynpoints'

const LEGACY_COBBLEDOLLARS_CURRENCY = 'cobbledollars'

export function websitePointsBalance(
  currencies: { currency_type: string; balance: number }[] | null | undefined
): number {
  let total = 0
  for (const c of currencies ?? []) {
    const t = c.currency_type.trim().toLowerCase()
    if (t === ASTERYN_POINTS_CURRENCY || t === LEGACY_COBBLEDOLLARS_CURRENCY) {
      total += Number(c.balance) || 0
    }
  }
  return total
}
