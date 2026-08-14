import { supabase } from "./supabase.js";

export const HOLDEM_MIN_BUY_IN = 10_000;
export const HOLDEM_MAX_BUY_IN = 100_000;
export const HOLDEM_DEFAULT_BUY_IN = 50_000;
export const HOLDEM_DEFAULT_SB = 250;
export const HOLDEM_DEFAULT_BB = 500;
export const HOLDEM_MIN_SB = 100;
export const HOLDEM_MAX_SB = 2_500;
export const HOLDEM_MIN_PLAYERS = 2;
export const HOLDEM_MAX_PLAYERS = 6;
export const HOLDEM_ACTION_MS = 45_000;

export type PokerWalletDeps = {
  cobbledollarsCurrency: string;
  ensureUserCobbledollarsRow: (userId: number) => Promise<{ id: number; balance: number } | null>;
  recordCobbledollarLedger: (
    userId: number,
    delta: number,
    balanceAfter: number,
    kind: string,
    detail: string | null
  ) => Promise<void>;
  incrementUserCurrency: (
    userId: number,
    currencyType: string,
    amount: number,
    ledger?: { kind: string; detail?: string | null }
  ) => Promise<number>;
};

export function clampBuyIn(amount: unknown): number | null {
  const n = typeof amount === "number" ? amount : parseInt(String(amount ?? ""), 10);
  if (!Number.isInteger(n) || n < HOLDEM_MIN_BUY_IN || n > HOLDEM_MAX_BUY_IN) return null;
  return n;
}

export function clampBlind(amount: unknown, fallback: number): number {
  const n = typeof amount === "number" ? amount : parseInt(String(amount ?? ""), 10);
  if (!Number.isInteger(n) || n < HOLDEM_MIN_SB || n > HOLDEM_MAX_SB) return fallback;
  return n;
}

export async function spendPokerBuyIn(
  deps: PokerWalletDeps,
  userId: number,
  amount: number,
  detail: string
): Promise<{ ok: true; newBalance: number } | { ok: false; error: string; balance?: number }> {
  const row = await deps.ensureUserCobbledollarsRow(userId);
  if (!row) return { ok: false, error: "Could not open Asteryn Point wallet" };
  if (row.balance < amount) {
    return { ok: false, error: "Not enough website Asteryn Point for buy-in", balance: row.balance };
  }
  if (!supabase) return { ok: false, error: "Database not configured" };
  const newBalance = row.balance - amount;
  const now = new Date().toISOString();
  const { data: updated, error: updErr } = await supabase
    .from("user_currency")
    .update({ balance: newBalance, updated_at: now })
    .eq("id", row.id)
    .eq("balance", row.balance)
    .select("balance");
  if (updErr) return { ok: false, error: updErr.message };
  if (!updated?.length) return { ok: false, error: "Balance changed — try again" };
  await deps.recordCobbledollarLedger(userId, -amount, newBalance, "poker_bet", detail);
  return { ok: true, newBalance };
}

export async function creditPokerCashOut(
  deps: PokerWalletDeps,
  userId: number,
  amount: number,
  detail: string
): Promise<number> {
  if (amount <= 0) {
    const row = await deps.ensureUserCobbledollarsRow(userId);
    return row?.balance ?? 0;
  }
  return deps.incrementUserCurrency(userId, deps.cobbledollarsCurrency, amount, {
    kind: "poker_payout",
    detail,
  });
}

/** @deprecated use clampBuyIn */
export const POKER_MIN_BET = HOLDEM_MIN_BUY_IN;
export const POKER_MAX_BET = HOLDEM_MAX_BUY_IN;
export const POKER_MAX_PLAYERS = HOLDEM_MAX_PLAYERS;
export const POKER_MIN_PLAYERS = HOLDEM_MIN_PLAYERS;
export const POKER_DRAW_MS = HOLDEM_ACTION_MS;

export const clampPokerBet = clampBuyIn;
export const spendPokerBet = spendPokerBuyIn;
export const creditPokerPayout = creditPokerCashOut;
