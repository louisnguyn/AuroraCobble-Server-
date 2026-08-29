/**
 * Website wallet currency (Asteryn Coin).
 * DB `user_currency.currency_type` key — not Minecraft in-game Cobble$.
 */
export const ASTERYN_POINTS_CURRENCY = "asterynpoints";

/** User-facing singular label. */
export const WEBSITE_CURRENCY_SINGULAR = "Asteryn Coin";

/** User-facing plural label. */
export const WEBSITE_CURRENCY_PLURAL = "Asteryn Coins";

/** @deprecated Legacy DB key; accepted when reading/migrating. */
export const LEGACY_COBBLEDOLLARS_CURRENCY = "cobbledollars";

export function isAsterynPointsCurrency(currencyType: string): boolean {
  const t = currencyType.trim().toLowerCase();
  return t === ASTERYN_POINTS_CURRENCY || t === LEGACY_COBBLEDOLLARS_CURRENCY;
}
