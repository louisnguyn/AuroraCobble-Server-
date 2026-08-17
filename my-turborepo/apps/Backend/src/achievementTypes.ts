/** Ordered from lowest to highest leaderboard weight (violet=1 … legend=5). */
export const ACHIEVEMENT_TIERS = [
  "violet",
  "rose",
  "gold",
  "mythic",
  "legend",
] as const;

export type AchievementTier = (typeof ACHIEVEMENT_TIERS)[number];

const TIER_SET = new Set<string>(ACHIEVEMENT_TIERS);

/** Legacy DB values accepted when reading (run migrate-badge-tiers-five.sql). */
const TIER_ALIASES: Record<string, AchievementTier> = {
  crimson: "mythic",
  silver: "violet",
  cyan: "violet",
  emerald: "violet",
};

/** Lower = earlier in lists (violet → legend). Unknown tiers sort last. */
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
