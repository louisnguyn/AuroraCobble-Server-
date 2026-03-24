import "dotenv/config";
import express from "express";
import {
  createUser,
  findUserByEmail,
  verifyPassword,
  signToken,
  verifyToken,
  updatePasswordForUser,
  type JwtPayload,
} from "./auth.js";
import { supabase } from "./supabase.js";
import { fetchMinecraftServerPayload } from "./minecraftStatus.js";
import { fetchRosterFromWhitelistRcon } from "./minecraftRconRoster.js";
import {
  fetchRosterFromUsers,
  mergeOnlineWithRoster,
  mergeRosterMaps,
} from "./minecraftRoster.js";
import { syncAndEnrichPresence } from "./minecraftPresence.js";
import { fetchCobbledollarsViaRcon, topBalancesFromMap } from "./minecraftRconCobbledollars.js";
import { executeMinecraftRconCommand } from "./minecraftRconExecute.js";
import {
  buildGivePokemonOtherCommand,
  isGachaClaimEnabled,
  isLikelyMinecraftUsername,
  parseRewardForGivePokemon,
} from "./gachaRewardClaim.js";
import {
  buildCobbledollarsDepositCommand,
  isCobbledollarsDepositEnabled,
} from "./minecraftCobbledollarsDeposit.js";

const app = express();
const port = process.env.PORT ?? 3001;

const cobbleStore = {
  usageStats: null as unknown,
  leaderboard: null as unknown,
};

const COBBLEDOLLARS_PUBLIC_CACHE_TTL_MS = 90_000;
let cobbledollarsPublicCache: {
  at: number;
  body: {
    ok: boolean;
    disabled: boolean;
    top10: { name: string; balance: number }[];
    error: string | null;
    updatedAt: string | null;
  };
} | null = null;
const COBBLE_API_KEY = process.env.COBBLE_API_KEY;
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "*";
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL?.trim() || null;

async function notifyDiscordPull(
  username: string,
  poolName: string,
  rewardType: string
): Promise<void> {
  if (!DISCORD_WEBHOOK_URL) return;
  const content = `**${username}** pulled **${rewardType}** from **${poolName}**!`;
  try {
    const res = await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn("[Discord] webhook failed:", res.status, text);
    }
  } catch (err) {
    console.warn("[Discord] webhook error:", err);
  }
}

// CORS: required when frontend is on a different origin (e.g. deploy frontend + backend separately)
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});
app.options("*", (_, res) => res.sendStatus(204));

function requireCobbleAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (!COBBLE_API_KEY) return next();
  const auth = req.headers.authorization;
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (token !== COBBLE_API_KEY) {
    res.status(401).json({ error: { code: "401", message: "token expired or incorrect" } });
    return;
  }
  next();
}

/* eslint-disable @typescript-eslint/no-namespace -- Express Locals augmentation for JWT */
declare global {
  namespace Express {
    interface Locals {
      user?: JwtPayload;
    }
  }
}
/* eslint-enable @typescript-eslint/no-namespace */

function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const auth = req.headers.authorization;
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  res.locals.user = payload;
  next();
}

function requireAdmin(
  _req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (!res.locals.user?.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ message: "Backend running" });
});
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/usage-stats", (_req, res) => res.json(cobbleStore.usageStats ?? {}));
app.post("/usage-stats", requireCobbleAuth, (req, res) => {
  cobbleStore.usageStats = req.body;
  res.json({ ok: true });
});
app.get("/leaderboard", (_req, res) => res.json(cobbleStore.leaderboard ?? {}));
app.post("/leaderboard", requireCobbleAuth, (req, res) => {
  cobbleStore.leaderboard = req.body;
  res.json({ ok: true });
});

app.get("/v4/usage-stats", (_req, res) => res.json(cobbleStore.usageStats ?? {}));
app.post("/v4/usage-stats", requireCobbleAuth, (req, res) => {
  cobbleStore.usageStats = req.body;
  res.json({ ok: true });
});
app.get("/v4/leaderboard", (_req, res) => res.json(cobbleStore.leaderboard ?? {}));
app.post("/v4/leaderboard", requireCobbleAuth, (req, res) => {
  cobbleStore.leaderboard = req.body;
  res.json({ ok: true });
});

/** Public Cobble$ top 10 from Minecraft RCON (cached ~90s). No auth. */
app.get("/minecraft/cobbledollars-leaderboard", async (_req, res) => {
  if (process.env.MC_COBBLEDOLLARS_DISABLE === "true") {
    res.json({
      ok: false,
      disabled: true,
      top10: [],
      error: null,
      updatedAt: null,
    });
    return;
  }
  const now = Date.now();
  if (
    cobbledollarsPublicCache &&
    now - cobbledollarsPublicCache.at < COBBLEDOLLARS_PUBLIC_CACHE_TTL_MS
  ) {
    res.json(cobbledollarsPublicCache.body);
    return;
  }
  try {
    const r = await fetchCobbledollarsViaRcon();
    const top10 = topBalancesFromMap(r.balances, 10);
    const body = {
      ok: !r.error,
      disabled: false,
      top10,
      error: r.error ?? null,
      updatedAt: new Date().toISOString(),
    };
    cobbledollarsPublicCache = { at: now, body };
    res.json(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.json({
      ok: false,
      disabled: false,
      top10: [],
      error: msg,
      updatedAt: null,
    });
  }
});

// --- Spawn data (public) ---
app.get("/spawn/pokemon", async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const q = String(req.query.q ?? "").trim();
  const generation = String(req.query.generation ?? "").trim();
  const source = String(req.query.source ?? "").trim();
  const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), 2000);

  let query = supabase
    .from("pokemon_spawn")
    .select("id, generation, generation_number, dex_number, pokemon, source, spawn, rarity, condition, forms")
    .order("generation_number", { ascending: true })
    .order("dex_number", { ascending: true })
    .order("pokemon", { ascending: true })
    .limit(limit);

  if (q) query = query.ilike("pokemon", `%${q}%`);
  if (generation) query = query.eq("generation", generation);
  if (source) query = query.eq("source", source);

  const { data, error } = await query;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  const rows = (data ?? []) as { generation: string | null; source: string | null }[];
  const generations = Array.from(new Set(rows.map((r) => r.generation).filter(Boolean))) as string[];
  const sources = Array.from(new Set(rows.map((r) => r.source).filter(Boolean))) as string[];
  res.json({
    rows: data ?? [],
    filters: { generations, sources },
  });
});

// --- Auth (users table, no Supabase built-in auth) ---
app.post("/auth/signup", async (req, res) => {
  const { email, password, username } = req.body ?? {};
  const result = await createUser({ email, password, username });
  if ("error" in result) {
    res.status(400).json({ error: result.error });
    return;
  }
  // Grant starter currency for gacha + website Cobble$ wallet (ignore errors so signup still succeeds)
  if (supabase) {
    void supabase.from("user_currency").insert([
      { user_id: result.id, currency_type: "tickets", balance: 0 },
      { user_id: result.id, currency_type: "cobbledollars", balance: 0 },
    ]);
  }
  const isAdmin = !!(result as { is_admin?: boolean }).is_admin;
  const token = signToken({
    userId: result.id,
    email: result.email,
    username: result.username,
    isAdmin,
  });
  res.json({
    token,
    user: { id: result.id, email: result.email, username: result.username, is_admin: isAdmin },
  });
});

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  const emailStr = (email ?? "").trim().toLowerCase();
  if (!emailStr || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }
  const user = await findUserByEmail(emailStr);
  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  const isAdmin = !!user.is_admin;
  const token = signToken({
    userId: user.id,
    email: user.email,
    username: user.username,
    isAdmin,
  });
  res.json({
    token,
    user: { id: user.id, email: user.email, username: user.username, is_admin: isAdmin },
  });
});

app.get("/auth/me", requireAuth, (_req, res) => {
  const user = res.locals.user!;
  res.json({
    user: {
      id: user.userId,
      email: user.email,
      username: user.username,
      is_admin: user.isAdmin ?? false,
    },
  });
});

app.post("/auth/change-password", requireAuth, async (req, res) => {
  const user = res.locals.user!;
  const { currentPassword, newPassword } = req.body ?? {};
  if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
    res.status(400).json({ error: "currentPassword and newPassword are required" });
    return;
  }
  const result = await updatePasswordForUser(user.userId, currentPassword, newPassword);
  if ("error" in result) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ ok: true });
});

// --- Gacha (requires login) ---
app.get("/gacha/pools", requireAuth, async (_req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("gacha_pools")
    .select("*")
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gte.${now}`);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ pools: data ?? [] });
});

app.get("/gacha/pools/:poolId/currency", requireAuth, async (req, res) => {
  const user = res.locals.user!;
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const poolId = Number(req.params.poolId);
  if (!Number.isFinite(poolId)) {
    res.status(400).json({ error: "Invalid pool id" });
    return;
  }
  const { data: pool } = await supabase.from("gacha_pools").select("config").eq("id", poolId).single();
  const config = (pool as { config?: { currency_type?: string } } | null)?.config;
  const currencyType = (config?.currency_type as string) ?? "gems";
  const { data: row } = await supabase
    .from("user_currency")
    .select("balance")
    .eq("user_id", user.userId)
    .eq("currency_type", currencyType)
    .maybeSingle();
  res.json({ balance: (row as { balance: number } | null)?.balance ?? 0, currencyType });
});

app.get("/gacha/pools/:poolId/rewards", requireAuth, async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const poolId = Number(req.params.poolId);
  if (!Number.isFinite(poolId)) {
    res.status(400).json({ error: "Invalid pool id" });
    return;
  }
  const { data, error } = await supabase
    .from("gacha_rewards")
    .select("id, reward_type, weight")
    .eq("pool_id", poolId)
    .order("weight", { ascending: true });
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ rewards: data ?? [] });
});

app.post("/gacha/pull", requireAuth, async (req, res) => {
  const user = res.locals.user!;
  const { poolId } = req.body ?? {};
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const id = Number(poolId);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid pool id" });
    return;
  }
  const { data: pool, error: poolErr } = await supabase
    .from("gacha_pools")
    .select("id, name, config")
    .eq("id", id)
    .single();
  if (poolErr || !pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }
  const poolName = (pool as { name?: string }).name ?? "Banner";
  const config = (pool.config as { cost?: number; currency_type?: string }) ?? {};
  const cost = Number(config.cost) || 100;
  const currencyType = (config.currency_type as string) ?? "gems";

  const { data: currencyRow } = await supabase
    .from("user_currency")
    .select("id, balance")
    .eq("user_id", user.userId)
    .eq("currency_type", currencyType)
    .maybeSingle();
  const current = (currencyRow as { id: number; balance: number } | null)?.balance ?? 0;
  if (current < cost) {
    res.status(400).json({ error: "Not enough currency", balance: current, required: cost });
    return;
  }

  const { data: rewards } = await supabase
    .from("gacha_rewards")
    .select("id, reward_type, weight")
    .eq("pool_id", id);
  const list = (rewards ?? []) as { id: number; reward_type: string; weight: number }[];
  if (list.length === 0) {
    res.status(400).json({ error: "Pool has no rewards configured" });
    return;
  }
  const totalWeight = list.reduce((s, r) => s + r.weight, 0);
  let r = Math.random() * totalWeight;
  let chosen = list[0]!;
  for (const reward of list) {
    r -= reward.weight;
    if (r <= 0) {
      chosen = reward;
      break;
    }
  }

  const newBalance = current - cost;
  const currencyId = (currencyRow as { id?: number } | null)?.id;
  if (currencyId) {
    await supabase
      .from("user_currency")
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq("id", currencyId);
  } else {
    await supabase.from("user_currency").insert({
      user_id: user.userId,
      currency_type: currencyType,
      balance: newBalance,
    });
  }

  const { error: historyErr } = await supabase.from("user_gacha_pulls").insert({
    user_id: user.userId,
    pool_id: id,
    reward_type: chosen.reward_type,
    pull_at: new Date().toISOString(),
  });
  if (historyErr) {
    // table may not exist yet; pull still succeeds
  }

  await notifyDiscordPull(user.username, poolName, chosen.reward_type);

  res.json({
    reward: {
      id: chosen.id,
      reward_type: chosen.reward_type,
    },
    newBalance,
  });
});

/** Claim a gacha pull in-game via RCON (Cobblemon givepokemonother). User must be online. */
app.post("/gacha/pulls/:pullId/claim", requireAuth, async (req, res) => {
  const user = res.locals.user!;
  if (!isGachaClaimEnabled()) {
    res.status(503).json({ error: "In-game claim is not configured (RCON or MC_GACHA_CLAIM_DISABLE)" });
    return;
  }
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const pullId = Number(req.params.pullId);
  if (!Number.isFinite(pullId)) {
    res.status(400).json({ error: "Invalid pull id" });
    return;
  }

  const { data: row, error: fetchErr } = await supabase
    .from("user_gacha_pulls")
    .select("id, user_id, reward_type, fulfilled_at")
    .eq("id", pullId)
    .maybeSingle();

  if (fetchErr) {
    res.status(500).json({ error: fetchErr.message });
    return;
  }
  const r = row as {
    id: number;
    user_id: number;
    reward_type: string;
    fulfilled_at: string | null;
  } | null;
  if (!r || r.user_id !== user.userId) {
    res.status(404).json({ error: "Pull not found" });
    return;
  }
  if (r.fulfilled_at) {
    res.status(400).json({ error: "This reward was already claimed or fulfilled" });
    return;
  }

  if (!isLikelyMinecraftUsername(user.username)) {
    res.status(400).json({
      error:
        "Your website username must match your Minecraft name (2–16 letters, numbers, underscore) to receive Pokémon.",
    });
    return;
  }

  const parsed = parseRewardForGivePokemon(r.reward_type);
  if (!parsed) {
    res.status(400).json({
      error:
        "This reward type cannot be sent automatically. Ask staff to fulfill it, or use a reward name like “shiny mesprit”.",
    });
    return;
  }

  const cmd = buildGivePokemonOtherCommand(user.username, parsed.species, parsed.shiny);
  const exec = await executeMinecraftRconCommand(cmd);
  if (!exec.ok) {
    res.status(502).json({
      error: exec.error,
      hint: "Make sure you are online on the server with the same username as your site account.",
    });
    return;
  }

  const { error: upErr } = await supabase
    .from("user_gacha_pulls")
    .update({ fulfilled_at: new Date().toISOString() })
    .eq("id", pullId)
    .eq("user_id", user.userId)
    .is("fulfilled_at", null);

  if (upErr) {
    if (/fulfilled_at|column/i.test(upErr.message)) {
      res.status(503).json({
        error:
          "Server ran the command but could not record fulfillment — run supabase/user_gacha_pulls_fulfilled.sql",
      });
      return;
    }
    res.status(500).json({ error: upErr.message });
    return;
  }

  res.json({ ok: true, message: "Pokémon sent to your party (if you were online)." });
});

app.get("/gacha/history", requireAuth, async (req, res) => {
  const user = res.locals.user!;
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const claimEnabled = isGachaClaimEnabled();

  let data: {
    id: number;
    pool_id: number;
    reward_type: string;
    pull_at: string;
    fulfilled_at?: string | null;
  }[] = [];
  const withFul = await supabase
    .from("user_gacha_pulls")
    .select("id, pool_id, reward_type, pull_at, fulfilled_at")
    .eq("user_id", user.userId)
    .order("pull_at", { ascending: false })
    .limit(limit);

  if (withFul.error && /fulfilled_at|column/i.test(withFul.error.message)) {
    const noFul = await supabase
      .from("user_gacha_pulls")
      .select("id, pool_id, reward_type, pull_at")
      .eq("user_id", user.userId)
      .order("pull_at", { ascending: false })
      .limit(limit);
    if (noFul.error) {
      res.status(500).json({ error: noFul.error.message });
      return;
    }
    data = (noFul.data ?? []).map((row) => ({ ...row, fulfilled_at: null }));
  } else if (withFul.error) {
    res.status(500).json({ error: withFul.error.message });
    return;
  } else {
    data = (withFul.data ?? []) as typeof data;
  }

  const poolIds = [...new Set(data.map((r) => r.pool_id))];
  const { data: pools } =
    poolIds.length > 0
      ? await supabase.from("gacha_pools").select("id, name").in("id", poolIds)
      : { data: [] };
  const poolNames = new Map((pools ?? []).map((p: { id: number; name: string }) => [p.id, p.name]));

  const history = data.map((r) => {
    const fulfilledAt = r.fulfilled_at ?? null;
    const claimable =
      claimEnabled &&
      !fulfilledAt &&
      isLikelyMinecraftUsername(user.username) &&
      parseRewardForGivePokemon(r.reward_type) != null;
    return {
      id: r.id,
      poolId: r.pool_id,
      poolName: poolNames.get(r.pool_id) ?? "Unknown",
      rewardType: r.reward_type,
      pulledAt: r.pull_at,
      fulfilledAt,
      claimable,
    };
  });
  res.json({ history });
});

// User currency (for gacha / display)
app.get("/user/currency", requireAuth, async (_req, res) => {
  const user = res.locals.user!;
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const { data, error } = await supabase
    .from("user_currency")
    .select("currency_type, balance")
    .eq("user_id", user.userId);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ currencies: data ?? [] });
});

const COBBLEDOLLARS_CURRENCY = "cobbledollars";

/** Website Cobble$ row — created on signup; lazily created for older accounts on first deposit. */
async function ensureUserCobbledollarsRow(
  userId: number
): Promise<{ id: number; balance: number } | null> {
  if (!supabase) return null;
  const { data: row } = await supabase
    .from("user_currency")
    .select("id, balance")
    .eq("user_id", userId)
    .eq("currency_type", COBBLEDOLLARS_CURRENCY)
    .maybeSingle();
  if (row) return row as { id: number; balance: number };
  const { data: inserted, error } = await supabase
    .from("user_currency")
    .insert({
      user_id: userId,
      currency_type: COBBLEDOLLARS_CURRENCY,
      balance: 0,
    })
    .select("id, balance")
    .single();
  if (error) return null;
  return inserted as { id: number; balance: number };
}

/**
 * Spend website Cobble$ and credit the linked Minecraft account via RCON.
 * Username must match Java edition IGN (same rule as gacha Pokémon claim).
 */
app.post("/user/cobbledollars/deposit", requireAuth, async (req, res) => {
  const user = res.locals.user!;
  if (!isCobbledollarsDepositEnabled()) {
    res.status(503).json({
      error:
        "Cobble$ deposit is not configured (set MC_RCON_* or disable MC_COBBLEDOLLARS_DEPOSIT_DISABLE)",
    });
    return;
  }
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const raw = (req.body ?? {}).amount;
  const amount =
    typeof raw === "number" ? raw : typeof raw === "string" ? parseInt(raw, 10) : NaN;
  if (!Number.isInteger(amount) || amount < 1) {
    res.status(400).json({ error: "amount must be a positive whole number" });
    return;
  }
  if (amount > 1_000_000_000_000) {
    res.status(400).json({ error: "amount too large" });
    return;
  }
  if (!isLikelyMinecraftUsername(user.username)) {
    res.status(400).json({
      error:
        "Your website username must match your Minecraft name (2–16 letters, numbers, underscore) to deposit Cobble$.",
    });
    return;
  }

  const row = await ensureUserCobbledollarsRow(user.userId);
  if (!row) {
    res.status(500).json({ error: "Could not open Cobble$ wallet" });
    return;
  }
  if (row.balance < amount) {
    res.status(400).json({
      error: "Not enough website Cobble$",
      balance: row.balance,
      required: amount,
    });
    return;
  }

  const newBalance = row.balance - amount;
  const now = new Date().toISOString();
  const { data: updated, error: updErr } = await supabase
    .from("user_currency")
    .update({ balance: newBalance, updated_at: now })
    .eq("id", row.id)
    .eq("balance", row.balance)
    .select("balance");

  if (updErr) {
    res.status(500).json({ error: updErr.message });
    return;
  }
  if (!updated?.length) {
    res.status(409).json({ error: "Balance changed — try again" });
    return;
  }

  const cmd = buildCobbledollarsDepositCommand(user.username, amount);
  const exec = await executeMinecraftRconCommand(cmd);
  if (!exec.ok) {
    await supabase
      .from("user_currency")
      .update({ balance: row.balance, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    res.status(502).json({
      error: exec.error,
      hint: "Website balance was not charged. Check RCON and that your server’s Cobble$ command matches MC_COBBLEDOLLARS_DEPOSIT_COMMAND_TEMPLATE.",
    });
    return;
  }

  res.json({ newBalance });
});

// Ticket exchange: spend tickets for special ticket types
const EXCHANGE_RATES: { to_currency: string; cost_tickets: number; label: string }[] = [
  { to_currency: "mythic tickets", cost_tickets: 5, label: "Mythic Tickets" },
  { to_currency: "shiny mythic tickets", cost_tickets: 10, label: "Shiny Mythic Tickets" },
  { to_currency: "legendary tickets", cost_tickets: 10, label: "Legend Tickets" },
  { to_currency: "shiny legendary tickets", cost_tickets: 20, label: "Shiny Legend Tickets" },
  { to_currency: "shiny paradox tickets", cost_tickets: 10, label: "Shiny Paradox Tickets" },
];

app.get("/user/exchange-rates", requireAuth, (_req, res) => {
  res.json({ rates: EXCHANGE_RATES });
});

app.post("/user/exchange", requireAuth, async (req, res) => {
  const user = res.locals.user!;
  const userId = user.userId;
  const { to_currency } = req.body ?? {};
  if (!to_currency || typeof to_currency !== "string") {
    res.status(400).json({ error: "Missing or invalid to_currency" });
    return;
  }
  const rate = EXCHANGE_RATES.find((r) => r.to_currency === to_currency);
  if (!rate) {
    res.status(400).json({ error: "Unknown exchange target" });
    return;
  }
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const cost = rate.cost_tickets;

  const { data: ticketsRow } = await supabase
    .from("user_currency")
    .select("id, balance")
    .eq("user_id", userId)
    .eq("currency_type", "tickets")
    .maybeSingle();
  const currentTickets = (ticketsRow as { balance: number } | null)?.balance ?? 0;
  if (currentTickets < cost) {
    res.status(400).json({ error: "Not enough tickets", balance: currentTickets, required: cost });
    return;
  }

  const ticketsId = (ticketsRow as { id: number } | null)?.id;
  if (ticketsId) {
    const { error: updErr } = await supabase
      .from("user_currency")
      .update({
        balance: currentTickets - cost,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ticketsId);
    if (updErr) {
      res.status(500).json({ error: updErr.message });
      return;
    }
  }

  const { data: targetRow } = await supabase
    .from("user_currency")
    .select("id, balance")
    .eq("user_id", userId)
    .eq("currency_type", to_currency)
    .maybeSingle();
  const now = new Date().toISOString();
  if (targetRow) {
    const newBalance = (targetRow as { balance: number }).balance + 1;
    await supabase
      .from("user_currency")
      .update({ balance: newBalance, updated_at: now })
      .eq("id", (targetRow as { id: number }).id);
  } else {
    await supabase.from("user_currency").insert({
      user_id: userId,
      currency_type: to_currency,
      balance: 1,
    });
  }

  res.json({
    to_currency,
    cost_tickets: cost,
    new_tickets_balance: currentTickets - cost,
  });
});

// --- Admin only (requireAuth + requireAdmin) ---
/**
 * Full Minecraft dashboard: Query/status data + roster (RCON whitelist ∪ users ∪ env) with online/offline.
 */
app.get("/admin/minecraft/dashboard", requireAuth, requireAdmin, async (_req, res) => {
  if (!process.env.MC_SERVER_HOST?.trim()) {
    res.status(503).json({
      error: "Minecraft not configured",
      hint: "Set MC_SERVER_HOST, MC_SERVER_PORT, and optionally MC_QUERY_PORT on the backend.",
    });
    return;
  }
  try {
    const data = await fetchMinecraftServerPayload();
    const rosterRcon = await fetchRosterFromWhitelistRcon();
    const includeWebsiteUsers = process.env.MC_ROSTER_INCLUDE_WEBSITE_USERS !== "false";
    const rosterWeb = includeWebsiteUsers ? await fetchRosterFromUsers(supabase) : new Map();
    const rosterBase = mergeRosterMaps(rosterRcon, rosterWeb);
    const { players, accountCount, extraEnvCount } = mergeOnlineWithRoster(
      data.onlinePlayerNames,
      rosterBase
    );

    const { players: playersEnriched, presenceTracking } = await syncAndEnrichPresence(
      supabase,
      players
    );

    const cobbledollarsRcon = await fetchCobbledollarsViaRcon();

    let rosterNote: string | undefined;
    if (accountCount === 0 && data.online === 0) {
      rosterNote =
        "No roster: configure RCON + /whitelist add, or website users (username = IGN), or MC_EXTRA_ROSTER_NAMES.";
    } else if (accountCount === 0 && data.online > 0) {
      rosterNote =
        "No roster for offline tracking — add whitelist (RCON), website users, or MC_EXTRA_ROSTER_NAMES.";
    }

    const serverInfo = { ...data };
    delete (serverInfo as { onlinePlayerNames?: unknown }).onlinePlayerNames;
    res.json({
      ...serverInfo,
      players: playersEnriched,
      presenceTracking,
      cobbledollarsRconError: cobbledollarsRcon.error,
      cobbledollarsTop10: topBalancesFromMap(cobbledollarsRcon.balances, 10),
      rosterAccountCount: accountCount,
      rosterExtraFromEnv: extraEnvCount > 0 ? extraEnvCount : undefined,
      rosterFromServerWhitelist: rosterRcon.size > 0 ? rosterRcon.size : undefined,
      rosterWebsiteUsers: includeWebsiteUsers && rosterWeb.size > 0 ? rosterWeb.size : undefined,
      rosterNote,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(502).json({ error: "Could not reach Minecraft server", details: msg });
  }
});

app.get("/admin/users", requireAuth, requireAdmin, async (_req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const { data, error } = await supabase
    .from("users")
    .select("id, email, username, is_admin, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ users: data ?? [] });
});

app.get("/admin/users/:userId/currency", requireAuth, requireAdmin, async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  const { data, error } = await supabase
    .from("user_currency")
    .select("id, currency_type, balance, updated_at")
    .eq("user_id", userId)
    .order("currency_type");
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ currencies: data ?? [] });
});

app.post("/admin/users/:userId/currency", requireAuth, requireAdmin, async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const userId = Number(req.params.userId);
  const { currency_type, amount } = req.body ?? {};
  const currencyTypeStr = typeof currency_type === "string" ? currency_type.trim() : "";
  if (!Number.isFinite(userId) || !currencyTypeStr || typeof amount !== "number" || amount <= 0) {
    res.status(400).json({ error: "Invalid user id, currency_type, or positive amount" });
    return;
  }
  const { data: row } = await supabase
    .from("user_currency")
    .select("id, balance")
    .eq("user_id", userId)
    .eq("currency_type", currencyTypeStr)
    .maybeSingle();
  const now = new Date().toISOString();
  if (row) {
    const newBalance = (row as { balance: number }).balance + amount;
    const { data, error } = await supabase
      .from("user_currency")
      .update({ balance: newBalance, updated_at: now })
      .eq("id", (row as { id: number }).id)
      .select()
      .single();
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json(data);
  } else {
    const { data, error } = await supabase
      .from("user_currency")
      .insert({
        user_id: userId,
        currency_type: currencyTypeStr,
        balance: amount,
      })
      .select()
      .single();
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json(data);
  }
});

app.get("/admin/users/:userId/history", requireAuth, requireAdmin, async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  type PullRow = { id: number; pool_id: number; reward_type: string; pull_at: string; fulfilled_at?: string | null };
  let rows: PullRow[] = [];
  let withFulfilled = true;

  const resultWithFulfilled = await supabase
    .from("user_gacha_pulls")
    .select("id, pool_id, reward_type, pull_at, fulfilled_at")
    .eq("user_id", userId)
    .order("pull_at", { ascending: false })
    .limit(limit);

  if (resultWithFulfilled.error && /fulfilled_at|column/i.test(resultWithFulfilled.error.message)) {
    withFulfilled = false;
    const resultWithout = await supabase
      .from("user_gacha_pulls")
      .select("id, pool_id, reward_type, pull_at")
      .eq("user_id", userId)
      .order("pull_at", { ascending: false })
      .limit(limit);
    if (resultWithout.error) {
      res.status(500).json({ error: resultWithout.error.message });
      return;
    }
    rows = (resultWithout.data ?? []).map((r) => ({ ...r, fulfilled_at: null }));
  } else {
    if (resultWithFulfilled.error) {
      res.status(500).json({ error: resultWithFulfilled.error.message });
      return;
    }
    rows = (resultWithFulfilled.data ?? []) as PullRow[];
  }

  const poolIds = [...new Set(rows.map((r) => r.pool_id))];
  const { data: pools } =
    poolIds.length > 0
      ? await supabase.from("gacha_pools").select("id, name").in("id", poolIds)
      : { data: [] };
  const poolNames = new Map((pools ?? []).map((p: { id: number; name: string }) => [p.id, p.name]));
  const history = rows.map((r) => ({
    id: r.id,
    poolId: r.pool_id,
    poolName: poolNames.get(r.pool_id) ?? "Unknown",
    rewardType: r.reward_type,
    pulledAt: r.pull_at,
    fulfilledAt: withFulfilled ? r.fulfilled_at ?? null : null,
  }));
  res.json({ history });
});

app.patch("/admin/pulls/:pullId/fulfilled", requireAuth, requireAdmin, async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const pullId = Number(req.params.pullId);
  const { fulfilled } = req.body ?? {};
  if (!Number.isFinite(pullId)) {
    res.status(400).json({ error: "Invalid pull id" });
    return;
  }
  const now = new Date().toISOString();
  const fulfilledAt = fulfilled === true ? now : null;
  const { data, error } = await supabase
    .from("user_gacha_pulls")
    .update({ fulfilled_at: fulfilledAt })
    .eq("id", pullId)
    .select()
    .single();
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({
    id: (data as { id: number }).id,
    fulfilled_at: (data as { fulfilled_at: string | null }).fulfilled_at,
  });
});

app.delete("/admin/pulls/:pullId", requireAuth, requireAdmin, async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const pullId = Number(req.params.pullId);
  if (!Number.isFinite(pullId)) {
    res.status(400).json({ error: "Invalid pull id" });
    return;
  }
  const { error } = await supabase.from("user_gacha_pulls").delete().eq("id", pullId);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ ok: true, id: pullId });
});

app.listen(port, () => {
  console.log(`Backend http://localhost:${port}`);
});
