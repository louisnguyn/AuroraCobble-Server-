import type { Express, Request, Response } from "express";
import multer from "multer";
import { supabase } from "./supabase.js";
import { uploadClanAvatarToStorage } from "./clanAvatarUpload.js";
import {
  bestEloForWebsiteUserFromLeaderboard,
  leaderboardPayloadHasSyncedData,
  UNRANKED_ELO_DEFAULT,
} from "./leaderboardPvpDerived.js";
import {
  CLAN_ABSOLUTE_MAX_MEMBERS,
  CLAN_ADMIN_XP_GRANT_MAX,
  CLAN_BASE_MAX_MEMBERS,
  CLAN_CREATE_COST,
  CLAN_DAILY_PER_MEMBER,
  CLAN_TREASURY_MILESTONE,
  CLAN_TREASURY_MILESTONES,
  CLAN_LEADERBOARD_DAILY_REWARD_TOP1,
  CLAN_LEADERBOARD_DAILY_REWARD_TOP2,
  CLAN_LEADERBOARD_REWARD_CATEGORIES,
  CLAN_XP_BASE_PER_DAILY_CLAIM,
  CLAN_XP_PER_LEVEL,
  CLAN_XP_STREAK_BONUS_PER_DAY,
  type ClanLeaderboardRewardCategory,
  clanDailyBankIncome,
  clanDailyIncomeMultiplier,
  clanDailyTicketBonus,
  clanHasDailyTicketBonus,
  clanLeaderboardDailyTreasuryBonus,
  clanLeaderboardDailyRewardForRank,
  clanLevelFromXp,
  clanMaxMembersFromTreasury,
  clanRejoinAvailableAt,
  clanXpInCurrentLevel,
  isClanRejoinBlocked,
  nextMemberUnlockTreasury,
} from "./clanLogic.js";
import { grantClanXpByAdmin } from "./clanXp.js";

const DAILY_RESET_TIMEZONE = "Asia/Ho_Chi_Minh";

type ClanDeps = {
  requireAuth: (req: Request, res: Response, next: () => void) => void;
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
  ensureUserTicketsWalletRow: (userId: number) => Promise<void>;
  cobbledollarsCurrency: string;
  ticketsCurrency: string;
  /** In-memory CobbleRanked leaderboard for live singles/doubles ELO. */
  getLiveLeaderboard?: () => unknown;
};

type ClanRow = {
  id: number;
  name: string;
  bio: string | null;
  avatar_url: string;
  leader_id: number;
  bank_balance: number;
  total_donated: number;
  xp: number;
  last_daily_income_date: string | null;
  created_at: string;
};

type MemberRow = {
  clan_id: number;
  user_id: number;
  role: string;
  donated_total: number;
  joined_at: string;
};

const CLAN_AVATAR_UPLOAD = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, /^image\/(png|jpeg|jpg|webp|gif)$/i.test(file.mimetype));
  },
});

function requireSupabase(res: Response): boolean {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return false;
  }
  return true;
}

function todayKeyInTimezone(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DAILY_RESET_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "00";
  const d = parts.find((p) => p.type === "day")?.value ?? "00";
  return `${y}-${m}-${d}`;
}

function normalizeClanName(raw: unknown): string | null {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (name.length < 2 || name.length > 32) return null;
  return name;
}

function normalizeClanBio(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const bio = raw.trim();
  if (!bio) return null;
  return bio.slice(0, 500);
}

function normalizeClanBioUpdate(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string") return undefined;
  const bio = raw.trim();
  if (!bio) return null;
  return bio.slice(0, 500);
}

function handleClanAvatarUpload(req: Request, res: Response, next: () => void): void {
  CLAN_AVATAR_UPLOAD.single("avatar")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ error: "Clan icon must be 2 MB or smaller." });
        return;
      }
      res.status(400).json({ error: err.message });
      return;
    }
    if (err) {
      res.status(400).json({ error: String((err as Error).message ?? err) });
      return;
    }
    next();
  });
}

async function loadPendingJoinRequests(clanId: number): Promise<
  Array<{ id: number; requester_id: number; requester_username: string; created_at: string }>
> {
  if (!supabase) return [];
  const { data: rows } = await supabase
    .from("clan_join_requests")
    .select("id, requester_id, created_at")
    .eq("clan_id", clanId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (!rows?.length) return [];
  const ids = rows.map((r) => (r as { requester_id: number }).requester_id);
  const { data: users } = await supabase.from("users").select("id, username").in("id", ids);
  const nameById = new Map((users ?? []).map((u) => [(u as { id: number }).id, (u as { username: string }).username]));

  const { data: members } = await supabase
    .from("clan_members")
    .select("user_id")
    .in("user_id", ids);
  const alreadyInClan = new Set((members ?? []).map((m) => (m as { user_id: number }).user_id));

  const out: Array<{ id: number; requester_id: number; requester_username: string; created_at: string }> = [];
  for (const r of rows) {
    const row = r as { id: number; requester_id: number; created_at: string };
    if (alreadyInClan.has(row.requester_id)) {
      await supabase.from("clan_join_requests").update({ status: "cancelled" }).eq("id", row.id);
      continue;
    }
    out.push({
      id: row.id,
      requester_id: row.requester_id,
      requester_username: nameById.get(row.requester_id) ?? `#${row.requester_id}`,
      created_at: row.created_at,
    });
  }
  return out;
}

async function addMemberFromJoinRequest(
  clanId: number,
  requesterId: number,
  requestId: number
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!supabase) return { ok: false, error: "Database not configured", status: 503 };

  const existingMembership = await getUserMembership(requesterId);
  if (existingMembership) {
    await supabase.from("clan_join_requests").update({ status: "cancelled" }).eq("id", requestId);
    return { ok: false, error: "That player is already in a clan.", status: 409 };
  }

  const rejoin = await assertCanJoinClan(requesterId);
  if (!rejoin.ok) {
    return { ok: false, error: rejoin.error, status: rejoin.status };
  }

  const { data: clan } = await supabase.from("clans").select("*").eq("id", clanId).maybeSingle();
  if (!clan) return { ok: false, error: "Clan not found", status: 404 };

  const { count } = await supabase
    .from("clan_members")
    .select("user_id", { count: "exact", head: true })
    .eq("clan_id", clanId);
  const memberCount = count ?? 0;
  const maxMembers = clanMaxMembersFromTreasury((clan as ClanRow).bank_balance);
  if (memberCount >= maxMembers) {
    return { ok: false, error: "Clan is full.", status: 400 };
  }

  const { error: memErr } = await supabase.from("clan_members").insert({
    clan_id: clanId,
    user_id: requesterId,
    role: "member",
    donated_total: 0,
  });
  if (memErr) {
    if (/unique|duplicate|primary/i.test(memErr.message)) {
      await supabase.from("clan_join_requests").update({ status: "cancelled" }).eq("id", requestId);
      return { ok: false, error: "That player is already in a clan.", status: 409 };
    }
    return { ok: false, error: memErr.message, status: 500 };
  }

  await supabase.from("clan_join_requests").update({ status: "accepted" }).eq("id", requestId);
  await supabase
    .from("clan_join_requests")
    .update({ status: "cancelled" })
    .eq("requester_id", requesterId)
    .eq("status", "pending")
    .neq("id", requestId);

  await clearClanLeaveCooldown(requesterId);

  return { ok: true };
}

async function getUserMembership(userId: number): Promise<(MemberRow & { clan: ClanRow }) | null> {
  if (!supabase) return null;
  const { data: member } = await supabase
    .from("clan_members")
    .select("clan_id, user_id, role, donated_total, joined_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) return null;
  const m = member as MemberRow;
  const { data: clan } = await supabase.from("clans").select("*").eq("id", m.clan_id).maybeSingle();
  if (!clan) return null;
  return { ...m, clan: clan as ClanRow };
}

async function findUserIdByUsername(username: string): Promise<{ id: number; username: string } | null> {
  if (!supabase) return null;
  const un = username.trim();
  if (!un) return null;
  const { data } = await supabase
    .from("users")
    .select("id, username")
    .ilike("username", un)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return data as { id: number; username: string };
}

async function getUserLastClanLeaveAt(userId: number): Promise<Date | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("clan_member_leaves")
    .select("left_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.warn("[clans] leave cooldown lookup:", error.message);
    return null;
  }
  if (!data) return null;
  return new Date((data as { left_at: string }).left_at);
}

async function getClanRejoinAvailableAt(userId: number): Promise<string | null> {
  const leftAt = await getUserLastClanLeaveAt(userId);
  if (!leftAt || !isClanRejoinBlocked(leftAt)) return null;
  return clanRejoinAvailableAt(leftAt).toISOString();
}

async function assertCanJoinClan(
  userId: number
): Promise<{ ok: true } | { ok: false; error: string; status: number; rejoin_available_at: string }> {
  const leftAt = await getUserLastClanLeaveAt(userId);
  if (!leftAt || !isClanRejoinBlocked(leftAt)) return { ok: true };
  const availableAt = clanRejoinAvailableAt(leftAt);
  return {
    ok: false,
    error: "You must wait 24 hours after leaving a clan before joining another.",
    status: 403,
    rejoin_available_at: availableAt.toISOString(),
  };
}

async function recordClanLeave(userId: number): Promise<void> {
  if (!supabase) return;
  const now = new Date().toISOString();
  await supabase.from("clan_member_leaves").upsert({ user_id: userId, left_at: now }, { onConflict: "user_id" });
  await supabase
    .from("clan_join_requests")
    .update({ status: "cancelled" })
    .eq("requester_id", userId)
    .eq("status", "pending");
}

async function clearClanLeaveCooldown(userId: number): Promise<void> {
  if (!supabase) return;
  await supabase.from("clan_member_leaves").delete().eq("user_id", userId);
}

async function userMayRequestClanJoin(userId: number): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase
    .from("users")
    .select("is_admin, minecraft_verified_at")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return false;
  const row = data as { is_admin?: boolean; minecraft_verified_at?: string | null };
  return !!row.is_admin || !!row.minecraft_verified_at;
}

async function loadDbElosForUserIds(userIds: number[]): Promise<Map<number, number | null>> {
  const out = new Map<number, number | null>();
  if (!supabase || userIds.length === 0) return out;
  const unique = [...new Set(userIds)];
  const { data, error } = await supabase
    .from("user_pvp_ranks")
    .select("user_id, elo")
    .in("user_id", unique);
  if (error) {
    console.warn("[clans] load elos:", error.message);
    return out;
  }
  for (const row of data ?? []) {
    const r = row as { user_id: number; elo: number | null };
    const elo = r.elo != null && Number.isFinite(r.elo) ? Math.trunc(r.elo) : null;
    out.set(r.user_id, elo);
  }
  return out;
}

function resolveMemberElo(
  username: string,
  dbElo: number | null | undefined,
  liveLeaderboard: unknown | null | undefined
): number {
  if (liveLeaderboard && leaderboardPayloadHasSyncedData(liveLeaderboard)) {
    return bestEloForWebsiteUserFromLeaderboard(liveLeaderboard, username);
  }
  if (dbElo != null && Number.isFinite(dbElo)) return Math.trunc(dbElo);
  return UNRANKED_ELO_DEFAULT;
}

async function loadElosForMembers(
  members: { user_id: number; username: string }[],
  getLiveLeaderboard?: () => unknown
): Promise<Map<number, number>> {
  const live = getLiveLeaderboard?.() ?? null;
  const dbByUser = await loadDbElosForUserIds(members.map((m) => m.user_id));
  const out = new Map<number, number>();
  for (const m of members) {
    out.set(m.user_id, resolveMemberElo(m.username, dbByUser.get(m.user_id), live));
  }
  return out;
}

function totalEloFromMemberElos(elos: number[]): number | null {
  if (elos.length === 0) return null;
  return elos.reduce((a, b) => a + b, 0);
}

async function loadTotalEloByClanIds(
  clanIds: number[],
  getLiveLeaderboard?: () => unknown
): Promise<Map<number, number | null>> {
  const out = new Map<number, number | null>();
  if (!supabase || clanIds.length === 0) return out;
  const { data: members, error } = await supabase
    .from("clan_members")
    .select("clan_id, user_id")
    .in("clan_id", clanIds);
  if (error || !members?.length) return out;
  const userIds = [...new Set(members.map((m) => (m as { user_id: number }).user_id))];
  const { data: users } = await supabase.from("users").select("id, username").in("id", userIds);
  const nameById = new Map((users ?? []).map((u) => [(u as { id: number }).id, (u as { username: string }).username]));
  const memberRows = members.map((raw) => {
    const m = raw as { clan_id: number; user_id: number };
    return {
      clan_id: m.clan_id,
      user_id: m.user_id,
      username: nameById.get(m.user_id) ?? "",
    };
  });
  const eloByUser = await loadElosForMembers(
    memberRows.map((m) => ({ user_id: m.user_id, username: m.username })),
    getLiveLeaderboard
  );
  const byClan = new Map<number, number[]>();
  for (const m of memberRows) {
    const elo = eloByUser.get(m.user_id) ?? UNRANKED_ELO_DEFAULT;
    const arr = byClan.get(m.clan_id) ?? [];
    arr.push(elo);
    byClan.set(m.clan_id, arr);
  }
  for (const id of clanIds) {
    const elos = byClan.get(id) ?? [];
    out.set(id, elos.length ? totalEloFromMemberElos(elos) : null);
  }
  return out;
}

async function loadClanMembers(
  clanId: number,
  getLiveLeaderboard?: () => unknown
): Promise<
  Array<{
    user_id: number;
    username: string;
    role: string;
    donated_total: number;
    joined_at: string;
    elo: number;
  }>
> {
  if (!supabase) return [];
  const { data: members } = await supabase
    .from("clan_members")
    .select("user_id, role, donated_total, joined_at")
    .eq("clan_id", clanId)
    .order("joined_at", { ascending: true });
  if (!members?.length) return [];
  const ids = members.map((m) => (m as { user_id: number }).user_id);
  const { data: users } = await supabase.from("users").select("id, username").in("id", ids);
  const nameById = new Map((users ?? []).map((u) => [(u as { id: number }).id, (u as { username: string }).username]));
  const memberInputs = members.map((m) => {
    const row = m as MemberRow;
    return {
      user_id: row.user_id,
      username: nameById.get(row.user_id) ?? `#${row.user_id}`,
    };
  });
  const eloByUser = await loadElosForMembers(memberInputs, getLiveLeaderboard);
  return members.map((m) => {
    const row = m as MemberRow;
    return {
      user_id: row.user_id,
      username: nameById.get(row.user_id) ?? `#${row.user_id}`,
      role: row.role,
      donated_total: row.donated_total,
      joined_at: row.joined_at,
      elo: eloByUser.get(row.user_id) ?? UNRANKED_ELO_DEFAULT,
    };
  });
}

function serializeClanPublic(
  clan: ClanRow,
  memberCount: number,
  leaderUsername: string,
  totalElo: number | null = null
) {
  const treasury = clan.bank_balance;
  const maxMembers = clanMaxMembersFromTreasury(treasury);
  const mult = clanDailyIncomeMultiplier(treasury);
  const xp = Math.max(0, clan.xp ?? 0);
  return {
    id: clan.id,
    name: clan.name,
    bio: clan.bio,
    avatar_url: clan.avatar_url,
    leader_id: clan.leader_id,
    leader_username: leaderUsername,
    member_count: memberCount,
    max_members: maxMembers,
    bank_balance: treasury,
    total_elo: totalElo,
    xp,
    level: clanLevelFromXp(xp),
    xp_in_level: clanXpInCurrentLevel(xp),
    xp_per_level: CLAN_XP_PER_LEVEL,
    daily_income_per_day: clanDailyBankIncome(memberCount, treasury),
    daily_income_multiplier: mult,
    daily_income_per_member: CLAN_DAILY_PER_MEMBER,
    has_daily_ticket_bonus: clanHasDailyTicketBonus(treasury),
    daily_ticket_bonus: clanDailyTicketBonus(treasury),
    next_member_unlock_treasury: nextMemberUnlockTreasury(treasury, maxMembers),
    treasury_milestone: CLAN_TREASURY_MILESTONE,
    treasury_milestones: CLAN_TREASURY_MILESTONES.map((m) => ({
      key: m.key,
      threshold: m.threshold,
      label: m.label,
      kind: m.kind,
    })),
    leaderboard_daily_reward_top1: CLAN_LEADERBOARD_DAILY_REWARD_TOP1,
    leaderboard_daily_reward_top2: CLAN_LEADERBOARD_DAILY_REWARD_TOP2,
    created_at: clan.created_at,
  };
}

type ClanLeaderboardRow = {
  rank: number;
  id: number;
  name: string;
  avatar_url: string;
  leader_username: string;
  member_count: number;
  bank_balance: number;
  total_elo: number | null;
  xp: number;
  level: number;
};

async function buildClanLeaderboards(
  getLiveLeaderboard: (() => unknown) | undefined,
  limit: number
): Promise<{ topTreasury: ClanLeaderboardRow[]; topTotalElo: ClanLeaderboardRow[]; topLevel: ClanLeaderboardRow[] }> {
  if (!supabase) return { topTreasury: [], topTotalElo: [], topLevel: [] };
  const { data: clans, error } = await supabase
    .from("clans")
    .select("id, name, avatar_url, leader_id, bank_balance, xp")
    .order("created_at", { ascending: false });
  if (error || !clans?.length) return { topTreasury: [], topTotalElo: [], topLevel: [] };

  const rows = clans as Pick<ClanRow, "id" | "name" | "avatar_url" | "leader_id" | "bank_balance" | "xp">[];
  const leaderIds = [...new Set(rows.map((c) => c.leader_id))];
  const { data: leaders } = await supabase.from("users").select("id, username").in("id", leaderIds);
  const leaderName = new Map(
    (leaders ?? []).map((u) => [(u as { id: number }).id, (u as { username: string }).username])
  );
  const clanIds = rows.map((c) => c.id);
  const totalEloByClan = await loadTotalEloByClanIds(clanIds, getLiveLeaderboard);
  const memberCounts = new Map<number, number>();
  for (const id of clanIds) {
    const { count } = await supabase
      .from("clan_members")
      .select("user_id", { count: "exact", head: true })
      .eq("clan_id", id);
    memberCounts.set(id, count ?? 0);
  }
  const base = rows.map((c) => {
    const xp = Math.max(0, c.xp ?? 0);
    return {
      id: c.id,
      name: c.name,
      avatar_url: c.avatar_url,
      leader_username: leaderName.get(c.leader_id) ?? `#${c.leader_id}`,
      member_count: memberCounts.get(c.id) ?? 0,
      bank_balance: c.bank_balance,
      total_elo: totalEloByClan.get(c.id) ?? null,
      xp,
      level: clanLevelFromXp(xp),
    };
  });
  const topTreasury = [...base]
    .sort((a, b) => b.bank_balance - a.bank_balance || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((row, i) => ({ ...row, rank: i + 1 }));
  const topTotalElo = [...base]
    .filter((row) => row.total_elo != null)
    .sort((a, b) => (b.total_elo ?? 0) - (a.total_elo ?? 0) || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((row, i) => ({ ...row, rank: i + 1 }));
  const topLevel = [...base]
    .sort(
      (a, b) =>
        b.level - a.level || b.xp - a.xp || a.name.localeCompare(b.name)
    )
    .slice(0, limit)
    .map((row, i) => ({ ...row, rank: i + 1 }));
  return { topTreasury, topTotalElo, topLevel };
}

function clanLeaderboardRanksForClan(
  clanId: number,
  topTreasury: ClanLeaderboardRow[],
  topTotalElo: ClanLeaderboardRow[],
  topLevel: ClanLeaderboardRow[]
): { top_treasury: number | null; top_total_elo: number | null; top_level: number | null } {
  return {
    top_treasury: topTreasury.find((r) => r.id === clanId)?.rank ?? null,
    top_total_elo: topTotalElo.find((r) => r.id === clanId)?.rank ?? null,
    top_level: topLevel.find((r) => r.id === clanId)?.rank ?? null,
  };
}

async function loadRecentLeaderboardPayoutsForClan(
  clanId: number,
  limit = 8
): Promise<Array<{ payout_date: string; category: ClanLeaderboardRewardCategory; amount: number; paid_at: string; rank_position: number }>> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("clan_leaderboard_daily_payouts")
    .select("payout_date, category, amount, paid_at, rank_position")
    .eq("clan_id", clanId)
    .order("paid_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("[clans] load leaderboard payouts:", error.message);
    return [];
  }
  return (data ?? []) as Array<{
    payout_date: string;
    category: ClanLeaderboardRewardCategory;
    amount: number;
    paid_at: string;
    rank_position: number;
  }>;
}

function leaderboardRewardsMeta() {
  return {
    top1_per_category: CLAN_LEADERBOARD_DAILY_REWARD_TOP1,
    top2_per_category: CLAN_LEADERBOARD_DAILY_REWARD_TOP2,
    categories: CLAN_LEADERBOARD_REWARD_CATEGORIES,
    timezone: DAILY_RESET_TIMEZONE,
    schedule:
      "Daily at 00:00 — member income & leaderboard bonuses to treasury; ticket milestones to members",
  };
}

async function spendCobbledollars(
  deps: ClanDeps,
  userId: number,
  amount: number,
  kind: string,
  detail: string
): Promise<{ ok: true; newBalance: number } | { ok: false; error: string; status: number; balance?: number }> {
  const row = await deps.ensureUserCobbledollarsRow(userId);
  if (!row) return { ok: false, error: "Could not open Cobble$ wallet", status: 500 };
  if (row.balance < amount) {
    return {
      ok: false,
      error: "Not enough website Cobble$",
      status: 400,
      balance: row.balance,
    };
  }
  const newBalance = row.balance - amount;
  const now = new Date().toISOString();
  const { data: updated, error: updErr } = await supabase!
    .from("user_currency")
    .update({ balance: newBalance, updated_at: now })
    .eq("id", row.id)
    .eq("balance", row.balance)
    .select("balance");
  if (updErr) return { ok: false, error: updErr.message, status: 500 };
  if (!updated?.length) return { ok: false, error: "Balance changed — try again", status: 409 };
  await deps.recordCobbledollarLedger(userId, -amount, newBalance, kind, detail);
  return { ok: true, newBalance };
}

async function creditCobbledollars(
  deps: ClanDeps,
  userId: number,
  amount: number,
  kind: string,
  detail: string
): Promise<void> {
  await deps.incrementUserCurrency(userId, deps.cobbledollarsCurrency, amount, { kind, detail });
}

export async function runClanDailyIncome(deps: ClanDeps): Promise<{ processed: number; date: string }> {
  if (!supabase) return { processed: 0, date: todayKeyInTimezone() };
  const today = todayKeyInTimezone();
  const { data: clans, error } = await supabase.from("clans").select("id, bank_balance");
  if (error) {
    console.warn("[clan-daily] load clans:", error.message);
    return { processed: 0, date: today };
  }
  if (!clans?.length) return { processed: 0, date: today };

  let processed = 0;
  for (const raw of clans) {
    const clan = raw as { id: number; bank_balance: number };

    const { data: existingPayout } = await supabase
      .from("clan_daily_member_income_payouts")
      .select("id")
      .eq("clan_id", clan.id)
      .eq("payout_date", today)
      .maybeSingle();
    if (existingPayout) continue;

    const { count } = await supabase
      .from("clan_members")
      .select("user_id", { count: "exact", head: true })
      .eq("clan_id", clan.id);
    const memberCount = count ?? 0;
    if (memberCount < 1) continue;

    const income = clanDailyBankIncome(memberCount, clan.bank_balance);
    if (income < 1) continue;

    const newBank = clan.bank_balance + income;
    const now = new Date().toISOString();

    const { data: updated, error: updErr } = await supabase
      .from("clans")
      .update({
        bank_balance: newBank,
        last_daily_income_date: today,
        updated_at: now,
      })
      .eq("id", clan.id)
      .eq("bank_balance", clan.bank_balance)
      .select("id");
    if (updErr) {
      console.warn(`[clan-daily] treasury update failed clan #${clan.id}:`, updErr.message);
      continue;
    }
    if (!updated?.length) {
      console.warn(`[clan-daily] treasury update skipped clan #${clan.id} (balance changed concurrently)`);
      continue;
    }

    const { error: logErr } = await supabase.from("clan_daily_member_income_payouts").insert({
      clan_id: clan.id,
      payout_date: today,
      member_count: memberCount,
      income_amount: income,
      paid_at: now,
    });
    if (logErr) {
      console.warn(`[clan-daily] payout log failed clan #${clan.id}:`, logErr.message);
      if (/clan_daily_member_income_payouts|relation|does not exist|schema cache/i.test(logErr.message)) {
        console.warn("[clan-daily] Run supabase/clan_daily_member_income_payouts.sql in Supabase SQL Editor.");
      }
      await supabase
        .from("clans")
        .update({ bank_balance: clan.bank_balance, updated_at: now })
        .eq("id", clan.id)
        .eq("bank_balance", newBank);
      continue;
    }

    processed += 1;
    console.log(
      `[clan-daily] clan #${clan.id} +${income} CD treasury (${clan.bank_balance} → ${newBank}) members=${memberCount}`
    );

    if (clanHasDailyTicketBonus(newBank)) {
      const ticketBonus = clanDailyTicketBonus(newBank);
      const { data: members } = await supabase
        .from("clan_members")
        .select("user_id")
        .eq("clan_id", clan.id);
      let ticketsGranted = 0;
      for (const m of members ?? []) {
        const uid = (m as { user_id: number }).user_id;
        try {
          await deps.ensureUserTicketsWalletRow(uid);
          const newTicketBalance = await deps.incrementUserCurrency(
            uid,
            deps.ticketsCurrency,
            ticketBonus,
            {
              kind: "clan_daily_tickets",
              detail: `clan #${clan.id} · ${today}`,
            }
          );
          ticketsGranted += 1;
          console.log(
            `[clan-daily] clan #${clan.id} user #${uid} +${ticketBonus} ${deps.ticketsCurrency} (balance ${newTicketBalance})`
          );
        } catch (ticketErr) {
          const msg = ticketErr instanceof Error ? ticketErr.message : String(ticketErr);
          console.warn(`[clan-daily] ticket grant failed clan #${clan.id} user #${uid}:`, msg);
        }
      }
      console.log(
        `[clan-daily] clan #${clan.id} tickets +${ticketBonus}/member granted=${ticketsGranted}/${members?.length ?? 0} treasury=${newBank}`
      );
    }
  }
  return { processed, date: today };
}

export async function runClanLeaderboardDailyRewards(
  getLiveLeaderboard?: () => unknown
): Promise<{
  date: string;
  paid: Array<{ category: ClanLeaderboardRewardCategory; clan_id: number; amount: number; rank_position: number }>;
}> {
  if (!supabase) return { date: todayKeyInTimezone(), paid: [] };
  const today = todayKeyInTimezone();
  const paid: Array<{
    category: ClanLeaderboardRewardCategory;
    clan_id: number;
    amount: number;
    rank_position: number;
  }> = [];

  const { topTreasury, topTotalElo, topLevel } = await buildClanLeaderboards(getLiveLeaderboard, 2);
  const boards: { category: ClanLeaderboardRewardCategory; rows: ClanLeaderboardRow[] }[] = [
    { category: "top_treasury", rows: topTreasury },
    { category: "top_average_elo", rows: topTotalElo },
    { category: "top_level", rows: topLevel },
  ];

  for (const { category, rows } of boards) {
    for (const row of rows) {
      const rankPosition = row.rank;
      if (rankPosition !== 1 && rankPosition !== 2) continue;

      const { data: existing } = await supabase
        .from("clan_leaderboard_daily_payouts")
        .select("id")
        .eq("payout_date", today)
        .eq("category", category)
        .eq("rank_position", rankPosition)
        .maybeSingle();
      if (existing) continue;

      const amount = clanLeaderboardDailyRewardForRank(rankPosition);
      const { data: clan, error: clanErr } = await supabase
        .from("clans")
        .select("id, bank_balance")
        .eq("id", row.id)
        .maybeSingle();
      if (clanErr || !clan) {
        console.warn(
          `[clan-lb-daily] clan ${row.id} missing for ${category} #${rankPosition}:`,
          clanErr?.message ?? "not found"
        );
        continue;
      }

      const clanRow = clan as { id: number; bank_balance: number };
      const newBank = clanRow.bank_balance + amount;
      const now = new Date().toISOString();

      const { data: updated, error: updErr } = await supabase
        .from("clans")
        .update({ bank_balance: newBank, updated_at: now })
        .eq("id", row.id)
        .eq("bank_balance", clanRow.bank_balance)
        .select("id");
      if (updErr || !updated?.length) {
        console.warn(
          `[clan-lb-daily] treasury update failed ${category} #${rankPosition} clan #${row.id}:`,
          updErr?.message ?? "conflict"
        );
        continue;
      }

      const { error: insErr } = await supabase.from("clan_leaderboard_daily_payouts").insert({
        payout_date: today,
        category,
        clan_id: row.id,
        rank_position: rankPosition,
        amount,
        paid_at: now,
      });
      if (insErr) {
        console.warn(
          `[clan-lb-daily] payout log failed ${category} #${rankPosition} clan #${row.id}:`,
          insErr.message
        );
        await supabase
          .from("clans")
          .update({ bank_balance: clanRow.bank_balance, updated_at: now })
          .eq("id", row.id)
          .eq("bank_balance", newBank);
        continue;
      }

      paid.push({ category, clan_id: row.id, amount, rank_position: rankPosition });
    }
  }

  return { date: today, paid };
}

let clanDailyPayoutLastAttemptMinute = "";

/** Member income + leaderboard rewards — both at 00:00 Asia/Ho_Chi_Minh (same tick as PvP daily payout). */
export function startClanDailyIncomeScheduler(deps: ClanDeps): void {
  if (process.env.CLAN_DAILY_INCOME_DISABLE === "true") return;
  const tick = async () => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: DAILY_RESET_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")?.value ?? "0000";
    const m = parts.find((p) => p.type === "month")?.value ?? "00";
    const d = parts.find((p) => p.type === "day")?.value ?? "00";
    const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
    const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
    const key = `${y}-${m}-${d} ${hh}:${mm}`;

    if (hh !== "00" || mm !== "00") return;
    if (clanDailyPayoutLastAttemptMinute === key) return;
    clanDailyPayoutLastAttemptMinute = key;

    let memberCredited = 0;
    let payoutDate = todayKeyInTimezone();
    try {
      const result = await runClanDailyIncome(deps);
      memberCredited = result.processed;
      payoutDate = result.date;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[clan-daily] member income error: ${msg}`);
    }

    let leaderboardPaid = 0;
    try {
      const lbResult = await runClanLeaderboardDailyRewards(deps.getLiveLeaderboard);
      leaderboardPaid = lbResult.paid.length;
      payoutDate = lbResult.date;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[clan-daily] leaderboard rewards error: ${msg}`);
    }

    console.log(
      `[clan-daily] date=${payoutDate} member_income_clans=${memberCredited} leaderboard_payouts=${leaderboardPaid}`
    );
  };
  void tick();
  setInterval(() => void tick(), 60_000);
}

export function registerClanRoutes(app: Express, deps: ClanDeps): void {
  const { requireAuth, getLiveLeaderboard } = deps;

  app.get("/clans/leaderboards", async (req, res) => {
    if (!requireSupabase(res)) return;
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
    const { topTreasury, topTotalElo, topLevel } = await buildClanLeaderboards(getLiveLeaderboard, limit);
    res.json({
      top_treasury: topTreasury,
      top_total_elo: topTotalElo,
      top_level: topLevel,
      rewards: leaderboardRewardsMeta(),
    });
  });

  app.get("/clans", async (req, res) => {
    if (!requireSupabase(res)) return;
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const q = String(req.query.q ?? "").trim().toLowerCase();

    const { data: clans, error } = await supabase!
      .from("clans")
      .select("id, name, bio, avatar_url, leader_id, bank_balance, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const rows: ClanRow[] = (clans ?? []) as ClanRow[];
    const leaderIds = [...new Set(rows.map((c) => c.leader_id))];
    const { data: leaders } = await supabase!.from("users").select("id, username").in("id", leaderIds);
    const leaderName = new Map((leaders ?? []).map((u) => [(u as { id: number }).id, (u as { username: string }).username]));

    const clanIds = rows.map((c) => c.id);
    const totalEloByClan = await loadTotalEloByClanIds(clanIds, getLiveLeaderboard);

    const out = [];
    for (const clan of rows) {
      if (q && !clan.name.toLowerCase().includes(q)) continue;
      const { count } = await supabase!
        .from("clan_members")
        .select("user_id", { count: "exact", head: true })
        .eq("clan_id", clan.id);
      out.push(
        serializeClanPublic(
          clan,
          count ?? 0,
          leaderName.get(clan.leader_id) ?? `#${clan.leader_id}`,
          totalEloByClan.get(clan.id) ?? null
        )
      );
    }
    res.json({
      rows: out,
      create_cost: CLAN_CREATE_COST,
      rules: {
        base_max_members: CLAN_BASE_MAX_MEMBERS,
        absolute_max: CLAN_ABSOLUTE_MAX_MEMBERS,
        treasury_milestone: CLAN_TREASURY_MILESTONE,
        clan_xp: {
          base_per_daily_claim: CLAN_XP_BASE_PER_DAILY_CLAIM,
          streak_bonus_per_day: CLAN_XP_STREAK_BONUS_PER_DAY,
          per_level: CLAN_XP_PER_LEVEL,
        },
        leaderboard_rewards: leaderboardRewardsMeta(),
      },
    });
  });

  app.get("/clans/mine", requireAuth, async (_req, res) => {
    if (!requireSupabase(res)) return;
    const userId = res.locals.user!.userId;
    const membership = await getUserMembership(userId);
    if (!membership) {
      const { data: myRequests } = await supabase!
        .from("clan_join_requests")
        .select("id, clan_id, created_at")
        .eq("requester_id", userId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      res.json({ clan: null, my_pending_join_requests: myRequests ?? [], rejoin_available_at: await getClanRejoinAvailableAt(userId) });
      return;
    }
    const members = await loadClanMembers(membership.clan.id, getLiveLeaderboard);
    const leader = members.find((m) => m.role === "leader");
    const { topTreasury, topTotalElo, topLevel } = await buildClanLeaderboards(getLiveLeaderboard, 50);
    const lbRanks = clanLeaderboardRanksForClan(membership.clan.id, topTreasury, topTotalElo, topLevel);
    const [recentLeaderboardPayouts, recentDonations, recentDisbursements] = await Promise.all([
      loadRecentLeaderboardPayoutsForClan(membership.clan.id),
      loadRecentDonationsForClan(membership.clan.id, 20),
      loadRecentDisbursementsForClan(membership.clan.id, 20),
    ]);
    const payload = serializeClanPublic(
      membership.clan,
      members.length,
      leader?.username ?? `#${membership.clan.leader_id}`,
      totalEloFromMemberElos(members.map((m) => m.elo))
    );
    const pendingJoinRequests =
      membership.role === "leader" ? await loadPendingJoinRequests(membership.clan.id) : [];
    res.json({
      clan: {
        ...payload,
        my_role: membership.role,
        my_donated_total: membership.donated_total,
        members,
        leaderboard_ranks: lbRanks,
        leaderboard_daily_treasury_bonus: clanLeaderboardDailyTreasuryBonus(lbRanks),
        recent_leaderboard_payouts: recentLeaderboardPayouts,
        recent_donations: recentDonations,
        recent_disbursements: recentDisbursements,
      },
      pending_join_requests: pendingJoinRequests,
      my_pending_join_requests: [],
      rejoin_available_at: null,
    });
  });

  app.get("/clans/:clanId", async (req, res) => {
    if (!requireSupabase(res)) return;
    const clanId = Number(req.params.clanId);
    if (!Number.isFinite(clanId)) {
      res.status(400).json({ error: "Invalid clan id" });
      return;
    }
    const { data: clan, error } = await supabase!.from("clans").select("*").eq("id", clanId).maybeSingle();
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    if (!clan) {
      res.status(404).json({ error: "Clan not found" });
      return;
    }
    const members = await loadClanMembers(clanId, getLiveLeaderboard);
    const leader = members.find((m) => m.role === "leader");
    res.json({
      clan: {
        ...serializeClanPublic(
          clan as ClanRow,
          members.length,
          leader?.username ?? `#${(clan as ClanRow).leader_id}`,
          totalEloFromMemberElos(members.map((m) => m.elo))
        ),
        members,
      },
    });
  });

  app.post("/clans/create", requireAuth, handleClanAvatarUpload, async (req, res) => {
      if (!requireSupabase(res)) return;
      const userId = res.locals.user!.userId;
      const name = normalizeClanName(req.body?.name);
      const bio = normalizeClanBio(req.body?.bio);
      const buf = req.file?.buffer;
      if (!name) {
        res.status(400).json({ error: "Clan name must be 2–32 characters." });
        return;
      }
      if (!Buffer.isBuffer(buf)) {
        res.status(400).json({ error: "Choose a clan icon (PNG, JPEG, WebP, or GIF)." });
        return;
      }

      const existingMembership = await getUserMembership(userId);
      if (existingMembership) {
        res.status(409).json({ error: "You are already in a clan." });
        return;
      }

      const { data: nameTaken } = await supabase!
        .from("clans")
        .select("id")
        .ilike("name", name)
        .limit(1)
        .maybeSingle();
      if (nameTaken) {
        res.status(409).json({ error: "Clan name already taken." });
        return;
      }

      const spend = await spendCobbledollars(deps, userId, CLAN_CREATE_COST, "clan_create", name);
      if (!spend.ok) {
        res.status(spend.status).json({
          error: spend.error,
          balance: spend.balance,
          required: CLAN_CREATE_COST,
        });
        return;
      }

      const placeholderAvatar = "https://placehold.co/128x128/png?text=Clan";
      const { data: inserted, error: insErr } = await supabase!
        .from("clans")
        .insert({
          name,
          bio,
          avatar_url: placeholderAvatar,
          leader_id: userId,
          bank_balance: 0,
          total_donated: 0,
        })
        .select("id")
        .single();

      if (insErr || !inserted) {
        await creditCobbledollars(deps, userId, CLAN_CREATE_COST, "clan_create_refund", name);
        res.status(500).json({ error: insErr?.message ?? "Could not create clan" });
        return;
      }

      const clanId = (inserted as { id: number }).id;
      const up = await uploadClanAvatarToStorage(supabase!, clanId, buf);
      if ("error" in up) {
        await supabase!.from("clans").delete().eq("id", clanId);
        await creditCobbledollars(deps, userId, CLAN_CREATE_COST, "clan_create_refund", name);
        res.status(400).json({ error: up.error });
        return;
      }

      const { error: memErr } = await supabase!.from("clan_members").insert({
        clan_id: clanId,
        user_id: userId,
        role: "leader",
        donated_total: 0,
      });
      if (memErr) {
        await supabase!.from("clans").delete().eq("id", clanId);
        await creditCobbledollars(deps, userId, CLAN_CREATE_COST, "clan_create_refund", name);
        res.status(500).json({ error: memErr.message });
        return;
      }

      await supabase!.from("clans").update({ avatar_url: up.publicUrl, updated_at: new Date().toISOString() }).eq("id", clanId);

      const { data: clan } = await supabase!.from("clans").select("*").eq("id", clanId).single();
      const { data: userRow } = await supabase!.from("users").select("username").eq("id", userId).single();
      res.status(201).json({
        ok: true,
        new_balance: spend.newBalance,
        clan: serializeClanPublic(
          clan as ClanRow,
          1,
          (userRow as { username: string } | null)?.username ?? `#${userId}`
        ),
      });
  });

  app.patch("/clans/:clanId", requireAuth, handleClanAvatarUpload, async (req, res) => {
    if (!requireSupabase(res)) return;
    const userId = res.locals.user!.userId;
    const clanId = Number(req.params.clanId);
    if (!Number.isFinite(clanId)) {
      res.status(400).json({ error: "Invalid clan id" });
      return;
    }

    const membership = await getUserMembership(userId);
    if (!membership || membership.clan_id !== clanId || membership.role !== "leader") {
      res.status(403).json({ error: "Only the clan leader can update clan details." });
      return;
    }

    const updates: {
      name?: string;
      bio?: string | null;
      avatar_url?: string;
      updated_at: string;
    } = { updated_at: new Date().toISOString() };

    if (req.body?.name !== undefined) {
      const name = normalizeClanName(req.body.name);
      if (!name) {
        res.status(400).json({ error: "Clan name must be 2–32 characters." });
        return;
      }
      const currentName = membership.clan.name.trim().toLowerCase();
      if (name.toLowerCase() !== currentName) {
        const { data: nameTaken } = await supabase!
          .from("clans")
          .select("id")
          .ilike("name", name)
          .neq("id", clanId)
          .limit(1)
          .maybeSingle();
        if (nameTaken) {
          res.status(409).json({ error: "Clan name already taken." });
          return;
        }
      }
      updates.name = name;
    }

    if (req.body?.bio !== undefined) {
      const bio = normalizeClanBioUpdate(req.body.bio);
      if (bio === undefined) {
        res.status(400).json({ error: "Invalid bio." });
        return;
      }
      updates.bio = bio;
    }

    const buf = req.file?.buffer;
    if (Buffer.isBuffer(buf)) {
      const up = await uploadClanAvatarToStorage(supabase!, clanId, buf);
      if ("error" in up) {
        res.status(400).json({ error: up.error });
        return;
      }
      updates.avatar_url = up.publicUrl;
    }

    if (Object.keys(updates).length <= 1) {
      res.status(400).json({ error: "Nothing to update." });
      return;
    }

    const { data: clan, error: updErr } = await supabase!
      .from("clans")
      .update(updates)
      .eq("id", clanId)
      .select("*")
      .single();
    if (updErr || !clan) {
      res.status(500).json({ error: updErr?.message ?? "Could not update clan" });
      return;
    }

    const members = await loadClanMembers(clanId, getLiveLeaderboard);
    const leader = members.find((m) => m.role === "leader");
    const { topTreasury, topTotalElo, topLevel } = await buildClanLeaderboards(getLiveLeaderboard, 50);
    const lbRanks = clanLeaderboardRanksForClan(clanId, topTreasury, topTotalElo, topLevel);
    const recentLeaderboardPayouts = await loadRecentLeaderboardPayoutsForClan(clanId);
    const payload = serializeClanPublic(
      clan as ClanRow,
      members.length,
      leader?.username ?? `#${(clan as ClanRow).leader_id}`,
      totalEloFromMemberElos(members.map((m) => m.elo))
    );

    res.json({
      ok: true,
      clan: {
        ...payload,
        my_role: membership.role,
        my_donated_total: membership.donated_total,
        members,
        leaderboard_ranks: lbRanks,
        leaderboard_daily_treasury_bonus: clanLeaderboardDailyTreasuryBonus(lbRanks),
        recent_leaderboard_payouts: recentLeaderboardPayouts,
      },
    });
  });

  app.post("/clans/:clanId/donate", requireAuth, async (req, res) => {
    if (!requireSupabase(res)) return;
    const userId = res.locals.user!.userId;
    const clanId = Number(req.params.clanId);
    const raw = (req.body ?? {}).amount;
    const amount =
      typeof raw === "number" ? raw : typeof raw === "string" ? parseInt(raw, 10) : NaN;
    if (!Number.isFinite(clanId) || !Number.isInteger(amount) || amount < 1) {
      res.status(400).json({ error: "amount must be a positive whole number" });
      return;
    }

    const membership = await getUserMembership(userId);
    if (!membership || membership.clan_id !== clanId) {
      res.status(403).json({ error: "You must be a member of this clan to donate." });
      return;
    }

    const spend = await spendCobbledollars(deps, userId, amount, "clan_donate", `clan #${clanId}`);
    if (!spend.ok) {
      res.status(spend.status).json({ error: spend.error, balance: spend.balance });
      return;
    }

    const clan = membership.clan;
    const newBank = clan.bank_balance + amount;
    const newMemberDonated = membership.donated_total + amount;
    const now = new Date().toISOString();

    const { data: clanUpdated, error: clanErr } = await supabase!
      .from("clans")
      .update({
        bank_balance: newBank,
        updated_at: now,
      })
      .eq("id", clanId)
      .eq("bank_balance", clan.bank_balance)
      .select("id");
    if (clanErr || !clanUpdated?.length) {
      await creditCobbledollars(deps, userId, amount, "clan_donate_refund", `clan #${clanId}`);
      res.status(409).json({ error: "Clan balance changed — try again" });
      return;
    }

    await supabase!
      .from("clan_members")
      .update({ donated_total: newMemberDonated })
      .eq("clan_id", clanId)
      .eq("user_id", userId);
    await supabase!.from("clan_donations").insert({ clan_id: clanId, user_id: userId, amount });

    const { data: freshClan } = await supabase!.from("clans").select("*").eq("id", clanId).single();
    const members = await loadClanMembers(clanId, getLiveLeaderboard);
    const leader = members.find((m) => m.role === "leader");

    res.json({
      ok: true,
      new_balance: spend.newBalance,
      clan: serializeClanPublic(
        freshClan as ClanRow,
        members.length,
        leader?.username ?? `#${(freshClan as ClanRow).leader_id}`,
        totalEloFromMemberElos(members.map((m) => m.elo))
      ),
    });
  });

  app.post("/clans/:clanId/join-request", requireAuth, async (req, res) => {
    if (!requireSupabase(res)) return;
    const userId = res.locals.user!.userId;
    const clanId = Number(req.params.clanId);
    if (!Number.isFinite(clanId)) {
      res.status(400).json({ error: "Invalid clan id" });
      return;
    }

    const existingMembership = await getUserMembership(userId);
    if (existingMembership) {
      res.status(409).json({ error: "You are already in a clan." });
      return;
    }

    const rejoin = await assertCanJoinClan(userId);
    if (!rejoin.ok) {
      res.status(rejoin.status).json({ error: rejoin.error, rejoin_available_at: rejoin.rejoin_available_at });
      return;
    }

    if (!(await userMayRequestClanJoin(userId))) {
      res.status(403).json({
        error: "Account verification is required to request joining a clan.",
      });
      return;
    }

    const { data: clan } = await supabase!.from("clans").select("*").eq("id", clanId).maybeSingle();
    if (!clan) {
      res.status(404).json({ error: "Clan not found" });
      return;
    }

    const { count } = await supabase!
      .from("clan_members")
      .select("user_id", { count: "exact", head: true })
      .eq("clan_id", clanId);
    const memberCount = count ?? 0;
    const maxMembers = clanMaxMembersFromTreasury((clan as ClanRow).bank_balance);
    if (memberCount >= maxMembers) {
      res.status(400).json({ error: "This clan is full." });
      return;
    }

    if ((clan as ClanRow).leader_id === userId) {
      res.status(400).json({ error: "You cannot request to join your own clan." });
      return;
    }

    const { data: existingReq } = await supabase!
      .from("clan_join_requests")
      .select("id")
      .eq("clan_id", clanId)
      .eq("requester_id", userId)
      .eq("status", "pending")
      .maybeSingle();
    if (existingReq) {
      res.status(409).json({ error: "You already have a pending request for this clan." });
      return;
    }

    const { data: request, error } = await supabase!
      .from("clan_join_requests")
      .insert({
        clan_id: clanId,
        requester_id: userId,
        status: "pending",
      })
      .select("id, clan_id, created_at")
      .single();
    if (error) {
      if (/unique|duplicate/i.test(error.message)) {
        res.status(409).json({ error: "You already have a pending request for this clan." });
        return;
      }
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ ok: true, request });
  });

  app.post("/clans/join-requests/:requestId/accept", requireAuth, async (req, res) => {
    if (!requireSupabase(res)) return;
    const userId = res.locals.user!.userId;
    const requestId = Number(req.params.requestId);
    if (!Number.isFinite(requestId)) {
      res.status(400).json({ error: "Invalid request id" });
      return;
    }

    const { data: joinReq, error: reqErr } = await supabase!
      .from("clan_join_requests")
      .select("id, clan_id, requester_id, status")
      .eq("id", requestId)
      .maybeSingle();
    if (reqErr) {
      res.status(500).json({ error: reqErr.message });
      return;
    }
    if (!joinReq || (joinReq as { status: string }).status !== "pending") {
      res.status(404).json({ error: "Join request not found or no longer pending." });
      return;
    }

    const clanId = (joinReq as { clan_id: number }).clan_id;
    const requesterId = (joinReq as { requester_id: number }).requester_id;
    const membership = await getUserMembership(userId);
    if (!membership || membership.clan_id !== clanId || membership.role !== "leader") {
      res.status(403).json({ error: "Only the clan leader can accept join requests." });
      return;
    }

    const result = await addMemberFromJoinRequest(clanId, requesterId, requestId);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ ok: true, clan_id: clanId });
  });

  app.post("/clans/join-requests/:requestId/reject", requireAuth, async (req, res) => {
    if (!requireSupabase(res)) return;
    const userId = res.locals.user!.userId;
    const requestId = Number(req.params.requestId);
    if (!Number.isFinite(requestId)) {
      res.status(400).json({ error: "Invalid request id" });
      return;
    }

    const { data: joinReq } = await supabase!
      .from("clan_join_requests")
      .select("id, clan_id, status")
      .eq("id", requestId)
      .maybeSingle();
    if (!joinReq || (joinReq as { status: string }).status !== "pending") {
      res.status(404).json({ error: "Join request not found or no longer pending." });
      return;
    }

    const clanId = (joinReq as { clan_id: number }).clan_id;
    const membership = await getUserMembership(userId);
    if (!membership || membership.clan_id !== clanId || membership.role !== "leader") {
      res.status(403).json({ error: "Only the clan leader can reject join requests." });
      return;
    }

    await supabase!.from("clan_join_requests").update({ status: "rejected" }).eq("id", requestId);
    res.json({ ok: true });
  });

  app.post("/clans/:clanId/disburse", requireAuth, async (req, res) => {
    if (!requireSupabase(res)) return;
    const userId = res.locals.user!.userId;
    const clanId = Number(req.params.clanId);
    const username = typeof (req.body ?? {}).username === "string" ? (req.body as { username: string }).username.trim() : "";
    const raw = (req.body ?? {}).amount;
    const amount =
      typeof raw === "number" ? raw : typeof raw === "string" ? parseInt(raw, 10) : NaN;
    if (!Number.isFinite(clanId) || !username || !Number.isInteger(amount) || amount < 1) {
      res.status(400).json({ error: "username and positive amount required" });
      return;
    }

    const membership = await getUserMembership(userId);
    if (!membership || membership.clan_id !== clanId || membership.role !== "leader") {
      res.status(403).json({ error: "Only the clan leader can send from the clan fund." });
      return;
    }

    const recipient = await findUserIdByUsername(username);
    if (!recipient) {
      res.status(404).json({ error: "Recipient not found." });
      return;
    }

    const { data: recipientMember } = await supabase!
      .from("clan_members")
      .select("user_id")
      .eq("clan_id", clanId)
      .eq("user_id", recipient.id)
      .maybeSingle();
    if (!recipientMember) {
      res.status(400).json({ error: "Recipient must be a member of your clan." });
      return;
    }

    const clan = membership.clan;
    if (clan.bank_balance < amount) {
      res.status(400).json({ error: "Not enough in clan fund", bank_balance: clan.bank_balance });
      return;
    }

    const newBank = clan.bank_balance - amount;
    const now = new Date().toISOString();
    const { data: updated } = await supabase!
      .from("clans")
      .update({ bank_balance: newBank, updated_at: now })
      .eq("id", clanId)
      .eq("bank_balance", clan.bank_balance)
      .select("bank_balance");
    if (!updated?.length) {
      res.status(409).json({ error: "Clan fund changed — try again" });
      return;
    }

    await creditCobbledollars(deps, recipient.id, amount, "clan_disburse", `from clan #${clanId}`);
    await supabase!.from("clan_disbursements").insert({
      clan_id: clanId,
      leader_id: userId,
      recipient_id: recipient.id,
      amount,
    });

    res.json({ ok: true, bank_balance: newBank, recipient_username: recipient.username });
  });

  app.post("/clans/:clanId/kick", requireAuth, async (req, res) => {
    if (!requireSupabase(res)) return;
    const userId = res.locals.user!.userId;
    const clanId = Number(req.params.clanId);
    const username =
      typeof (req.body ?? {}).username === "string" ? (req.body as { username: string }).username.trim() : "";
    if (!Number.isFinite(clanId) || !username) {
      res.status(400).json({ error: "username required" });
      return;
    }

    const membership = await getUserMembership(userId);
    if (!membership || membership.clan_id !== clanId || membership.role !== "leader") {
      res.status(403).json({ error: "Only the clan leader can remove members." });
      return;
    }

    const target = await findUserIdByUsername(username);
    if (!target) {
      res.status(404).json({ error: "Member not found." });
      return;
    }
    if (target.id === userId) {
      res.status(400).json({ error: "You cannot kick yourself. Transfer leadership or disband the clan." });
      return;
    }

    const { data: targetMember } = await supabase!
      .from("clan_members")
      .select("user_id, role")
      .eq("clan_id", clanId)
      .eq("user_id", target.id)
      .maybeSingle();
    if (!targetMember) {
      res.status(400).json({ error: "That player is not in your clan." });
      return;
    }
    if ((targetMember as { role: string }).role === "leader") {
      res.status(400).json({ error: "You cannot kick the clan leader." });
      return;
    }

    const { error: delErr } = await supabase!.from("clan_members").delete().eq("user_id", target.id);
    if (delErr) {
      res.status(500).json({ error: delErr.message });
      return;
    }

    await recordClanLeave(target.id);
    res.json({ ok: true, kicked_username: target.username });
  });

  app.post("/clans/:clanId/transfer-leader", requireAuth, async (req, res) => {
    if (!requireSupabase(res)) return;
    const userId = res.locals.user!.userId;
    const clanId = Number(req.params.clanId);
    const username =
      typeof (req.body ?? {}).username === "string" ? (req.body as { username: string }).username.trim() : "";
    if (!Number.isFinite(clanId) || !username) {
      res.status(400).json({ error: "username required" });
      return;
    }

    const membership = await getUserMembership(userId);
    if (!membership || membership.clan_id !== clanId || membership.role !== "leader") {
      res.status(403).json({ error: "Only the clan leader can transfer leadership." });
      return;
    }

    const target = await findUserIdByUsername(username);
    if (!target) {
      res.status(404).json({ error: "Member not found." });
      return;
    }
    if (target.id === userId) {
      res.status(400).json({ error: "You are already the clan leader." });
      return;
    }

    const { data: targetMember } = await supabase!
      .from("clan_members")
      .select("user_id, role")
      .eq("clan_id", clanId)
      .eq("user_id", target.id)
      .maybeSingle();
    if (!targetMember) {
      res.status(400).json({ error: "That player is not in your clan." });
      return;
    }

    const now = new Date().toISOString();
    const { data: updatedClan, error: clanErr } = await supabase!
      .from("clans")
      .update({ leader_id: target.id, updated_at: now })
      .eq("id", clanId)
      .eq("leader_id", userId)
      .select("id, leader_id")
      .maybeSingle();
    if (clanErr || !updatedClan) {
      res.status(409).json({ error: "Could not transfer leadership — try again." });
      return;
    }

    const { error: demoteErr } = await supabase!
      .from("clan_members")
      .update({ role: "member" })
      .eq("clan_id", clanId)
      .eq("user_id", userId)
      .eq("role", "leader");
    if (demoteErr) {
      await supabase!.from("clans").update({ leader_id: userId, updated_at: now }).eq("id", clanId);
      res.status(500).json({ error: demoteErr.message });
      return;
    }

    const { error: promoteErr } = await supabase!
      .from("clan_members")
      .update({ role: "leader" })
      .eq("clan_id", clanId)
      .eq("user_id", target.id);
    if (promoteErr) {
      await supabase!.from("clan_members").update({ role: "leader" }).eq("clan_id", clanId).eq("user_id", userId);
      await supabase!.from("clans").update({ leader_id: userId, updated_at: now }).eq("id", clanId);
      res.status(500).json({ error: promoteErr.message });
      return;
    }

    res.json({ ok: true, new_leader_username: target.username, new_leader_id: target.id });
  });

  app.post("/clans/leave", requireAuth, async (_req, res) => {
    if (!requireSupabase(res)) return;
    const userId = res.locals.user!.userId;
    const membership = await getUserMembership(userId);
    if (!membership) {
      res.status(404).json({ error: "You are not in a clan." });
      return;
    }
    if (membership.role === "leader") {
      res.status(400).json({
        error: "Leaders cannot leave. Disband the clan or transfer leadership first.",
      });
      return;
    }
    await supabase!.from("clan_members").delete().eq("user_id", userId);
    await recordClanLeave(userId);
    res.json({ ok: true, rejoin_available_at: clanRejoinAvailableAt(new Date()).toISOString() });
  });

  app.post("/clans/disband", requireAuth, async (_req, res) => {
    if (!requireSupabase(res)) return;
    const userId = res.locals.user!.userId;
    const membership = await getUserMembership(userId);
    if (!membership) {
      res.status(404).json({ error: "You are not in a clan." });
      return;
    }
    if (membership.role !== "leader") {
      res.status(403).json({ error: "Only the clan leader can disband the clan." });
      return;
    }

    const clanId = membership.clan_id;
    const { data: members } = await supabase!
      .from("clan_members")
      .select("user_id, role")
      .eq("clan_id", clanId);

    const { error: delErr } = await supabase!.from("clans").delete().eq("id", clanId);
    if (delErr) {
      res.status(500).json({ error: delErr.message });
      return;
    }

    for (const raw of members ?? []) {
      const m = raw as { user_id: number; role: string };
      if (m.role !== "leader") {
        await recordClanLeave(m.user_id);
      }
    }

    res.json({ ok: true });
  });
}

type AdminClanDeps = {
  requireAuth: (req: Request, res: Response, next: () => void) => void;
  requireAdmin: (req: Request, res: Response, next: () => void) => void;
  getLiveLeaderboard?: () => unknown;
};

async function adminForceDisbandClan(
  clanId: number
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!supabase) return { ok: false, error: "Database not configured", status: 503 };

  const { data: clan } = await supabase.from("clans").select("id").eq("id", clanId).maybeSingle();
  if (!clan) return { ok: false, error: "Clan not found", status: 404 };

  const { data: members } = await supabase
    .from("clan_members")
    .select("user_id, role")
    .eq("clan_id", clanId);

  const { error: delErr } = await supabase.from("clans").delete().eq("id", clanId);
  if (delErr) return { ok: false, error: delErr.message, status: 500 };

  for (const raw of members ?? []) {
    const m = raw as { user_id: number; role: string };
    if (m.role !== "leader") {
      await recordClanLeave(m.user_id);
    }
  }

  return { ok: true };
}

async function loadRecentDonationsForClan(
  clanId: number,
  limit = 25
): Promise<
  Array<{
    id: number;
    user_id: number;
    username: string;
    amount: number;
    created_at: string;
  }>
> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("clan_donations")
    .select("id, user_id, amount, created_at")
    .eq("clan_id", clanId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data?.length) return [];

  const ids = [...new Set(data.map((r) => (r as { user_id: number }).user_id))];
  const { data: users } = await supabase.from("users").select("id, username").in("id", ids);
  const nameById = new Map((users ?? []).map((u) => [(u as { id: number }).id, (u as { username: string }).username]));

  return data.map((r) => {
    const row = r as { id: number; user_id: number; amount: number; created_at: string };
    return {
      ...row,
      username: nameById.get(row.user_id) ?? `#${row.user_id}`,
    };
  });
}

async function loadRecentDisbursementsForClan(
  clanId: number,
  limit = 25
): Promise<
  Array<{
    id: number;
    leader_id: number;
    leader_username: string;
    recipient_id: number;
    recipient_username: string;
    amount: number;
    created_at: string;
  }>
> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("clan_disbursements")
    .select("id, leader_id, recipient_id, amount, created_at")
    .eq("clan_id", clanId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data?.length) return [];

  const ids = new Set<number>();
  for (const r of data) {
    const row = r as { leader_id: number; recipient_id: number };
    ids.add(row.leader_id);
    ids.add(row.recipient_id);
  }
  const { data: users } = await supabase.from("users").select("id, username").in("id", [...ids]);
  const nameById = new Map((users ?? []).map((u) => [(u as { id: number }).id, (u as { username: string }).username]));

  return data.map((r) => {
    const row = r as {
      id: number;
      leader_id: number;
      recipient_id: number;
      amount: number;
      created_at: string;
    };
    return {
      ...row,
      leader_username: nameById.get(row.leader_id) ?? `#${row.leader_id}`,
      recipient_username: nameById.get(row.recipient_id) ?? `#${row.recipient_id}`,
    };
  });
}

async function loadRecentXpGrantsForClan(
  clanId: number,
  limit = 30
): Promise<
  Array<{
    user_id: number;
    username: string;
    claim_date: string;
    streak_day: number;
    xp_amount: number;
    created_at: string;
  }>
> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("clan_xp_grants")
    .select("user_id, claim_date, streak_day, xp_amount, created_at")
    .eq("clan_id", clanId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data?.length) return [];

  const ids = [...new Set(data.map((r) => (r as { user_id: number }).user_id))];
  const { data: users } = await supabase.from("users").select("id, username").in("id", ids);
  const nameById = new Map((users ?? []).map((u) => [(u as { id: number }).id, (u as { username: string }).username]));

  return data.map((r) => {
    const row = r as {
      user_id: number;
      claim_date: string;
      streak_day: number;
      xp_amount: number;
      created_at: string;
    };
    return {
      ...row,
      username: nameById.get(row.user_id) ?? `#${row.user_id}`,
    };
  });
}

async function loadRecentAdminXpGrantsForClan(
  clanId: number,
  limit = 30
): Promise<
  Array<{
    id: number;
    admin_user_id: number;
    admin_username: string;
    xp_amount: number;
    note: string | null;
    created_at: string;
  }>
> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("clan_admin_xp_grants")
    .select("id, admin_user_id, xp_amount, note, created_at")
    .eq("clan_id", clanId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data?.length) return [];

  const ids = [...new Set(data.map((r) => (r as { admin_user_id: number }).admin_user_id))];
  const { data: users } = await supabase.from("users").select("id, username").in("id", ids);
  const nameById = new Map((users ?? []).map((u) => [(u as { id: number }).id, (u as { username: string }).username]));

  return data.map((r) => {
    const row = r as {
      id: number;
      admin_user_id: number;
      xp_amount: number;
      note: string | null;
      created_at: string;
    };
    return {
      ...row,
      admin_username: nameById.get(row.admin_user_id) ?? `#${row.admin_user_id}`,
    };
  });
}

export function registerAdminClanRoutes(app: Express, deps: AdminClanDeps): void {
  const { requireAuth, requireAdmin, getLiveLeaderboard } = deps;
  const guard = [requireAuth, requireAdmin] as const;

  app.get("/admin/clans", ...guard, async (req, res) => {
    if (!requireSupabase(res)) return;

    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const limitRaw = parseInt(String(req.query.limit ?? "200"), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 200;

    let query = supabase!
      .from("clans")
      .select("id, name, bio, avatar_url, leader_id, bank_balance, xp, created_at, last_daily_income_date")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (q.length >= 1) {
      query = query.ilike("name", `%${q.replace(/[%_]/g, "\\$&")}%`);
    }

    const { data: clans, error } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    if (!clans?.length) {
      res.json({ clans: [], count: 0 });
      return;
    }

    const rows = clans as ClanRow[];
    const leaderIds = [...new Set(rows.map((c) => c.leader_id))];
    const { data: leaders } = await supabase!.from("users").select("id, username, email").in("id", leaderIds);
    const leaderById = new Map(
      (leaders ?? []).map((u) => [
        (u as { id: number }).id,
        u as { id: number; username: string; email: string },
      ])
    );

    const clanIds = rows.map((c) => c.id);
    const totalEloByClan = await loadTotalEloByClanIds(clanIds, getLiveLeaderboard);
    const memberCounts = new Map<number, number>();
    for (const id of clanIds) {
      const { count } = await supabase!
        .from("clan_members")
        .select("user_id", { count: "exact", head: true })
        .eq("clan_id", id);
      memberCounts.set(id, count ?? 0);
    }

    const out = rows.map((clan) => {
      const leader = leaderById.get(clan.leader_id);
      const memberCount = memberCounts.get(clan.id) ?? 0;
      const xp = Math.max(0, clan.xp ?? 0);
      return {
        ...serializeClanPublic(clan, memberCount, leader?.username ?? `#${clan.leader_id}`, totalEloByClan.get(clan.id) ?? null),
        leader_email: leader?.email ?? null,
      };
    });

    const summary = {
      total_clans: out.length,
      total_members: out.reduce((s, c) => s + c.member_count, 0),
      total_treasury: out.reduce((s, c) => s + c.bank_balance, 0),
      total_elo: out.reduce((s, c) => s + (c.total_elo ?? 0), 0),
      avg_level:
        out.length > 0
          ? Math.round((out.reduce((s, c) => s + c.level, 0) / out.length) * 10) / 10
          : 0,
    };

    res.json({ clans: out, count: out.length, summary });
  });

  app.get("/admin/clans/:clanId", ...guard, async (req, res) => {
    if (!requireSupabase(res)) return;

    const clanId = parseInt(String(req.params.clanId), 10);
    if (!Number.isFinite(clanId) || clanId < 1) {
      res.status(400).json({ error: "Invalid clan id" });
      return;
    }

    const { data: clanRaw, error: clanErr } = await supabase!
      .from("clans")
      .select("*")
      .eq("id", clanId)
      .maybeSingle();
    if (clanErr) {
      res.status(500).json({ error: clanErr.message });
      return;
    }
    if (!clanRaw) {
      res.status(404).json({ error: "Clan not found" });
      return;
    }

    const clan = clanRaw as ClanRow;
    const { data: leaderUser } = await supabase!
      .from("users")
      .select("id, username, email")
      .eq("id", clan.leader_id)
      .maybeSingle();
    const leader = leaderUser as { id: number; username: string; email: string } | null;

    const members = await loadClanMembers(clanId, getLiveLeaderboard);
    const memberCount = members.length;
    const totalElo = members.reduce((sum, m) => sum + m.elo, 0);

    const { topTreasury, topTotalElo, topLevel } = await buildClanLeaderboards(getLiveLeaderboard, 50);
    const leaderboard_ranks = clanLeaderboardRanksForClan(clanId, topTreasury, topTotalElo, topLevel);

    const [
      pending_join_requests,
      recent_leaderboard_payouts,
      recent_xp_grants,
      recent_admin_xp_grants,
      recent_donations,
      recent_disbursements,
    ] = await Promise.all([
      loadPendingJoinRequests(clanId),
      loadRecentLeaderboardPayoutsForClan(clanId, 20),
      loadRecentXpGrantsForClan(clanId, 40),
      loadRecentAdminXpGrantsForClan(clanId, 30),
      loadRecentDonationsForClan(clanId, 25),
      loadRecentDisbursementsForClan(clanId, 25),
    ]);

    const totalMemberDonations = members.reduce((s, m) => s + m.donated_total, 0);
    const leaderboard_daily_bonus = clanLeaderboardDailyTreasuryBonus({
      top_treasury: leaderboard_ranks.top_treasury,
      top_total_elo: leaderboard_ranks.top_total_elo,
      top_level: leaderboard_ranks.top_level,
    });

    res.json({
      clan: {
        ...serializeClanPublic(clan, memberCount, leader?.username ?? `#${clan.leader_id}`, totalElo),
        leader_email: leader?.email ?? null,
        last_daily_income_date: clan.last_daily_income_date,
        leaderboard_ranks,
        leaderboard_daily_bonus,
      },
      members,
      pending_join_requests,
      recent_leaderboard_payouts,
      recent_xp_grants,
      recent_admin_xp_grants,
      recent_donations,
      recent_disbursements,
      stats: {
        total_member_donations: totalMemberDonations,
        recent_donations_count: recent_donations.length,
        recent_disbursements_total: recent_disbursements.reduce((s, d) => s + d.amount, 0),
        pending_join_requests_count: pending_join_requests.length,
        avg_member_elo: memberCount > 0 ? Math.round(totalElo / memberCount) : null,
      },
      leaderboard_rewards: leaderboardRewardsMeta(),
    });
  });

  app.post("/admin/clans/:clanId/disband", ...guard, async (req, res) => {
    if (!requireSupabase(res)) return;

    const clanId = parseInt(String(req.params.clanId), 10);
    if (!Number.isFinite(clanId) || clanId < 1) {
      res.status(400).json({ error: "Invalid clan id" });
      return;
    }

    const result = await adminForceDisbandClan(clanId);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
  });

  app.post("/admin/clans/:clanId/grant-xp", ...guard, async (req, res) => {
    if (!requireSupabase(res)) return;

    const staff = res.locals.user as { userId: number; username?: string } | undefined;
    if (!staff?.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const clanId = parseInt(String(req.params.clanId), 10);
    if (!Number.isFinite(clanId) || clanId < 1) {
      res.status(400).json({ error: "Invalid clan id" });
      return;
    }

    const body = req.body ?? {};
    const amountRaw = body.amount ?? body.xp;
    const amount = typeof amountRaw === "number" ? amountRaw : parseInt(String(amountRaw ?? ""), 10);
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: "amount must be a positive integer" });
      return;
    }
    if (amount > CLAN_ADMIN_XP_GRANT_MAX) {
      res.status(400).json({ error: `amount cannot exceed ${CLAN_ADMIN_XP_GRANT_MAX.toLocaleString()} XP` });
      return;
    }

    const note = typeof body.note === "string" ? body.note : typeof body.reason === "string" ? body.reason : null;

    const result = await grantClanXpByAdmin(clanId, staff.userId, amount, note);
    if ("error" in result) {
      const status = result.error === "Clan not found" ? 404 : 500;
      res.status(status).json({ error: result.error });
      return;
    }

    res.json({
      ok: true,
      granted: result.granted,
      xp: result.totalXp,
      level: result.level,
      xp_in_level: result.xpInLevel,
      xp_per_level: result.xpPerLevel,
    });
  });
}

export async function fetchClanLeaderboardRanksById(
  clanId: number,
  getLiveLeaderboard?: () => unknown
): Promise<{
  top_treasury: number | null;
  top_total_elo: number | null;
  top_level: number | null;
}> {
  const { topTreasury, topTotalElo, topLevel } = await buildClanLeaderboards(getLiveLeaderboard, 50);
  return clanLeaderboardRanksForClan(clanId, topTreasury, topTotalElo, topLevel);
}
