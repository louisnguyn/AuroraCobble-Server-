import type { SupabaseClient } from "@supabase/supabase-js";
import type { RankedFeedKind } from "./cobbleRankedFeedAdmin.js";

export async function fetchReviewedKeySet(
  supabase: SupabaseClient,
  itemKeys: string[]
): Promise<Set<string>> {
  const out = new Set<string>();
  if (itemKeys.length === 0) return out;
  const unique = [...new Set(itemKeys)];
  const chunk = 200;
  for (let i = 0; i < unique.length; i += chunk) {
    const slice = unique.slice(i, i + chunk);
    const { data, error } = await supabase
      .from("cobble_ranked_feed_reviews")
      .select("item_key")
      .eq("reviewed", true)
      .in("item_key", slice);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const k = (row as { item_key?: string }).item_key;
      if (k) out.add(k);
    }
  }
  return out;
}

export async function upsertFeedReview(
  supabase: SupabaseClient,
  params: {
    itemKey: string;
    feedKind: RankedFeedKind;
    reviewed: boolean;
    reviewedByUserId: number;
  }
): Promise<void> {
  const now = new Date().toISOString();
  if (params.reviewed) {
    const { error } = await supabase.from("cobble_ranked_feed_reviews").upsert(
      {
        item_key: params.itemKey,
        feed_kind: params.feedKind,
        reviewed: true,
        reviewed_at: now,
        reviewed_by_user_id: params.reviewedByUserId,
      },
      { onConflict: "item_key" }
    );
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("cobble_ranked_feed_reviews").delete().eq("item_key", params.itemKey);
    if (error) throw new Error(error.message);
  }
}
