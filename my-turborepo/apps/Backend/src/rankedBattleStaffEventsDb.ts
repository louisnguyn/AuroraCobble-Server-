import { supabase } from "./supabase.js";

export type RankedBattleStaffEventKind = "elo_add" | "elo_remove" | "feed_review";

export type RankedBattleStaffEventListItem = {
  id: number;
  created_at: string;
  staff_user_id: number;
  staff_username: string | null;
  event_kind: RankedBattleStaffEventKind;
  minecraft_username: string | null;
  elo_amount: number | null;
  elo_format: string | null;
  elo_ok: boolean | null;
  elo_error: string | null;
  review_item_key: string | null;
  review_feed_kind: string | null;
  review_reviewed: boolean | null;
};

export async function insertRankedBattleStaffEvent(params: {
  staffUserId: number;
  eventKind: RankedBattleStaffEventKind;
  minecraftUsername?: string | null;
  eloAmount?: number | null;
  eloFormat?: string | null;
  eloOk?: boolean | null;
  eloError?: string | null;
  reviewItemKey?: string | null;
  reviewFeedKind?: string | null;
  reviewReviewed?: boolean | null;
}): Promise<void> {
  if (!supabase) return;
  const row = {
    staff_user_id: params.staffUserId,
    event_kind: params.eventKind,
    minecraft_username: params.minecraftUsername ?? null,
    elo_amount: params.eloAmount ?? null,
    elo_format: params.eloFormat ?? null,
    elo_ok: params.eloOk ?? null,
    elo_error: params.eloError ?? null,
    review_item_key: params.reviewItemKey ?? null,
    review_feed_kind: params.reviewFeedKind ?? null,
    review_reviewed: params.reviewReviewed ?? null,
  };
  const { error } = await supabase.from("ranked_battle_staff_events").insert(row);
  if (error) {
    console.error("[ranked-battle-staff-events] insert failed:", error.message);
  }
}

export async function listRankedBattleStaffEvents(
  limit: number
): Promise<{ ok: true; events: RankedBattleStaffEventListItem[] } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: "Database not configured" };
  const lim = Number.isFinite(limit) && limit > 0 ? Math.min(Math.trunc(limit), 500) : 100;
  const { data: rows, error } = await supabase
    .from("ranked_battle_staff_events")
    .select(
      "id, created_at, staff_user_id, event_kind, minecraft_username, elo_amount, elo_format, elo_ok, elo_error, review_item_key, review_feed_kind, review_reviewed"
    )
    .order("created_at", { ascending: false })
    .limit(lim);
  if (error) {
    const missing = /ranked_battle_staff_events|relation|does not exist|schema cache/i.test(error.message);
    return {
      ok: false,
      error: missing ? "Run supabase/ranked_battle_staff_events.sql." : error.message,
    };
  }
  const base = (rows ?? []) as Omit<RankedBattleStaffEventListItem, "staff_username">[];
  const ids = [...new Set(base.map((r) => r.staff_user_id))];
  if (ids.length === 0) return { ok: true, events: [] };
  const { data: users, error: uErr } = await supabase.from("users").select("id, username").in("id", ids);
  if (uErr) return { ok: false, error: uErr.message };
  const byId = new Map<number, string>();
  for (const u of users ?? []) {
    const row = u as { id: number; username: string };
    byId.set(row.id, row.username);
  }
  return {
    ok: true,
    events: base.map((r) => ({
      ...r,
      staff_username: byId.get(r.staff_user_id) ?? null,
    })),
  };
}
