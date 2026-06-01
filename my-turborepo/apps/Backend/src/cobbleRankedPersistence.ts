import { supabase } from "./supabase.js";

export const COBBLE_RANKED_SNAPSHOT_USAGE = "usage_stats";
export const COBBLE_RANKED_SNAPSHOT_LEADERBOARD = "leaderboard";

export type CobbleRankedMemoryStore = {
  usageStats: unknown;
  leaderboard: unknown;
  battleReplays: unknown[];
  matchResults: unknown[];
};

export async function hydrateCobbleRankedStore(
  target: CobbleRankedMemoryStore,
  feedMax: number
): Promise<void> {
  if (!supabase) return;
  try {
    const { data: snaps, error: snapErr } = await supabase
      .from("cobble_ranked_snapshots")
      .select("snapshot_key, payload")
      .in("snapshot_key", [COBBLE_RANKED_SNAPSHOT_USAGE, COBBLE_RANKED_SNAPSHOT_LEADERBOARD]);
    if (snapErr) throw snapErr;
    for (const row of snaps ?? []) {
      const key = row.snapshot_key as string;
      if (key === COBBLE_RANKED_SNAPSHOT_USAGE) target.usageStats = row.payload;
      if (key === COBBLE_RANKED_SNAPSHOT_LEADERBOARD) target.leaderboard = row.payload;
    }

    const { data: replays, error: brErr } = await supabase
      .from("cobble_ranked_battle_replays")
      .select("payload")
      .order("received_at", { ascending: false })
      .limit(feedMax);
    if (brErr) throw brErr;
    target.battleReplays = (replays ?? []).map((r) => r.payload);

    const { data: matches, error: mrErr } = await supabase
      .from("cobble_ranked_match_results")
      .select("payload")
      .order("received_at", { ascending: false })
      .limit(feedMax);
    if (mrErr) throw mrErr;
    target.matchResults = (matches ?? []).map((r) => r.payload);
  } catch (e) {
    console.warn(
      "[cobble-ranked-db] hydrate failed (tables missing? run supabase/cobble_ranked_mirror.sql):",
      e instanceof Error ? e.message : e
    );
  }
}

export async function persistCobbleRankedSnapshot(
  snapshotKey: string,
  payload: unknown
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("cobble_ranked_snapshots").upsert(
    {
      snapshot_key: snapshotKey,
      payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "snapshot_key" }
  );
  if (error) throw error;
}

export async function persistCobbleBattleReplay(payload: unknown, feedMax: number): Promise<void> {
  if (!supabase) return;
  const { error: insertErr } = await supabase.from("cobble_ranked_battle_replays").insert({ payload });
  if (insertErr) throw insertErr;
  const { error: trimErr } = await supabase.rpc("trim_cobble_ranked_battle_replays", {
    p_keep: feedMax,
  });
  if (trimErr) throw trimErr;
}

export async function persistCobbleMatchResult(payload: unknown, feedMax: number): Promise<void> {
  if (!supabase) return;
  const { error: insertErr } = await supabase.from("cobble_ranked_match_results").insert({ payload });
  if (insertErr) throw insertErr;
  const { error: trimErr } = await supabase.rpc("trim_cobble_ranked_match_results", {
    p_keep: feedMax,
  });
  if (trimErr) throw trimErr;
}

/** Remove all match results and battle replays from memory and database. */
export async function clearCobbleRankedFeed(
  target: CobbleRankedMemoryStore
): Promise<{ matchCount: number; replayCount: number }> {
  const matchCount = target.matchResults.length;
  const replayCount = target.battleReplays.length;
  target.matchResults = [];
  target.battleReplays = [];
  if (!supabase) return { matchCount, replayCount };

  const { error: mrErr } = await supabase.from("cobble_ranked_match_results").delete().gte("id", 0);
  if (mrErr) throw mrErr;
  const { error: brErr } = await supabase.from("cobble_ranked_battle_replays").delete().gte("id", 0);
  if (brErr) throw brErr;
  const { error: revErr } = await supabase.from("cobble_ranked_feed_reviews").delete().neq("item_key", "");
  if (revErr) throw revErr;

  return { matchCount, replayCount };
}
