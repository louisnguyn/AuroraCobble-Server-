import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicAchievement } from "./achievementTypes.js";
import { fetchGrantedPublicAchievements } from "./profileAchievements.js";

export type { PublicAchievement };

function isSafeHttpsAvatarUrl(raw: string): boolean {
  const s = raw.trim();
  if (s.length < 12 || s.length > 2000) return false;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:") return false;
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return false;
    return true;
  } catch {
    return false;
  }
}

export function sanitizeProfileBio(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const t = raw.replace(/\r\n/g, "\n").trim();
  return t.length > 800 ? t.slice(0, 800) : t;
}

export function sanitizeAvatarUrl(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return isSafeHttpsAvatarUrl(t) ? t : null;
}

export type PublicProfilePayload = {
  username: string;
  bio: string | null;
  avatarUrl: string | null;
  minecraftRole: string;
  memberSince: string;
  achievements: PublicAchievement[];
  pvp: {
    rank: number | null;
    /** Present when ELO is known (tier derived from ELO). */
    tier: string | null;
    elo: number | null;
    format: string | null;
  };
};

function safeDecodePathSegment(raw: string): string {
  const t = raw.trim();
  try {
    return decodeURIComponent(t).trim();
  } catch {
    return t;
  }
}

export async function fetchPublicProfileByUsername(
  supabase: SupabaseClient,
  usernameParam: string,
  readMinecraftRole: (row: { minecraft_role?: string | null } | null) => string,
  pvpTierFromElo: (elo: number | null) => string
): Promise<PublicProfilePayload | null> {
  const uname = safeDecodePathSegment(usernameParam);
  if (!uname || uname.length > 48) return null;

  const { data: userRow, error: uerr } = await supabase
    .from("users")
    .select("id, username, minecraft_role, minecraft_verified_at, created_at")
    .ilike("username", uname)
    .limit(1)
    .maybeSingle();

  if (uerr || !userRow) return null;

  const uid = (userRow as { id: number }).id;
  const username = String((userRow as { username: string }).username);
  const mcRole = readMinecraftRole(userRow as { minecraft_role?: string | null });
  const createdAt = String((userRow as { created_at: string }).created_at);

  let bio: string | null = null;
  let avatarUrl: string | null = null;

  const { data: prof } = await supabase
    .from("user_public_profiles")
    .select("bio, avatar_url")
    .eq("user_id", uid)
    .maybeSingle();
  if (prof) {
    const p = prof as { bio?: string | null; avatar_url?: string | null };
    if (typeof p.bio === "string" && p.bio.trim()) bio = p.bio.trim().slice(0, 800);
    if (typeof p.avatar_url === "string") {
      const a = sanitizeAvatarUrl(p.avatar_url);
      avatarUrl = a;
    }
  }

  let rank: number | null = null;
  let elo: number | null = null;
  let formatKey: string | null = null;
  const { data: pv } = await supabase
    .from("user_pvp_ranks")
    .select("rank_position, elo, format_key")
    .eq("user_id", uid)
    .maybeSingle();
  if (pv) {
    const pr = pv as { rank_position?: number | null; elo?: number | null; format_key?: string | null };
    rank = typeof pr.rank_position === "number" ? pr.rank_position : null;
    elo = typeof pr.elo === "number" ? pr.elo : null;
    formatKey = typeof pr.format_key === "string" ? pr.format_key : null;
  }

  const achievements = await fetchGrantedPublicAchievements(supabase, uid);

  const tier = elo != null && Number.isFinite(elo) ? pvpTierFromElo(elo) : null;

  return {
    username,
    bio,
    avatarUrl,
    minecraftRole: mcRole,
    memberSince: createdAt,
    achievements,
    pvp: {
      rank,
      tier,
      elo,
      format: formatKey,
    },
  };
}

export { isSafeHttpsAvatarUrl };
