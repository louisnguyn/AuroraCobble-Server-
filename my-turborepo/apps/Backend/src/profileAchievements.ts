import type { SupabaseClient } from "@supabase/supabase-js";
import type { AchievementTier, PublicAchievement } from "./achievementTypes.js";
import { ACHIEVEMENT_TIERS, achievementTierRank } from "./achievementTypes.js";

const TIER_SET = new Set<string>(ACHIEVEMENT_TIERS);

export type { AchievementTier } from "./achievementTypes.js";
export { achievementTierRank, parseAchievementTier } from "./achievementTypes.js";

export function normalizeAchievementSlug(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return s;
}

/** Load granted + active achievements for public profile cards. */
export async function fetchGrantedPublicAchievements(
  supabase: SupabaseClient,
  userId: number
): Promise<PublicAchievement[]> {
  let grants: { achievement_id: number }[] | null = null;
  try {
    const { data, error } = await supabase
      .from("profile_achievement_grants")
      .select("achievement_id")
      .eq("user_id", userId);

    const missingTables = Boolean(
      error && /profile_achievement_grants|relation|does not exist|schema cache/i.test(error.message)
    );
    if (error && !missingTables) {
      console.warn("[profile] achievement grants:", error.message);
      return [];
    }
    grants = missingTables ? null : ((data ?? []) as { achievement_id: number }[]);
  } catch {
    return [];
  }
  if (!grants?.length) return [];

  const ids = [...new Set(grants.map((g) => g.achievement_id))];
  const { data: defs, error: defErr } = await supabase
    .from("profile_achievement_definitions")
    .select("id, slug, title, description, tier, active, sort_order")
    .in("id", ids)
    .eq("active", true);

  const missingDefs = Boolean(
    defErr && /profile_achievement_definitions|relation|does not exist|schema cache/i.test(defErr.message)
  );
  if (defErr && !missingDefs) {
    console.warn("[profile] achievement definitions:", defErr.message);
    return [];
  }
  if (!defs?.length || missingDefs) return [];

  const allowed = new Set(ids);
  type DefRow = {
    id: number;
    slug: string;
    title: string;
    description: string;
    tier: string;
    active: boolean;
    sort_order: number;
  };
  const rows = defs as DefRow[];
  const tierOk = (t: string): t is AchievementTier => TIER_SET.has(t);

  return rows
    .filter((d) => allowed.has(d.id) && tierOk(d.tier))
    .sort((a, b) => {
      const tr = achievementTierRank(a.tier) - achievementTierRank(b.tier);
      if (tr !== 0) return tr;
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return String(a.slug).localeCompare(String(b.slug));
    })
    .map(
      (d): PublicAchievement => ({
        id: d.slug,
        title: d.title.trim().slice(0, 120),
        description: d.description.trim().slice(0, 600),
        tier: d.tier as AchievementTier,
      })
    );
}
