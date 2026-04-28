import "dotenv/config";
import express from "express";
import {
  adminResetPassword,
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
import { fetchPcoTopViaRcon } from "./minecraftRconPcoTop.js";
import {
  fetchBattleTowerLeaderboardViaRcon,
  normalizeBattleTowerMode,
  normalizeBattleTowerTop,
  type BattleTowerLeaderboardRow,
} from "./minecraftRconBattleTower.js";
import { executeMinecraftRconCommand } from "./minecraftRconExecute.js";
import {
  DEFAULT_MINECRAFT_ROLE,
  GRANT_ONLY_ROLE_KEYS,
  getDailyLoginFlatCobbleBonusPerClaim,
  getDailyLoginTicketBonusPerClaim,
  getPurchasableCost,
  getRoleCatalog,
  getWebsiteShopDiscountPercent,
  isKnownRoleKey,
  listAllKnownRoleKeys,
  normalizeRoleKey,
  runLuckpermsParentSet,
} from "./minecraftRoles.js";
import {
  buildGivePokemonOtherCommand,
  isGachaClaimEnabled,
  isLikelyMinecraftUsername,
  parseCobbledollarsReward,
  parseRewardForGivePokemon,
} from "./gachaRewardClaim.js";
import { registerTournamentRoutes } from "./tournamentRoutes.js";
import { analyzeTeamPokepaste } from "./teamAnalyzeAi.js";
import {
  buildCobbledollarsDepositCommand,
  isCobbledollarsDepositEnabled,
} from "./minecraftCobbledollarsDeposit.js";

function readMinecraftRoleField(row: { minecraft_role?: string | null } | null | undefined): string {
  const r = row?.minecraft_role?.trim();
  if (!r) return DEFAULT_MINECRAFT_ROLE;
  return normalizeRoleKey(r);
}

const app = express();
const port = process.env.PORT ?? 3001;

const cobbleStore = {
  usageStats: null as unknown,
  leaderboard: null as unknown,
  /** Newest first; bounded by COBBLE_RANKED_FEED_MAX */
  battleReplays: [] as unknown[],
  matchResults: [] as unknown[],
};

function pushCobbleRankedFeed(kind: "battleReplays" | "matchResults", body: unknown) {
  const arr = cobbleStore[kind] as unknown[];
  arr.unshift(body);
  if (arr.length > COBBLE_RANKED_FEED_MAX) arr.length = COBBLE_RANKED_FEED_MAX;
}

function cobbleRankedPostOk(res: express.Response) {
  /** Gashi docs use `{ success: true }`; keep `ok` for anything already relying on it. */
  res.json({ ok: true, success: true });
}

function logCobbleRankedFeedReceipt(
  kind: "battle-replay" | "match-result",
  body: unknown
): void {
  if (process.env.COBBLE_LOG_SYNC !== "true") return;
  const mid =
    body && typeof body === "object" && body !== null && "matchId" in body
      ? String((body as { matchId?: unknown }).matchId ?? "")
      : "";
  console.info(`[CobbleRanked] POST /${kind}${mid ? ` matchId=${mid}` : ""} stored`);
}

function parseRankedFeedLimit(raw: unknown): number {
  const n = parseInt(String(raw ?? "50"), 10);
  if (!Number.isFinite(n) || n < 1) return 50;
  return Math.min(n, 200);
}

const COBBLEDOLLARS_PUBLIC_CACHE_TTL_MS = 90_000;
/** PVP daily payout: only top 3 on the synced leaderboard (website usernames matched). */
const PVP_DAILY_REWARDS: Record<number, number> = {
  1: 100_000,
  2: 75_000,
  3: 50_000,
};
/** Bonus website normal tickets (`user_currency` `tickets`) per rank each daily payout. */
const PVP_DAILY_TICKETS_BY_RANK: Record<number, number> = {
  1: 2,
  2: 1,
  3: 1,
};
const PVP_TICKETS_CURRENCY = "tickets";

/** PVP predictions: exact top-3 order pays `stake ×` this; each single-rank bet pays `stake ×` PVP_PREDICTION_SLOT_WIN_MULT. */
const PVP_PREDICTION_MAX_STAKE = 20_000;
const PVP_PREDICTION_MIN_STAKE = 100;
const PVP_PREDICTION_FULL_WIN_MULT = 4;
const PVP_PREDICTION_SLOT_WIN_MULT = 2;
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

let pcoPublicCache: {
  at: number;
  body: {
    ok: boolean;
    disabled: boolean;
    top10: { name: string; balance: number }[];
    error: string | null;
    updatedAt: string | null;
  };
} | null = null;

type BattleTowerPublicBody = {
  ok: boolean;
  disabled: boolean;
  mode: string;
  top: number;
  floorRows: BattleTowerLeaderboardRow[];
  streakRows: BattleTowerLeaderboardRow[];
  fallbackFloorLines: string[];
  fallbackStreakLines: string[];
  error: string | null;
  updatedAt: string | null;
};
const battleTowerPublicCache = new Map<string, { at: number; body: BattleTowerPublicBody }>();

const COBBLE_API_KEY = process.env.COBBLE_API_KEY;
const COBBLE_RANKED_FEED_MAX = (() => {
  const n = parseInt(process.env.COBBLE_RANKED_FEED_MAX ?? "200", 10);
  if (!Number.isFinite(n) || n < 1) return 200;
  return Math.min(n, 2000);
})();
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "*";
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL?.trim() || null;
console.log("[Discord] webhook configured:", DISCORD_WEBHOOK_URL ? "yes" : "no");

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
  await notifyDiscordEmbed({
    title: "New Listing",
    color: 0x8b5cf6,
    fields: [
      { name: "Player", value: username, inline: true },
      { name: "Pool", value: poolName, inline: true },
      { name: "Reward", value: rewardType, inline: false },
    ],
  });
}

type DiscordEmbedField = {
  name: string;
  value: string;
  inline?: boolean;
};

type DiscordEmbed = {
  title?: string;
  description?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  timestamp?: string;
};

type DiscordWebhookPayload = {
  content?: string;
  embeds?: DiscordEmbed[];
};

async function notifyDiscordEmbed(embed: DiscordEmbed): Promise<void> {
  return notifyDiscordPayload({ embeds: [embed] });
}

async function notifyDiscordPayload(payload: DiscordWebhookPayload): Promise<void> {
  if (!DISCORD_WEBHOOK_URL) {
    console.warn("[Discord] DISCORD_WEBHOOK_URL is missing; not sending");
    return;
  }
  const webhookUrl = DISCORD_WEBHOOK_URL;

  // Serialize webhook sends + throttle slightly to avoid Discord 429.
  discordSendChain = discordSendChain
    .then(() => sendDiscordPayloadNow(webhookUrl, payload))
    .catch((err) => console.warn("[Discord] previous send error:", err));

  return discordSendChain;
}

const DISCORD_MIN_INTERVAL_MS = 2500;
let discordLastSentAt = 0;
/** When set, Discord asked us to back off — do not block the queue with long sleeps. */
let discordRateLimitUntilMs = 0;
let discordSendChain: Promise<void> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampDiscordText(value: string, maxLen: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLen) return trimmed || "—";
  return `${trimmed.slice(0, maxLen - 1)}…`;
}

async function sendDiscordPayloadNow(
  webhookUrl: string,
  payload: DiscordWebhookPayload,
  attempt = 0
): Promise<void> {
  const hasEmbeds = Array.isArray(payload.embeds) && payload.embeds.length > 0;
  const contentPreview = payload.content
    ? payload.content.length > 120
      ? `${payload.content.slice(0, 120)}…`
      : payload.content
    : "";
  console.log("[Discord] sending", hasEmbeds ? "embed" : "text", contentPreview);

  const now = Date.now();
  const cooldownWait = Math.max(0, discordRateLimitUntilMs - now);
  const throttleWait = Math.max(0, DISCORD_MIN_INTERVAL_MS - (now - discordLastSentAt));
  const waitBefore = Math.max(cooldownWait, throttleWait);
  if (waitBefore > 0) await sleep(waitBefore);

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        allowed_mentions: { parse: [] },
      }),
    });

    if (res.status === 429) {
      let waitMs = 60_000;
      const retryAfterRaw = res.headers.get("retry-after");
      const retryAfterSec = retryAfterRaw ? Number(retryAfterRaw) : NaN;
      if (Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
        waitMs = retryAfterSec * 1000;
      } else {
        const bodyText = await res.text();
        try {
          const parsed = JSON.parse(bodyText) as { retry_after?: number };
          if (Number.isFinite(Number(parsed.retry_after)) && Number(parsed.retry_after) > 0) {
            waitMs = Number(parsed.retry_after) * 1000;
          }
        } catch {
          // ignore invalid JSON body
        }
      }
      // Add small jitter so multiple app instances do not hammer at the same millisecond.
      waitMs += 300;
      discordRateLimitUntilMs = Date.now() + waitMs;
      if (attempt < 5) {
        console.warn(`[Discord] 429; retrying in ${Math.round(waitMs)}ms (attempt ${attempt + 1})`);
        await sleep(waitMs);
        return sendDiscordPayloadNow(webhookUrl, payload, attempt + 1);
      }
      console.warn("[Discord] 429 persisted; dropping message after retries");
      return;
    }

    if (!res.ok) {
      const text = await res.text();
      console.warn("[Discord] webhook failed:", res.status, text);
      return;
    }

    discordLastSentAt = Date.now();
    discordRateLimitUntilMs = 0;
  } catch (err) {
    console.warn("[Discord] webhook error:", err);
  }
}

const discordUsernameCache = new Map<number, string>();
async function resolveDiscordUsername(userId: number): Promise<string> {
  const cached = discordUsernameCache.get(userId);
  if (cached) return cached;
  if (!supabase) return `user#${userId}`;
  const { data, error } = await supabase.from("users").select("username").eq("id", userId).maybeSingle();
  if (error) return `user#${userId}`;
  const username = (data as { username?: string } | null)?.username?.trim();
  if (username) {
    discordUsernameCache.set(userId, username);
    return username;
  }
  return `user#${userId}`;
}

const DISCORD_COBBLEDOLLAR_LEDGER_KINDS = new Set([
  "deposit_to_server",
  "shop",
  "pokemon_shop",
  "role_shop",
]);

async function notifyDiscordCobbleLedger(
  userId: number,
  delta: number,
  balanceAfter: number,
  kind: string,
  detail: string | null
): Promise<void> {
  if (!DISCORD_COBBLEDOLLAR_LEDGER_KINDS.has(kind)) return;
  const username = await resolveDiscordUsername(userId);
  const absDelta = Math.abs(delta);
  const amountStr = absDelta.toLocaleString();
  const balanceAfterStr = balanceAfter.toLocaleString();

  let content: string | null = null;
  switch (kind) {
    case "deposit_to_server": {
      content = `${username} deposited ${amountStr} Cobble$ to the server (new balance ${balanceAfterStr})`;
      break;
    }
    case "shop": {
      // detail like: `${item.label} ×${quantity}`
      content = `${username} bought ${detail ?? "item"} for ${amountStr} Cobble$ (new balance ${balanceAfterStr})`;
      break;
    }
    case "pokemon_shop": {
      content = `${username} bought ${detail ?? "shiny"} for ${amountStr} Cobble$ (new balance ${balanceAfterStr})`;
      break;
    }
    case "role_shop": {
      content = `${username} bought rank ${detail ?? "role"} for ${amountStr} Cobble$ (new balance ${balanceAfterStr})`;
      break;
    }
  }

  if (!content) return;
  void notifyDiscordEmbed({
    title: "Transaction",
    color: 0x22c55e,
    fields: [
      { name: "Player", value: clampDiscordText(username, 128), inline: true },
      { name: "Type", value: clampDiscordText(kind.replace(/_/g, " "), 128), inline: true },
      { name: "Amount", value: `${amountStr} Cobble$`, inline: true },
      { name: "Balance", value: `${balanceAfterStr} Cobble$`, inline: true },
      {
        name: "Detail",
        value: clampDiscordText(detail ?? content, 1024),
        inline: false,
      },
    ],
    timestamp: new Date().toISOString(),
  }).catch(() => {});
}

// CORS: required when frontend is on a different origin (e.g. deploy frontend + backend separately)
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Client-Locale, X-API-Key",
  );
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
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const xApiKeyRaw = req.headers["x-api-key"];
  const xApiKey = typeof xApiKeyRaw === "string" ? xApiKeyRaw : Array.isArray(xApiKeyRaw) ? xApiKeyRaw[0] : null;
  const token = bearer ?? xApiKey;
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

/** Large battle-replay payloads (Showdown log lines) can exceed a few MB; override with JSON_BODY_LIMIT if needed. */
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT?.trim() || "32mb";
app.use(express.json({ limit: JSON_BODY_LIMIT }));

registerTournamentRoutes(app, { requireAuth, requireAdmin });

const TEAM_AI_COOLDOWN_MS = 12 * 60 * 60 * 1000;

app.post("/team/analyze-ai", requireAuth, async (req, res) => {
  const paste = typeof (req.body as { pokepaste?: unknown } | undefined)?.pokepaste === "string"
    ? (req.body as { pokepaste: string }).pokepaste
    : "";
  if (!paste.trim()) {
    res.status(400).json({ error: "pokepaste required" });
    return;
  }
  if (paste.length > 12_000) {
    res.status(400).json({ error: "pokepaste too long" });
    return;
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    res.status(503).json({ error: "AI analysis is not configured on this server." });
    return;
  }
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }

  const userId = res.locals.user!.userId;
  const { data: urow, error: userErr } = await supabase
    .from("users")
    .select("is_admin, last_team_ai_at, minecraft_verified_at")
    .eq("id", userId)
    .maybeSingle();

  if (userErr) {
    res.status(500).json({ error: userErr.message });
    return;
  }
  if (!urow) {
    res.status(403).json({ error: "User not found" });
    return;
  }

  const isAdminUser = !!(urow as { is_admin?: boolean }).is_admin;
  const minecraftVerifiedAt = (urow as { minecraft_verified_at?: string | null }).minecraft_verified_at;
  if (!isAdminUser && !minecraftVerifiedAt) {
    res.status(403).json({
      code: "team_ai_verification_required",
      error: "Team AI analysis is only available after staff mark your account as verified in the admin panel.",
    });
    return;
  }

  const lastAtRaw = (urow as { last_team_ai_at?: string | null }).last_team_ai_at;
  if (!isAdminUser && lastAtRaw) {
    const lastMs = new Date(lastAtRaw).getTime();
    if (Number.isFinite(lastMs)) {
      const elapsed = Date.now() - lastMs;
      if (elapsed >= 0 && elapsed < TEAM_AI_COOLDOWN_MS) {
        const nextAllowed = new Date(lastMs + TEAM_AI_COOLDOWN_MS).toISOString();
        res.status(429).json({
          code: "team_ai_cooldown",
          next_allowed_at: nextAllowed,
          error: "You can only use Team AI analysis once every 12 hours. Administrators are not limited.",
        });
        return;
      }
    }
  }

  const body = (req.body ?? {}) as { language?: unknown };
  const language = body.language === "vi" ? "vi" : "en";
  try {
    const { text } = await analyzeTeamPokepaste(paste, { language });
    if (!isAdminUser) {
      const { error: upErr } = await supabase
        .from("users")
        .update({ last_team_ai_at: new Date().toISOString() })
        .eq("id", userId);
      if (upErr) {
        console.error("[team/analyze-ai] last_team_ai_at update failed", upErr);
      }
    }
    res.json({ analysis: text });
  } catch (e) {
    console.error("[team/analyze-ai]", e);
    res.status(502).json({ error: "AI request failed. Try again later." });
  }
});

app.get("/", (_req, res) => {
  res.json({ message: "Backend running" });
});
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

/** CobbleRanked Web API — mounted at `/` and `/api` so `baseUrl` can be `https://host` or `https://host/api`. */
const cobbleRankedSyncRouter = express.Router();
cobbleRankedSyncRouter.get("/usage-stats", (_req, res) => res.json(cobbleStore.usageStats ?? {}));
cobbleRankedSyncRouter.post("/usage-stats", requireCobbleAuth, (req, res) => {
  cobbleStore.usageStats = req.body;
  cobbleRankedPostOk(res);
});
cobbleRankedSyncRouter.get("/leaderboard", (_req, res) => res.json(cobbleStore.leaderboard ?? {}));
cobbleRankedSyncRouter.post("/leaderboard", requireCobbleAuth, (req, res) => {
  cobbleStore.leaderboard = req.body;
  void syncWebsitePvpRanksFromLeaderboard(req.body);
  cobbleRankedPostOk(res);
});
cobbleRankedSyncRouter.get("/v4/usage-stats", (_req, res) => res.json(cobbleStore.usageStats ?? {}));
cobbleRankedSyncRouter.post("/v4/usage-stats", requireCobbleAuth, (req, res) => {
  cobbleStore.usageStats = req.body;
  cobbleRankedPostOk(res);
});
cobbleRankedSyncRouter.get("/v4/leaderboard", (_req, res) => res.json(cobbleStore.leaderboard ?? {}));
cobbleRankedSyncRouter.post("/v4/leaderboard", requireCobbleAuth, (req, res) => {
  cobbleStore.leaderboard = req.body;
  void syncWebsitePvpRanksFromLeaderboard(req.body);
  cobbleRankedPostOk(res);
});
cobbleRankedSyncRouter.get("/battle-replays", (req, res) => {
  const limit = parseRankedFeedLimit(req.query.limit);
  res.json({ items: cobbleStore.battleReplays.slice(0, limit) });
});
cobbleRankedSyncRouter.post("/battle-replay", requireCobbleAuth, (req, res) => {
  pushCobbleRankedFeed("battleReplays", req.body);
  logCobbleRankedFeedReceipt("battle-replay", req.body);
  cobbleRankedPostOk(res);
});
cobbleRankedSyncRouter.get("/match-results", (req, res) => {
  const limit = parseRankedFeedLimit(req.query.limit);
  res.json({ items: cobbleStore.matchResults.slice(0, limit) });
});
cobbleRankedSyncRouter.post("/match-result", requireCobbleAuth, (req, res) => {
  pushCobbleRankedFeed("matchResults", req.body);
  logCobbleRankedFeedReceipt("match-result", req.body);
  cobbleRankedPostOk(res);
});
cobbleRankedSyncRouter.get("/v4/battle-replays", (req, res) => {
  const limit = parseRankedFeedLimit(req.query.limit);
  res.json({ items: cobbleStore.battleReplays.slice(0, limit) });
});
cobbleRankedSyncRouter.post("/v4/battle-replay", requireCobbleAuth, (req, res) => {
  pushCobbleRankedFeed("battleReplays", req.body);
  logCobbleRankedFeedReceipt("battle-replay", req.body);
  cobbleRankedPostOk(res);
});
cobbleRankedSyncRouter.get("/v4/match-results", (req, res) => {
  const limit = parseRankedFeedLimit(req.query.limit);
  res.json({ items: cobbleStore.matchResults.slice(0, limit) });
});
cobbleRankedSyncRouter.post("/v4/match-result", requireCobbleAuth, (req, res) => {
  pushCobbleRankedFeed("matchResults", req.body);
  logCobbleRankedFeedReceipt("match-result", req.body);
  cobbleRankedPostOk(res);
});
app.use(cobbleRankedSyncRouter);
app.use("/api", cobbleRankedSyncRouter);

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

/** Public PCO top 10 from Minecraft RCON (`pco top` by default). Cached ~90s. No auth. */
app.get("/minecraft/pco-leaderboard", async (_req, res) => {
  if (process.env.MC_PCO_DISABLE === "true") {
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
    pcoPublicCache &&
    now - pcoPublicCache.at < COBBLEDOLLARS_PUBLIC_CACHE_TTL_MS
  ) {
    res.json(pcoPublicCache.body);
    return;
  }
  try {
    const r = await fetchPcoTopViaRcon();
    const top10 = topBalancesFromMap(r.balances, 10);
    const body = {
      ok: !r.error,
      disabled: false,
      top10,
      error: r.error ?? null,
      updatedAt: new Date().toISOString(),
    };
    pcoPublicCache = { at: now, body };
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

/** Public Battle Tower leaderboard via RCON: `bt leaderboard <mode> top<N>` (Cobblemon Battle Tower). Cached ~90s per mode+top. */
app.get("/minecraft/battle-tower-leaderboard", async (req, res) => {
  if (process.env.MC_BT_DISABLE === "true") {
    res.json({
      ok: false,
      disabled: true,
      mode: "singles",
      top: 10,
      floorRows: [],
      streakRows: [],
      fallbackFloorLines: [],
      fallbackStreakLines: [],
      error: null,
      updatedAt: null,
    });
    return;
  }
  const mode = normalizeBattleTowerMode(String(req.query.mode ?? "singles"));
  const top = normalizeBattleTowerTop(String(req.query.top ?? "10"));
  const cacheKey = `${mode}:${top}`;
  const now = Date.now();
  const cached = battleTowerPublicCache.get(cacheKey);
  if (cached && now - cached.at < COBBLEDOLLARS_PUBLIC_CACHE_TTL_MS) {
    res.json(cached.body);
    return;
  }
  try {
    const r = await fetchBattleTowerLeaderboardViaRcon(mode, top);
    const body: BattleTowerPublicBody = {
      ok: !r.error,
      disabled: false,
      mode,
      top: parseInt(top, 10),
      floorRows: r.floorRows,
      streakRows: r.streakRows,
      fallbackFloorLines: r.fallbackFloorLines,
      fallbackStreakLines: r.fallbackStreakLines,
      error: r.error ?? null,
      updatedAt: new Date().toISOString(),
    };
    battleTowerPublicCache.set(cacheKey, { at: now, body });
    res.json(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.json({
      ok: false,
      disabled: false,
      mode,
      top: parseInt(top, 10),
      floorRows: [],
      streakRows: [],
      fallbackFloorLines: [],
      fallbackStreakLines: [],
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

app.get("/spawn/boss", async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const q = String(req.query.q ?? "").trim();
  const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), 2000);

  const query = supabase
    .from("boss_spawn")
    // Supabase column names in your table appear as: "boss name", "spawn biomes", "normal rate", "shiny rate".
    .select('id, created_at, boss_name:"boss name", spawn_biomes:"spawn biomes", normal_rate:"normal rate", shiny_rate:"shiny rate", reward')
    .order("created_at", { ascending: false })
    .limit(limit);

  const { data, error } = await query;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const rows = (data ?? []) as unknown as Array<{
    id: number;
    boss_name?: string | null;
    spawn_biomes?: string | null;
    normal_rate?: number | null;
    shiny_rate?: number | null;
    reward?: string | null;
  }>;

  const qLower = q.toLowerCase();
  const filtered =
    qLower.length > 0
      ? rows.filter((r) => String(r.boss_name ?? "").toLowerCase().includes(qLower))
      : rows;

  res.json({
    rows: filtered,
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
  const mcVerified =
    (result as { minecraft_verified_at?: string | null }).minecraft_verified_at ?? null;
  res.json({
    token,
    user: {
      id: result.id,
      email: result.email,
      username: result.username,
      is_admin: isAdmin,
      minecraft_verified_at: mcVerified,
      minecraft_role: readMinecraftRoleField(result as { minecraft_role?: string | null }),
    },
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
  const mcVerified = (user as { minecraft_verified_at?: string | null }).minecraft_verified_at ?? null;
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      is_admin: isAdmin,
      minecraft_verified_at: mcVerified,
      minecraft_role: readMinecraftRoleField(user as { minecraft_role?: string | null }),
    },
  });
});

app.get("/auth/me", requireAuth, async (_req, res) => {
  const tokenUser = res.locals.user!;
  if (supabase) {
    const { data: row, error } = await supabase
      .from("users")
      .select("id, email, username, is_admin, minecraft_verified_at, minecraft_role")
      .eq("id", tokenUser.userId)
      .maybeSingle();
    if (!error && row) {
      const r = row as {
        id: number;
        email: string;
        username: string;
        is_admin: boolean;
        minecraft_verified_at: string | null;
        minecraft_role?: string | null;
      };
      res.json({
        user: {
          id: r.id,
          email: r.email,
          username: r.username,
          is_admin: !!r.is_admin,
          minecraft_verified_at: r.minecraft_verified_at ?? null,
          minecraft_role: readMinecraftRoleField(r),
        },
      });
      return;
    }
  }
  res.json({
    user: {
      id: tokenUser.userId,
      email: tokenUser.email,
      username: tokenUser.username,
      is_admin: tokenUser.isAdmin ?? false,
      minecraft_verified_at: null as string | null,
      minecraft_role: DEFAULT_MINECRAFT_ROLE,
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

type SavedTeamSlotJson = {
  species: string;
  speciesSlug: string;
  item: string;
  ability: string | null;
  teraType: string | null;
  moves: string[];
};

function emptySavedTeamSlot(): SavedTeamSlotJson {
  return { species: "", speciesSlug: "", item: "", ability: null, teraType: null, moves: [] };
}

function normalizeSavedTeamSlots(raw: unknown): SavedTeamSlotJson[] | null {
  if (!Array.isArray(raw)) return null;
  const out: SavedTeamSlotJson[] = [];
  for (let i = 0; i < 6; i++) {
    const el = raw[i];
    if (!el || typeof el !== "object") {
      out.push(emptySavedTeamSlot());
      continue;
    }
    const o = el as Record<string, unknown>;
    const species = typeof o.species === "string" ? o.species.slice(0, 120) : "";
    const speciesSlug = typeof o.speciesSlug === "string" ? o.speciesSlug.slice(0, 120) : "";
    const item = typeof o.item === "string" ? o.item.slice(0, 120) : "";
    const ability =
      typeof o.ability === "string" && o.ability.trim() ? o.ability.trim().slice(0, 80) : null;
    const teraType =
      typeof o.teraType === "string" && o.teraType.trim()
        ? o.teraType.trim().slice(0, 40)
        : null;
    let moves: string[] = [];
    if (Array.isArray(o.moves)) {
      moves = o.moves
        .filter((m): m is string => typeof m === "string")
        .map((m) => m.trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, 24);
    }
    out.push({ species, speciesSlug, item, ability, teraType, moves });
  }
  return out;
}

const MAX_SAVED_AI_ANALYSIS_CHARS = 100_000;

function normalizeSavedAiAnalysis(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  return t.length > MAX_SAVED_AI_ANALYSIS_CHARS ? t.slice(0, MAX_SAVED_AI_ANALYSIS_CHARS) : t;
}

async function userMayUseTeamAiFeatures(userId: number): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase
    .from("users")
    .select("is_admin, minecraft_verified_at")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return false;
  const r = data as { is_admin?: boolean; minecraft_verified_at?: string | null };
  return !!r.is_admin || !!r.minecraft_verified_at;
}

// --- Saved teams (Team Builder, requires login) ---
app.get("/user/saved-teams", requireAuth, async (_req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const userId = res.locals.user!.userId;
  const { data, error } = await supabase
    .from("user_saved_teams")
    .select("id, name, team_json, ai_analysis, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  const allowAi = await userMayUseTeamAiFeatures(userId);
  const teams = (data ?? []).map((row) => ({
    ...row,
    ai_analysis: allowAi ? row.ai_analysis : null,
  }));
  res.json({ teams });
});

app.post("/user/saved-teams", requireAuth, async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const userId = res.locals.user!.userId;
  const name =
    typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 120) : "";
  if (!name) {
    res.status(400).json({ error: "Name is required" });
    return;
  }
  const normalized = normalizeSavedTeamSlots(req.body?.team);
  if (!normalized) {
    res.status(400).json({ error: "team must be an array" });
    return;
  }
  const body = (req.body ?? {}) as { ai_analysis?: unknown };
  const ai_analysis =
    "ai_analysis" in body ? normalizeSavedAiAnalysis(body.ai_analysis) : null;
  if (ai_analysis && !(await userMayUseTeamAiFeatures(userId))) {
    res.status(403).json({
      error:
        "Saving AI analysis requires an in-game verified account or admin. Remove ai_analysis or verify your account.",
    });
    return;
  }
  const { data, error } = await supabase
    .from("user_saved_teams")
    .insert({ user_id: userId, name, team_json: normalized, ai_analysis })
    .select("id, name, team_json, ai_analysis, updated_at")
    .single();
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.status(201).json({ team: data });
});

app.patch("/user/saved-teams/:id", requireAuth, async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const userId = res.locals.user!.userId;
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const { data: existing, error: findErr } = await supabase
    .from("user_saved_teams")
    .select("id")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (findErr) {
    res.status(500).json({ error: findErr.message });
    return;
  }
  if (!existing) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  const patchBody = (req.body ?? {}) as { name?: unknown; team?: unknown; ai_analysis?: unknown };
  const hasName = typeof patchBody.name === "string";
  const hasTeam = patchBody.team !== undefined;
  const hasAiAnalysis = patchBody !== null && typeof patchBody === "object" && "ai_analysis" in patchBody;
  if (!hasName && !hasTeam && !hasAiAnalysis) {
    res.status(400).json({ error: "Provide name, team, and/or ai_analysis" });
    return;
  }
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (hasName) {
    const n = (patchBody.name as string).trim().slice(0, 120);
    if (!n) {
      res.status(400).json({ error: "Name cannot be empty" });
      return;
    }
    updates.name = n;
  }
  if (hasTeam) {
    const normalized = normalizeSavedTeamSlots(patchBody.team);
    if (!normalized) {
      res.status(400).json({ error: "team must be an array" });
      return;
    }
    updates.team_json = normalized;
  }
  if (hasAiAnalysis) {
    const normalizedAi = normalizeSavedAiAnalysis(patchBody.ai_analysis);
    if (normalizedAi && !(await userMayUseTeamAiFeatures(userId))) {
      /**
       * Allow clearing analysis (null / empty) even when unverified; block setting new analysis text.
       */
      res.status(403).json({
        error:
          "Saving AI analysis requires an in-game verified account or admin. Send ai_analysis: null to clear, or verify your account.",
      });
      return;
    }
    updates.ai_analysis = normalizedAi;
  }
  const { data, error } = await supabase
    .from("user_saved_teams")
    .update(updates)
    .eq("id", id)
    .eq("user_id", userId)
    .select("id, name, team_json, ai_analysis, updated_at")
    .single();
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ team: data });
});

app.delete("/user/saved-teams/:id", requireAuth, async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const userId = res.locals.user!.userId;
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const { error } = await supabase
    .from("user_saved_teams")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ ok: true });
});

const MAX_VERIFICATION_REQUEST_MESSAGE = 2000;
const MAX_VERIFICATION_ADMIN_NOTE = 500;

function normalizeVerificationMessage(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  return t.slice(0, MAX_VERIFICATION_REQUEST_MESSAGE);
}

// --- User verification requests (queue for staff) ---
app.get("/user/verification-request", requireAuth, async (_req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const userId = res.locals.user!.userId;
  const { data: urow, error: uerr } = await supabase
    .from("users")
    .select("minecraft_verified_at")
    .eq("id", userId)
    .maybeSingle();
  if (uerr) {
    res.status(500).json({ error: uerr.message });
    return;
  }
  const verified = !!(urow as { minecraft_verified_at?: string | null } | null)?.minecraft_verified_at;

  const { data: pending, error: perr } = await supabase
    .from("user_verification_requests")
    .select("id, message, status, created_at, resolved_at, admin_note")
    .eq("user_id", userId)
    .eq("status", "pending")
    .maybeSingle();
  if (perr) {
    res.status(500).json({ error: perr.message });
    return;
  }

  const { data: lastRows, error: lerr } = await supabase
    .from("user_verification_requests")
    .select("id, message, status, created_at, resolved_at, admin_note")
    .eq("user_id", userId)
    .in("status", ["approved", "rejected"])
    .order("resolved_at", { ascending: false })
    .limit(1);
  if (lerr) {
    res.status(500).json({ error: lerr.message });
    return;
  }
  const lastResolved = (lastRows ?? [])[0] ?? null;

  res.json({
    verified,
    pending: pending ?? null,
    lastResolved,
  });
});

app.post("/user/verification-request", requireAuth, async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const userId = res.locals.user!.userId;
  const { data: urow, error: uerr } = await supabase
    .from("users")
    .select("minecraft_verified_at, is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (uerr || !urow) {
    res.status(uerr ? 500 : 404).json({ error: uerr?.message ?? "User not found" });
    return;
  }
  const u = urow as { minecraft_verified_at?: string | null; is_admin?: boolean };
  if (u.is_admin) {
    res.status(400).json({ error: "Admin accounts do not need verification requests." });
    return;
  }
  if (u.minecraft_verified_at) {
    res.status(400).json({ error: "Your account is already verified." });
    return;
  }
  const message = normalizeVerificationMessage((req.body as { message?: unknown })?.message);

  const { data: existingPending } = await supabase
    .from("user_verification_requests")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "pending")
    .maybeSingle();
  if (existingPending) {
    res.status(409).json({ error: "You already have a pending verification request." });
    return;
  }

  const { data: inserted, error: insErr } = await supabase
    .from("user_verification_requests")
    .insert({ user_id: userId, message, status: "pending" })
    .select("id, message, status, created_at, resolved_at, admin_note")
    .single();

  if (insErr) {
    if (/duplicate|unique|one_pending/i.test(insErr.message)) {
      res.status(409).json({ error: "You already have a pending verification request." });
      return;
    }
    res.status(500).json({ error: insErr.message });
    return;
  }
  res.status(201).json({ request: inserted });
});

app.get("/admin/verification-requests", requireAuth, requireAdmin, async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const statusQ = String(req.query.status ?? "pending").toLowerCase();
  const status = statusQ === "all" ? null : statusQ === "rejected" || statusQ === "approved" ? statusQ : "pending";

  let q = supabase
    .from("user_verification_requests")
    .select("id, user_id, message, status, created_at, resolved_at, resolved_by_user_id, admin_note")
    .order("created_at", { ascending: true });

  if (status) q = q.eq("status", status);

  const { data: reqs, error } = await q;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  const list = reqs ?? [];
  const userIds = [...new Set(list.map((r) => (r as { user_id: number }).user_id))];
  const byUser = new Map<number, { email: string; username: string; minecraft_verified_at: string | null }>();
  if (userIds.length > 0) {
    const { data: users, error: uerr } = await supabase
      .from("users")
      .select("id, email, username, minecraft_verified_at")
      .in("id", userIds);
    if (uerr) {
      res.status(500).json({ error: uerr.message });
      return;
    }
    for (const u of users ?? []) {
      const row = u as {
        id: number;
        email: string;
        username: string;
        minecraft_verified_at: string | null;
      };
      byUser.set(row.id, {
        email: row.email,
        username: row.username,
        minecraft_verified_at: row.minecraft_verified_at ?? null,
      });
    }
  }

  const rows = list.map((row) => {
    const r = row as {
      id: number;
      user_id: number;
      message: string | null;
      status: string;
      created_at: string;
      resolved_at: string | null;
      resolved_by_user_id: number | null;
      admin_note: string | null;
    };
    const u = byUser.get(r.user_id);
    return {
      id: r.id,
      user_id: r.user_id,
      message: r.message,
      status: r.status,
      created_at: r.created_at,
      resolved_at: r.resolved_at,
      resolved_by_user_id: r.resolved_by_user_id,
      admin_note: r.admin_note,
      user_email: u?.email ?? null,
      user_username: u?.username ?? null,
      user_minecraft_verified_at: u?.minecraft_verified_at ?? null,
    };
  });

  res.json({ requests: rows });
});

app.post("/admin/verification-requests/:id/approve", requireAuth, requireAdmin, async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const staff = res.locals.user!;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid request id" });
    return;
  }
  const { data: reqRow, error: findErr } = await supabase
    .from("user_verification_requests")
    .select("id, user_id, status")
    .eq("id", id)
    .maybeSingle();
  if (findErr) {
    res.status(500).json({ error: findErr.message });
    return;
  }
  if (!reqRow) {
    res.status(404).json({ error: "Request not found" });
    return;
  }
  const r = reqRow as { user_id: number; status: string };
  if (r.status !== "pending") {
    res.status(400).json({ error: "This request is no longer pending." });
    return;
  }
  const now = new Date().toISOString();
  const { error: userErr } = await supabase
    .from("users")
    .update({ minecraft_verified_at: now, updated_at: now })
    .eq("id", r.user_id);
  if (userErr) {
    res.status(500).json({ error: userErr.message });
    return;
  }
  const { data: updatedReq, error: upReqErr } = await supabase
    .from("user_verification_requests")
    .update({
      status: "approved",
      resolved_at: now,
      resolved_by_user_id: staff.userId,
      admin_note: null,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select()
    .maybeSingle();
  if (upReqErr) {
    res.status(500).json({ error: upReqErr.message });
    return;
  }
  if (!updatedReq) {
    res.status(409).json({ error: "Request was updated by another action." });
    return;
  }
  res.json({ ok: true, request: updatedReq });
});

app.post("/admin/verification-requests/:id/reject", requireAuth, requireAdmin, async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const staff = res.locals.user!;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid request id" });
    return;
  }
  const noteRaw = (req.body as { admin_note?: unknown })?.admin_note;
  const admin_note =
    typeof noteRaw === "string" ? noteRaw.trim().slice(0, MAX_VERIFICATION_ADMIN_NOTE) || null : null;

  const { data: reqRow, error: findErr } = await supabase
    .from("user_verification_requests")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (findErr) {
    res.status(500).json({ error: findErr.message });
    return;
  }
  if (!reqRow) {
    res.status(404).json({ error: "Request not found" });
    return;
  }
  if ((reqRow as { status: string }).status !== "pending") {
    res.status(400).json({ error: "This request is no longer pending." });
    return;
  }
  const now = new Date().toISOString();
  const { data: updatedReq, error: upErr } = await supabase
    .from("user_verification_requests")
    .update({
      status: "rejected",
      resolved_at: now,
      resolved_by_user_id: staff.userId,
      admin_note,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select()
    .maybeSingle();
  if (upErr) {
    res.status(500).json({ error: upErr.message });
    return;
  }
  if (!updatedReq) {
    res.status(409).json({ error: "Request was updated by another action." });
    return;
  }
  res.json({ ok: true, request: updatedReq });
});

// --- Minecraft rank: catalog, Cobble$ purchase (RCON LuckPerms), grant-only requests ---
app.get("/roles/catalog", requireAuth, (_req, res) => {
  res.json({ currency: COBBLEDOLLARS_CURRENCY, ...getRoleCatalog() });
});

app.get("/user/role-request", requireAuth, async (_req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const userId = res.locals.user!.userId;
  const { data: urow, error: uerr } = await supabase
    .from("users")
    .select("minecraft_role")
    .eq("id", userId)
    .maybeSingle();
  if (uerr) {
    res.status(500).json({ error: uerr.message });
    return;
  }
  const currentRole = readMinecraftRoleField(urow as { minecraft_role?: string | null });

  const { data: pending } = await supabase
    .from("user_role_grant_requests")
    .select("id, requested_role, message, status, created_at, resolved_at, admin_note")
    .eq("user_id", userId)
    .eq("status", "pending")
    .maybeSingle();

  const { data: lastResolvedRows } = await supabase
    .from("user_role_grant_requests")
    .select("id, requested_role, message, status, created_at, resolved_at, admin_note")
    .eq("user_id", userId)
    .neq("status", "pending")
    .order("id", { ascending: false })
    .limit(1);
  const lastResolved = lastResolvedRows?.[0] ?? null;

  res.json({
    currentRole,
    pending: pending ?? null,
    lastResolved,
    grantOnlyRoleKeys: [...GRANT_ONLY_ROLE_KEYS],
  });
});

app.post("/user/role-request", requireAuth, async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const userId = res.locals.user!.userId;
  const requested_role = normalizeRoleKey(String((req.body as { requestedRole?: unknown })?.requestedRole ?? ""));
  if (!requested_role || !GRANT_ONLY_ROLE_KEYS.has(requested_role)) {
    res.status(400).json({
      error:
        "Choose a valid grant-only rank (Legend+ and staff/partner roles require approval — see catalog on Account).",
    });
    return;
  }
  const message = normalizeVerificationMessage((req.body as { message?: unknown })?.message);

  const { data: urow, error: uerr } = await supabase
    .from("users")
    .select("minecraft_role")
    .eq("id", userId)
    .maybeSingle();
  if (uerr || !urow) {
    res.status(uerr ? 500 : 404).json({ error: uerr?.message ?? "User not found" });
    return;
  }
  if (readMinecraftRoleField(urow as { minecraft_role?: string | null }) === requested_role) {
    res.status(400).json({ error: "You already have this rank." });
    return;
  }

  const { data: existingPending } = await supabase
    .from("user_role_grant_requests")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "pending")
    .maybeSingle();
  if (existingPending) {
    res.status(409).json({ error: "You already have a pending rank request." });
    return;
  }

  const { data: inserted, error: insErr } = await supabase
    .from("user_role_grant_requests")
    .insert({ user_id: userId, requested_role, message, status: "pending" })
    .select("id, requested_role, message, status, created_at, resolved_at, admin_note")
    .single();

  if (insErr) {
    if (/duplicate|unique|one_pending/i.test(insErr.message)) {
      res.status(409).json({ error: "You already have a pending rank request." });
      return;
    }
    res.status(500).json({ error: insErr.message });
    return;
  }
  res.status(201).json({ request: inserted });
});

app.get("/admin/role-requests", requireAuth, requireAdmin, async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const statusQ = String(req.query.status ?? "pending").toLowerCase();
  const status = statusQ === "all" ? null : statusQ === "rejected" || statusQ === "approved" ? statusQ : "pending";

  let q = supabase
    .from("user_role_grant_requests")
    .select(
      "id, user_id, requested_role, message, status, created_at, resolved_at, resolved_by_user_id, admin_note"
    )
    .order("created_at", { ascending: true });

  if (status) q = q.eq("status", status);

  const { data: reqs, error } = await q;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  const list = reqs ?? [];
  const userIds = [...new Set(list.map((r) => (r as { user_id: number }).user_id))];
  const byUser = new Map<number, { email: string; username: string; minecraft_role: string }>();
  if (userIds.length > 0) {
    const { data: users, error: uerr } = await supabase
      .from("users")
      .select("id, email, username, minecraft_role")
      .in("id", userIds);
    if (uerr) {
      res.status(500).json({ error: uerr.message });
      return;
    }
    for (const u of users ?? []) {
      const row = u as {
        id: number;
        email: string;
        username: string;
        minecraft_role?: string | null;
      };
      byUser.set(row.id, {
        email: row.email,
        username: row.username,
        minecraft_role: readMinecraftRoleField(row),
      });
    }
  }

  const rows = list.map((row) => {
    const r = row as {
      id: number;
      user_id: number;
      requested_role: string;
      message: string | null;
      status: string;
      created_at: string;
      resolved_at: string | null;
      resolved_by_user_id: number | null;
      admin_note: string | null;
    };
    const u = byUser.get(r.user_id);
    return {
      id: r.id,
      user_id: r.user_id,
      requested_role: r.requested_role,
      message: r.message,
      status: r.status,
      created_at: r.created_at,
      resolved_at: r.resolved_at,
      resolved_by_user_id: r.resolved_by_user_id,
      admin_note: r.admin_note,
      user_email: u?.email ?? null,
      user_username: u?.username ?? null,
      user_minecraft_role: u?.minecraft_role ?? null,
    };
  });

  res.json({ requests: rows });
});

app.post("/admin/role-requests/:id/approve", requireAuth, requireAdmin, async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const staff = res.locals.user!;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid request id" });
    return;
  }
  const { data: reqRow, error: findErr } = await supabase
    .from("user_role_grant_requests")
    .select("id, user_id, requested_role, status")
    .eq("id", id)
    .maybeSingle();
  if (findErr) {
    res.status(500).json({ error: findErr.message });
    return;
  }
  if (!reqRow) {
    res.status(404).json({ error: "Request not found" });
    return;
  }
  const r = reqRow as { user_id: number; status: string; requested_role: string };
  if (r.status !== "pending") {
    res.status(400).json({ error: "This request is no longer pending." });
    return;
  }
  const roleKey = normalizeRoleKey(r.requested_role);
  if (!GRANT_ONLY_ROLE_KEYS.has(roleKey)) {
    res.status(400).json({ error: "Invalid grant-only role on this request." });
    return;
  }
  const { data: urow, error: uerr } = await supabase
    .from("users")
    .select("username")
    .eq("id", r.user_id)
    .maybeSingle();
  if (uerr || !urow) {
    res.status(uerr ? 500 : 404).json({ error: uerr?.message ?? "User not found" });
    return;
  }
  const username = (urow as { username: string }).username.trim();
  const lp = await runLuckpermsParentSet(username, roleKey);
  if (!lp.ok) {
    res.status(502).json({ error: lp.error });
    return;
  }
  const now = new Date().toISOString();
  const { error: userUpErr } = await supabase
    .from("users")
    .update({ minecraft_role: roleKey, updated_at: now })
    .eq("id", r.user_id);
  if (userUpErr) {
    res.status(500).json({ error: userUpErr.message });
    return;
  }
  const { data: updatedReq, error: upReqErr } = await supabase
    .from("user_role_grant_requests")
    .update({
      status: "approved",
      resolved_at: now,
      resolved_by_user_id: staff.userId,
      admin_note: null,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select()
    .maybeSingle();
  if (upReqErr) {
    res.status(500).json({ error: upReqErr.message });
    return;
  }
  if (!updatedReq) {
    res.status(409).json({ error: "Request was updated by another action." });
    return;
  }
  res.json({ ok: true, request: updatedReq });
});

app.post("/admin/role-requests/:id/reject", requireAuth, requireAdmin, async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const staff = res.locals.user!;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid request id" });
    return;
  }
  const noteRaw = (req.body as { admin_note?: unknown })?.admin_note;
  const admin_note =
    typeof noteRaw === "string" ? noteRaw.trim().slice(0, MAX_VERIFICATION_ADMIN_NOTE) || null : null;

  const { data: reqRow, error: findErr } = await supabase
    .from("user_role_grant_requests")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (findErr) {
    res.status(500).json({ error: findErr.message });
    return;
  }
  if (!reqRow) {
    res.status(404).json({ error: "Request not found" });
    return;
  }
  if ((reqRow as { status: string }).status !== "pending") {
    res.status(400).json({ error: "This request is no longer pending." });
    return;
  }
  const now = new Date().toISOString();
  const { data: updatedReq, error: upErr } = await supabase
    .from("user_role_grant_requests")
    .update({
      status: "rejected",
      resolved_at: now,
      resolved_by_user_id: staff.userId,
      admin_note,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select()
    .maybeSingle();
  if (upErr) {
    res.status(500).json({ error: upErr.message });
    return;
  }
  if (!updatedReq) {
    res.status(409).json({ error: "Request was updated by another action." });
    return;
  }
  res.json({ ok: true, request: updatedReq });
});

app.post("/roles/buy", requireAuth, async (req, res) => {
  const user = res.locals.user!;
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  if (!(await userMayUseTeamAiFeatures(user.userId))) {
    res.status(403).json({
      code: "shop_verification_required",
      error: "A verified account is required to purchase ranks on the website shop.",
    });
    return;
  }
  const roleKey = normalizeRoleKey(String((req.body as { roleKey?: unknown })?.roleKey ?? ""));
  const cost = getPurchasableCost(roleKey);
  if (cost == null || roleKey === DEFAULT_MINECRAFT_ROLE || GRANT_ONLY_ROLE_KEYS.has(roleKey)) {
    res.status(400).json({ error: "This rank cannot be purchased on the web shop." });
    return;
  }

  const wallet = await ensureUserCobbledollarsRow(user.userId);
  if (!wallet) {
    res.status(500).json({ error: "Could not open Cobble$ wallet" });
    return;
  }
  if (wallet.balance < cost) {
    res.status(400).json({
      error: "Not enough Cobble$",
      balance: wallet.balance,
      required: cost,
    });
    return;
  }

  const newBalance = wallet.balance - cost;
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

  const lp = await runLuckpermsParentSet(user.username, roleKey);
  if (!lp.ok) {
    await supabase
      .from("user_currency")
      .update({ balance: wallet.balance, updated_at: new Date().toISOString() })
      .eq("id", wallet.id);
    res.status(502).json({ error: lp.error });
    return;
  }

  const { error: roleErr } = await supabase
    .from("users")
    .update({ minecraft_role: roleKey, updated_at: now })
    .eq("id", user.userId);
  if (roleErr) {
    console.error("[roles/buy] LuckPerms OK but users.minecraft_role update failed", roleErr);
    res.status(500).json({
      error:
        "Rank was applied on the Minecraft server but the website failed to save it. Staff can fix your account — your Cobble$ was still charged.",
    });
    return;
  }

  await recordCobbledollarLedger(user.userId, -cost, newBalance, "role_shop", roleKey);
  res.json({
    ok: true,
    roleKey,
    cost,
    newBalance,
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
  if (!(await userMayUseTeamAiFeatures(user.userId))) {
    res.status(403).json({
      code: "verification_required",
      error: "A verified account is required to pull gacha on the website.",
    });
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

  let cobbledollarsRewardAmount = 0;
  let cobbledollarsRewardNewBalance: number | null = null;
  const cobbleReward = parseCobbledollarsReward(chosen.reward_type);
  if (cobbleReward) {
    cobbledollarsRewardAmount = cobbleReward.amount;
    cobbledollarsRewardNewBalance = await incrementUserCurrency(
      user.userId,
      COBBLEDOLLARS_CURRENCY,
      cobbledollarsRewardAmount,
      {
        kind: "gacha_reward",
        detail: `${poolName} — ${chosen.reward_type}`,
      }
    );
  }

  const fulfilledAt = cobbleReward ? new Date().toISOString() : null;
  const historyBase = {
    user_id: user.userId,
    pool_id: id,
    reward_type: chosen.reward_type,
    pull_at: new Date().toISOString(),
  };
  const withFulfilled = await supabase.from("user_gacha_pulls").insert({
    ...historyBase,
    fulfilled_at: fulfilledAt,
  });
  if (withFulfilled.error && /fulfilled_at|column/i.test(withFulfilled.error.message)) {
    await supabase.from("user_gacha_pulls").insert(historyBase);
  }

  // Do not await: a slow/hanging Discord webhook fetch would block the response and leave the
  // client stuck on "Fetching your drop from the server…" forever.
  void notifyDiscordPull(user.username, poolName, chosen.reward_type).catch((err) =>
    console.warn("[gacha/pull] Discord notify failed:", err)
  );

  res.json({
    reward: {
      id: chosen.id,
      reward_type: chosen.reward_type,
    },
    newBalance,
    ...(cobbledollarsRewardAmount > 0
      ? {
          cobbledollarsReward: {
            amount: cobbledollarsRewardAmount,
            newBalance: cobbledollarsRewardNewBalance,
          },
        }
      : {}),
  });
});

/** Claim a gacha pull in-game via RCON (Cobblemon givepokemonother). User must be online. */
app.post("/gacha/pulls/:pullId/claim", requireAuth, async (req, res) => {
  const user = res.locals.user!;
  if (!(await userMayUseTeamAiFeatures(user.userId))) {
    res.status(403).json({
      code: "verification_required",
      error: "A verified account is required to claim gacha rewards in-game.",
    });
    return;
  }
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

/** Resolve pending top-3 predictions when daily payout runs. Idempotent per row (`result` must stay `pending`). */
async function resolvePvpTopPredictionsForPayout(
  payoutDate: string,
  formatKey: string,
  actualRows: PvpLeaderboardRow[]
): Promise<{ settled: number; wins: number }> {
  if (!supabase) return { settled: 0, wins: 0 };
  const a1 = actualRows.find((r) => r.rank === 1);
  const a2 = actualRows.find((r) => r.rank === 2);
  const a3 = actualRows.find((r) => r.rank === 3);
  if (!a1 || !a2 || !a3) return { settled: 0, wins: 0 };

  const { data: pending, error } = await supabase
    .from("pvp_top_predictions")
    .select(
      "id, user_id, stake, pick_rank1_name, pick_rank2_name, pick_rank3_name, stake_rank1_only, pick_rank1_only, stake_rank2_only, pick_rank2_only, stake_rank3_only, pick_rank3_only"
    )
    .eq("for_payout_date", payoutDate)
    .eq("format_key", formatKey)
    .eq("result", "pending");
  if (error || !pending?.length) return { settled: 0, wins: 0 };

  let settled = 0;
  let wins = 0;
  const nowIso = new Date().toISOString();
  for (const p of pending as Array<{
    id: number;
    user_id: number;
    stake: number;
    pick_rank1_name: string;
    pick_rank2_name: string;
    pick_rank3_name: string;
    stake_rank1_only: number;
    pick_rank1_only: string | null;
    stake_rank2_only: number;
    pick_rank2_only: string | null;
    stake_rank3_only: number;
    pick_rank3_only: string | null;
  }>) {
    let payoutAmt = 0;
    if (p.stake > 0) {
      const exact =
        normalizeName(p.pick_rank1_name) === normalizeName(a1.playerName) &&
        normalizeName(p.pick_rank2_name) === normalizeName(a2.playerName) &&
        normalizeName(p.pick_rank3_name) === normalizeName(a3.playerName);
      if (exact) payoutAmt += p.stake * PVP_PREDICTION_FULL_WIN_MULT;
    }
    if (
      p.stake_rank1_only > 0 &&
      p.pick_rank1_only &&
      normalizeName(p.pick_rank1_only) === normalizeName(a1.playerName)
    ) {
      payoutAmt += p.stake_rank1_only * PVP_PREDICTION_SLOT_WIN_MULT;
    }
    if (
      p.stake_rank2_only > 0 &&
      p.pick_rank2_only &&
      normalizeName(p.pick_rank2_only) === normalizeName(a2.playerName)
    ) {
      payoutAmt += p.stake_rank2_only * PVP_PREDICTION_SLOT_WIN_MULT;
    }
    if (
      p.stake_rank3_only > 0 &&
      p.pick_rank3_only &&
      normalizeName(p.pick_rank3_only) === normalizeName(a3.playerName)
    ) {
      payoutAmt += p.stake_rank3_only * PVP_PREDICTION_SLOT_WIN_MULT;
    }

    const wonAnything = payoutAmt > 0;
    const { data: locked } = await supabase
      .from("pvp_top_predictions")
      .update({
        result: wonAnything ? "won" : "lost",
        payout_amount: payoutAmt,
        resolved_at: nowIso,
      })
      .eq("id", p.id)
      .eq("result", "pending")
      .select("id");
    if (!locked?.length) continue;
    settled++;
    if (wonAnything) {
      wins++;
      await incrementUserCurrency(p.user_id, COBBLEDOLLARS_CURRENCY, payoutAmt, {
        kind: "pvp_prediction_win",
        detail: `PVP predict · ${payoutDate} · +${payoutAmt}`,
      });
    }
  }
  return { settled, wins };
}

app.get("/user/pvp-top-prediction", requireAuth, async (_req, res) => {
  const user = res.locals.user!;
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const rows = extractPvpRowsFromLeaderboardPayload(cobbleStore.leaderboard);
  const forPayoutDate = pvpPredictionTargetDate();
  const windowOpen = isPvpPredictionWindowOpenFor(forPayoutDate);
  const formatKey = rows[0]?.formatKey ?? "singles";
  const rankedPlayers = rows.map((r) => ({ rank: r.rank, playerName: r.playerName }));
  const { data: entryRow, error: entryErr } = await supabase
    .from("pvp_top_predictions")
    .select(
      "id, stake, pick_rank1_name, pick_rank2_name, pick_rank3_name, stake_rank1_only, pick_rank1_only, stake_rank2_only, pick_rank2_only, stake_rank3_only, pick_rank3_only, result, payout_amount, resolved_at"
    )
    .eq("user_id", user.userId)
    .eq("for_payout_date", forPayoutDate)
    .eq("format_key", formatKey)
    .maybeSingle();
  if (entryErr) {
    res.status(500).json({ error: entryErr.message });
    return;
  }
  res.json({
    label: "prediction",
    forPayoutDate,
    formatKey,
    windowOpen,
    resetTimeZone: DAILY_RESET_TIMEZONE,
    /** Same rule as daily login streak + PVP daily Cobble$: `forPayoutDate` settles at 00:00 this timezone. */
    settlesAtLocalMidnight: true,
    rankedPlayers,
    maxStake: PVP_PREDICTION_MAX_STAKE,
    minStake: PVP_PREDICTION_MIN_STAKE,
    winMultiplierFull: PVP_PREDICTION_FULL_WIN_MULT,
    winMultiplierSlot: PVP_PREDICTION_SLOT_WIN_MULT,
    entry: entryRow ?? null,
  });
});

app.post("/user/pvp-top-prediction", requireAuth, async (req, res) => {
  const user = res.locals.user!;
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const forPayoutDate = pvpPredictionTargetDate();
  if (!isPvpPredictionWindowOpenFor(forPayoutDate)) {
    res.status(400).json({ error: "Prediction window is closed for this reset." });
    return;
  }
  const rows = extractPvpRowsFromLeaderboardPayload(cobbleStore.leaderboard);
  if (rows.length < 3) {
    res.status(503).json({ error: "Ranked leaderboard needs at least 3 players to predict." });
    return;
  }
  const formatKey = rows[0]?.formatKey ?? "singles";
  const allowed = new Set(rows.map((r) => normalizeName(r.playerName)));
  const body = req.body ?? {};
  const parseStake = (v: unknown): number => {
    if (typeof v === "number" && Number.isInteger(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = parseInt(v.replace(/,/g, ""), 10);
      return Number.isInteger(n) ? n : NaN;
    }
    return 0;
  };
  const stakeFull = parseStake(body.stake);
  const stakeR1 = parseStake(body.stakeRank1Only);
  const stakeR2 = parseStake(body.stakeRank2Only);
  const stakeR3 = parseStake(body.stakeRank3Only);
  const pick1 = typeof body.pickRank1 === "string" ? body.pickRank1.trim() : "";
  const pick2 = typeof body.pickRank2 === "string" ? body.pickRank2.trim() : "";
  const pick3 = typeof body.pickRank3 === "string" ? body.pickRank3.trim() : "";
  const pickOnly1 = typeof body.pickRank1Only === "string" ? body.pickRank1Only.trim() : "";
  const pickOnly2 = typeof body.pickRank2Only === "string" ? body.pickRank2Only.trim() : "";
  const pickOnly3 = typeof body.pickRank3Only === "string" ? body.pickRank3Only.trim() : "";

  function validateStakeLabel(s: number, label: string): string | null {
    if (s === 0) return null;
    if (!Number.isInteger(s) || s < PVP_PREDICTION_MIN_STAKE || s > PVP_PREDICTION_MAX_STAKE) {
      return `${label} must be 0 or a whole number from ${PVP_PREDICTION_MIN_STAKE} to ${PVP_PREDICTION_MAX_STAKE}`;
    }
    return null;
  }
  const errStake =
    validateStakeLabel(stakeFull, "Full top-3 stake") ||
    validateStakeLabel(stakeR1, "Top #1-only stake") ||
    validateStakeLabel(stakeR2, "Top #2-only stake") ||
    validateStakeLabel(stakeR3, "Top #3-only stake");
  if (errStake) {
    res.status(400).json({ error: errStake });
    return;
  }
  const totalStake = stakeFull + stakeR1 + stakeR2 + stakeR3;
  if (totalStake <= 0) {
    res.status(400).json({ error: "Stake at least one line (full combo and/or single-rank bets)." });
    return;
  }

  if (stakeFull > 0) {
    if (!pick1 || !pick2 || !pick3) {
      res.status(400).json({ error: "Full combo: pick #1, #2, and #3 are required when stake > 0." });
      return;
    }
    const n1 = normalizeName(pick1);
    const n2 = normalizeName(pick2);
    const n3 = normalizeName(pick3);
    if (n1 === n2 || n2 === n3 || n1 === n3) {
      res.status(400).json({ error: "Full combo: choose three different players." });
      return;
    }
    if (!allowed.has(n1) || !allowed.has(n2) || !allowed.has(n3)) {
      res.status(400).json({ error: "Full combo: each pick must be on the ranked leaderboard." });
      return;
    }
  }
  if (stakeR1 > 0) {
    if (!pickOnly1 || !allowed.has(normalizeName(pickOnly1))) {
      res
        .status(400)
        .json({ error: "Top #1 only: pick a player on the ranked leaderboard when stake > 0." });
      return;
    }
  }
  if (stakeR2 > 0) {
    if (!pickOnly2 || !allowed.has(normalizeName(pickOnly2))) {
      res
        .status(400)
        .json({ error: "Top #2 only: pick a player on the ranked leaderboard when stake > 0." });
      return;
    }
  }
  if (stakeR3 > 0) {
    if (!pickOnly3 || !allowed.has(normalizeName(pickOnly3))) {
      res
        .status(400)
        .json({ error: "Top #3 only: pick a player on the ranked leaderboard when stake > 0." });
      return;
    }
  }

  const wallet = await ensureUserCobbledollarsRow(user.userId);
  if (!wallet || wallet.balance < totalStake) {
    res.status(400).json({
      error: "Not enough website Cobble$",
      balance: wallet?.balance ?? 0,
      required: totalStake,
    });
    return;
  }
  const { data: exists } = await supabase
    .from("pvp_top_predictions")
    .select("id")
    .eq("user_id", user.userId)
    .eq("for_payout_date", forPayoutDate)
    .eq("format_key", formatKey)
    .maybeSingle();
  if (exists) {
    res.status(409).json({ error: "You already submitted a prediction for this round" });
    return;
  }
  const newBalance = wallet.balance - totalStake;
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
  const canonical = (raw: string) => {
    const row = rows.find((r) => normalizeName(r.playerName) === normalizeName(raw));
    return row?.playerName ?? raw;
  };
  const { error: insErr } = await supabase.from("pvp_top_predictions").insert({
    user_id: user.userId,
    for_payout_date: forPayoutDate,
    format_key: formatKey,
    stake: stakeFull,
    pick_rank1_name: stakeFull > 0 ? canonical(pick1) : "",
    pick_rank2_name: stakeFull > 0 ? canonical(pick2) : "",
    pick_rank3_name: stakeFull > 0 ? canonical(pick3) : "",
    stake_rank1_only: stakeR1,
    pick_rank1_only: stakeR1 > 0 ? canonical(pickOnly1) : null,
    stake_rank2_only: stakeR2,
    pick_rank2_only: stakeR2 > 0 ? canonical(pickOnly2) : null,
    stake_rank3_only: stakeR3,
    pick_rank3_only: stakeR3 > 0 ? canonical(pickOnly3) : null,
    result: "pending",
  });
  if (insErr) {
    await supabase
      .from("user_currency")
      .update({ balance: wallet.balance, updated_at: new Date().toISOString() })
      .eq("id", wallet.id);
    if (/duplicate|uq_pvp_top_predictions/i.test(insErr.message)) {
      res.status(409).json({ error: "You already submitted a prediction for this round" });
      return;
    }
    res.status(500).json({ error: insErr.message });
    return;
  }
  await recordCobbledollarLedger(
    user.userId,
    -totalStake,
    newBalance,
    "pvp_prediction_stake",
    `PVP predict · ${forPayoutDate} · staked ${totalStake}`
  );
  res.json({ ok: true, newBalance, forPayoutDate });
});

const COBBLEDOLLARS_CURRENCY = "cobbledollars";
const DAILY_RESET_TIMEZONE = "Asia/Ho_Chi_Minh";
const DAILY_STREAK_REWARDS = [
  { day: 1, kind: "cobbledollars", amount: 50_000, label: "Cobble$ +50,000" },
  { day: 2, kind: "cobbledollars", amount: 60_000, label: "Cobble$ +60,000" },
  { day: 3, kind: "cobbledollars", amount: 70_000, label: "Cobble$ +70,000" },
  { day: 4, kind: "cobbledollars", amount: 80_000, label: "Cobble$ +80,000" },
  { day: 5, kind: "cobbledollars", amount: 90_000, label: "Cobble$ +90,000" },
  { day: 6, kind: "cobbledollars", amount: 100_000, label: "Cobble$ +100,000" },
  { day: 7, kind: "cobbledollars", amount: 150_000, label: "Cobble$ +150,000" },
] as const;
const SHOP_ITEMS = [
  { itemKey: "exp_candy_xl", label: "EXP Candy XL", cost: 70_000 },
  { itemKey: "ancient_origin_ball", label: "Ancient Origin Ball", cost: 1_000_000 },
  { itemKey: "master_ball", label: "Master Ball", cost: 500_000 },
  { itemKey: "gold_bottle_cap", label: "Gold Bottle Cap", cost: 8_000_000 },
] as const;

/** Cobble$ after integer percent-off (rank shop discount). */
function applyCobbleShopDiscount(baseCobble: number, discountPercent: number): number {
  const b = Math.floor(Number(baseCobble));
  const p = Math.min(100, Math.max(0, Math.floor(Number(discountPercent))));
  if (!Number.isFinite(b) || b <= 0 || p <= 0) return Math.max(0, b);
  const out = Math.floor((b * (100 - p)) / 100);
  return Math.max(1, out);
}

async function getUserMinecraftRoleForShop(userId: number): Promise<string> {
  if (!supabase) return DEFAULT_MINECRAFT_ROLE;
  const { data, error } = await supabase.from("users").select("minecraft_role").eq("id", userId).maybeSingle();
  if (error || !data) return DEFAULT_MINECRAFT_ROLE;
  return readMinecraftRoleField(data as { minecraft_role?: string | null });
}

const POKEMON_SHOP_REFRESH_HOURS = 12;
const POKEMON_SHOP_OFFER_COUNT = 4;
const POKEMON_SHOP_CATEGORIES = {
  mythic: {
    price: 7_500_000,
    species: [
      "mew", "celebi", "jirachi", "deoxys", "manaphy", "phione", "darkrai", "shaymin",
      "arceus", "victini", "keldeo", "meloetta", "genesect", "diancie", "hoopa", "volcanion",
      "magearna", "marshadow", "zeraora", "meltan", "melmetal", "zarude", "pecharunt"
    ],
  },
  pseudo_legend: {
    price: 3_000_000,
    species: [
      "dragonite", "tyranitar", "salamence", "metagross", "garchomp", "hydreigon",
      "goodra", "kommo-o", "dragapult", "baxcalibur"
    ],
  },
  paradox: {
    price: 4_000_000,
    species: [
      "greattusk", "screamtail", "brutebonnet", "fluttermane", "slitherwing", "sandyshocks",
      "irontreads", "ironbundle", "ironhands", "ironjugulis", "ironmoth", "ironthorns",
      "roaringmoon", "ironvaliant", "walkingwake", "ironleaves", "gougingfire", "ragingbolt",
      "ironboulder", "ironcrown"
    ],
  },
  ultra_beast: {
    price: 5_000_000,
    species: [
      "nihilego", "buzzwole", "pheromosa", "xurkitree", "celesteela", "kartana", "guzzlord",
      "poipole", "naganadel", "stakataka", "blacephalon"
    ],
  },
  legend: {
    price: 10_000_000,
    species: [
      "articuno", "zapdos", "moltres", "mewtwo", "raikou", "entei", "suicune", "lugia", "hooh",
      "regirock", "regice", "registeel", "latias", "latios", "kyogre", "groudon", "rayquaza",
      "uxie", "mesprit", "azelf", "dialga", "palkia", "heatran", "giratina", "cresselia",
      "cobalion", "terrakion", "virizion", "tornadus", "thundurus", "reshiram", "zekrom",
      "landorus", "kyurem", "xerneas", "yveltal", "zygarde", "tapukoko", "tapulele",
      "tapubulu", "tapufini", "cosmog", "cosmoem", "solgaleo", "lunala", "necrozma",
      "zacian", "zamazenta", "eternatus", "kubfu", "urshifu", "regieleki", "regidrago",
      "glastrier", "spectrier", "calyrex", "koraidon", "miraidon"
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
  // Fisher-Yates shuffle so category order is random but complete.
  for (let i = categoryPool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const a = categoryPool[i]!;
    const b = categoryPool[j]!;
    categoryPool[i] = b;
    categoryPool[j] = a;
  }
  const pickedCategories = categoryPool.slice(0, Math.min(POKEMON_SHOP_OFFER_COUNT, categoryPool.length));
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
  // Safety net: always return requested offer count (reuse random categories if needed).
  while (offers.length < POKEMON_SHOP_OFFER_COUNT && categories.length > 0) {
    const category = categories[Math.floor(rng() * categories.length)]!;
    const def = POKEMON_SHOP_CATEGORIES[category];
    const pickIdx = Math.floor(rng() * def.species.length);
    const species = def.species[pickIdx] ?? def.species[0]!;
    offers.push({
      slot: offers.length + 1,
      category,
      species,
      shiny: true,
      price: def.price,
      label: `Shiny ${species}`,
    });
  }
  return offers;
}

const INVENTORY_ITEM_DEFS = [
  { key: "exp_candy_xl", label: "EXP Candy XL", itemId: "cobblemon:exp_candy_xl" },
  { key: "ancient_origin_ball", label: "Ancient Origin Ball", itemId: "cobblemon:ancient_origin_ball" },
  { key: "master_ball", label: "Master Ball", itemId: "cobblemon:master_ball" },
  // Website key is gold_bottle_cap; mod registry id is bottle_cap_gold (not obc:gold_bottle_cap).
  { key: "gold_bottle_cap", label: "Gold Bottle Cap", itemId: "obc:bottle_cap_gold" },
] as const;
const INVENTORY_CLAIM_COMMAND_TEMPLATE =
  process.env.INVENTORY_CLAIM_COMMAND_TEMPLATE?.trim() ||
  "give {player} {item_id} {amount}";

function inventoryItemDef(itemKey: string) {
  return INVENTORY_ITEM_DEFS.find((it) => it.key === itemKey);
}

function normalizeInventoryKey(itemKey: string): string {
  return itemKey.trim().toLowerCase();
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

function addOneCalendarDayYyyyMmDd(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const t = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  return new Date(t + 86400000).toISOString().slice(0, 10);
}

/** Next calendar day in Asia/Ho_Chi_Minh (YYYY-MM-DD) — used as `for_payout_date` for open predictions. */
function pvpPredictionTargetDate(now: Date = new Date()): string {
  return addOneCalendarDayYyyyMmDd(localDateOnly(now, DAILY_RESET_TIMEZONE));
}

function isPvpPredictionWindowOpenFor(forPayoutDate: string, now: Date = new Date()): boolean {
  return localDateOnly(now, DAILY_RESET_TIMEZONE) < forPayoutDate;
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
  if (error) {
    console.warn("[cobbledollars ledger]", error.message);
    return;
  }
  // Best-effort Discord notification (do not block ledger write).
  void notifyDiscordCobbleLedger(userId, delta, balanceAfter, kind, detail).catch(() => {});
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
  const key = normalizeInventoryKey(itemKey);
  const { data: row } = await supabase
    .from("user_inventory")
    .select("id, quantity")
    .eq("user_id", userId)
    .eq("item_key", key)
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
    item_key: key,
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

/** Transfer website Cobble$ to another website account by username. */
app.post("/user/cobbledollars/transfer", requireAuth, async (req, res) => {
  const user = res.locals.user!;
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const rawRecipient = typeof req.body?.toUsername === "string" ? req.body.toUsername.trim() : "";
  const rawAmount = req.body?.amount;
  const amount =
    typeof rawAmount === "number"
      ? rawAmount
      : typeof rawAmount === "string"
        ? parseInt(rawAmount, 10)
        : NaN;
  if (!rawRecipient) {
    res.status(400).json({ error: "toUsername is required" });
    return;
  }
  if (!Number.isInteger(amount) || amount < 1) {
    res.status(400).json({ error: "amount must be a positive whole number" });
    return;
  }
  if (amount > 1_000_000_000_000) {
    res.status(400).json({ error: "amount too large" });
    return;
  }
  if (rawRecipient.toLowerCase() === user.username.toLowerCase()) {
    res.status(400).json({ error: "You cannot transfer Cobble$ to yourself" });
    return;
  }

  const { data: recipientRaw, error: recipientErr } = await supabase
    .from("users")
    .select("id, username")
    .eq("username", rawRecipient)
    .maybeSingle();
  if (recipientErr) {
    res.status(500).json({ error: recipientErr.message });
    return;
  }
  const recipient = recipientRaw as { id: number; username: string } | null;
  if (!recipient) {
    res.status(404).json({ error: "Recipient account not found" });
    return;
  }
  if (recipient.id === user.userId) {
    res.status(400).json({ error: "You cannot transfer Cobble$ to yourself" });
    return;
  }

  const senderWallet = await ensureUserCobbledollarsRow(user.userId);
  if (!senderWallet) {
    res.status(500).json({ error: "Could not open Cobble$ wallet" });
    return;
  }
  if (senderWallet.balance < amount) {
    res.status(400).json({
      error: "Not enough website Cobble$",
      balance: senderWallet.balance,
      required: amount,
    });
    return;
  }
  const recipientWallet = await ensureUserCobbledollarsRow(recipient.id);
  if (!recipientWallet) {
    res.status(500).json({ error: "Could not open recipient Cobble$ wallet" });
    return;
  }

  const now = new Date().toISOString();
  const senderNewBalance = senderWallet.balance - amount;
  const recipientNewBalance = recipientWallet.balance + amount;
  const { data: senderUpdated, error: senderUpdErr } = await supabase
    .from("user_currency")
    .update({ balance: senderNewBalance, updated_at: now })
    .eq("id", senderWallet.id)
    .eq("balance", senderWallet.balance)
    .select("balance");
  if (senderUpdErr) {
    res.status(500).json({ error: senderUpdErr.message });
    return;
  }
  if (!senderUpdated?.length) {
    res.status(409).json({ error: "Balance changed — try again" });
    return;
  }

  const { data: recipientUpdated, error: recipientUpdErr } = await supabase
    .from("user_currency")
    .update({ balance: recipientNewBalance, updated_at: now })
    .eq("id", recipientWallet.id)
    .eq("balance", recipientWallet.balance)
    .select("balance");
  if (recipientUpdErr || !recipientUpdated?.length) {
    await supabase
      .from("user_currency")
      .update({ balance: senderWallet.balance, updated_at: new Date().toISOString() })
      .eq("id", senderWallet.id);
    if (recipientUpdErr) {
      res.status(500).json({ error: recipientUpdErr.message });
      return;
    }
    res.status(409).json({ error: "Recipient balance changed — try again" });
    return;
  }

  await recordCobbledollarLedger(
    user.userId,
    -amount,
    senderNewBalance,
    "transfer_to_user",
    `to ${recipient.username}`
  );
  await recordCobbledollarLedger(
    recipient.id,
    amount,
    recipientNewBalance,
    "transfer_from_user",
    `from ${user.username}`
  );

  res.json({
    ok: true,
    toUsername: recipient.username,
    amount,
    newBalance: senderNewBalance,
  });
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

app.get("/shop/items", requireAuth, async (_req, res) => {
  const user = res.locals.user!;
  const role = await getUserMinecraftRoleForShop(user.userId);
  const shopDiscountPercent = getWebsiteShopDiscountPercent(role);
  res.json({
    currency: COBBLEDOLLARS_CURRENCY,
    shopDiscountPercent,
    items: SHOP_ITEMS.map((item) => ({
      itemKey: item.itemKey,
      label: item.label,
      cost: item.cost,
      discountedCost: applyCobbleShopDiscount(item.cost, shopDiscountPercent),
    })),
  });
});

app.post("/shop/buy", requireAuth, async (req, res) => {
  const user = res.locals.user!;
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  if (!(await userMayUseTeamAiFeatures(user.userId))) {
    res.status(403).json({
      code: "shop_verification_required",
      error: "A verified account is required to purchase from the website shop.",
    });
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
  const role = await getUserMinecraftRoleForShop(user.userId);
  const shopDiscountPercent = getWebsiteShopDiscountPercent(role);
  const totalCost = applyCobbleShopDiscount(item.cost * quantity, shopDiscountPercent);

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
      shopDiscountPercent > 0
        ? `${item.label} ×${quantity} (−${shopDiscountPercent}% rank)`
        : `${item.label} ×${quantity}`
    );
    res.json({
      ok: true,
      itemKey: item.itemKey,
      quantityPurchased: quantity,
      totalCost,
      shopDiscountPercent,
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

let pokemonShopLastNotifiedWindowStartIso = "";
app.get("/pokemon-shop/offers", requireAuth, async (req, res) => {
  const user = res.locals.user!;
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const { start, end } = currentPokemonShopWindow();
  const windowStartIso = start.toISOString();
  const offers = buildPokemonShopOffers(windowStartIso);
  const role = await getUserMinecraftRoleForShop(user.userId);
  const shopDiscountPercent = getWebsiteShopDiscountPercent(role);

  if (pokemonShopLastNotifiedWindowStartIso !== windowStartIso) {
    pokemonShopLastNotifiedWindowStartIso = windowStartIso;
    const shinyOffers = offers.filter((o) => o.shiny);
    if (shinyOffers.length) {
      const offerLines = shinyOffers
        .map((o) => `#${o.slot} ${o.label} (${o.category}) - ${o.price.toLocaleString()} Cobble$`)
        .join("\n");
      void notifyDiscordEmbed({
        title: "Pokemon Shop Refreshed",
        color: 0xef4444,
        fields: [
          { name: "Window Start", value: clampDiscordText(windowStartIso, 1024), inline: false },
          { name: "Shiny Offers", value: clampDiscordText(offerLines, 1024), inline: false },
        ],
        timestamp: new Date().toISOString(),
      }).catch(() => {});
    }
  }
  const { data: purchases } = await supabase
    .from("user_pokemon_shop_purchases")
    .select("slot, claimed_at")
    .eq("user_id", user.userId)
    .eq("window_start", windowStartIso);
  const purchasedMap = new Map<number, { claimed_at: string | null }>();
  for (const p of (purchases ?? []) as { slot: number; claimed_at: string | null }[]) {
    purchasedMap.set(p.slot, { claimed_at: p.claimed_at });
  }
  res.json({
    refreshHours: POKEMON_SHOP_REFRESH_HOURS,
    shopDiscountPercent,
    windowStart: windowStartIso,
    windowEnd: end.toISOString(),
    offers: offers.map((o) => {
      const listPrice = o.price;
      const price = applyCobbleShopDiscount(listPrice, shopDiscountPercent);
      return {
        slot: o.slot,
        category: o.category,
        species: o.species,
        shiny: o.shiny,
        listPrice,
        price,
        label: o.label,
        purchased: purchasedMap.has(o.slot),
        claimed: Boolean(purchasedMap.get(o.slot)?.claimed_at),
      };
    }),
  });
});

app.post("/pokemon-shop/buy", requireAuth, async (req, res) => {
  const user = res.locals.user!;
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  if (!(await userMayUseTeamAiFeatures(user.userId))) {
    res.status(403).json({
      code: "shop_verification_required",
      error: "A verified account is required to purchase from the website shop.",
    });
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
  const role = await getUserMinecraftRoleForShop(user.userId);
  const shopDiscountPercent = getWebsiteShopDiscountPercent(role);
  const payPrice = applyCobbleShopDiscount(offer.price, shopDiscountPercent);

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
  if (wallet.balance < payPrice) {
    res.status(400).json({ error: "Not enough Cobble$", balance: wallet.balance, required: payPrice });
    return;
  }

  const now = new Date().toISOString();
  const newBalance = wallet.balance - payPrice;
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
    price: payPrice,
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
    -payPrice,
    newBalance,
    "pokemon_shop",
    shopDiscountPercent > 0
      ? `${offer.species} (shiny) (−${shopDiscountPercent}% rank)`
      : `${offer.species} (shiny)`
  );

  res.json({
    ok: true,
    slot: offer.slot,
    species: offer.species,
    shiny: true,
    price: payPrice,
    listPrice: offer.price,
    shopDiscountPercent,
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

  const { count: totalClaimDaysRaw } = await supabase
    .from("user_daily_login_claims")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.userId)
    .eq("status", "success");
  const totalClaimDays = totalClaimDaysRaw ?? 0;

  const prevDate = (prev as { claim_date?: string } | null)?.claim_date ?? null;
  const prevStreak = Number((prev as { streak_day?: number } | null)?.streak_day ?? 0) || 0;
  const nextDay = prevDate === yesterdayDateOnly(today) ? Math.min(prevStreak + 1, 7) : 1;
  const nextReward = DAILY_STREAK_REWARDS.find((r) => r.day === nextDay) ?? DAILY_STREAK_REWARDS[0]!;
  const role = await getUserMinecraftRoleForShop(user.userId);
  const flatCobbleBonusPerClaim = getDailyLoginFlatCobbleBonusPerClaim(role);
  const ticketBonusPerClaim = getDailyLoginTicketBonusPerClaim(role);
  const nextClaimCobbleTotal =
    nextReward.kind === "cobbledollars"
      ? nextReward.amount + flatCobbleBonusPerClaim
      : flatCobbleBonusPerClaim > 0
        ? flatCobbleBonusPerClaim
        : null;

  res.json({
    date: today,
    timeZone: DAILY_RESET_TIMEZONE,
    eligible,
    dailyRankBonus: {
      minecraftRole: role,
      flatCobbleBonusPerClaim,
      ticketBonusPerClaim,
      nextClaimCobbleTotal,
    },
    streak: { nextDay, nextReward },
    /** Lifetime count of successful daily claims (distinct calendar days in reset timezone). */
    totalClaimDays,
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
  if (existing) {
    const status = (existing as { status?: string }).status ?? "";
    if (status === "success") {
      res.status(400).json({ error: "Already claimed today." });
      return;
    }
    if (status === "pending") {
      res.status(409).json({ error: "Claim already processing. Try again shortly." });
      return;
    }
    if (status === "failed") {
      res
        .status(409)
        .json({ error: "Today's claim is in a failed state. Please contact staff to resolve it." });
      return;
    }
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
  const streakDay = prevDate === yesterdayDateOnly(today) ? Math.min(prevStreak + 1, 7) : 1;
  const reward = DAILY_STREAK_REWARDS.find((r) => r.day === streakDay) ?? DAILY_STREAK_REWARDS[0]!;
  const role = await getUserMinecraftRoleForShop(user.userId);
  const flatCobbleBonus = getDailyLoginFlatCobbleBonusPerClaim(role);
  const ticketBonus = getDailyLoginTicketBonusPerClaim(role);
  const streakCobbleTotal = reward.amount + flatCobbleBonus;
  const selectedRewardLabel =
    flatCobbleBonus > 0
      ? `${reward.label} + ${flatCobbleBonus.toLocaleString()} Cobble$ rank`
      : reward.label;

  if (!existing) {
    const { error: insErr } = await supabase.from("user_daily_login_claims").insert({
      user_id: user.userId,
      claim_date: today,
      streak_day: streakDay,
      selected_reward: selectedRewardLabel,
      reward_kind: reward.kind,
      reward_amount: streakCobbleTotal,
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
    let newBalance = 0;
    newBalance = await incrementUserCurrency(user.userId, COBBLEDOLLARS_CURRENCY, reward.amount, {
      kind: "daily_login",
      detail: `Day ${streakDay} — streak (${reward.label})`,
    });
    if (flatCobbleBonus > 0) {
      newBalance = await incrementUserCurrency(user.userId, COBBLEDOLLARS_CURRENCY, flatCobbleBonus, {
        kind: "daily_login",
        detail: `Day ${streakDay} — rank daily bonus (${role})`,
      });
    }
    message = `Day ${streakDay}: +${(reward.amount + flatCobbleBonus).toLocaleString()} Cobble$`;
    if (flatCobbleBonus > 0) message += ` (streak + rank)`;
    message += ` (new balance ${newBalance.toLocaleString()})`;

    if (ticketBonus > 0) {
      const tb = await incrementUserCurrency(user.userId, PVP_TICKETS_CURRENCY, ticketBonus, {
        kind: "daily_login",
        detail: `Day ${streakDay} — rank ticket bonus`,
      });
      message += ` · +${ticketBonus} normal ticket(s) (balance ${tb.toLocaleString()})`;
    }

    await supabase
      .from("user_daily_login_claims")
      .update({
        streak_day: streakDay,
        selected_reward: selectedRewardLabel,
        reward_kind: reward.kind,
        reward_amount: streakCobbleTotal,
        status: "success",
        claimed_at: new Date().toISOString(),
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.userId)
      .eq("claim_date", today);

    res.json({
      ok: true,
      date: today,
      streakDay,
      reward: selectedRewardLabel,
      message,
      dailyRankBonus: {
        flatCobbleBonus,
        ticketBonus,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase
      .from("user_daily_login_claims")
      .update({
        streak_day: streakDay,
        selected_reward: selectedRewardLabel,
        reward_kind: reward.kind,
        reward_amount: streakCobbleTotal,
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
  { to_currency: "mythic tickets", cost_tickets: 20, label: "Mythic Tickets" },
  { to_currency: "shiny mythic tickets", cost_tickets: 80, label: "Shiny Mythic Tickets" },
  { to_currency: "legendary tickets", cost_tickets: 30, label: "Legend Tickets" },
  { to_currency: "shiny legendary tickets", cost_tickets: 90, label: "Shiny Legend Tickets" },
  { to_currency: "shiny paradox tickets", cost_tickets: 80, label: "Shiny Paradox Tickets" },
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
  if (!(await userMayUseTeamAiFeatures(userId))) {
    res.status(403).json({
      code: "verification_required",
      error: "A verified account is required to exchange tickets on the website.",
    });
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

    let rosterNote: string | undefined;
    if (accountCount === 0 && data.online === 0) {
      rosterNote =
        "No roster: configure RCON + /whitelist add, or website users (username = IGN), or MC_EXTRA_ROSTER_NAMES.";
    } else if (accountCount === 0 && data.online > 0) {
      rosterNote =
        "No roster for offline tracking — add whitelist (RCON), website users, or MC_EXTRA_ROSTER_NAMES.";
    }

    const claimDaysByPlayer = new Map<string, number>();
    if (supabase && playersEnriched.length > 0) {
      const playerNames = [...new Set(playersEnriched.map((p) => p.name))];
      const { data: matchedUsers } = await supabase
        .from("users")
        .select("id, username")
        .in("username", playerNames);
      const userRows = (matchedUsers ?? []) as Array<{ id?: number; username?: string }>;
      const userIds = userRows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n) && n > 0);
      if (userIds.length > 0) {
        const byUserId = new Map<number, string>();
        for (const row of userRows) {
          const uid = Number(row.id);
          const uname = String(row.username ?? "").toLowerCase();
          if (!Number.isFinite(uid) || uid <= 0 || !uname) continue;
          byUserId.set(uid, uname);
          claimDaysByPlayer.set(uname, 0);
        }
        const { data: claimRows } = await supabase
          .from("user_daily_login_claims")
          .select("user_id")
          .eq("status", "success")
          .in("user_id", userIds);
        for (const row of (claimRows ?? []) as Array<{ user_id?: number }>) {
          const uid = Number(row.user_id);
          const uname = byUserId.get(uid);
          if (!uname) continue;
          claimDaysByPlayer.set(uname, (claimDaysByPlayer.get(uname) ?? 0) + 1);
        }
      }
    }

    const serverInfo = { ...data };
    delete (serverInfo as { onlinePlayerNames?: unknown }).onlinePlayerNames;
    res.json({
      ...serverInfo,
      players: playersEnriched.map((p) => ({
        ...p,
        totalClaimDays: claimDaysByPlayer.get(p.name.toLowerCase()) ?? 0,
      })),
      presenceTracking,
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
    .select("id, email, username, is_admin, created_at, minecraft_verified_at, minecraft_role")
    .order("created_at", { ascending: false });
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ users: data ?? [] });
});

app.get("/admin/minecraft-roles", requireAuth, requireAdmin, (_req, res) => {
  res.json({ keys: listAllKnownRoleKeys() });
});

app.post("/admin/users/:userId/minecraft-role", requireAuth, requireAdmin, async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  const roleKey = normalizeRoleKey(String((req.body as { roleKey?: unknown })?.roleKey ?? ""));
  if (!roleKey || !isKnownRoleKey(roleKey)) {
    res.status(400).json({ error: "Unknown or invalid role key" });
    return;
  }
  const { data: target, error: fetchErr } = await supabase
    .from("users")
    .select("id, username")
    .eq("id", userId)
    .maybeSingle();
  if (fetchErr) {
    res.status(500).json({ error: fetchErr.message });
    return;
  }
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const username = (target as { username: string }).username.trim();
  if (!username) {
    res.status(400).json({ error: "User has no username" });
    return;
  }
  const lp = await runLuckpermsParentSet(username, roleKey);
  if (!lp.ok) {
    res.status(502).json({ error: lp.error });
    return;
  }
  const now = new Date().toISOString();
  const { data: updated, error: updErr } = await supabase
    .from("users")
    .update({ minecraft_role: roleKey, updated_at: now })
    .eq("id", userId)
    .select("id, email, username, is_admin, created_at, minecraft_verified_at, minecraft_role")
    .single();
  if (updErr) {
    console.error("[admin/minecraft-role] RCON ok but DB update failed", updErr);
    res.status(500).json({
      error:
        "LuckPerms command ran on the server but the website failed to save the rank. Fix the DB row manually.",
    });
    return;
  }
  res.json({ user: updated });
});

async function countAdminUsers(): Promise<number> {
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("is_admin", true);
  if (error) return 0;
  return count ?? 0;
}

function isValidAdminEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

app.patch("/admin/users/:userId", requireAuth, requireAdmin, async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  const body = req.body ?? {};
  const hasEmail = Object.prototype.hasOwnProperty.call(body, "email");
  const hasUsername = Object.prototype.hasOwnProperty.call(body, "username");
  const hasIsAdmin = Object.prototype.hasOwnProperty.call(body, "is_admin");
  if (!hasEmail && !hasUsername && !hasIsAdmin) {
    res.status(400).json({ error: "No changes: provide email, username, and/or is_admin" });
    return;
  }

  const { data: target, error: fetchErr } = await supabase
    .from("users")
    .select("id, email, username, is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (fetchErr) {
    res.status(500).json({ error: fetchErr.message });
    return;
  }
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const row = target as { id: number; email: string; username: string; is_admin: boolean };
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (hasEmail) {
    const email = String((body as { email?: unknown }).email ?? "").trim().toLowerCase();
    if (!isValidAdminEmail(email)) {
      res.status(400).json({ error: "Invalid email" });
      return;
    }
    if (email !== row.email) {
      const existing = await findUserByEmail(email);
      if (existing && existing.id !== userId) {
        res.status(400).json({ error: "An account with this email already exists" });
        return;
      }
    }
    patch.email = email;
  }

  if (hasUsername) {
    const username = String((body as { username?: unknown }).username ?? "").trim();
    if (!username || username.length > 64) {
      res.status(400).json({ error: "Username is required (max 64 characters)" });
      return;
    }
    if (username !== row.username) {
      const { data: nameDupe } = await supabase
        .from("users")
        .select("id")
        .eq("username", username)
        .maybeSingle();
      const dupeId = (nameDupe as { id?: number } | null)?.id;
      if (dupeId != null && dupeId !== userId) {
        res.status(400).json({ error: "Username already taken" });
        return;
      }
      patch.minecraft_verified_at = null;
    }
    patch.username = username;
  }

  if (hasIsAdmin) {
    const nextAdmin = !!(body as { is_admin?: unknown }).is_admin;
    if (row.is_admin && !nextAdmin) {
      const admins = await countAdminUsers();
      if (admins <= 1) {
        res.status(400).json({ error: "Cannot remove the last admin account" });
        return;
      }
    }
    patch.is_admin = nextAdmin;
  }

  const { data: updated, error: updErr } = await supabase
    .from("users")
    .update(patch)
    .eq("id", userId)
    .select("id, email, username, is_admin, created_at, minecraft_verified_at, minecraft_role")
    .single();
  if (updErr) {
    res.status(500).json({ error: updErr.message });
    return;
  }
  res.json({ user: updated });
});

app.post("/admin/users/:userId/verify-ingame", requireAuth, requireAdmin, async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const staff = res.locals.user!;
  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  const { data: target, error: fetchErr } = await supabase
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (fetchErr) {
    res.status(500).json({ error: fetchErr.message });
    return;
  }
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const verifiedAt = new Date().toISOString();
  const { data: updated, error: updErr } = await supabase
    .from("users")
    .update({ minecraft_verified_at: verifiedAt, updated_at: verifiedAt })
    .eq("id", userId)
    .select("id, email, username, is_admin, created_at, minecraft_verified_at, minecraft_role")
    .single();
  if (updErr) {
    res.status(500).json({ error: updErr.message });
    return;
  }
  await supabase
    .from("user_verification_requests")
    .update({
      status: "approved",
      resolved_at: verifiedAt,
      resolved_by_user_id: staff.userId,
      admin_note: null,
    })
    .eq("user_id", userId)
    .eq("status", "pending");
  res.json({ user: updated });
});

app.post("/admin/users/:userId/revoke-ingame-verification", requireAuth, requireAdmin, async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  const now = new Date().toISOString();
  const { data: updated, error: updErr } = await supabase
    .from("users")
    .update({ minecraft_verified_at: null, updated_at: now })
    .eq("id", userId)
    .select("id, email, username, is_admin, created_at, minecraft_verified_at, minecraft_role")
    .maybeSingle();
  if (updErr) {
    res.status(500).json({ error: updErr.message });
    return;
  }
  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ user: updated });
});

app.post("/admin/users/:userId/password", requireAuth, requireAdmin, async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  const newPassword =
    typeof (req.body as { new_password?: unknown })?.new_password === "string"
      ? (req.body as { new_password: string }).new_password
      : "";
  const result = await adminResetPassword(userId, newPassword);
  if ("error" in result) {
    const status = result.error === "User not found" ? 404 : 400;
    res.status(status).json({ error: result.error });
    return;
  }
  res.json({ ok: true });
});

app.delete("/admin/users/:userId", requireAuth, requireAdmin, async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const staff = res.locals.user!;
  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  if (staff.userId === userId) {
    res.status(400).json({ error: "You cannot delete your own account" });
    return;
  }
  const { data: target, error: fetchErr } = await supabase
    .from("users")
    .select("id, is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (fetchErr) {
    res.status(500).json({ error: fetchErr.message });
    return;
  }
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const t = target as { is_admin: boolean };
  if (t.is_admin) {
    const admins = await countAdminUsers();
    if (admins <= 1) {
      res.status(400).json({ error: "Cannot delete the last admin account" });
      return;
    }
  }
  const { error: delErr } = await supabase.from("users").delete().eq("id", userId);
  if (delErr) {
    res.status(500).json({ error: delErr.message });
    return;
  }
  res.json({ ok: true, id: userId });
});

async function runDailyPvpRankPayout(): Promise<{
  payoutDate: string;
  format: string;
  paid: Array<{ rank: number; username: string; amount: number; tickets?: number }>;
  skipped: Array<{ rank: number; username: string; reason: string }>;
  predictions: { settled: number; wins: number };
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
  /** Same moment as daily login & rank rewards: calendar date = payoutDate at 00:00 Asia/Ho_Chi_Minh. */
  const predictions = await resolvePvpTopPredictionsForPayout(payoutDate, formatKey, rows);
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
        ticket_bonus: 0,
        status: "skipped",
        note: "No matching website username",
        paid_at: now,
        updated_at: now,
      });
      skipped.push({ rank, username: row.playerName, reason: "No matching website username" });
      continue;
    }
    const ticketBonus = PVP_DAILY_TICKETS_BY_RANK[rank] ?? 0;
    await incrementUserCurrency(user.id, COBBLEDOLLARS_CURRENCY, amount, {
      kind: "pvp_rank_daily",
      detail: `Rank ${rank} — ${row.formatKey} (daily job)`,
    });
    let note: string | null = null;
    if (ticketBonus > 0) {
      await incrementUserCurrency(user.id, PVP_TICKETS_CURRENCY, ticketBonus, {
        kind: "pvp_rank_daily",
        detail: `Rank ${rank} — tickets (daily job)`,
      });
      note = `+${ticketBonus} website normal ticket(s) (${PVP_TICKETS_CURRENCY})`;
    }
    await supabase.from("user_pvp_daily_payouts").insert({
      payout_date: payoutDate,
      format_key: row.formatKey,
      rank_position: rank,
      minecraft_username: row.playerName,
      user_id: user.id,
      amount,
      ticket_bonus: ticketBonus,
      status: "success",
      note,
      paid_at: now,
      claimed_at: now,
      updated_at: now,
    });
    paid.push({
      rank,
      username: row.playerName,
      amount,
      ...(ticketBonus > 0 ? { tickets: ticketBonus } : {}),
    });
  }

  return { payoutDate, format: formatKey, paid, skipped, predictions };
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

/** Grant website Cobble$ (cobbledollars) to many users in one request; ledger uses same kind as single admin grant. */
app.post("/admin/cobbledollars/bulk-grant", requireAuth, requireAdmin, async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const staff = res.locals.user!;
  const body = req.body ?? {};
  const rawIds = body.user_ids;
  const amount = body.amount;
  const note =
    typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";

  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    res.status(400).json({ error: "user_ids must be a non-empty array" });
    return;
  }
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    res.status(400).json({ error: "amount must be a positive whole number" });
    return;
  }
  const userIds = [
    ...new Set(
      rawIds
        .map((x: unknown) => Number(x))
        .filter((n): n is number => Number.isFinite(n) && Number.isInteger(n) && n > 0)
    ),
  ];
  if (userIds.length === 0) {
    res.status(400).json({ error: "No valid user ids" });
    return;
  }
  const maxBulk = 500;
  if (userIds.length > maxBulk) {
    res.status(400).json({ error: `At most ${maxBulk} users per request` });
    return;
  }

  const detail =
    note.length > 0
      ? `Staff: ${staff.username} (bulk: ${note})`
      : `Staff: ${staff.username} (bulk)`;

  const failures: Array<{ user_id: number; error: string }> = [];
  let granted = 0;
  for (const userId of userIds) {
    try {
      await incrementUserCurrency(userId, COBBLEDOLLARS_CURRENCY, amount, {
        kind: "admin_grant",
        detail,
      });
      granted += 1;
    } catch (e) {
      failures.push({
        user_id: userId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  res.json({
    ok: true,
    currency: COBBLEDOLLARS_CURRENCY,
    amount_per_user: amount,
    granted,
    requested: userIds.length,
    failures,
  });
});

/** Website inventory items staff may grant in bulk (same keys as shop / daily streak). */
app.get("/admin/inventory/grantable-items", requireAuth, requireAdmin, (_req, res) => {
  res.json({
    items: INVENTORY_ITEM_DEFS.map((it) => ({ key: it.key, label: it.label })),
  });
});

/** Grant website inventory items (e.g. Master Ball) to many users in one request. */
app.post("/admin/inventory/bulk-grant", requireAuth, requireAdmin, async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const staff = res.locals.user!;
  const body = req.body ?? {};
  const rawIds = body.user_ids;
  const rawKey = typeof body.item_key === "string" ? body.item_key : "";
  const itemKey = normalizeInventoryKey(rawKey);
  const amount = body.amount;
  const note =
    typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";

  const def = inventoryItemDef(itemKey);
  if (!def) {
    res.status(400).json({
      error: "Unknown item_key",
      allowed: INVENTORY_ITEM_DEFS.map((it) => it.key),
    });
    return;
  }

  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    res.status(400).json({ error: "user_ids must be a non-empty array" });
    return;
  }
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    res.status(400).json({ error: "amount must be a positive whole number" });
    return;
  }
  const maxPerUser = 100_000;
  if (amount > maxPerUser) {
    res.status(400).json({ error: `amount per user must be at most ${maxPerUser}` });
    return;
  }

  const userIds = [
    ...new Set(
      rawIds
        .map((x: unknown) => Number(x))
        .filter((n): n is number => Number.isFinite(n) && Number.isInteger(n) && n > 0)
    ),
  ];
  if (userIds.length === 0) {
    res.status(400).json({ error: "No valid user ids" });
    return;
  }
  const maxBulk = 500;
  if (userIds.length > maxBulk) {
    res.status(400).json({ error: `At most ${maxBulk} users per request` });
    return;
  }

  const detailNote = note.length > 0 ? ` (${note})` : "";
  const failures: Array<{ user_id: number; error: string }> = [];
  let granted = 0;
  for (const userId of userIds) {
    try {
      await incrementUserInventory(userId, itemKey, amount);
      granted += 1;
      console.info(
        `[admin] bulk inventory +${amount} ${itemKey} user ${userId} by ${staff.username}${detailNote}`
      );
    } catch (e) {
      failures.push({
        user_id: userId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  res.json({
    ok: true,
    item_key: def.key,
    label: def.label,
    amount_per_user: amount,
    granted,
    requested: userIds.length,
    failures,
  });
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
