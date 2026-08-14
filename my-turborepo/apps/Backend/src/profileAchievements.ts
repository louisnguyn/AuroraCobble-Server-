import type { SupabaseClient } from "@supabase/supabase-js";
import type { AchievementTier, PublicAchievement } from "./achievementTypes.js";
import { achievementTierRank, parseAchievementTier } from "./achievementTypes.js";

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

export type UserProfileBadgeCounts = {
  /** Was `crimson` — purple tier. */
  mythic: number;
  gold: number;
  /** Was top `mythic` — orange tier. */
  legend: number;
};

async function loadUserGrantedBadgeDefinitionTiers(
  supabase: SupabaseClient,
  userId: number
): Promise<string[]> {
  const { data: grants, error } = await supabase
    .from("profile_achievement_grants")
    .select("achievement_id")
    .eq("user_id", userId);
  const missingGrants = Boolean(
    error && /profile_achievement_grants|relation|does not exist|schema cache/i.test(error.message)
  );
  if (error && !missingGrants) {
    console.warn("[profile] badge count grants:", error.message);
    return [];
  }
  if (missingGrants || !grants?.length) return [];

  const ids = [...new Set(grants.map((g) => (g as { achievement_id: number }).achievement_id))];
  const { data: defs, error: defErr } = await supabase
    .from("profile_achievement_definitions")
    .select("tier")
    .in("id", ids)
    .in("tier", ["mythic", "gold", "legend", "crimson"])
    .eq("active", true);
  const missingDefs = Boolean(
    defErr && /profile_achievement_definitions|relation|does not exist|schema cache/i.test(defErr.message)
  );
  if (defErr && !missingDefs) {
    console.warn("[profile] badge count defs:", defErr.message);
    return [];
  }
  return (defs ?? []).map((d) => (d as { tier: string }).tier);
}

export async function countUserProfileBadgesByTier(
  supabase: SupabaseClient,
  userId: number
): Promise<UserProfileBadgeCounts> {
  try {
    const tiers = await loadUserGrantedBadgeDefinitionTiers(supabase, userId);
    let mythic = 0;
    let gold = 0;
    let legend = 0;
    for (const tier of tiers) {
      const t = tier.trim().toLowerCase();
      if (t === "mythic" || t === "crimson") mythic += 1;
      else if (t === "gold") gold += 1;
      else if (t === "legend") legend += 1;
    }
    return { mythic, gold, legend };
  } catch {
    return { mythic: 0, gold: 0, legend: 0 };
  }
}

/** @deprecated Use counts.mythic — kept for call sites that meant the old crimson tier. */
export async function countUserCrimsonBadges(supabase: SupabaseClient, userId: number): Promise<number> {
  const counts = await countUserProfileBadgesByTier(supabase, userId);
  return counts.mythic;
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

  return rows
    .map((d) => {
      const tier = parseAchievementTier(d.tier);
      if (!tier || !allowed.has(d.id)) return null;
      return { ...d, tier };
    })
    .filter((d): d is DefRow & { tier: AchievementTier } => d != null)
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
        tier: d.tier,
      })
    );
}

export type AchievementLeaderboardRow = {
  rank: number;
  userId: number;
  username: string;
  badgeCount: number;
  score: number;
  legend: number;
  mythic: number;
  gold: number;
};

/** Public ranking: higher-tier badges score more (silver=1 … legend=8). */
export async function fetchAchievementLeaderboard(
  supabase: SupabaseClient,
  limit = 50
): Promise<AchievementLeaderboardRow[]> {
  const cap = Math.min(Math.max(limit, 1), 100);
  const { data: grants, error: gErr } = await supabase
    .from("profile_achievement_grants")
    .select("user_id, achievement_id");
  if (gErr) {
    if (/profile_achievement_grants|relation|does not exist|schema cache/i.test(gErr.message)) return [];
    throw new Error(gErr.message);
  }
  const gRows = (grants ?? []) as { user_id: number; achievement_id: number }[];
  if (!gRows.length) return [];

  const defIds = [...new Set(gRows.map((g) => g.achievement_id))];
  const { data: defs, error: dErr } = await supabase
    .from("profile_achievement_definitions")
    .select("id, tier, active")
    .in("id", defIds);
  if (dErr) {
    if (/profile_achievement_definitions|relation|does not exist|schema cache/i.test(dErr.message)) return [];
    throw new Error(dErr.message);
  }
  const weightById = new Map<number, number>();
  const tierById = new Map<number, string>();
  for (const d of (defs ?? []) as { id: number; tier: string; active: boolean }[]) {
    if (!d.active) continue;
    const parsed = parseAchievementTier(d.tier);
    if (!parsed) continue;
    weightById.set(d.id, achievementTierRank(parsed) + 1);
    tierById.set(d.id, parsed);
  }

  type Acc = { badgeCount: number; score: number; legend: number; mythic: number; gold: number };
  const byUser = new Map<number, Acc>();
  for (const g of gRows) {
    const w = weightById.get(g.achievement_id);
    if (w == null) continue;
    const t = tierById.get(g.achievement_id) ?? "";
    const prev = byUser.get(g.user_id) ?? { badgeCount: 0, score: 0, legend: 0, mythic: 0, gold: 0 };
    prev.badgeCount += 1;
    prev.score += w;
    if (t === "legend") prev.legend += 1;
    else if (t === "mythic") prev.mythic += 1;
    else if (t === "gold") prev.gold += 1;
    byUser.set(g.user_id, prev);
  }
  const ranked = [...byUser.entries()].sort((a, b) => {
    if (b[1].score !== a[1].score) return b[1].score - a[1].score;
    if (b[1].badgeCount !== a[1].badgeCount) return b[1].badgeCount - a[1].badgeCount;
    return a[0] - b[0];
  });
  const top = ranked.slice(0, cap);
  const ids = top.map(([id]) => id);
  const names = new Map<number, string>();
  if (ids.length > 0) {
    const { data: users, error: uErr } = await supabase.from("users").select("id, username").in("id", ids);
    if (uErr) throw new Error(uErr.message);
    for (const u of (users ?? []) as { id: number; username: string }[]) {
      const nm = String(u.username ?? "").trim();
      if (nm) names.set(Number(u.id), nm);
    }
  }
  return top.map(([userId, acc], i) => ({
    rank: i + 1,
    userId,
    username: names.get(userId) ?? `#${userId}`,
    badgeCount: acc.badgeCount,
    score: acc.score,
    legend: acc.legend,
    mythic: acc.mythic,
    gold: acc.gold,
  }));
}
