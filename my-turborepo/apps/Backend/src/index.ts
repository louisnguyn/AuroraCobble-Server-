import "dotenv/config";
import express from "express";
import {
  createUser,
  findUserByEmail,
  verifyPassword,
  signToken,
  verifyToken,
  type JwtPayload,
} from "./auth.js";
import { supabase } from "./supabase.js";

const app = express();
const port = process.env.PORT ?? 3001;

const cobbleStore = {
  usageStats: null as unknown,
  leaderboard: null as unknown,
};
const COBBLE_API_KEY = process.env.COBBLE_API_KEY;
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "*";

// CORS: required when frontend is on a different origin (e.g. deploy frontend + backend separately)
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (process.env.NODE_ENV === "production" && CORS_ORIGIN === "*") {
    // In production, prefer setting CORS_ORIGIN to your frontend URL for security
  }
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

declare global {
  namespace Express {
    interface Locals {
      user?: JwtPayload;
    }
  }
}

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

// Normalize double slashes (plugin may send baseUrl/ + /path => //path)
// app.use((req, _res, next) => {
//   if (req.url?.includes("//")) {
//     const [path, qs] = req.url.split("?");
//     req.url = (path?.replace(/\/+/g, "/") || "/") + (qs ? `?${qs}` : "");
//   }
//   next();
// });
app.use(express.json());
app.use((req, _res, next) => {
  console.log(req.method, req.path);
  next();
});

app.get("/", (_req, res) => {
  res.json({ message: "Backend running" });
});
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/usage-stats", (_req, res) => res.json(cobbleStore.usageStats ?? {}));
app.post("/usage-stats", requireCobbleAuth, (req, res) => {
  cobbleStore.usageStats = req.body;
  console.log("[CobbleRanked] usage-stats pushed");
  res.json({ ok: true });
});
app.get("/leaderboard", (_req, res) => res.json(cobbleStore.leaderboard ?? {}));
app.post("/leaderboard", requireCobbleAuth, (req, res) => {
  cobbleStore.leaderboard = req.body;
  console.log("[CobbleRanked] leaderboard pushed");
  res.json({ ok: true });
});

app.get("/v4/usage-stats", (_req, res) => res.json(cobbleStore.usageStats ?? {}));
app.post("/v4/usage-stats", requireCobbleAuth, (req, res) => {
  cobbleStore.usageStats = req.body;
  console.log("[CobbleRanked] usage-stats pushed");
  res.json({ ok: true });
});
app.get("/v4/leaderboard", (_req, res) => res.json(cobbleStore.leaderboard ?? {}));
app.post("/v4/leaderboard", requireCobbleAuth, (req, res) => {
  cobbleStore.leaderboard = req.body;
  console.log("[CobbleRanked] leaderboard pushed");
  res.json({ ok: true });
});

// --- Auth (users table, no Supabase built-in auth) ---
app.post("/auth/signup", async (req, res) => {
  const { email, password, username } = req.body ?? {};
  const result = await createUser({ email, password, username });
  if ("error" in result) {
    res.status(400).json({ error: result.error });
    return;
  }
  // Grant starter currency for gacha (ignore errors so signup still succeeds)
  if (supabase) {
    const { error: _ } = await supabase.from("user_currency").insert({
      user_id: result.id,
      currency_type: "tickets",
      balance: 0,
    });
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
    .select("id, config")
    .eq("id", id)
    .single();
  if (poolErr || !pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }
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

  res.json({
    reward: {
      id: chosen.id,
      reward_type: chosen.reward_type,
    },
    newBalance,
  });
});

app.get("/gacha/history", requireAuth, async (req, res) => {
  const user = res.locals.user!;
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const { data, error } = await supabase
    .from("user_gacha_pulls")
    .select("id, pool_id, reward_type, pull_at")
    .eq("user_id", user.userId)
    .order("pull_at", { ascending: false })
    .limit(limit);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  const poolIds = [...new Set((data ?? []).map((r: { pool_id: number }) => r.pool_id))];
  const { data: pools } =
    poolIds.length > 0
      ? await supabase.from("gacha_pools").select("id, name").in("id", poolIds)
      : { data: [] };
  const poolNames = new Map((pools ?? []).map((p: { id: number; name: string }) => [p.id, p.name]));
  const history = (data ?? []).map((r: { id: number; pool_id: number; reward_type: string; pull_at: string }) => ({
    id: r.id,
    poolId: r.pool_id,
    poolName: poolNames.get(r.pool_id) ?? "Unknown",
    rewardType: r.reward_type,
    pulledAt: r.pull_at,
  }));
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

app.listen(port, () => {
  console.log(`Backend http://localhost:${port}`);
});
