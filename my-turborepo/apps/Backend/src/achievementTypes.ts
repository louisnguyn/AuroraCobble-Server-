/** Ordered roughly from subtle to standout (mythic = animated on the website). */
export const ACHIEVEMENT_TIERS = [
  "silver",
  "cyan",
  "emerald",
  "violet",
  "rose",
  "gold",
  "crimson",
  "mythic",
] as const;

export type AchievementTier = (typeof ACHIEVEMENT_TIERS)[number];

const TIER_SET = new Set<string>(ACHIEVEMENT_TIERS);

/** Lower = earlier in lists (silver → mythic). Unknown tiers sort last. */
export function achievementTierRank(tier: string): number {
  const t = typeof tier === "string" ? tier.trim().toLowerCase() : "";
  const i = (ACHIEVEMENT_TIERS as readonly string[]).indexOf(t);
  return i === -1 ? 999 : i;
}

export type PublicAchievement = {
  id: string;
  title: string;
  description: string;
  tier: AchievementTier;
};

export function parseAchievementTier(raw: unknown): AchievementTier | null {
  const t = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return TIER_SET.has(t) ? (t as AchievementTier) : null;
}
