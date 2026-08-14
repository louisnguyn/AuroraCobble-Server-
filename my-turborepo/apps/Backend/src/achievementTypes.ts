/** Ordered roughly from subtle to standout (legend = animated on the website). */
export const ACHIEVEMENT_TIERS = [
  "silver",
  "cyan",
  "emerald",
  "violet",
  "rose",
  "gold",
  "mythic",
  "legend",
] as const;

export type AchievementTier = (typeof ACHIEVEMENT_TIERS)[number];

const TIER_SET = new Set<string>(ACHIEVEMENT_TIERS);

/** Legacy DB values accepted when reading (run migrate-badge-tiers-mythic-legend.sql). */
const TIER_ALIASES: Record<string, AchievementTier> = {
  crimson: "mythic",
};

/** Lower = earlier in lists (silver → legend). Unknown tiers sort last. */
export function achievementTierRank(tier: string): number {
  const t = normalizeAchievementTierKey(tier) ?? "";
  const i = (ACHIEVEMENT_TIERS as readonly string[]).indexOf(t);
  return i === -1 ? 999 : i;
}

export type PublicAchievement = {
  id: string;
  title: string;
  description: string;
  tier: AchievementTier;
};

export function normalizeAchievementTierKey(raw: unknown): AchievementTier | null {
  const t = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!t) return null;
  if (TIER_SET.has(t)) return t as AchievementTier;
  return TIER_ALIASES[t] ?? null;
}

export function parseAchievementTier(raw: unknown): AchievementTier | null {
  return normalizeAchievementTierKey(raw);
}
