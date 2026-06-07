import type { Express, Request, Response } from "express";
import multer from "multer";
import { supabase } from "./supabase.js";
import { uploadClanAvatarToStorage } from "./clanAvatarUpload.js";
import {
  CLAN_ABSOLUTE_MAX_MEMBERS,
  CLAN_CREATE_COST,
  CLAN_DAILY_PER_MEMBER,
  CLAN_DAILY_TICKETS_BONUS,
  CLAN_DONATE_MILESTONE,
  CLAN_MULTIPLIER_THRESHOLD_100,
  CLAN_MULTIPLIER_THRESHOLD_50,
  clanDailyBankIncome,
  clanDailyIncomeMultiplier,
  clanHasDailyTicketBonus,
  clanMaxMembersFromTotalDonated,
  nextMemberUnlockDonation,
} from "./clanLogic.js";

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
  cobbledollarsCurrency: string;
  ticketsCurrency: string;
};

type ClanRow = {
  id: number;
  name: string;
  bio: string | null;
  avatar_url: string;
  leader_id: number;
  bank_balance: number;
  total_donated: number;
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
  return rows.map((r) => {
    const row = r as { id: number; requester_id: number; created_at: string };
    return {
      id: row.id,
      requester_id: row.requester_id,
      requester_username: nameById.get(row.requester_id) ?? `#${row.requester_id}`,
      created_at: row.created_at,
    };
  });
}

async function addMemberFromJoinRequest(
  clanId: number,
  requesterId: number,
  requestId: number
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!supabase) return { ok: false, error: "Database not configured", status: 503 };

  const existingMembership = await getUserMembership(requesterId);
  if (existingMembership) {
    return { ok: false, error: "That player is already in a clan.", status: 409 };
  }

  const { data: clan } = await supabase.from("clans").select("*").eq("id", clanId).maybeSingle();
  if (!clan) return { ok: false, error: "Clan not found", status: 404 };

  const { count } = await supabase
    .from("clan_members")
    .select("user_id", { count: "exact", head: true })
    .eq("clan_id", clanId);
  const memberCount = count ?? 0;
  const maxMembers = clanMaxMembersFromTotalDonated((clan as ClanRow).total_donated);
  if (memberCount >= maxMembers) {
    return { ok: false, error: "Clan is full.", status: 400 };
  }

  const { error: memErr } = await supabase.from("clan_members").insert({
    clan_id: clanId,
    user_id: requesterId,
    role: "member",
    donated_total: 0,
  });
  if (memErr) return { ok: false, error: memErr.message, status: 500 };

  await supabase.from("clan_join_requests").update({ status: "accepted" }).eq("id", requestId);
  await supabase
    .from("clan_join_requests")
    .update({ status: "cancelled" })
    .eq("requester_id", requesterId)
    .eq("status", "pending")
    .neq("id", requestId);

  return { ok: true };
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

async function loadClanMembers(clanId: number): Promise<
  Array<{
    user_id: number;
    username: string;
    role: string;
    donated_total: number;
    joined_at: string;
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
  return members.map((m) => {
    const row = m as MemberRow;
    return {
      user_id: row.user_id,
      username: nameById.get(row.user_id) ?? `#${row.user_id}`,
      role: row.role,
      donated_total: row.donated_total,
      joined_at: row.joined_at,
    };
  });
}

function serializeClanPublic(
  clan: ClanRow,
  memberCount: number,
  leaderUsername: string
) {
  const maxMembers = clanMaxMembersFromTotalDonated(clan.total_donated);
  const mult = clanDailyIncomeMultiplier(clan.total_donated);
  return {
    id: clan.id,
    name: clan.name,
    bio: clan.bio,
    avatar_url: clan.avatar_url,
    leader_id: clan.leader_id,
    leader_username: leaderUsername,
    member_count: memberCount,
    max_members: maxMembers,
    bank_balance: clan.bank_balance,
    total_donated: clan.total_donated,
    daily_income_per_day: clanDailyBankIncome(memberCount, clan.total_donated),
    daily_income_multiplier: mult,
    daily_income_per_member: CLAN_DAILY_PER_MEMBER,
    has_daily_ticket_bonus: clanHasDailyTicketBonus(clan.total_donated),
    daily_ticket_bonus: clanHasDailyTicketBonus(clan.total_donated) ? CLAN_DAILY_TICKETS_BONUS : 0,
    next_member_unlock_donation: nextMemberUnlockDonation(clan.total_donated, maxMembers),
    donate_milestone: CLAN_DONATE_MILESTONE,
    multiplier_threshold_50: CLAN_MULTIPLIER_THRESHOLD_50,
    multiplier_threshold_100: CLAN_MULTIPLIER_THRESHOLD_100,
    created_at: clan.created_at,
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
  const { data: clans, error } = await supabase
    .from("clans")
    .select("id, total_donated, bank_balance, last_daily_income_date")
    .or(`last_daily_income_date.is.null,last_daily_income_date.lt.${today}`);
  if (error || !clans?.length) return { processed: 0, date: today };

  let processed = 0;
  for (const raw of clans) {
    const clan = raw as {
      id: number;
      total_donated: number;
      bank_balance: number;
      last_daily_income_date: string | null;
    };
    const { count } = await supabase
      .from("clan_members")
      .select("user_id", { count: "exact", head: true })
      .eq("clan_id", clan.id);
    const memberCount = count ?? 0;
    if (memberCount < 1) continue;

    const income = clanDailyBankIncome(memberCount, clan.total_donated);
    const newBank = clan.bank_balance + income;
    const now = new Date().toISOString();
    const { data: updated } = await supabase
      .from("clans")
      .update({
        bank_balance: newBank,
        last_daily_income_date: today,
        updated_at: now,
      })
      .eq("id", clan.id)
      .or(`last_daily_income_date.is.null,last_daily_income_date.lt.${today}`)
      .select("id");
    if (!updated?.length) continue;
    processed += 1;

    if (clanHasDailyTicketBonus(clan.total_donated)) {
      const { data: members } = await supabase
        .from("clan_members")
        .select("user_id")
        .eq("clan_id", clan.id);
      for (const m of members ?? []) {
        const uid = (m as { user_id: number }).user_id;
        await deps.incrementUserCurrency(uid, deps.ticketsCurrency, CLAN_DAILY_TICKETS_BONUS, {
          kind: "clan_daily_tickets",
          detail: `clan #${clan.id}`,
        });
      }
    }
  }
  return { processed, date: today };
}

let clanDailyLastAttemptMinute = "";

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
    if (clanDailyLastAttemptMinute === key) return;
    clanDailyLastAttemptMinute = key;
    try {
      const result = await runClanDailyIncome(deps);
      console.log(`[clan-daily] date=${result.date} clans_credited=${result.processed}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[clan-daily] error: ${msg}`);
    }
  };
  void tick();
  setInterval(() => void tick(), 60_000);
}

export function registerClanRoutes(app: Express, deps: ClanDeps): void {
  const { requireAuth } = deps;

  app.get("/clans", async (req, res) => {
    if (!requireSupabase(res)) return;
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const q = String(req.query.q ?? "").trim().toLowerCase();

    const { data: clans, error } = await supabase!
      .from("clans")
      .select("id, name, bio, avatar_url, leader_id, bank_balance, total_donated, created_at")
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

    const out = [];
    for (const clan of rows) {
      if (q && !clan.name.toLowerCase().includes(q)) continue;
      const { count } = await supabase!
        .from("clan_members")
        .select("user_id", { count: "exact", head: true })
        .eq("clan_id", clan.id);
      out.push(
        serializeClanPublic(clan, count ?? 0, leaderName.get(clan.leader_id) ?? `#${clan.leader_id}`)
      );
    }
    res.json({ rows: out, create_cost: CLAN_CREATE_COST, rules: { base_max_members: 2, absolute_max: CLAN_ABSOLUTE_MAX_MEMBERS, donate_milestone: CLAN_DONATE_MILESTONE } });
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
      res.json({ clan: null, my_pending_join_requests: myRequests ?? [] });
      return;
    }
    const members = await loadClanMembers(membership.clan.id);
    const leader = members.find((m) => m.role === "leader");
    const payload = serializeClanPublic(
      membership.clan,
      members.length,
      leader?.username ?? `#${membership.clan.leader_id}`
    );
    const pendingJoinRequests =
      membership.role === "leader" ? await loadPendingJoinRequests(membership.clan.id) : [];
    res.json({
      clan: {
        ...payload,
        my_role: membership.role,
        my_donated_total: membership.donated_total,
        members,
      },
      pending_join_requests: pendingJoinRequests,
      my_pending_join_requests: [],
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
    const members = await loadClanMembers(clanId);
    const leader = members.find((m) => m.role === "leader");
    res.json({
      clan: {
        ...serializeClanPublic(clan as ClanRow, members.length, leader?.username ?? `#${(clan as ClanRow).leader_id}`),
        members,
      },
    });
  });

  app.post(
    "/clans/create",
    requireAuth,
    (req, res, next) => {
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
    },
    async (req, res) => {
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
    }
  );

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
    const newTotalDonated = clan.total_donated + amount;
    const newBank = clan.bank_balance + amount;
    const newMemberDonated = membership.donated_total + amount;
    const now = new Date().toISOString();

    const { data: clanUpdated, error: clanErr } = await supabase!
      .from("clans")
      .update({
        total_donated: newTotalDonated,
        bank_balance: newBank,
        updated_at: now,
      })
      .eq("id", clanId)
      .eq("total_donated", clan.total_donated)
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
    const members = await loadClanMembers(clanId);
    const leader = members.find((m) => m.role === "leader");

    res.json({
      ok: true,
      new_balance: spend.newBalance,
      clan: serializeClanPublic(
        freshClan as ClanRow,
        members.length,
        leader?.username ?? `#${(freshClan as ClanRow).leader_id}`
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
    const maxMembers = clanMaxMembersFromTotalDonated((clan as ClanRow).total_donated);
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

  app.post("/clans/leave", requireAuth, async (_req, res) => {
    if (!requireSupabase(res)) return;
    const userId = res.locals.user!.userId;
    const membership = await getUserMembership(userId);
    if (!membership) {
      res.status(404).json({ error: "You are not in a clan." });
      return;
    }
    if (membership.role === "leader") {
      res.status(400).json({ error: "Leaders cannot leave. Transfer leadership is not supported yet." });
      return;
    }
    await supabase!.from("clan_members").delete().eq("user_id", userId);
    res.json({ ok: true });
  });
}
