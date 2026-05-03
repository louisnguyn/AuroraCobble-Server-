import { supabase } from "./supabase.js";
import type { BattlePassLpKind } from "./minecraftBattlePassLp.js";

export async function persistBattlePassGrantMirror(params: {
  kind: BattlePassLpKind;
  minecraftUsername: string;
  grant: boolean;
  websiteUserId: number | null;
  grantedByUserId: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: "Database not configured" };
  const name = params.minecraftUsername.trim();
  const norm = name.toLowerCase();
  const now = new Date().toISOString();

  if (params.grant) {
    const { error } = await supabase.from("battlepass_lp_grants").upsert(
      {
        minecraft_username: name,
        kind: params.kind,
        active: true,
        website_user_id: params.websiteUserId,
        granted_by_user_id: params.grantedByUserId,
        granted_at: now,
        revoked_at: null,
        updated_at: now,
      },
      { onConflict: "minecraft_username_normalized,kind" }
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const { error } = await supabase
    .from("battlepass_lp_grants")
    .update({
      active: false,
      revoked_at: now,
      granted_by_user_id: params.grantedByUserId,
      updated_at: now,
    })
    .eq("minecraft_username_normalized", norm)
    .eq("kind", params.kind);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type BattlePassGrantListItem = {
  id: number;
  minecraft_username: string;
  kind: BattlePassLpKind;
  granted_at: string;
  updated_at: string;
  website_user_id: number | null;
  website_username: string | null;
  website_email: string | null;
  granted_by_user_id: number | null;
  granted_by_username: string | null;
};

export async function listActiveBattlePassGrants(
  kind: BattlePassLpKind
): Promise<{ ok: true; grants: BattlePassGrantListItem[] } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: "Database not configured" };
  const { data: rows, error } = await supabase
    .from("battlepass_lp_grants")
    .select(
      "id, minecraft_username, kind, granted_at, updated_at, website_user_id, granted_by_user_id"
    )
    .eq("kind", kind)
    .eq("active", true)
    .order("granted_at", { ascending: false });
  if (error) {
    const missing = /battlepass_lp_grants|relation|does not exist|schema cache/i.test(error.message);
    return { ok: false, error: missing ? "Run supabase/battlepass_lp_grants.sql." : error.message };
  }
  const base = (rows ?? []) as Omit<
    BattlePassGrantListItem,
    "website_username" | "website_email" | "granted_by_username"
  >[];
  const userIds = new Set<number>();
  for (const r of base) {
    if (r.website_user_id != null) userIds.add(r.website_user_id);
    if (r.granted_by_user_id != null) userIds.add(r.granted_by_user_id);
  }
  if (userIds.size === 0) {
    return {
      ok: true,
      grants: base.map((r) => ({
        ...r,
        website_username: null,
        website_email: null,
        granted_by_username: null,
      })),
    };
  }
  const { data: users, error: uErr } = await supabase
    .from("users")
    .select("id, username, email")
    .in("id", [...userIds]);
  if (uErr) return { ok: false, error: uErr.message };
  const byId = new Map<number, { username: string; email: string }>();
  for (const u of users ?? []) {
    const row = u as { id: number; username: string; email: string };
    byId.set(row.id, { username: row.username, email: row.email });
  }
  return {
    ok: true,
    grants: base.map((r) => {
      const w = r.website_user_id != null ? byId.get(r.website_user_id) : undefined;
      const g = r.granted_by_user_id != null ? byId.get(r.granted_by_user_id) : undefined;
      return {
        ...r,
        website_username: w?.username ?? null,
        website_email: w?.email ?? null,
        granted_by_username: g?.username ?? null,
      };
    }),
  };
}
