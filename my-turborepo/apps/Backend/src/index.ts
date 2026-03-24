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
const PVP_DAILY_REWARDS: Record<number, number> = {
  1: 60_000,
  2: 50_000,
  3: 45_000,
  4: 40_000,
  5: 35_000,
  6: 30_000,
  7: 25_000,
  8: 20_000,
};
/** Ranks that receive bonus website “normal tickets” (user_currency `tickets`) each daily payout. */
const PVP_DAILY_TICKET_BONUS_RANKS = new Set([1, 2]);
const PVP_DAILY_TICKETS_PER_BONUS_RANK = 1;
const PVP_TICKETS_CURRENCY = "tickets";
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

type PvpLeaderboardRow = {
  rank: number;
  playerName: string;
  elo: number | null;
  formatKey: string;
};

function pvpTierFromElo(elo: number | null): string {
  const n = Number(elo ?? 0);
  if (n >= 1350) return "netherite";
  if (n >= 1250) return "diamond";
  if (n >= 1175) return "emerald";
  if (n >= 1100) return "gold";
  if (n >= 1050) return "silver";
  return "copper";
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase();
}


function extractPvpRowsFromLeaderboardPayload(payload: unknown): PvpLeaderboardRow[] {
  const obj = payload as { formats?: Record<string, { players?: unknown[] }>; entries?: unknown[] } | null;
  if (!obj || typeof obj !== "object") return [];

  const formats = obj.formats ?? {};
  const formatKeys = Object.keys(formats);
  const singlesKey = formatKeys.find((k) => k.toLowerCase() === "singles");
  const chosenKey = singlesKey ?? formatKeys.find((k) => Array.isArray(formats[k]?.players));

  if (chosenKey) {
    const players = formats[chosenKey]?.players ?? [];
    const rows = (players as Array<{ rank?: unknown; playerName?: unknown; elo?: unknown }>)
      .map((p) => ({
        rank: Number(p.rank),
        playerName: typeof p.playerName === "string" ? p.playerName.trim() : "",
        elo: Number.isFinite(Number(p.elo)) ? Number(p.elo) : null,
        formatKey: chosenKey,
      }))
      .filter((p) => p.playerName && Number.isFinite(p.rank))
      .sort((a, b) => a.rank - b.rank);
    if (rows.length) return rows;
  }

  const entries = obj.entries ?? [];
  return (entries as Array<{ rank?: unknown; name?: unknown; playerName?: unknown; elo?: unknown; rating?: unknown }>)
    .map((e) => ({
      rank: Number(e.rank),
      playerName:
        typeof e.playerName === "string"
          ? e.playerName.trim()
          : typeof e.name === "string"
            ? e.name.trim()
            : "",
      elo: Number.isFinite(Number(e.elo)) ? Number(e.elo) : Number.isFinite(Number(e.rating)) ? Number(e.rating) : null,
      formatKey: "singles",
    }))
    .filter((p) => p.playerName && Number.isFinite(p.rank))
    .sort((a, b) => a.rank - b.rank);
}

async function syncWebsitePvpRanksFromLeaderboard(payload: unknown): Promise<void> {
  if (!supabase) return;
  const rows = extractPvpRowsFromLeaderboardPayload(payload);
  if (!rows.length) return;
  const { data: users, error: usersErr } = await supabase.from("users").select("id, username");
  if (usersErr || !users?.length) return;
  const byUsername = new Map<string, { id: number }>();
  for (const u of users as { id: number; username: string }[]) {
    byUsername.set(normalizeName(u.username), { id: u.id });
  }
  const now = new Date().toISOString();
  const upserts = rows
    .map((r) => {
      const user = byUsername.get(normalizeName(r.playerName));
      if (!user) return null;
      return {
        user_id: user.id,
        minecraft_username: r.playerName,
        format_key: r.formatKey,
        rank_position: r.rank,
        elo: r.elo,
        source_updated_at: now,
        updated_at: now,
      };
    })
    .filter(Boolean) as Array<{
    user_id: number;
    minecraft_username: string;
    format_key: string;
    rank_position: number;
    elo: number | null;
    source_updated_at: string;
    updated_at: string;
  }>;
  if (!upserts.length) return;
  await supabase.from("user_pvp_ranks").upsert(upserts, { onConflict: "user_id" });
}

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
  void syncWebsitePvpRanksFromLeaderboard(req.body);
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
  void syncWebsitePvpRanksFromLeaderboard(req.body);
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

app.get("/user/pvp-rank", requireAuth, async (_req, res) => {
  const user = res.locals.user!;
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const { data, error } = await supabase
    .from("user_pvp_ranks")
    .select("rank_position, minecraft_username, format_key, elo, source_updated_at")
    .eq("user_id", user.userId)
    .maybeSingle();
  const missingRankTable = Boolean(
    error && /user_pvp_ranks|relation|does not exist|schema cache/i.test(error.message)
  );
  if (error && !missingRankTable) {
    res.status(500).json({ error: error.message });
    return;
  }
  const row = data as
    | {
        rank_position: number;
        minecraft_username: string;
        format_key: string;
        elo: number | null;
        source_updated_at: string;
      }
    | null;
  if (row) {
    res.json({
      rank: row.rank_position,
      status: "ranked",
      format: row.format_key,
      minecraftUsername: row.minecraft_username,
      elo: row.elo,
      tier: pvpTierFromElo(row.elo),
      updatedAt: row.source_updated_at,
    });
    return;
  }

  // Fallback: derive live rank directly from in-memory /leaderboard payload.
  const liveRows = extractPvpRowsFromLeaderboardPayload(cobbleStore.leaderboard);
  const mine = liveRows.find((r) => normalizeName(r.playerName) === normalizeName(user.username));
  if (!mine) {
    res.json({ rank: null, status: "unranked" });
    return;
  }
  const now = new Date().toISOString();
  await supabase.from("user_pvp_ranks").upsert(
    {
      user_id: user.userId,
      minecraft_username: mine.playerName,
      format_key: mine.formatKey,
      rank_position: mine.rank,
      elo: mine.elo,
      source_updated_at: now,
      updated_at: now,
    },
    { onConflict: "user_id" }
  );
  res.json({
    rank: mine.rank,
    status: "ranked",
    format: mine.formatKey,
    minecraftUsername: mine.playerName,
    elo: mine.elo,
    tier: pvpTierFromElo(mine.elo),
    updatedAt: now,
    fromLiveLeaderboard: true,
  });
});

const COBBLEDOLLARS_CURRENCY = "cobbledollars";
const DAILY_RESET_TIMEZONE = "Asia/Ho_Chi_Minh";
const DAILY_STREAK_REWARDS = [
  { day: 1, kind: "cobbledollars", amount: 25_000, label: "Cobble$ +25,000" },
  { day: 2, kind: "cobbledollars", amount: 35_000, label: "Cobble$ +35,000" },
  { day: 3, kind: "cobbledollars", amount: 45_000, label: "Cobble$ +45,000" },
  { day: 4, kind: "cobbledollars", amount: 50_000, label: "Cobble$ +50,000" },
  { day: 5, kind: "cobbledollars", amount: 60_000, label: "Cobble$ +60,000" },
  { day: 6, kind: "cobbledollars", amount: 70_000, label: "Cobble$ +70,000" },
  { day: 7, kind: "item", itemKey: "masterball", amount: 1, label: "Master Ball x1" },
] as const;
const SHOP_ITEMS = [
  { itemKey: "exp_candy_xl", label: "EXP Candy XL", cost: 40_000 },
  { itemKey: "ancient_origin_ball", label: "Ancient Origin Ball", cost: 300_000 },
  { itemKey: "master_ball", label: "Master Ball", cost: 100_000 },
  { itemKey: "gold_bottle_cap", label: "Gold Bottle Cap", cost: 2_000_000 },
] as const;
const POKEMON_SHOP_REFRESH_HOURS = 4;
const POKEMON_SHOP_OFFER_COUNT = 3;
const POKEMON_SHOP_CATEGORIES = {
  starter: {
    price: 750_000,
    species: [
      "bulbasaur", "charmander", "squirtle", "chikorita", "cyndaquil", "totodile", "treecko",
      "torchic", "mudkip", "turtwig", "chimchar", "piplup", "snivy", "tepig", "oshawott",
      "chespin", "fennekin", "froakie", "rowlet", "litten", "popplio", "grookey", "scorbunny",
      "sobble", "sprigatito", "fuecoco", "quaxly",
    ],
  },
  mythic: {
    price: 3_500_000,
    species: [
      "mew", "celebi", "jirachi", "deoxys", "manaphy", "phione", "darkrai", "shaymin",
      "arceus", "victini", "keldeo", "meloetta", "genesect", "diancie", "hoopa", "volcanion",
      "magearna", "marshadow", "zeraora", "meltan", "melmetal", "zarude", "pecharunt",
    ],
  },
  pseudo_legend: {
    price: 1_500_000,
    species: [
      "dragonite", "tyranitar", "salamence", "metagross", "garchomp", "hydreigon",
      "goodra", "kommo-o", "dragapult", "baxcalibur",
    ],
  },
  legend: {
    price: 7_500_000,
    species: [
      "articuno", "zapdos", "moltres", "mewtwo", "raikou", "entei", "suicune", "lugia", "ho-oh",
      "regirock", "regice", "registeel", "latias", "latios", "kyogre", "groudon", "rayquaza",
      "uxie", "mesprit", "azelf", "dialga", "palkia", "heatran", "giratina", "cresselia",
      "cobalion", "terrakion", "virizion", "tornadus", "thundurus", "reshiram", "zekrom",
      "landorus", "kyurem", "xerneas", "yveltal", "zygarde", "tapu-koko", "tapu-lele",
      "tapu-bulu", "tapu-fini", "cosmog", "cosmoem", "solgaleo", "lunala", "necrozma",
      "zacian", "zamazenta", "eternatus", "kubfu", "urshifu", "regieleki", "regidrago",
      "glastrier", "spectrier", "calyrex", "koraidon", "miraidon",
    ],
  },
} as const;
type PokemonShopCategory = keyof typeof POKEMON_SHOP_CATEGORIES;

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function currentPokemonShopWindow(now: Date = new Date()): { start: Date; end: Date } {
  const ms = now.getTime();
  const period = POKEMON_SHOP_REFRESH_HOURS * 60 * 60 * 1000;
  const startMs = Math.floor(ms / period) * period;
  return { start: new Date(startMs), end: new Date(startMs + period) };
}

function buildPokemonShopOffers(windowStartIso: string) {
  const categories = Object.keys(POKEMON_SHOP_CATEGORIES) as PokemonShopCategory[];
  const rng = mulberry32(hashString(`pokemon-shop:${windowStartIso}`));
  const categoryPool = [...categories];
  const pickedCategories: PokemonShopCategory[] = [];
  while (pickedCategories.length < Math.min(POKEMON_SHOP_OFFER_COUNT, categoryPool.length)) {
    const idx = Math.floor(rng() * categoryPool.length);
    const [cat] = categoryPool.splice(idx, 1);
    if (cat) pickedCategories.push(cat);
  }
  const offers = pickedCategories.map((category, i) => {
    const def = POKEMON_SHOP_CATEGORIES[category];
    const pickIdx = Math.floor(rng() * def.species.length);
    const species = def.species[pickIdx] ?? def.species[0]!;
    return {
      slot: i + 1,
      category,
      species,
      shiny: true,
      price: def.price,
      label: `Shiny ${species}`,
    };
  });
  return offers;
}

const INVENTORY_ITEM_DEFS = [
  { key: "exp_candy_xl", label: "EXP Candy XL", itemId: "cobblemon:exp_candy_xl" },
  { key: "ancient_origin_ball", label: "Ancient Origin Ball", itemId: "cobblemon:ancient_origin_ball" },
  // legacy alias in case old rows exist
  { key: "origin_ball", label: "Origin Ball", itemId: "cobblemon:origin_ball" },
  { key: "master_ball", label: "Master Ball", itemId: "cobblemon:master_ball" },
  { key: "gold_bottle_cap", label: "Gold Bottle Cap", itemId: "obc:bottle_cap_gold" },
] as const;
const INVENTORY_CLAIM_COMMAND_TEMPLATE =
  process.env.INVENTORY_CLAIM_COMMAND_TEMPLATE?.trim() ||
  "give {player} {item_id} {amount}";

function inventoryItemDef(itemKey: string) {
  return INVENTORY_ITEM_DEFS.find((it) => it.key === itemKey);
}

function normalizeInventoryKey(itemKey: string): string {
  return itemKey === "origin_ball" ? "ancient_origin_ball" : itemKey;
}

function localDateOnly(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function yesterdayDateOnly(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

type CobbledollarsLedgerMeta = { kind: string; detail?: string | null };

async function recordCobbledollarLedger(
  userId: number,
  delta: number,
  balanceAfter: number,
  kind: string,
  detail: string | null
): Promise<void> {
  if (!supabase || delta === 0) return;
  const { error } = await supabase.from("user_cobbledollar_ledger").insert({
    user_id: userId,
    delta,
    balance_after: balanceAfter,
    kind,
    detail,
  });
  if (error) console.warn("[cobbledollars ledger]", error.message);
}

async function incrementUserCurrency(
  userId: number,
  currencyType: string,
  amount: number,
  cobbledollarsLedger?: CobbledollarsLedgerMeta
): Promise<number> {
  if (!supabase) throw new Error("Database not configured");
  const { data: row } = await supabase
    .from("user_currency")
    .select("id, balance")
    .eq("user_id", userId)
    .eq("currency_type", currencyType)
    .maybeSingle();
  const now = new Date().toISOString();
  if (row) {
    const newBalance = (row as { balance: number }).balance + amount;
    const { error } = await supabase
      .from("user_currency")
      .update({ balance: newBalance, updated_at: now })
      .eq("id", (row as { id: number }).id);
    if (error) throw new Error(error.message);
    if (
      currencyType === COBBLEDOLLARS_CURRENCY &&
      amount !== 0 &&
      cobbledollarsLedger
    ) {
      void recordCobbledollarLedger(
        userId,
        amount,
        newBalance,
        cobbledollarsLedger.kind,
        cobbledollarsLedger.detail ?? null
      );
    }
    return newBalance;
  }
  const { error } = await supabase.from("user_currency").insert({
    user_id: userId,
    currency_type: currencyType,
    balance: amount,
  });
  if (error) throw new Error(error.message);
  if (
    currencyType === COBBLEDOLLARS_CURRENCY &&
    amount !== 0 &&
    cobbledollarsLedger
  ) {
    void recordCobbledollarLedger(
      userId,
      amount,
      amount,
      cobbledollarsLedger.kind,
      cobbledollarsLedger.detail ?? null
    );
  }
  return amount;
}

async function incrementUserInventory(
  userId: number,
  itemKey: string,
  amount: number
): Promise<number> {
  if (!supabase) throw new Error("Database not configured");
  const { data: row } = await supabase
    .from("user_inventory")
    .select("id, quantity")
    .eq("user_id", userId)
    .eq("item_key", itemKey)
    .maybeSingle();
  const now = new Date().toISOString();
  if (row) {
    const newQty = (row as { quantity: number }).quantity + amount;
    const { error } = await supabase
      .from("user_inventory")
      .update({ quantity: newQty, updated_at: now })
      .eq("id", (row as { id: number }).id);
    if (error) throw new Error(error.message);
    return newQty;
  }
  const { error } = await supabase.from("user_inventory").insert({
    user_id: userId,
    item_key: itemKey,
    quantity: amount,
  });
  if (error) throw new Error(error.message);
  return amount;
}

async function isUserOnlineNow(username: string): Promise<boolean> {
  const status = await fetchMinecraftServerPayload();
  const online = status.onlinePlayerNames.map((p) => p.name.toLowerCase());
  return online.includes(username.toLowerCase());
}

async function isEligibleToday(userId: number, username: string): Promise<boolean> {
  if (await isUserOnlineNow(username).catch(() => false)) return true;
  if (!supabase) return false;
  const { data: row } = await supabase
    .from("minecraft_player_presence")
    .select("last_seen_online")
    .eq("player_key", username.toLowerCase())
    .maybeSingle();
  const lastSeen = (row as { last_seen_online?: string | null } | null)?.last_seen_online ?? null;
  if (!lastSeen) return false;
  const today = localDateOnly(new Date(), DAILY_RESET_TIMEZONE);
  return localDateOnly(new Date(lastSeen), DAILY_RESET_TIMEZONE) === today;
}

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

  await recordCobbledollarLedger(
    user.userId,
    -amount,
    newBalance,
    "deposit_to_server",
    null
  );

  res.json({ newBalance });
});

app.get("/user/cobbledollars/ledger", requireAuth, async (req, res) => {
  const user = res.locals.user!;
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const raw = req.query.limit;
  const n = typeof raw === "string" ? parseInt(raw, 10) : NaN;
  const limit = Number.isFinite(n) ? Math.min(Math.max(n, 1), 50) : 10;
  const { data, error } = await supabase
    .from("user_cobbledollar_ledger")
    .select("id, delta, balance_after, kind, detail, created_at")
    .eq("user_id", user.userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ transactions: data ?? [] });
});

app.get("/user/inventory", requireAuth, async (_req, res) => {
  const user = res.locals.user!;
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const { data, error } = await supabase
    .from("user_inventory")
    .select("item_key, quantity")
    .eq("user_id", user.userId)
    .order("item_key");
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  const rows = (data ?? []) as { item_key: string; quantity: number }[];
  const merged = new Map<string, number>();
  for (const r of rows) {
    const key = normalizeInventoryKey(r.item_key);
    merged.set(key, (merged.get(key) ?? 0) + (Number(r.quantity) || 0));
  }
  res.json({
    inventory: [...merged.entries()]
      .map(([item_key, quantity]) => ({ item_key, quantity }))
      .sort((a, b) => a.item_key.localeCompare(b.item_key)),
  });
});

app.post("/user/inventory/claim", requireAuth, async (req, res) => {
  const user = res.locals.user!;
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  if (!isLikelyMinecraftUsername(user.username)) {
    res.status(400).json({ error: "Your website username must match your Minecraft username." });
    return;
  }
  const itemKeyRaw = typeof req.body?.itemKey === "string" ? req.body.itemKey.trim() : "";
  const itemKey = normalizeInventoryKey(itemKeyRaw);
  const qtyRaw = req.body?.quantity;
  const quantity = Number.isFinite(Number(qtyRaw)) ? Math.floor(Number(qtyRaw)) : 1;
  if (quantity < 1 || quantity > 999) {
    res.status(400).json({ error: "quantity must be between 1 and 999" });
    return;
  }
  const def = inventoryItemDef(itemKey);
  if (!def) {
    res.status(400).json({ error: "Item is not claimable" });
    return;
  }
  const online = await isUserOnlineNow(user.username).catch(() => false);
  if (!online) {
    res.status(400).json({ error: "You must be online on Minecraft server to claim items." });
    return;
  }

  let row =
    (
      await supabase
        .from("user_inventory")
        .select("id, quantity, item_key")
        .eq("user_id", user.userId)
        .eq("item_key", itemKey)
        .maybeSingle()
    ).data as { id: number; quantity: number; item_key: string } | null;

  // Backward-compat: old key `origin_ball` should be claimable as `ancient_origin_ball`.
  if (!row && itemKey === "ancient_origin_ball") {
    row =
      (
        await supabase
          .from("user_inventory")
          .select("id, quantity, item_key")
          .eq("user_id", user.userId)
          .eq("item_key", "origin_ball")
          .maybeSingle()
      ).data as { id: number; quantity: number; item_key: string } | null;
  }

  if (!row) {
    res.status(400).json({ error: "Not enough quantity in inventory" });
    return;
  }
  const currentQty = row.quantity;
  if (currentQty < quantity) {
    res.status(400).json({ error: "Not enough quantity in inventory" });
    return;
  }

  const nextQty = currentQty - quantity;
  const { data: decRows, error: decErr } = await supabase
    .from("user_inventory")
    .update({ quantity: nextQty, updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("quantity", currentQty)
    .select("quantity");
  if (decErr) {
    res.status(500).json({ error: decErr.message });
    return;
  }
  if (!decRows?.length) {
    res.status(409).json({ error: "Inventory changed — try again." });
    return;
  }

  const cmd = INVENTORY_CLAIM_COMMAND_TEMPLATE
    .replace(/\{player\}/g, user.username)
    .replace(/\{item_id\}/g, def.itemId)
    .replace(/\{amount\}/g, String(quantity));
  const exec = await executeMinecraftRconCommand(cmd);
  if (!exec.ok) {
    await supabase
      .from("user_inventory")
      .update({ quantity: currentQty, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    res.status(502).json({ error: exec.error });
    return;
  }

  res.json({
    ok: true,
    itemKey,
    label: def.label,
    quantityClaimed: quantity,
    remaining: nextQty,
  });
});

app.get("/shop/items", requireAuth, (_req, res) => {
  res.json({ currency: COBBLEDOLLARS_CURRENCY, items: SHOP_ITEMS });
});

app.post("/shop/buy", requireAuth, async (req, res) => {
  const user = res.locals.user!;
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const itemKey = typeof req.body?.itemKey === "string" ? req.body.itemKey.trim() : "";
  const qtyRaw = req.body?.quantity;
  const quantity = Number.isFinite(Number(qtyRaw)) ? Math.floor(Number(qtyRaw)) : 1;
  if (quantity < 1 || quantity > 999) {
    res.status(400).json({ error: "quantity must be between 1 and 999" });
    return;
  }
  const item = SHOP_ITEMS.find((x) => x.itemKey === itemKey);
  if (!item) {
    res.status(400).json({ error: "Unknown item key" });
    return;
  }
  const totalCost = item.cost * quantity;

  const wallet = await ensureUserCobbledollarsRow(user.userId);
  if (!wallet) {
    res.status(500).json({ error: "Could not open Cobble$ wallet" });
    return;
  }
  if (wallet.balance < totalCost) {
    res.status(400).json({
      error: "Not enough Cobble$",
      balance: wallet.balance,
      required: totalCost,
    });
    return;
  }

  const newBalance = wallet.balance - totalCost;
  const now = new Date().toISOString();
  const { data: updated, error: updErr } = await supabase
    .from("user_currency")
    .update({ balance: newBalance, updated_at: now })
    .eq("id", wallet.id)
    .eq("balance", wallet.balance)
    .select("balance");
  if (updErr) {
    res.status(500).json({ error: updErr.message });
    return;
  }
  if (!updated?.length) {
    res.status(409).json({ error: "Balance changed — try again" });
    return;
  }

  try {
    const newQty = await incrementUserInventory(user.userId, item.itemKey, quantity);
    await recordCobbledollarLedger(
      user.userId,
      -totalCost,
      newBalance,
      "shop",
      `${item.label} ×${quantity}`
    );
    res.json({
      ok: true,
      itemKey: item.itemKey,
      quantityPurchased: quantity,
      totalCost,
      newBalance,
      newInventoryQuantity: newQty,
    });
  } catch (e) {
    // best-effort rollback if inventory write fails
    await supabase
      .from("user_currency")
      .update({ balance: wallet.balance, updated_at: new Date().toISOString() })
      .eq("id", wallet.id);
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

app.get("/pokemon-shop/offers", requireAuth, async (req, res) => {
  const user = res.locals.user!;
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const { start, end } = currentPokemonShopWindow();
  const offers = buildPokemonShopOffers(start.toISOString());
  const { data: purchases } = await supabase
    .from("user_pokemon_shop_purchases")
    .select("slot, claimed_at")
    .eq("user_id", user.userId)
    .eq("window_start", start.toISOString());
  const purchasedMap = new Map<number, { claimed_at: string | null }>();
  for (const p of (purchases ?? []) as { slot: number; claimed_at: string | null }[]) {
    purchasedMap.set(p.slot, { claimed_at: p.claimed_at });
  }
  res.json({
    refreshHours: POKEMON_SHOP_REFRESH_HOURS,
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    offers: offers.map((o) => ({
      ...o,
      purchased: purchasedMap.has(o.slot),
      claimed: Boolean(purchasedMap.get(o.slot)?.claimed_at),
    })),
  });
});

app.post("/pokemon-shop/buy", requireAuth, async (req, res) => {
  const user = res.locals.user!;
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const slot = Number(req.body?.slot);
  if (!Number.isInteger(slot) || slot < 1 || slot > POKEMON_SHOP_OFFER_COUNT) {
    res.status(400).json({ error: "Invalid slot" });
    return;
  }
  const { start } = currentPokemonShopWindow();
  const offers = buildPokemonShopOffers(start.toISOString());
  const offer = offers.find((o) => o.slot === slot);
  if (!offer) {
    res.status(404).json({ error: "Offer not found" });
    return;
  }
  const { data: already } = await supabase
    .from("user_pokemon_shop_purchases")
    .select("id")
    .eq("user_id", user.userId)
    .eq("window_start", start.toISOString())
    .eq("slot", slot)
    .maybeSingle();
  if (already) {
    res.status(400).json({ error: "You already purchased this offer in current rotation." });
    return;
  }

  const wallet = await ensureUserCobbledollarsRow(user.userId);
  if (!wallet) {
    res.status(500).json({ error: "Could not open Cobble$ wallet" });
    return;
  }
  if (wallet.balance < offer.price) {
    res.status(400).json({ error: "Not enough Cobble$", balance: wallet.balance, required: offer.price });
    return;
  }

  const now = new Date().toISOString();
  const newBalance = wallet.balance - offer.price;
  const { data: updated, error: updErr } = await supabase
    .from("user_currency")
    .update({ balance: newBalance, updated_at: now })
    .eq("id", wallet.id)
    .eq("balance", wallet.balance)
    .select("balance");
  if (updErr) {
    res.status(500).json({ error: updErr.message });
    return;
  }
  if (!updated?.length) {
    res.status(409).json({ error: "Balance changed — try again." });
    return;
  }

  const { error: insErr } = await supabase.from("user_pokemon_shop_purchases").insert({
    user_id: user.userId,
    window_start: start.toISOString(),
    slot: offer.slot,
    species: offer.species,
    category: offer.category,
    price: offer.price,
    shiny: true,
    purchased_at: now,
    updated_at: now,
  });
  if (insErr) {
    await supabase
      .from("user_currency")
      .update({ balance: wallet.balance, updated_at: new Date().toISOString() })
      .eq("id", wallet.id);
    if (/uq_user_pokemon_shop_window_slot|duplicate key/i.test(insErr.message)) {
      res.status(400).json({ error: "You already purchased this offer in current rotation." });
      return;
    }
    res.status(500).json({ error: insErr.message });
    return;
  }

  await recordCobbledollarLedger(
    user.userId,
    -offer.price,
    newBalance,
    "pokemon_shop",
    `${offer.species} (shiny)`
  );

  res.json({
    ok: true,
    slot: offer.slot,
    species: offer.species,
    shiny: true,
    price: offer.price,
    newBalance,
  });
});

app.get("/pokemon-shop/purchases", requireAuth, async (req, res) => {
  const user = res.locals.user!;
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const { data, error } = await supabase
    .from("user_pokemon_shop_purchases")
    .select("id, species, category, price, shiny, purchased_at, claimed_at")
    .eq("user_id", user.userId)
    .order("purchased_at", { ascending: false })
    .limit(limit);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({
    purchases: (data ?? []).map((r) => ({
      id: r.id,
      species: r.species,
      category: r.category,
      shiny: r.shiny,
      price: r.price,
      purchasedAt: r.purchased_at,
      claimedAt: r.claimed_at,
      claimable: !r.claimed_at,
    })),
  });
});

app.post("/pokemon-shop/purchases/:id/claim", requireAuth, async (req, res) => {
  const user = res.locals.user!;
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  if (!isLikelyMinecraftUsername(user.username)) {
    res.status(400).json({
      error: "Your website username must match your Minecraft name to claim Pokémon.",
    });
    return;
  }
  const purchaseId = Number(req.params.id);
  if (!Number.isFinite(purchaseId)) {
    res.status(400).json({ error: "Invalid purchase id" });
    return;
  }
  const { data: row, error } = await supabase
    .from("user_pokemon_shop_purchases")
    .select("id, user_id, species, shiny, claimed_at")
    .eq("id", purchaseId)
    .maybeSingle();
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  const p = row as
    | { id: number; user_id: number; species: string; shiny: boolean; claimed_at: string | null }
    | null;
  if (!p || p.user_id !== user.userId) {
    res.status(404).json({ error: "Purchase not found" });
    return;
  }
  if (p.claimed_at) {
    res.status(400).json({ error: "This Pokémon was already claimed." });
    return;
  }

  const cmd = buildGivePokemonOtherCommand(user.username, p.species, p.shiny);
  const exec = await executeMinecraftRconCommand(cmd);
  if (!exec.ok) {
    res.status(502).json({
      error: exec.error,
      hint: "Make sure you are online with the same username as your website account.",
    });
    return;
  }

  const { error: upErr } = await supabase
    .from("user_pokemon_shop_purchases")
    .update({ claimed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", p.id)
    .eq("user_id", user.userId)
    .is("claimed_at", null);
  if (upErr) {
    res.status(500).json({ error: upErr.message });
    return;
  }
  res.json({ ok: true, message: "Pokémon sent to your party (if online)." });
});

app.get("/user/daily-login/status", requireAuth, async (_req, res) => {
  const user = res.locals.user!;
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const today = localDateOnly(new Date(), DAILY_RESET_TIMEZONE);
  const eligible = await isEligibleToday(user.userId, user.username).catch(() => false);
  const { data: todayClaim } = await supabase
    .from("user_daily_login_claims")
    .select("status, claimed_at, selected_reward, error_message, streak_day")
    .eq("user_id", user.userId)
    .eq("claim_date", today)
    .maybeSingle();
  const { data: prev } = await supabase
    .from("user_daily_login_claims")
    .select("claim_date, streak_day")
    .eq("user_id", user.userId)
    .eq("status", "success")
    .lt("claim_date", today)
    .order("claim_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const prevDate = (prev as { claim_date?: string } | null)?.claim_date ?? null;
  const prevStreak = Number((prev as { streak_day?: number } | null)?.streak_day ?? 0) || 0;
  const nextDay = prevDate === yesterdayDateOnly(today) ? (prevStreak >= 7 ? 1 : prevStreak + 1) : 1;
  const nextReward = DAILY_STREAK_REWARDS.find((r) => r.day === nextDay) ?? DAILY_STREAK_REWARDS[0]!;

  res.json({
    date: today,
    timeZone: DAILY_RESET_TIMEZONE,
    eligible,
    streak: { nextDay, nextReward },
    claim: todayClaim
      ? {
          status: (todayClaim as { status?: string }).status ?? null,
          claimedAt: (todayClaim as { claimed_at?: string | null }).claimed_at ?? null,
          selectedReward: (todayClaim as { selected_reward?: string }).selected_reward ?? null,
          error: (todayClaim as { error_message?: string | null }).error_message ?? null,
          streakDay: Number((todayClaim as { streak_day?: number }).streak_day ?? 0) || null,
        }
      : null,
  });
});

app.post("/user/daily-login/claim", requireAuth, async (_req, res) => {
  const user = res.locals.user!;
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  if (!isLikelyMinecraftUsername(user.username)) {
    res.status(400).json({ error: "Your website username must match your Minecraft username." });
    return;
  }
  const eligible = await isEligibleToday(user.userId, user.username).catch(() => false);
  if (!eligible) {
    res.status(400).json({
      error: "Not eligible yet today. Go online in Minecraft at least once after 00:00 Asia/Ho_Chi_Minh.",
    });
    return;
  }

  const today = localDateOnly(new Date(), DAILY_RESET_TIMEZONE);
  const { data: existing } = await supabase
    .from("user_daily_login_claims")
    .select("id, status")
    .eq("user_id", user.userId)
    .eq("claim_date", today)
    .maybeSingle();
  if (existing && (existing as { status?: string }).status === "success") {
    res.status(400).json({ error: "Already claimed today." });
    return;
  }

  const { data: prev } = await supabase
    .from("user_daily_login_claims")
    .select("claim_date, streak_day")
    .eq("user_id", user.userId)
    .eq("status", "success")
    .lt("claim_date", today)
    .order("claim_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const prevDate = (prev as { claim_date?: string } | null)?.claim_date ?? null;
  const prevStreak = Number((prev as { streak_day?: number } | null)?.streak_day ?? 0) || 0;
  const streakDay = prevDate === yesterdayDateOnly(today) ? (prevStreak >= 7 ? 1 : prevStreak + 1) : 1;
  const reward = DAILY_STREAK_REWARDS.find((r) => r.day === streakDay) ?? DAILY_STREAK_REWARDS[0]!;

  if (!existing) {
    const { error: insErr } = await supabase.from("user_daily_login_claims").insert({
      user_id: user.userId,
      claim_date: today,
      streak_day: streakDay,
      selected_reward: reward.label,
      reward_kind: reward.kind,
      reward_amount: reward.amount,
      status: "pending",
      updated_at: new Date().toISOString(),
    });
    if (insErr) {
      if (/duplicate key|uq_user_daily_login_claims_user_date/i.test(insErr.message)) {
        res.status(409).json({ error: "Claim already processing. Try again." });
        return;
      }
      res.status(500).json({ error: insErr.message });
      return;
    }
  }

  try {
    let message = "";
    if (reward.kind === "cobbledollars") {
      const newBalance = await incrementUserCurrency(
        user.userId,
        COBBLEDOLLARS_CURRENCY,
        reward.amount,
        { kind: "daily_login", detail: `Day ${streakDay} — ${reward.label}` }
      );
      message = `Day ${streakDay}: +${reward.amount.toLocaleString()} Cobble$ (new balance ${newBalance.toLocaleString()})`;
    } else {
      const totalQty = await incrementUserInventory(user.userId, reward.itemKey, reward.amount);
      message = `Day ${streakDay}: +${reward.amount} ${reward.itemKey} in website inventory (total ${totalQty})`;
    }

    await supabase
      .from("user_daily_login_claims")
      .update({
        streak_day: streakDay,
        selected_reward: reward.label,
        reward_kind: reward.kind,
        reward_amount: reward.amount,
        status: "success",
        claimed_at: new Date().toISOString(),
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.userId)
      .eq("claim_date", today);

    res.json({ ok: true, date: today, streakDay, reward: reward.label, message });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase
      .from("user_daily_login_claims")
      .update({
        streak_day: streakDay,
        selected_reward: reward.label,
        reward_kind: reward.kind,
        reward_amount: reward.amount,
        status: "failed",
        error_message: msg,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.userId)
      .eq("claim_date", today);
    res.status(500).json({ error: msg });
  }
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

async function runDailyPvpRankPayout(): Promise<{
  payoutDate: string;
  format: string;
  paid: Array<{ rank: number; username: string; amount: number; tickets?: number }>;
  skipped: Array<{ rank: number; username: string; reason: string }>;
}> {
  if (!supabase) {
    throw new Error("Database not configured");
  }
  const rows = extractPvpRowsFromLeaderboardPayload(cobbleStore.leaderboard);
  if (!rows.length) {
    throw new Error("Leaderboard is empty. Sync /leaderboard first.");
  }
  const payoutDate = localDateOnly(new Date(), DAILY_RESET_TIMEZONE);
  const formatKey = rows[0]?.formatKey ?? "singles";
  const { data: existing } = await supabase
    .from("user_pvp_daily_payouts")
    .select("id")
    .eq("payout_date", payoutDate)
    .eq("format_key", formatKey);
  if ((existing?.length ?? 0) > 0) {
    throw new Error(`Daily payout already processed for ${payoutDate} (${formatKey}).`);
  }
  const { data: users, error: usersErr } = await supabase.from("users").select("id, username");
  if (usersErr) {
    throw new Error(usersErr.message);
  }
  const byUsername = new Map<string, { id: number }>();
  for (const u of (users ?? []) as { id: number; username: string }[]) {
    byUsername.set(normalizeName(u.username), { id: u.id });
  }

  const paid: Array<{ rank: number; username: string; amount: number }> = [];
  const skipped: Array<{ rank: number; username: string; reason: string }> = [];
  for (const [rankStr, amount] of Object.entries(PVP_DAILY_REWARDS)) {
    const rank = Number(rankStr);
    const row = rows.find((r) => r.rank === rank);
    if (!row) continue;
    const user = byUsername.get(normalizeName(row.playerName));
    const now = new Date().toISOString();
    if (!user) {
      await supabase.from("user_pvp_daily_payouts").insert({
        payout_date: payoutDate,
        format_key: row.formatKey,
        rank_position: rank,
        minecraft_username: row.playerName,
        user_id: null,
        amount,
        status: "skipped",
        note: "No matching website username",
        paid_at: now,
        updated_at: now,
      });
      skipped.push({ rank, username: row.playerName, reason: "No matching website username" });
      continue;
    }
    await incrementUserCurrency(user.id, COBBLEDOLLARS_CURRENCY, amount, {
      kind: "pvp_rank_daily",
      detail: `Rank ${rank} — ${row.formatKey}`,
    });
    const ticketBonus = PVP_DAILY_TICKET_BONUS_RANKS.has(rank) ? PVP_DAILY_TICKETS_PER_BONUS_RANK : 0;
    if (ticketBonus > 0) {
      await incrementUserCurrency(user.id, PVP_TICKETS_CURRENCY, ticketBonus);
    }
    await supabase.from("user_pvp_daily_payouts").insert({
      payout_date: payoutDate,
      format_key: row.formatKey,
      rank_position: rank,
      minecraft_username: row.playerName,
      user_id: user.id,
      amount,
      status: "success",
      note:
        ticketBonus > 0
          ? `+${ticketBonus} website normal ticket(s) (${PVP_TICKETS_CURRENCY})`
          : null,
      paid_at: now,
      updated_at: now,
    });
    paid.push({
      rank,
      username: row.playerName,
      amount,
      ...(ticketBonus > 0 ? { tickets: ticketBonus } : {}),
    });
  }

  return { payoutDate, format: formatKey, paid, skipped };
}

app.post("/admin/pvp-rank/daily-payout", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const result = await runDailyPvpRankPayout();
    res.json({ ok: true, rewards: PVP_DAILY_REWARDS, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/already processed/i.test(msg) || /Leaderboard is empty/i.test(msg)) {
      res.status(400).json({ error: msg });
      return;
    }
    if (/Database not configured/i.test(msg)) {
      res.status(503).json({ error: msg });
      return;
    }
    res.status(500).json({ error: msg });
  }
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
  const staff = res.locals.user!;
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
    if (currencyTypeStr === COBBLEDOLLARS_CURRENCY) {
      await recordCobbledollarLedger(
        userId,
        amount,
        newBalance,
        "admin_grant",
        `Staff: ${staff.username}`
      );
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
    if (currencyTypeStr === COBBLEDOLLARS_CURRENCY) {
      await recordCobbledollarLedger(
        userId,
        amount,
        amount,
        "admin_grant",
        `Staff: ${staff.username}`
      );
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

let dailyPvpAutoLastAttemptMinute = "";
function startDailyPvpAutoPayoutScheduler(): void {
  if (process.env.PVP_DAILY_AUTO_PAYOUT_DISABLE === "true") return;
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

    // Daily 00:00 in configured timezone
    if (hh !== "00" || mm !== "00") return;
    if (dailyPvpAutoLastAttemptMinute === key) return;
    dailyPvpAutoLastAttemptMinute = key;
    try {
      const result = await runDailyPvpRankPayout();
      console.log(
        `[pvp-daily-auto] paid date=${result.payoutDate} format=${result.format} paid=${result.paid.length} skipped=${result.skipped.length}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[pvp-daily-auto] skipped/error: ${msg}`);
    }
  };
  void tick();
  setInterval(() => {
    void tick();
  }, 60_000);
}

app.listen(port, () => {
  console.log(`Backend http://localhost:${port}`);
  startDailyPvpAutoPayoutScheduler();
});
