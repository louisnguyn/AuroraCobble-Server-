import type { SupabaseClient } from "@supabase/supabase-js";
import { ASTERYN_POINTS_CURRENCY } from "./websiteCurrency.js";
import { fetchAsterynPointLeaderboardViaRcon } from "./minecraftRconAsterynPoint.js";
import { executeMinecraftRconCommand } from "./minecraftRconExecute.js";
import { topBalancesFromMap } from "./minecraftRconCobbledollars.js";

export type AsterynPointMigrateMatch = {
  ign: string;
  amount: number;
  userId: number;
  websiteName: string;
  walletAfter?: number;
};

export type AsterynPointMigrateSkip = {
  ign: string;
  amount: number;
};

export type AsterynPointMigratePlan = {
  boardCount: number;
  totalCredit: number;
  matched: AsterynPointMigrateMatch[];
  unmatched: AsterynPointMigrateSkip[];
  leaderboardError: string | null;
};

export type AsterynPointMigrateResult = AsterynPointMigratePlan & {
  applied: boolean;
  bankCleared: boolean;
  bankClearOutput: string | null;
  bankClearError: string | null;
};

async function creditWebsiteAp(
  supabase: SupabaseClient,
  userId: number,
  amount: number,
  ign: string
): Promise<number> {
  const now = new Date().toISOString();
  const { data: sel, error: selErr } = await supabase
    .from("user_currency")
    .select("id, balance")
    .eq("user_id", userId)
    .eq("currency_type", ASTERYN_POINTS_CURRENCY)
    .limit(1);
  if (selErr) throw new Error(selErr.message);
  const row = sel?.[0] as { id: number; balance: number } | undefined;
  const next = (row ? Number(row.balance) : 0) + amount;
  if (row) {
    const { error } = await supabase
      .from("user_currency")
      .update({ balance: next, updated_at: now })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("user_currency").insert({
      user_id: userId,
      currency_type: ASTERYN_POINTS_CURRENCY,
      balance: next,
    });
    if (error) throw new Error(error.message);
  }
  const { error: ledErr } = await supabase.from("user_cobbledollar_ledger").insert({
    user_id: userId,
    delta: amount,
    balance_after: next,
    kind: "ingame_ap_migrate",
    detail: `From in-game AsterynPoints (${ign})`,
  });
  if (ledErr) console.warn("[ingame-ap-migrate ledger]", ledErr.message);
  return next;
}

export async function planAsterynPointMigration(
  supabase: SupabaseClient
): Promise<AsterynPointMigratePlan> {
  const r = await fetchAsterynPointLeaderboardViaRcon();
  if (r.error && r.balances.size === 0) {
    throw new Error(r.error);
  }
  const rows = topBalancesFromMap(r.balances, 200).filter(
    (row) => Number.isFinite(row.balance) && row.balance > 0
  );
  const { data: users, error: uErr } = await supabase.from("users").select("id, username");
  if (uErr) throw new Error(uErr.message);

  const byName = new Map<string, { id: number; username: string }>();
  for (const u of users ?? []) {
    const name = String((u as { username?: string }).username ?? "").trim();
    const id = Number((u as { id?: number }).id);
    if (!name || !Number.isFinite(id)) continue;
    const key = name.toLowerCase();
    if (!byName.has(key)) byName.set(key, { id, username: name });
  }

  const matched: AsterynPointMigrateMatch[] = [];
  const unmatched: AsterynPointMigrateSkip[] = [];
  for (const row of rows) {
    const amount = Math.trunc(row.balance);
    if (amount < 1) continue;
    const hit = byName.get(row.name.trim().toLowerCase());
    if (hit) matched.push({ ign: row.name, amount, userId: hit.id, websiteName: hit.username });
    else unmatched.push({ ign: row.name, amount });
  }

  return {
    boardCount: rows.length,
    totalCredit: matched.reduce((s, m) => s + m.amount, 0),
    matched,
    unmatched,
    leaderboardError: r.error ?? null,
  };
}

export async function applyAsterynPointMigration(
  supabase: SupabaseClient
): Promise<AsterynPointMigrateResult> {
  const plan = await planAsterynPointMigration(supabase);
  const credited: AsterynPointMigrateMatch[] = [];
  for (const m of plan.matched) {
    const walletAfter = await creditWebsiteAp(supabase, m.userId, m.amount, m.ign);
    credited.push({ ...m, walletAfter });
  }

  const cleared = await executeMinecraftRconCommand("asterynpoint bank clear");
  return {
    ...plan,
    matched: credited,
    applied: true,
    bankCleared: cleared.ok,
    bankClearOutput: cleared.ok ? (cleared.output ?? "").trim() || null : null,
    bankClearError: cleared.ok ? null : cleared.error,
  };
}
