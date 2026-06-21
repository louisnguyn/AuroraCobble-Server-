import "dotenv/config";
import express from "express";
import { createServer } from "http";
import multer from "multer";
import cron from "node-cron";
import {
  adminResetPassword,
  createUser,
  findUserByEmail,
  findUserById,
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
import {
  extractPvpRowsFromLeaderboardPayload,
  filterPvpRowsWithPlayedMatchesAndRerank,
  leaderboardPayloadHasSyncedData,
  listLeaderboardPvpFormatKeys,
  livePvpSnapFromLeaderboardForWebsiteUser,
  rankedPvpRowsForFormatKey,
  rankedPvpRowsForWebsiteRewards,
  type PvpLeaderboardRow,
} from "./leaderboardPvpDerived.js";
import { registerTournamentRoutes } from "./tournamentRoutes.js";
import { registerTournamentPredictionRoutes } from "./tournamentPrediction.js";
import { registerAdminClanRoutes, registerClanRoutes, startClanDailyIncomeScheduler } from "./clanRoutes.js";
import { attachPokerWebSocket, registerPokerRoutes } from "./pokerRoutes.js";
import { grantClanXpForDailyLoginClaim } from "./clanXp.js";
import { registerBattleRestrictionsRoutes } from "./battleRestrictionsRoutes.js";
import { analyzeTeamPokepaste } from "./teamAnalyzeAi.js";
import { createPokepasteShareUrl } from "./pokepasteLink.js";
import { sanitizeReplayForAi, summarizeBattleReplayWithOpenAI } from "./replaySummaryAi.js";
import {
  buildCobbledollarsDepositCommand,
  isCobbledollarsDepositEnabled,
} from "./minecraftCobbledollarsDeposit.js";
import {
  COBBLE_RANKED_SNAPSHOT_LEADERBOARD,
  COBBLE_RANKED_SNAPSHOT_USAGE,
  clearCobbleRankedFeed,
  hydrateCobbleRankedStore,
  persistCobbleBattleReplay,
  persistCobbleMatchResult,
  persistCobbleRankedSnapshot,
  type CobbleRankedMemoryStore,
} from "./cobbleRankedPersistence.js";
import {
  getLeaderboardDisplaySettings,
  hydrateLeaderboardDisplaySettings,
  parseLeaderboardDisplaySettingsInput,
  persistLeaderboardDisplaySettings,
} from "./leaderboardDisplaySettings.js";
import {
  rankedFeedAttentionReasons,
  rankedFeedNeedsAttention,
  stableRankedFeedItemKey,
  type RankedFeedKind,
} from "./cobbleRankedFeedAdmin.js";
import { fetchReviewedKeySet, upsertFeedReview, upsertFeedReviewBundle } from "./cobbleRankedFeedReviewsDb.js";
import { runRankedAdminEloRcon, type RankedFormatArg } from "./minecraftRankedAdminElo.js";
import { runBattlePassLuckpermsCommand } from "./minecraftBattlePassLp.js";
import {
  getBattlePassOwnershipForUser,
  listActiveBattlePassGrants,
  persistBattlePassGrantMirror,
  syncBattlePassGrantsForWebsiteUser,
  userHasActiveBattlePassGrantForUser,
} from "./battlepassLpGrantsDb.js";
import {
  insertRankedBattleStaffEvent,
  listRankedBattleStaffEvents,
} from "./rankedBattleStaffEventsDb.js";
import {
  fetchPublicProfileByUsername,
  sanitizeProfileBio,
  sanitizeAvatarUrl,
} from "./publicProfile.js";
import { uploadProfileAvatarToStorage } from "./profileAvatarUpload.js";
import {
  achievementTierRank,
  normalizeAchievementSlug,
  parseAchievementTier,
} from "./profileAchievements.js";

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

function getPvpRankDailyRewardsMeta() {
  const ranks = Object.keys(PVP_DAILY_REWARDS)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  return {
    ranks: ranks.map((rank) => ({
      rank,
      cobble: PVP_DAILY_REWARDS[rank] ?? 0,
      tickets: PVP_DAILY_TICKETS_BY_RANK[rank] ?? 0,
    })),
    timezone: "Asia/Ho_Chi_Minh",
    schedule: "Daily at 00:00 — credited to your website wallet (each ladder: Singles & Doubles)",
  };
}
const PVP_TICKETS_CURRENCY = "tickets";

/** Ticket-family `user_currency` types staff may bulk-grant from admin (same strings as single-user grant). */
const BULK_ADMIN_TICKET_CURRENCIES: readonly string[] = [
  PVP_TICKETS_CURRENCY,
  "mythic tickets",
  "shiny mythic tickets",
  "legendary tickets",
  "shiny legendary tickets",
  "paradox tickets",
  "shiny paradox tickets",
];

/** Website ticket-family balances that append to `user_ticket_currency_ledger`. */
const TICKET_LEDGER_CURRENCIES: ReadonlySet<string> = new Set(BULK_ADMIN_TICKET_CURRENCIES);

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

/** Website wallet Cobble$ (`user_currency` + `users`) — same JSON shape as in-game economy leaderboards. */
let websiteCobbledollarsPublicCache: {
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

function rememberBattleReplaySynced(body: unknown): void {
  pushCobbleRankedFeed("battleReplays", body);
  void persistCobbleBattleReplay(body, COBBLE_RANKED_FEED_MAX).catch((err) =>
    console.error("[cobble-ranked-db] battle replay:", err instanceof Error ? err.message : err)
  );
}

function rememberMatchResultSynced(body: unknown): void {
  pushCobbleRankedFeed("matchResults", body);
  void persistCobbleMatchResult(body, COBBLE_RANKED_FEED_MAX).catch((err) =>
    console.error("[cobble-ranked-db] match result:", err instanceof Error ? err.message : err)
  );
}

const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "*";
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL?.trim() || null;
/** Gacha “New Listing” posts; defaults to DISCORD_WEBHOOK_URL if unset. */
const DISCORD_GACHA_WEBHOOK_URL =
  process.env.DISCORD_GACHA_WEBHOOK_URL?.trim() || DISCORD_WEBHOOK_URL;
/** Ranked staff ELO add/remove announcements only (no fallback—set explicitly). */
const DISCORD_RANKED_ELO_WEBHOOK_URL = process.env.DISCORD_RANKED_ELO_WEBHOOK_URL?.trim() || null;
/** Pokémon shop refresh + purchases; defaults to DISCORD_WEBHOOK_URL if unset. */
const DISCORD_POKEMON_SHOP_WEBHOOK_URL =
  process.env.DISCORD_POKEMON_SHOP_WEBHOOK_URL?.trim() || DISCORD_WEBHOOK_URL;
console.log(
  "[Discord] default:",
  DISCORD_WEBHOOK_URL ? "yes" : "no",
  "| gacha:",
  DISCORD_GACHA_WEBHOOK_URL ? "yes" : "no",
  "| pokemon shop:",
  DISCORD_POKEMON_SHOP_WEBHOOK_URL ? "yes" : "no",
  "| ranked elo:",
  DISCORD_RANKED_ELO_WEBHOOK_URL ? "yes" : "no"
);

function pvpTierFromElo(elo: number | null): string {
  const n = Number(elo ?? 0);
  if (n >= 1600) return "netherite";
  if (n >= 1400) return "diamond";
  if (n >= 1300) return "emerald";
  if (n >= 1200) return "gold";
  if (n >= 1100) return "iron";
  if (n >= 1000) return "copper";
  return "copper";
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase();
}

async function syncWebsitePvpRanksFromLeaderboard(payload: unknown): Promise<void> {
  if (!supabase) return;
  const rows = rankedPvpRowsForWebsiteRewards(payload);
  const { data: users, error: usersErr } = await supabase.from("users").select("id, username");
  if (usersErr || !users?.length) return;

  if (!rows.length) {
    await supabase.from("user_pvp_ranks").delete().neq("user_id", 0);
    return;
  }

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
        matches_played: r.matches ?? 0,
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
    matches_played: number;
    source_updated_at: string;
    updated_at: string;
  }>;
  if (!upserts.length) {
    await supabase.from("user_pvp_ranks").delete().neq("user_id", 0);
    return;
  }
  let upsertErr = (await supabase.from("user_pvp_ranks").upsert(upserts, { onConflict: "user_id" })).error;
  if (upsertErr && /matches_played|schema cache/i.test(upsertErr.message)) {
    upsertErr = (
      await supabase.from("user_pvp_ranks").upsert(
        upserts.map(({ matches_played: _m, ...rest }) => rest),
        { onConflict: "user_id" }
      )
    ).error;
  }
  if (upsertErr) {
    console.warn("[pvp-rank] sync upsert:", upsertErr.message);
    return;
  }
  const rankedUserIds = upserts.map((u) => u.user_id);
  const staleIds = (users as { id: number }[]).map((u) => u.id).filter((id) => !rankedUserIds.includes(id));
  if (staleIds.length) {
    await supabase.from("user_pvp_ranks").delete().in("user_id", staleIds);
  }
}

async function notifyDiscordPull(
  username: string,
  poolName: string,
  rewardType: string
): Promise<void> {
  await notifyDiscordEmbed(
    {
      title: "New Listing",
      color: 0x8b5cf6,
      fields: [
        { name: "Player", value: username, inline: true },
        { name: "Pool", value: poolName, inline: true },
        { name: "Reward", value: rewardType, inline: false },
      ],
    },
    DISCORD_GACHA_WEBHOOK_URL
  );
}

async function notifyDiscordTournamentPredictionStake(params: {
  username: string;
  tournamentTitle: string;
  totalStake: number;
  newBalance: number;
  stakeChampion: number;
  pickChampionLabel: string | null;
  stakeRunnerUp: number;
  pickRunnerUpLabel: string | null;
}): Promise<void> {
  if (!DISCORD_GACHA_WEBHOOK_URL) return;
  const fields: DiscordEmbedField[] = [
    { name: "Player", value: clampDiscordText(params.username, 128), inline: true },
    { name: "Tournament", value: clampDiscordText(params.tournamentTitle, 256), inline: true },
    {
      name: "Total staked",
      value: `${params.totalStake.toLocaleString()} Cobble$`,
      inline: true,
    },
    {
      name: "Balance",
      value: `${params.newBalance.toLocaleString()} Cobble$`,
      inline: true,
    },
  ];
  if (params.stakeChampion > 0) {
    fields.push({
      name: "Champion pick",
      value: clampDiscordText(
        `${params.pickChampionLabel ?? "—"} · ${params.stakeChampion.toLocaleString()} CD`,
        1024
      ),
      inline: false,
    });
  }
  if (params.stakeRunnerUp > 0) {
    fields.push({
      name: "Runner-up pick",
      value: clampDiscordText(
        `${params.pickRunnerUpLabel ?? "—"} · ${params.stakeRunnerUp.toLocaleString()} CD`,
        1024
      ),
      inline: false,
    });
  }
  await notifyDiscordEmbed(
    {
      title: "Tournament prediction",
      color: 0x3b82f6,
      fields,
      timestamp: new Date().toISOString(),
    },
    DISCORD_GACHA_WEBHOOK_URL
  );
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

async function notifyDiscordEmbed(
  embed: DiscordEmbed,
  webhookUrlOverride?: string | null
): Promise<void> {
  return notifyDiscordPayload({ embeds: [embed] }, webhookUrlOverride);
}

async function notifyDiscordPayload(
  payload: DiscordWebhookPayload,
  webhookUrlOverride?: string | null
): Promise<void> {
  const trimmedOverride = webhookUrlOverride?.trim();
  const webhookUrl = trimmedOverride || DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("[Discord] webhook URL is missing; not sending");
    return;
  }

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
  "tournament_prediction_stake",
  "tournament_prediction_win",
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
      content = `${username} bought ${detail ?? "pokemon"} for ${amountStr} Cobble$ (new balance ${balanceAfterStr})`;
      void notifyDiscordEmbed(
        {
          title: "Pokémon Shop Purchase",
          color: 0xa855f7,
          fields: [
            { name: "Player", value: clampDiscordText(username, 128), inline: true },
            { name: "Paid", value: `${amountStr} Cobble$`, inline: true },
            { name: "Balance", value: `${balanceAfterStr} Cobble$`, inline: true },
            {
              name: "Pokémon",
              value: clampDiscordText(detail ?? "—", 1024),
              inline: false,
            },
          ],
          timestamp: new Date().toISOString(),
        },
        DISCORD_POKEMON_SHOP_WEBHOOK_URL
      ).catch(() => {});
      return;
    }
    case "role_shop": {
      content = `${username} bought rank ${detail ?? "role"} for ${amountStr} Cobble$ (new balance ${balanceAfterStr})`;
      break;
    }
    case "tournament_prediction_stake": {
      content = `${username} staked ${amountStr} Cobble$ on tournament predictions (balance ${balanceAfterStr})`;
      break;
    }
    case "tournament_prediction_win": {
      content = `${username} won ${amountStr} Cobble$ from tournament predictions (balance ${balanceAfterStr})`;
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

async function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
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
    const row = await findUserById(payload.userId);
    if (!row) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    res.locals.user = {
      userId: row.id,
      email: row.email,
      username: row.username,
      isAdmin: !!row.is_admin,
    };
    next();
  } catch (e) {
    next(e);
  }
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

registerTournamentRoutes(app, {
  requireAuth,
  requireAdmin,
  getLiveLeaderboard: () => cobbleStore.leaderboard,
});
registerBattleRestrictionsRoutes(app, { requireAuth, requireAdmin });

const TEAM_AI_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const GACHA_PULL_COOLDOWN_MS = 5_000;
const gachaPullCooldownUntilByUser = new Map<number, number>();

/** Upload Showdown paste to pokepast.es and return a shareable link (public; no auth). */
app.post("/team/pokepaste-link", async (req, res) => {
  const body = (req.body ?? {}) as { paste?: unknown; title?: unknown; author?: unknown };
  const paste = typeof body.paste === "string" ? body.paste : "";
  if (!paste.trim()) {
    res.status(400).json({ error: "paste required" });
    return;
  }
  if (paste.length > 12_000) {
    res.status(400).json({ error: "paste too long" });
    return;
  }
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "Team";
  const author =
    typeof body.author === "string" && body.author.trim()
      ? body.author.trim().slice(0, 100)
      : "AuroraCobble";
  try {
    const url = await createPokepasteShareUrl({ paste, title: title || "Team", author });
    res.json({ url });
  } catch (e) {
    console.warn("[team/pokepaste-link]", e instanceof Error ? e.message : e);
    res.status(502).json({
      error:
        e instanceof Error && e.message.includes("paste required")
          ? "Add at least one Pokémon to export."
          : "Could not create PokePaste link. Try again or copy the team text instead.",
    });
  }
});

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
  void persistCobbleRankedSnapshot(COBBLE_RANKED_SNAPSHOT_USAGE, req.body).catch((err) =>
    console.error("[cobble-ranked-db] persist usage_stats:", err instanceof Error ? err.message : err)
  );
  cobbleRankedPostOk(res);
});
cobbleRankedSyncRouter.get("/leaderboard", (_req, res) => res.json(cobbleStore.leaderboard ?? {}));
cobbleRankedSyncRouter.post("/leaderboard", requireCobbleAuth, (req, res) => {
  cobbleStore.leaderboard = req.body;
  void persistCobbleRankedSnapshot(COBBLE_RANKED_SNAPSHOT_LEADERBOARD, req.body).catch((err) =>
    console.error("[cobble-ranked-db] persist leaderboard:", err instanceof Error ? err.message : err)
  );
  void syncWebsitePvpRanksFromLeaderboard(req.body);
  cobbleRankedPostOk(res);
});
cobbleRankedSyncRouter.get("/v4/usage-stats", (_req, res) => res.json(cobbleStore.usageStats ?? {}));
cobbleRankedSyncRouter.post("/v4/usage-stats", requireCobbleAuth, (req, res) => {
  cobbleStore.usageStats = req.body;
  void persistCobbleRankedSnapshot(COBBLE_RANKED_SNAPSHOT_USAGE, req.body).catch((err) =>
    console.error("[cobble-ranked-db] persist usage_stats:", err instanceof Error ? err.message : err)
  );
  cobbleRankedPostOk(res);
});
cobbleRankedSyncRouter.get("/v4/leaderboard", (_req, res) => res.json(cobbleStore.leaderboard ?? {}));
cobbleRankedSyncRouter.post("/v4/leaderboard", requireCobbleAuth, (req, res) => {
  cobbleStore.leaderboard = req.body;
  void persistCobbleRankedSnapshot(COBBLE_RANKED_SNAPSHOT_LEADERBOARD, req.body).catch((err) =>
    console.error("[cobble-ranked-db] persist leaderboard:", err instanceof Error ? err.message : err)
  );
  void syncWebsitePvpRanksFromLeaderboard(req.body);
  cobbleRankedPostOk(res);
});
cobbleRankedSyncRouter.get("/battle-replays", (req, res) => {
  const limit = parseRankedFeedLimit(req.query.limit);
  res.json({ items: cobbleStore.battleReplays.slice(0, limit) });
});
cobbleRankedSyncRouter.post("/battle-replay", requireCobbleAuth, (req, res) => {
  rememberBattleReplaySynced(req.body);
  logCobbleRankedFeedReceipt("battle-replay", req.body);
  cobbleRankedPostOk(res);
});
cobbleRankedSyncRouter.get("/match-results", (req, res) => {
  const limit = parseRankedFeedLimit(req.query.limit);
  res.json({ items: cobbleStore.matchResults.slice(0, limit) });
});
cobbleRankedSyncRouter.post("/match-result", requireCobbleAuth, (req, res) => {
  rememberMatchResultSynced(req.body);
  logCobbleRankedFeedReceipt("match-result", req.body);
  cobbleRankedPostOk(res);
});
cobbleRankedSyncRouter.get("/v4/battle-replays", (req, res) => {
  const limit = parseRankedFeedLimit(req.query.limit);
  res.json({ items: cobbleStore.battleReplays.slice(0, limit) });
});
cobbleRankedSyncRouter.post("/v4/battle-replay", requireCobbleAuth, (req, res) => {
  rememberBattleReplaySynced(req.body);
  logCobbleRankedFeedReceipt("battle-replay", req.body);
  cobbleRankedPostOk(res);
});
cobbleRankedSyncRouter.get("/v4/match-results", (req, res) => {
  const limit = parseRankedFeedLimit(req.query.limit);
  res.json({ items: cobbleStore.matchResults.slice(0, limit) });
});
cobbleRankedSyncRouter.post("/v4/match-result", requireCobbleAuth, (req, res) => {
  rememberMatchResultSynced(req.body);
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

/** Public website Cobble$ top 10 (`user_currency` cobbledollars + `users.username`). Cached ~90s. No auth. */
app.get("/leaderboard/website-cobbledollars", async (_req, res) => {
  if (process.env.WEBSITE_COBBLEDOLLARS_LEADERBOARD_DISABLE === "true") {
    res.json({
      ok: false,
      disabled: true,
      top10: [],
      error: null,
      updatedAt: null,
    });
    return;
  }
  if (!supabase) {
    res.status(503).json({
      ok: false,
      disabled: false,
      top10: [],
      error: "Database not configured",
      updatedAt: null,
    });
    return;
  }
  const now = Date.now();
  if (
    websiteCobbledollarsPublicCache &&
    now - websiteCobbledollarsPublicCache.at < COBBLEDOLLARS_PUBLIC_CACHE_TTL_MS
  ) {
    res.json(websiteCobbledollarsPublicCache.body);
    return;
  }
  try {
    const window = 80;
    const { data: curRows, error: curErr } = await supabase
      .from("user_currency")
      .select("user_id, balance")
      .eq("currency_type", COBBLEDOLLARS_CURRENCY)
      .order("balance", { ascending: false })
      .limit(window);
    if (curErr) {
      throw new Error(curErr.message);
    }
    const seen = new Set<number>();
    const deduped: { user_id: number; balance: number }[] = [];
    for (const r of (curRows ?? []) as { user_id: number; balance: number }[]) {
      const uid = Number(r.user_id);
      if (!Number.isFinite(uid) || seen.has(uid)) continue;
      seen.add(uid);
      deduped.push({ user_id: uid, balance: Math.trunc(Number(r.balance)) || 0 });
      if (deduped.length >= 10) break;
    }
    const ids = deduped.map((d) => d.user_id);
    const byId = new Map<number, string>();
    if (ids.length > 0) {
      const { data: usersData, error: uErr } = await supabase.from("users").select("id, username").in("id", ids);
      if (uErr) {
        throw new Error(uErr.message);
      }
      for (const u of (usersData ?? []) as { id: number; username: string }[]) {
        const nm = String(u.username ?? "").trim();
        if (nm) byId.set(Number(u.id), nm);
      }
    }
    const top10 = deduped.map((d) => ({
      name: byId.get(d.user_id) ?? `#${d.user_id}`,
      balance: d.balance,
    }));
    const body = {
      ok: true,
      disabled: false,
      top10,
      error: null as string | null,
      updatedAt: new Date().toISOString(),
    };
    websiteCobbledollarsPublicCache = { at: now, body };
    res.json(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const body = {
      ok: false,
      disabled: false,
      top10: [] as { name: string; balance: number }[],
      error: msg,
      updatedAt: null as string | null,
    };
    websiteCobbledollarsPublicCache = { at: now, body };
    res.json(body);
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

const readLeaderboardDisplaySettings = (_req: express.Request, res: express.Response) => {
  res.json({
    ...getLeaderboardDisplaySettings(),
    pvpRankDailyRewards: getPvpRankDailyRewardsMeta(),
  });
};

const putLeaderboardDisplaySettings = async (req: express.Request, res: express.Response) => {
  const parsed = parseLeaderboardDisplaySettingsInput(req.body);
  if (!parsed) {
    res.status(400).json({
      error: "hideZeroMatchPlayers must be { singles: boolean, doubles: boolean }",
    });
    return;
  }
  try {
    await persistLeaderboardDisplaySettings(parsed);
    res.json(getLeaderboardDisplaySettings());
  } catch (e) {
    console.error("[leaderboard-display] persist:", e);
    res.status(500).json({ error: "Failed to save leaderboard display settings" });
  }
};

app.get("/leaderboard/display-settings", readLeaderboardDisplaySettings);
app.get("/admin/leaderboard/display-settings", requireAuth, requireAdmin, readLeaderboardDisplaySettings);
app.put("/admin/leaderboard/display-settings", requireAuth, requireAdmin, putLeaderboardDisplaySettings);

const leaderboardDisplayApiRouter = express.Router();
leaderboardDisplayApiRouter.get("/leaderboard/display-settings", readLeaderboardDisplaySettings);
leaderboardDisplayApiRouter.get(
  "/admin/leaderboard/display-settings",
  requireAuth,
  requireAdmin,
  readLeaderboardDisplaySettings
);
leaderboardDisplayApiRouter.put(
  "/admin/leaderboard/display-settings",
  requireAuth,
  requireAdmin,
  putLeaderboardDisplaySettings
);
app.use("/api", leaderboardDisplayApiRouter);

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

app.get("/auth/me", requireAuth, async (req, res) => {
  const tokenUser = res.locals.user!;
  const authHeader = req.headers.authorization;
  const rawToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const jwtPayload = rawToken ? verifyToken(rawToken) : null;

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
      const user = {
        id: r.id,
        email: r.email,
        username: r.username,
        is_admin: !!r.is_admin,
        minecraft_verified_at: r.minecraft_verified_at ?? null,
        minecraft_role: readMinecraftRoleField(r),
      };
      const staleJwt =
        jwtPayload != null &&
        (jwtPayload.username !== r.username ||
          jwtPayload.email !== r.email ||
          !!jwtPayload.isAdmin !== !!r.is_admin);
      res.json({
        user,
        ...(staleJwt
          ? {
              token: signToken({
                userId: r.id,
                email: r.email,
                username: r.username,
                isAdmin: !!r.is_admin,
              }),
            }
          : {}),
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

app.get("/public/profile/:username", async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const param = decodeURIComponent(String(req.params.username ?? "").trim());
  if (!param || param.length > 64) {
    res.status(400).json({ error: "Invalid username" });
    return;
  }
  try {
    const profile = await fetchPublicProfileByUsername(
      supabase,
      param,
      readMinecraftRoleField,
      pvpTierFromElo,
      cobbleStore.leaderboard
    );

    if (!profile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }
    res.json({ profile });
  } catch (e: unknown) {
    res.status(500).json({ error: String((e as Error)?.message ?? e) });
  }
});

app.get("/user/my-public-profile", requireAuth, async (_req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const tokenUser = res.locals.user!;
  try {
    const profile = await fetchPublicProfileByUsername(
      supabase,
      tokenUser.username.trim(),
      readMinecraftRoleField,
      pvpTierFromElo,
      cobbleStore.leaderboard
    );

    if (!profile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }
    res.json({ profile });
  } catch (e: unknown) {
    res.status(500).json({ error: String((e as Error)?.message ?? e) });
  }
});

app.patch("/user/my-public-profile", requireAuth, async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const userId = res.locals.user!.userId;
  const body = req.body as { bio?: unknown; avatar_url?: unknown } | null | undefined;
  let nextBio: string | null | undefined = undefined;
  let nextAvatar: string | null | undefined = undefined;
  if (body && typeof body === "object" && "bio" in body) {
    const cleaned = sanitizeProfileBio(body.bio);
    nextBio = cleaned.length > 0 ? cleaned : null;
  }
  if (body && typeof body === "object" && "avatar_url" in body) {
    const v = body.avatar_url;
    if (v === null || v === "") {
      nextAvatar = null;
    } else if (typeof v !== "string") {
      res.status(400).json({ error: "avatar_url must be a string or null" });
      return;
    } else if (!sanitizeAvatarUrl(v)) {
      res.status(400).json({ error: "avatar_url must be a valid https URL" });
      return;
    } else {
      nextAvatar = sanitizeAvatarUrl(v);
    }
  }
  let mergedBio: string | null = null;
  let mergedAvatar: string | null = null;
  if (nextBio !== undefined || nextAvatar !== undefined) {
    const { data: existing, error: selErr } = await supabase
      .from("user_public_profiles")
      .select("bio, avatar_url")
      .eq("user_id", userId)
      .maybeSingle();
    if (selErr && !/user_public_profiles|relation|does not exist|schema cache/i.test(selErr.message)) {
      res.status(500).json({ error: selErr.message });
      return;
    }
    const ex = existing as { bio?: string | null; avatar_url?: string | null } | null;
    mergedBio = nextBio !== undefined ? nextBio : (typeof ex?.bio === "string" ? ex.bio : null);
    mergedAvatar =
      nextAvatar !== undefined ? nextAvatar : (typeof ex?.avatar_url === "string" ? sanitizeAvatarUrl(ex.avatar_url) : null);
    if (mergedAvatar && !sanitizeAvatarUrl(mergedAvatar)) mergedAvatar = null;
    const now = new Date().toISOString();
    const { error: upErr } = await supabase.from("user_public_profiles").upsert(
      {
        user_id: userId,
        bio: mergedBio && mergedBio.trim() ? mergedBio.trim().slice(0, 800) : null,
        avatar_url: mergedAvatar,
        updated_at: now,
      },
      { onConflict: "user_id" }
    );
    if (upErr) {
      const missing = /user_public_profiles|relation|does not exist|schema cache/i.test(upErr.message);
      if (missing) {
        res.status(503).json({ error: "Profile table not migrated (user_public_profiles)" });
      } else {
        res.status(500).json({ error: upErr.message });
      }
      return;
    }
  }

  try {
    const profile = await fetchPublicProfileByUsername(
      supabase,
      res.locals.user!.username.trim(),
      readMinecraftRoleField,
      pvpTierFromElo,
      cobbleStore.leaderboard
    );
    if (!profile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }
    res.json({ profile });
  } catch (e: unknown) {
    res.status(500).json({ error: String((e as Error)?.message ?? e) });
  }
});

const PROFILE_AVATAR_UPLOAD = multer({

  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, /^image\/(png|jpeg|jpg|webp|gif)$/i.test(file.mimetype));
  },
});

app.post(
  "/user/profile-avatar",
  requireAuth,
  (req, res, next) => {
    PROFILE_AVATAR_UPLOAD.single("avatar")(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(400).json({ error: "Avatar image must be 2 MB or smaller." });
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
    if (!supabase) {
      res.status(503).json({ error: "Database not configured" });
      return;
    }
    const userId = res.locals.user!.userId;
    const buf = req.file?.buffer;
    if (!Buffer.isBuffer(buf)) {
      res.status(400).json({ error: "Choose an image file (PNG, JPEG, WebP, or GIF)." });
      return;
    }
    const up = await uploadProfileAvatarToStorage(supabase, userId, buf);
    if ("error" in up) {
      res.status(400).json({ error: up.error });
      return;
    }

    const { data: existing, error: selErr } = await supabase
      .from("user_public_profiles")
      .select("bio")
      .eq("user_id", userId)
      .maybeSingle();
    if (selErr && !/user_public_profiles|relation|does not exist|schema cache/i.test(selErr.message)) {
      res.status(500).json({ error: selErr.message });
      return;
    }
    const ex = existing as { bio?: string | null } | null;
    const mergedBio =
      typeof ex?.bio === "string" && ex.bio.trim() ? ex.bio.trim().slice(0, 800) : null;

    const now = new Date().toISOString();
    const avatarUrlStored = sanitizeAvatarUrl(up.publicUrl);
    if (!avatarUrlStored) {
      res.status(500).json({ error: "Uploaded file URL rejected by avatar policy." });
      return;
    }
    const { error: upsertErr } = await supabase.from("user_public_profiles").upsert(
      {
        user_id: userId,
        bio: mergedBio,
        avatar_url: avatarUrlStored,
        updated_at: now,
      },
      { onConflict: "user_id" }
    );
    if (upsertErr) {
      const missing = /user_public_profiles|relation|does not exist|schema cache/i.test(upsertErr.message);
      if (missing) {
        res.status(503).json({ error: "Profile table not migrated (user_public_profiles)" });
      } else {
        res.status(500).json({ error: upsertErr.message });
      }
      return;
    }

    try {
      const profile = await fetchPublicProfileByUsername(
        supabase,
        res.locals.user!.username.trim(),
        readMinecraftRoleField,
        pvpTierFromElo,
        cobbleStore.leaderboard
      );
      if (!profile) {
        res.status(404).json({ error: "Profile not found" });
        return;
      }
      res.json({ profile });
    } catch (e: unknown) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  }
);

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
  const nowMs = Date.now();
  const cooldownUntil = gachaPullCooldownUntilByUser.get(user.userId) ?? 0;
  if (cooldownUntil > nowMs) {
    const retryAfterSeconds = Math.max(1, Math.ceil((cooldownUntil - nowMs) / 1000));
    res.status(429).json({
      code: "gacha_pull_cooldown",
      error: `Please wait ${retryAfterSeconds}s before your next pull.`,
      retry_after_seconds: retryAfterSeconds,
    });
    return;
  }
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

  gachaPullCooldownUntilByUser.set(user.userId, Date.now() + GACHA_PULL_COOLDOWN_MS);

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

  const lb = cobbleStore.leaderboard;
  const hasLive = leaderboardPayloadHasSyncedData(lb);
  const now = new Date().toISOString();

  if (hasLive) {
    const snap = livePvpSnapFromLeaderboardForWebsiteUser(lb, user.username ?? "");
    if (snap != null) {
      const rankRow = {
        user_id: user.userId,
        minecraft_username: snap.ladderPlayerName,
        format_key: snap.formatKey,
        rank_position: snap.rank,
        elo: snap.elo,
        matches_played: snap.matches,
        source_updated_at: now,
        updated_at: now,
      };
      let upsertErr = (await supabase.from("user_pvp_ranks").upsert(rankRow, { onConflict: "user_id" })).error;
      if (upsertErr && /matches_played|schema cache/i.test(upsertErr.message)) {
        const { matches_played: _m, ...withoutMatches } = rankRow;
        upsertErr = (await supabase.from("user_pvp_ranks").upsert(withoutMatches, { onConflict: "user_id" })).error;
      }
      if (upsertErr) {
        res.status(500).json({ error: upsertErr.message });
        return;
      }
      res.json({
        rank: snap.rank,
        status: "ranked",
        format: snap.formatKey,
        minecraftUsername: snap.ladderPlayerName,
        elo: snap.elo,
        tier: pvpTierFromElo(snap.elo),
        updatedAt: now,
      });
      return;
    }

    await supabase.from("user_pvp_ranks").delete().eq("user_id", user.userId);
    res.json({ rank: null, status: "unranked", elo: null, tier: null });
    return;
  }

  type UserPvpRankRow = {
    rank_position: number;
    minecraft_username: string;
    format_key: string;
    elo: number | null;
    matches_played?: number | null;
    source_updated_at: string;
  };
  let row: UserPvpRankRow | null = null;
  {
    const { data, error } = await supabase
      .from("user_pvp_ranks")
      .select("rank_position, minecraft_username, format_key, elo, matches_played, source_updated_at")
      .eq("user_id", user.userId)
      .maybeSingle();
    const missingRankTable = Boolean(
      error && /user_pvp_ranks|relation|does not exist|schema cache/i.test(error.message)
    );
    if (error && !missingRankTable && !/matches_played|schema cache/i.test(error.message)) {
      res.status(500).json({ error: error.message });
      return;
    }
    if (!error) row = data as UserPvpRankRow | null;
    else if (/matches_played|schema cache/i.test(error.message)) {
      const fallback = await supabase
        .from("user_pvp_ranks")
        .select("rank_position, minecraft_username, format_key, elo, source_updated_at")
        .eq("user_id", user.userId)
        .maybeSingle();
      if (fallback.error && !/user_pvp_ranks|relation|does not exist|schema cache/i.test(fallback.error.message)) {
        res.status(500).json({ error: fallback.error.message });
        return;
      }
      row = fallback.data as UserPvpRankRow | null;
    }
  }
  if (row) {
    const matchesPlayed =
      typeof row.matches_played === "number" && Number.isFinite(row.matches_played)
        ? Math.max(0, Math.trunc(row.matches_played))
        : null;
    if (matchesPlayed != null && matchesPlayed <= 0) {
      res.json({ rank: null, status: "unranked", elo: null, tier: null });
      return;
    }
    if (matchesPlayed == null && row.elo === 1000) {
      res.json({ rank: null, status: "unranked", elo: null, tier: null });
      return;
    }
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

  res.json({ rank: null, status: "unranked", elo: null, tier: null });
});

function rankedPayloadInvolvesUsername(payload: unknown, username: string): boolean {
  if (!payload || typeof payload !== "object") return false;
  const players = (payload as { players?: unknown }).players;
  if (!Array.isArray(players)) return false;
  const want = normalizeName(username);
  if (!want) return false;
  for (const p of players) {
    if (!p || typeof p !== "object") continue;
    const name = (p as { playerName?: unknown }).playerName;
    if (typeof name === "string" && normalizeName(name) === want) return true;
  }
  return false;
}

/** Match results / replays involving the authenticated user's website username (same as IGN for matching). */
app.get("/user/ranked-history", requireAuth, (req, res) => {
  const user = res.locals.user!;
  const limit = parseRankedFeedLimit(req.query.limit);
  const uname = user.username ?? "";
  const matchResults = (cobbleStore.matchResults as unknown[]).filter((m) =>
    rankedPayloadInvolvesUsername(m, uname)
  );
  const battleReplays = (cobbleStore.battleReplays as unknown[]).filter((r) =>
    rankedPayloadInvolvesUsername(r, uname)
  );
  res.json({
    matchResults: matchResults.slice(0, limit),
    battleReplays: battleReplays.slice(0, limit),
  });
});

/** OpenAI summary of a ranked battle replay (must include the signed-in user as a player). */
app.post("/user/ranked-replay/ai-summary", requireAuth, async (req, res) => {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    res.status(503).json({ error: "AI analysis is not configured on this server." });
    return;
  }
  const user = res.locals.user!;
  const raw = (req.body as { replay?: unknown } | undefined)?.replay ?? req.body;
  if (!raw || typeof raw !== "object") {
    res.status(400).json({ error: "replay payload required" });
    return;
  }
  if (!rankedPayloadInvolvesUsername(raw, user.username ?? "")) {
    res.status(403).json({ error: "This replay does not involve your account." });
    return;
  }
  const sanitized = sanitizeReplayForAi(raw);
  if (!sanitized.ok) {
    res.status(400).json({ error: sanitized.error });
    return;
  }
  try {
    const { text } = await summarizeBattleReplayWithOpenAI(sanitized.replay);
    res.json({ summary: text });
  } catch (e) {
    console.error("[user/ranked-replay/ai-summary]", e);
    res.status(502).json({ error: "AI request failed. Try again later." });
  }
});

/** Staff: OpenAI summary for any battle replay payload (no “your match” check). */
app.post("/admin/ranked-replay/ai-summary", requireAuth, requireAdmin, async (req, res) => {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    res.status(503).json({ error: "AI analysis is not configured on this server." });
    return;
  }
  const raw = (req.body as { replay?: unknown } | undefined)?.replay ?? req.body;
  if (!raw || typeof raw !== "object") {
    res.status(400).json({ error: "replay payload required" });
    return;
  }
  const sanitized = sanitizeReplayForAi(raw);
  if (!sanitized.ok) {
    res.status(400).json({ error: sanitized.error });
    return;
  }
  try {
    const { text } = await summarizeBattleReplayWithOpenAI(sanitized.replay);
    res.json({ summary: text });
  } catch (e) {
    console.error("[admin/ranked-replay/ai-summary]", e);
    res.status(502).json({ error: "AI request failed. Try again later." });
  }
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
  { itemKey: "silver_bottle_cap", label: "Silver Bottle Cap", cost: 500_000 },
  { itemKey: "master_ball", label: "Master Ball", cost: 1_000_000 },
  { itemKey: "ancient_origin_ball", label: "Ancient Origin Ball", cost: 1_250_000 },
] as const;

const BATTLEPASS_SHOP_ITEMS = [
  {
    itemKey: "battlepass_party",
    label: "Battle Pass — Party creation",
    cost: 750_000,
    battlePassKind: "party" as const,
  },
  {
    itemKey: "battlepass_premium",
    label: "Battle Pass — Premium",
    cost: 2_200_000,
    battlePassKind: "premium" as const,
  },
] as const;

function battlePassShopItemByKey(itemKey: string) {
  return BATTLEPASS_SHOP_ITEMS.find((x) => x.itemKey === itemKey);
}

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
const POKEMON_SHOP_OFFER_COUNT = 6;
/** Per-slot chance an offer is shiny (0–1). Remaining rolls are normal. */
const POKEMON_SHOP_SHINY_CHANCE = 0.35;
const POKEMON_SHOP_CATEGORIES = {
  mythic: {
    priceShiny: 20_000_000,
    priceNormal: 8_000_000,
    weight: 4,
    species: [
      "mew", "celebi", "jirachi", "deoxys", "manaphy", "phione", "darkrai", "shaymin",
      "arceus", "victini", "keldeo", "meloetta", "genesect", "diancie", "hoopa", "volcanion",
      "magearna", "marshadow", "zeraora", "meltan", "melmetal", "zarude", "pecharunt"
    ],
  },
  pseudo_legend: {
    priceShiny: 5_000_000,
    priceNormal: 2_000_000,
    weight: 40,
    species: [
      "dragonite", "tyranitar", "salamence", "metagross", "garchomp", "hydreigon",
      "goodra", "kommo-o", "dragapult", "baxcalibur"
    ],
  },
  paradox: {
    priceShiny: 9_000_000,
    priceNormal: 4_000_000,
    weight: 25,
    species: [
      "greattusk", "screamtail", "brutebonnet", "fluttermane", "slitherwing", "sandyshocks",
      "irontreads", "ironbundle", "ironhands", "ironjugulis", "ironmoth", "ironthorns",
      "roaringmoon", "ironvaliant", "walkingwake", "ironleaves", "gougingfire", "ragingbolt",
      "ironboulder", "ironcrown"
    ],
  },
  ultra_beast: {
    priceShiny: 9_000_000,
    priceNormal: 4_000_000,
    weight: 25,
    species: [
      "nihilego", "buzzwole", "pheromosa", "xurkitree", "celesteela", "kartana", "guzzlord",
      "poipole", "naganadel", "stakataka", "blacephalon"
    ],
  },
  legend_high: {
    priceShiny: 35_000_000,
    priceNormal: 15_000_000,
    weight: 2,
    species: [
      "mewtwo", "lugia", "hooh", "latias", "latios", "kyogre", "groudon", "rayquaza",
      "dialga", "palkia", "heatran", "giratina", "reshiram", "zekrom", "kyurem",
      "xerneas", "yveltal", "zygarde", "solgaleo", "lunala", "necrozma",
      "zacian", "zamazenta", "eternatus", "urshifu", "regieleki", "calyrex",
      "koraidon", "miraidon",
      "cosmog", "cosmoem", "glastrier", "spectrier",
    ],
  },
  legend_low: {
    priceShiny: 25_000_000,
    priceNormal: 10_000_000,
    weight: 4,
    species: [
      "articuno", "zapdos", "moltres", "raikou", "entei", "suicune",
      "regirock", "regice", "registeel", "uxie", "mesprit", "azelf", "cresselia",
      "cobalion", "terrakion", "virizion", "tornadus", "thundurus", "landorus",
      "tapukoko", "tapulele", "tapubulu", "tapufini",
      "kubfu", "regidrago",
      "enamorus",
    ],
  },
} as const;
type PokemonShopCategory = keyof typeof POKEMON_SHOP_CATEGORIES;
type PokemonShopCategoryDef = (typeof POKEMON_SHOP_CATEGORIES)[PokemonShopCategory];

function pokemonShopPriceForVariant(def: PokemonShopCategoryDef, shiny: boolean): number {
  return shiny ? def.priceShiny : def.priceNormal;
}

function pokemonShopOfferLabel(species: string, shiny: boolean): string {
  return shiny ? `Shiny ${species}` : species;
}

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

/** Admin force-refresh sets a new window until the usual 12h period ends. */
let pokemonShopWindowStartOverrideMs: number | null = null;
let pokemonShopLastNotifiedWindowStartIso = "";

function getPokemonShopWindow(now: Date = new Date()): { start: Date; end: Date } {
  const period = POKEMON_SHOP_REFRESH_HOURS * 60 * 60 * 1000;
  const nowMs = now.getTime();
  if (pokemonShopWindowStartOverrideMs != null) {
    const overrideEndMs = pokemonShopWindowStartOverrideMs + period;
    if (nowMs < overrideEndMs) {
      return {
        start: new Date(pokemonShopWindowStartOverrideMs),
        end: new Date(overrideEndMs),
      };
    }
    pokemonShopWindowStartOverrideMs = null;
  }
  return currentPokemonShopWindow(now);
}

function forcePokemonShopWindowRefresh(): { start: Date; end: Date } {
  const period = POKEMON_SHOP_REFRESH_HOURS * 60 * 60 * 1000;
  const nowMs = Date.now();
  pokemonShopWindowStartOverrideMs = nowMs;
  return { start: new Date(nowMs), end: new Date(nowMs + period) };
}

type PokemonShopBuiltOffer = ReturnType<typeof buildPokemonShopOffers>[number];

function notifyPokemonShopRefreshIfNeeded(
  windowStartIso: string,
  offers: PokemonShopBuiltOffer[]
): void {
  if (pokemonShopLastNotifiedWindowStartIso === windowStartIso) return;
  pokemonShopLastNotifiedWindowStartIso = windowStartIso;
  if (!offers.length) return;
  const offerLines = offers
    .map(
      (o) =>
        `#${o.slot} ${o.label}${o.shiny ? "" : " (normal)"} (${o.category}) - ${o.price.toLocaleString()} Cobble$`
    )
    .join("\n");
  void notifyDiscordEmbed(
    {
      title: "Pokemon Shop Refreshed",
      color: 0xef4444,
      fields: [
        { name: "Window Start", value: clampDiscordText(windowStartIso, 1024), inline: false },
        { name: "Offers", value: clampDiscordText(offerLines, 1024), inline: false },
      ],
      timestamp: new Date().toISOString(),
    },
    DISCORD_POKEMON_SHOP_WEBHOOK_URL
  ).catch(() => {});
}

function pickPokemonShopCategories(count: number, rng: () => number): PokemonShopCategory[] {
  const categories = Object.keys(POKEMON_SHOP_CATEGORIES) as PokemonShopCategory[];
  const categoryPool = [...categories];
  const picked: PokemonShopCategory[] = [];

  // Weighted pick without replacement: rarer categories (legend_high/mythic) roll less often.
  while (picked.length < Math.min(count, categoryPool.length)) {
    const totalWeight = categoryPool.reduce(
      (sum, c) => sum + Math.max(0, POKEMON_SHOP_CATEGORIES[c].weight),
      0
    );
    if (totalWeight <= 0) break;
    let roll = rng() * totalWeight;
    let pickIndex = 0;
    for (let i = 0; i < categoryPool.length; i += 1) {
      const w = Math.max(0, POKEMON_SHOP_CATEGORIES[categoryPool[i]!].weight);
      roll -= w;
      if (roll <= 0) {
        pickIndex = i;
        break;
      }
    }
    const [pickedCategory] = categoryPool.splice(pickIndex, 1);
    if (pickedCategory) picked.push(pickedCategory);
  }
  while (picked.length < count && categories.length > 0) {
    picked.push(categories[Math.floor(rng() * categories.length)]!);
  }
  return picked;
}

function buildPokemonShopOffer(
  category: PokemonShopCategory,
  slot: number,
  shiny: boolean,
  rng: () => number
) {
  const def = POKEMON_SHOP_CATEGORIES[category];
  const pickIdx = Math.floor(rng() * def.species.length);
  const species = def.species[pickIdx] ?? def.species[0]!;
  return {
    slot,
    category,
    species,
    shiny,
    price: pokemonShopPriceForVariant(def, shiny),
    label: pokemonShopOfferLabel(species, shiny),
  };
}

function buildPokemonShopOffers(windowStartIso: string) {
  const rng = mulberry32(hashString(`pokemon-shop:${windowStartIso}`));
  const pickedCategories = pickPokemonShopCategories(POKEMON_SHOP_OFFER_COUNT, rng);

  const offers = pickedCategories.map((category, i) => {
    const shiny = rng() < POKEMON_SHOP_SHINY_CHANCE;
    return buildPokemonShopOffer(category, i + 1, shiny, rng);
  });

  const categories = Object.keys(POKEMON_SHOP_CATEGORIES) as PokemonShopCategory[];
  while (offers.length < POKEMON_SHOP_OFFER_COUNT && categories.length > 0) {
    const category = categories[Math.floor(rng() * categories.length)]!;
    const shiny = rng() < POKEMON_SHOP_SHINY_CHANCE;
    offers.push(buildPokemonShopOffer(category, offers.length + 1, shiny, rng));
  }
  return offers;
}

const INVENTORY_ITEM_DEFS = [
  { key: "exp_candy_xl", label: "EXP Candy XL", itemId: "cobblemon:exp_candy_xl" },
  { key: "silver_bottle_cap", label: "Silver Bottle Cap", itemId: "obc:bottle_cap" },
  { key: "master_ball", label: "Master Ball", itemId: "cobblemon:master_ball" },
  { key: "ancient_origin_ball", label: "Ancient Origin Ball", itemId: "cobblemon:ancient_origin_ball" },
] as const;
const INVENTORY_CLAIM_COMMAND_TEMPLATE =
  process.env.INVENTORY_CLAIM_COMMAND_TEMPLATE?.trim() ||
  "give {player} {item_id} {amount}";

function normalizeInventoryKey(itemKey: string): string {
  return itemKey.trim().toLowerCase();
}

/** Legacy website keys → current catalog (gold bottle cap → silver). */
function canonicalInventoryKey(itemKey: string): string {
  const k = normalizeInventoryKey(itemKey);
  if (k === "gold_bottle_cap") return "silver_bottle_cap";
  return k;
}

function inventoryItemDef(itemKey: string) {
  return INVENTORY_ITEM_DEFS.find((it) => it.key === canonicalInventoryKey(itemKey));
}

async function findUserInventoryRow(
  userId: number,
  itemKey: string
): Promise<{ id: number; quantity: number; item_key: string } | null> {
  if (!supabase) return null;
  const key = canonicalInventoryKey(itemKey);
  const candidates = key === "silver_bottle_cap" ? ["silver_bottle_cap", "gold_bottle_cap"] : [key];
  for (const k of candidates) {
    const { data } = await supabase
      .from("user_inventory")
      .select("id, quantity, item_key")
      .eq("user_id", userId)
      .eq("item_key", k)
      .maybeSingle();
    if (data) return data as { id: number; quantity: number; item_key: string };
  }
  return null;
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

type CurrencyLedgerMeta = { kind: string; detail?: string | null };

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

async function recordTicketCurrencyLedger(
  userId: number,
  currencyType: string,
  delta: number,
  balanceAfter: number,
  kind: string,
  detail: string | null
): Promise<void> {
  if (!supabase || delta === 0) return;
  const { error } = await supabase.from("user_ticket_currency_ledger").insert({
    user_id: userId,
    currency_type: currencyType,
    delta,
    balance_after: balanceAfter,
    kind,
    detail,
  });
  if (error) {
    console.warn("[ticket currency ledger]", error.message);
  }
}

async function ensureUserTicketsWalletRow(userId: number): Promise<void> {
  if (!supabase) return;
  const { data: rows, error } = await supabase
    .from("user_currency")
    .select("id")
    .eq("user_id", userId)
    .eq("currency_type", PVP_TICKETS_CURRENCY)
    .limit(1);
  if (error) {
    console.warn("[user_currency] ensure tickets row — select:", error.message);
    return;
  }
  if (rows?.length) return;
  const ins = await supabase.from("user_currency").insert({
    user_id: userId,
    currency_type: PVP_TICKETS_CURRENCY,
    balance: 0,
  });
  if (ins.error && !/duplicate|unique/i.test(`${ins.error.code ?? ""} ${ins.error.message}`)) {
    console.warn("[user_currency] ensure tickets row — insert:", ins.error.message);
  }
}

async function incrementUserCurrency(
  userId: number,
  currencyType: string,
  amount: number,
  ledger?: CurrencyLedgerMeta
): Promise<number> {
  if (!supabase) throw new Error("Database not configured");
  const { data: sel, error: selErr } = await supabase
    .from("user_currency")
    .select("id, balance")
    .eq("user_id", userId)
    .eq("currency_type", currencyType)
    .limit(1);
  if (selErr) throw new Error(selErr.message);
  const row = sel?.[0] as { id: number; balance: number } | undefined;
  const now = new Date().toISOString();
  if (row) {
    const newBalance = row.balance + amount;
    const { error } = await supabase
      .from("user_currency")
      .update({ balance: newBalance, updated_at: now })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
    if (amount !== 0 && ledger) {
      if (currencyType === COBBLEDOLLARS_CURRENCY) {
        void recordCobbledollarLedger(userId, amount, newBalance, ledger.kind, ledger.detail ?? null);
      } else if (TICKET_LEDGER_CURRENCIES.has(currencyType)) {
        void recordTicketCurrencyLedger(
          userId,
          currencyType,
          amount,
          newBalance,
          ledger.kind,
          ledger.detail ?? null
        );
      }
    }
    return newBalance;
  }
  const { error } = await supabase.from("user_currency").insert({
    user_id: userId,
    currency_type: currencyType,
    balance: amount,
  });
  if (error) throw new Error(error.message);
  if (amount !== 0 && ledger) {
    if (currencyType === COBBLEDOLLARS_CURRENCY) {
      void recordCobbledollarLedger(userId, amount, amount, ledger.kind, ledger.detail ?? null);
    } else if (TICKET_LEDGER_CURRENCIES.has(currencyType)) {
      void recordTicketCurrencyLedger(
        userId,
        currencyType,
        amount,
        amount,
        ledger.kind,
        ledger.detail ?? null
      );
    }
  }
  return amount;
}

async function incrementUserInventory(
  userId: number,
  itemKey: string,
  amount: number
): Promise<number> {
  if (!supabase) throw new Error("Database not configured");
  const key = canonicalInventoryKey(itemKey);
  const row = await findUserInventoryRow(userId, key);
  const now = new Date().toISOString();
  if (row) {
    const newQty = row.quantity + amount;
    const { error } = await supabase
      .from("user_inventory")
      .update({ quantity: newQty, updated_at: now })
      .eq("id", row.id);
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

app.get("/user/tickets/ledger", requireAuth, async (req, res) => {
  const user = res.locals.user!;
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const raw = req.query.limit;
  const n = typeof raw === "string" ? parseInt(raw, 10) : NaN;
  const limit = Number.isFinite(n) ? Math.min(Math.max(n, 1), 50) : 10;
  const { data, error } = await supabase
    .from("user_ticket_currency_ledger")
    .select("id, currency_type, delta, balance_after, kind, detail, created_at")
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
    const key = canonicalInventoryKey(r.item_key);
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
  const itemKey = canonicalInventoryKey(itemKeyRaw);
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

  let row = await findUserInventoryRow(user.userId, itemKey);

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
  const owned = await getBattlePassOwnershipForUser(user.userId);
  res.json({
    currency: COBBLEDOLLARS_CURRENCY,
    shopDiscountPercent,
    items: SHOP_ITEMS.map((item) => ({
      itemKey: item.itemKey,
      label: item.label,
      cost: item.cost,
      discountedCost: applyCobbleShopDiscount(item.cost, shopDiscountPercent),
    })),
    battlePassItems: BATTLEPASS_SHOP_ITEMS.map((item) => ({
      itemKey: item.itemKey,
      label: item.label,
      cost: item.cost,
      discountedCost: applyCobbleShopDiscount(item.cost, shopDiscountPercent),
      battlePassKind: item.battlePassKind,
      owned: item.battlePassKind === "premium" ? owned.premium : owned.party,
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

  const bpItem = battlePassShopItemByKey(itemKey);
  if (bpItem) {
    if (quantity !== 1) {
      res.status(400).json({ error: "Battle pass purchases are one per account" });
      return;
    }
    const ign = user.username.trim();
    if (!isLikelyMinecraftUsername(ign)) {
      res.status(400).json({
        error:
          "Your website username must match your Minecraft name (2–16 letters, numbers, underscore) to buy battle pass access.",
      });
      return;
    }
    if (await userHasActiveBattlePassGrantForUser(user.userId, bpItem.battlePassKind)) {
      res.status(400).json({
        code: "battlepass_already_owned",
        error:
          bpItem.battlePassKind === "premium"
            ? "You already have premium battle pass access."
            : "You already have party creation access.",
      });
      return;
    }
    const role = await getUserMinecraftRoleForShop(user.userId);
    const shopDiscountPercent = getWebsiteShopDiscountPercent(role);
    const totalCost = applyCobbleShopDiscount(bpItem.cost, shopDiscountPercent);

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

    const exec = await runBattlePassLuckpermsCommand(bpItem.battlePassKind, ign, true);
    if (!exec.ok) {
      res.status(exec.command ? 502 : 400).json({ error: exec.error, command: exec.command || undefined });
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
      await runBattlePassLuckpermsCommand(bpItem.battlePassKind, ign, false);
      res.status(500).json({ error: updErr.message });
      return;
    }
    if (!updated?.length) {
      await runBattlePassLuckpermsCommand(bpItem.battlePassKind, ign, false);
      res.status(409).json({ error: "Balance changed — try again" });
      return;
    }

    const mirror = await persistBattlePassGrantMirror({
      kind: bpItem.battlePassKind,
      minecraftUsername: ign,
      grant: true,
      websiteUserId: user.userId,
      grantedByUserId: user.userId,
    });
    if (!mirror.ok) {
      await supabase
        .from("user_currency")
        .update({ balance: wallet.balance, updated_at: new Date().toISOString() })
        .eq("id", wallet.id);
      await runBattlePassLuckpermsCommand(bpItem.battlePassKind, ign, false);
      res.status(500).json({
        error:
          "Server permission was applied but the grant could not be saved. Your Cobble$ was refunded. Contact staff if this persists.",
        dbPersisted: false,
      });
      return;
    }

    const ledgerDetail =
      shopDiscountPercent > 0
        ? `${bpItem.label} (−${shopDiscountPercent}% rank)`
        : bpItem.label;
    await recordCobbledollarLedger(user.userId, -totalCost, newBalance, "shop", ledgerDetail);

    res.json({
      ok: true,
      itemKey: bpItem.itemKey,
      battlePassKind: bpItem.battlePassKind,
      quantityPurchased: 1,
      totalCost,
      shopDiscountPercent,
      newBalance,
      dbPersisted: true,
    });
    return;
  }

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

app.get("/pokemon-shop/offers", requireAuth, async (req, res) => {
  const user = res.locals.user!;
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const { start, end } = getPokemonShopWindow();
  const windowStartIso = start.toISOString();
  const offers = buildPokemonShopOffers(windowStartIso);
  const role = await getUserMinecraftRoleForShop(user.userId);
  const shopDiscountPercent = getWebsiteShopDiscountPercent(role);

  notifyPokemonShopRefreshIfNeeded(windowStartIso, offers);
  const { data: windowPurchases } = await supabase
    .from("user_pokemon_shop_purchases")
    .select("slot, user_id, claimed_at")
    .eq("window_start", windowStartIso);
  const soldSlots = new Set<number>();
  const mineBySlot = new Map<number, { claimed_at: string | null }>();
  for (const p of (windowPurchases ?? []) as {
    slot: number;
    user_id: number;
    claimed_at: string | null;
  }[]) {
    soldSlots.add(p.slot);
    if (p.user_id === user.userId) {
      mineBySlot.set(p.slot, { claimed_at: p.claimed_at });
    }
  }
  res.json({
    refreshHours: POKEMON_SHOP_REFRESH_HOURS,
    shopDiscountPercent,
    windowStart: windowStartIso,
    windowEnd: end.toISOString(),
    offers: offers.map((o) => {
      const listPrice = o.price;
      const price = applyCobbleShopDiscount(listPrice, shopDiscountPercent);
      const purchasedByYou = mineBySlot.has(o.slot);
      return {
        slot: o.slot,
        category: o.category,
        species: o.species,
        shiny: o.shiny,
        listPrice,
        price,
        label: o.label,
        soldOut: soldSlots.has(o.slot),
        purchasedByYou,
        claimed: Boolean(mineBySlot.get(o.slot)?.claimed_at),
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
  const { start } = getPokemonShopWindow();
  const offers = buildPokemonShopOffers(start.toISOString());
  const offer = offers.find((o) => o.slot === slot);
  if (!offer) {
    res.status(404).json({ error: "Offer not found" });
    return;
  }
  const role = await getUserMinecraftRoleForShop(user.userId);
  const shopDiscountPercent = getWebsiteShopDiscountPercent(role);
  const payPrice = applyCobbleShopDiscount(offer.price, shopDiscountPercent);

  const { data: taken } = await supabase
    .from("user_pokemon_shop_purchases")
    .select("id, user_id")
    .eq("window_start", start.toISOString())
    .eq("slot", slot)
    .maybeSingle();
  if (taken) {
    const row = taken as { id: number; user_id: number };
    if (row.user_id === user.userId) {
      res.status(400).json({ error: "You already purchased this offer in the current rotation." });
    } else {
      res.status(400).json({
        error: "This Pokémon is sold out for this rotation (another player bought it first).",
        code: "pokemon_shop_sold_out",
      });
    }
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
    shiny: offer.shiny,
    purchased_at: now,
    updated_at: now,
  });
  if (insErr) {
    await supabase
      .from("user_currency")
      .update({ balance: wallet.balance, updated_at: new Date().toISOString() })
      .eq("id", wallet.id);
    if (/uq_pokemon_shop_window_slot_global|uq_user_pokemon_shop_window_slot|duplicate key/i.test(insErr.message)) {
      res.status(409).json({
        error: "This Pokémon was just purchased by another player. Your Cobble$ balance was restored.",
        code: "pokemon_shop_sold_out",
      });
      return;
    }
    res.status(500).json({ error: insErr.message });
    return;
  }

  const variantLabel = offer.shiny ? "Shiny" : "Normal";
  const pokemonShopDetail =
    shopDiscountPercent > 0
      ? `Slot ${slot}: ${variantLabel} ${offer.species} (${offer.category}) · −${shopDiscountPercent}% rank`
      : `Slot ${slot}: ${variantLabel} ${offer.species} (${offer.category})`;
  await recordCobbledollarLedger(user.userId, -payPrice, newBalance, "pokemon_shop", pokemonShopDetail);

  res.json({
    ok: true,
    slot: offer.slot,
    species: offer.species,
    shiny: offer.shiny,
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

    const clanXp = await grantClanXpForDailyLoginClaim(user.userId, streakDay, today);

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
      clanXp: clanXp ?? undefined,
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

// Ticket exchange: spend normal tickets for special ticket types (shiny = 2× base cost).
const EXCHANGE_RATES: { to_currency: string; cost_tickets: number; label: string }[] = [
  { to_currency: "mythic tickets", cost_tickets: 40, label: "Mythic Tickets" },
  { to_currency: "shiny mythic tickets", cost_tickets: 80, label: "Shiny Mythic Tickets" },
  { to_currency: "legendary tickets", cost_tickets: 45, label: "Legend Tickets" },
  { to_currency: "shiny legendary tickets", cost_tickets: 90, label: "Shiny Legend Tickets" },
  { to_currency: "paradox tickets", cost_tickets: 25, label: "Paradox Tickets" },
  { to_currency: "shiny paradox tickets", cost_tickets: 50, label: "Shiny Paradox Tickets" },
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
  const ticketsAfter = currentTickets - cost;
  let targetNewBalance: number;
  if (targetRow) {
    targetNewBalance = (targetRow as { balance: number }).balance + 1;
    await supabase
      .from("user_currency")
      .update({ balance: targetNewBalance, updated_at: now })
      .eq("id", (targetRow as { id: number }).id);
  } else {
    targetNewBalance = 1;
    await supabase.from("user_currency").insert({
      user_id: userId,
      currency_type: to_currency,
      balance: 1,
    });
  }

  void recordTicketCurrencyLedger(
    userId,
    PVP_TICKETS_CURRENCY,
    -cost,
    ticketsAfter,
    "ticket_exchange",
    `Spent on ${rate.label}`
  );
  void recordTicketCurrencyLedger(
    userId,
    to_currency,
    1,
    targetNewBalance,
    "ticket_exchange",
    `From normal tickets (−${cost})`
  );

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

app.get("/admin/users", requireAuth, requireAdmin, async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const qRaw = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const searchMode = typeof req.query.q === "string";
  let qb = supabase
    .from("users")
    .select("id, email, username, is_admin, created_at, minecraft_verified_at, minecraft_role");
  if (searchMode) {
    if (qRaw.length < 1) {
      res.json({ users: [] });
      return;
    }
    const safe = qRaw.replace(/%/g, "").slice(0, 80);
    const pattern = `%${safe}%`;
    qb = qb.ilike("username", pattern).limit(50).order("username", { ascending: true });
  } else {
    qb = qb.order("created_at", { ascending: false });
  }
  const { data, error } = await qb;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ users: data ?? [] });
});

app.get("/admin/profile-achievement-definitions", requireAuth, requireAdmin, async (_req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const { data, error } = await supabase
    .from("profile_achievement_definitions")
    .select("id, slug, title, description, tier, sort_order, active, created_at, updated_at")
    .order("id", { ascending: true });
  if (error) {
    const missing = /profile_achievement_definitions|relation|does not exist|schema cache/i.test(error.message);
    res.status(missing ? 503 : 500).json({
      error: missing
        ? "Run supabase/profile_achievements.sql (tables missing)."
        : error.message,
    });
    return;
  }
  type DefListRow = {
    id: number;
    slug: string;
    title: string;
    description: string;
    tier: string;
    sort_order: number;
    active: boolean;
    created_at: string;
    updated_at: string;
  };
  const definitions = ((data ?? []) as DefListRow[]).slice().sort((a, b) => {
    const tr = achievementTierRank(a.tier) - achievementTierRank(b.tier);
    if (tr !== 0) return tr;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.id - b.id;
  });
  res.json({ definitions });
});

app.post("/admin/profile-achievement-definitions", requireAuth, requireAdmin, async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const body = req.body ?? {};
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 600) : "";
  const tier = parseAchievementTier(body.tier);
  const sortOrderIn = body.sort_order;
  const sortOrder =
    typeof sortOrderIn === "number" && Number.isFinite(sortOrderIn) ? Math.trunc(sortOrderIn) : 0;
  if (!title || !description || !tier) {
    res.status(400).json({
      error:
        "title, description, and a valid tier are required (silver|cyan|emerald|violet|rose|gold|crimson|mythic).",
    });
    return;
  }
  let slug =
    typeof body.slug === "string" && body.slug.trim()
      ? normalizeAchievementSlug(body.slug)
      : normalizeAchievementSlug(title.replace(/\s+/g, "-"));
  if (!slug) slug = `badge-${Date.now()}`;
  const now = new Date().toISOString();
  const { data: row, error } = await supabase
    .from("profile_achievement_definitions")
    .insert({
      slug,
      title,
      description,
      tier,
      sort_order: sortOrder,
      active: body.active === false ? false : true,
      updated_at: now,
    })
    .select("id, slug, title, description, tier, sort_order, active, created_at, updated_at")
    .maybeSingle();
  if (error) {
    if (/duplicate key|unique/i.test(error.message)) {
      res.status(409).json({ error: "Slug already exists — pick another slug or title." });
      return;
    }
    const missing = /profile_achievement_definitions|relation|does not exist|schema cache/i.test(error.message);
    res.status(missing ? 503 : 500).json({
      error: missing ? "Run supabase/profile_achievements.sql." : error.message,
    });
    return;
  }
  res.status(201).json({ definition: row });
});

app.patch("/admin/profile-achievement-definitions/:id", requireAuth, requireAdmin, async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id < 1) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const body = req.body ?? {};
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("title" in body && typeof body.title === "string") patch.title = body.title.trim().slice(0, 120);
  if ("description" in body && typeof body.description === "string") {
    patch.description = body.description.trim().slice(0, 600);
  }
  if ("tier" in body) {
    const t = parseAchievementTier(body.tier);
    if (!t) {
      res.status(400).json({
        error:
          "tier must be silver, cyan, emerald, violet, rose, gold, crimson, or mythic (run profile_achievement_tiers_expand.sql if the DB rejects new tiers).",
      });
      return;
    }
    patch.tier = t;
  }
  if ("sort_order" in body) {
    const n = Number(body.sort_order);
    if (Number.isFinite(n)) patch.sort_order = Math.trunc(n);
  }
  if ("active" in body) patch.active = Boolean(body.active);
  const { data, error } = await supabase
    .from("profile_achievement_definitions")
    .update(patch)
    .eq("id", id)
    .select("id, slug, title, description, tier, sort_order, active, created_at, updated_at")
    .maybeSingle();
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "Definition not found" });
    return;
  }
  res.json({ definition: data });
});

app.get("/admin/profile-achievement-grants", requireAuth, requireAdmin, async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const qUid = req.query.user_id ?? req.query.target_user_id;
  const uid =
    typeof qUid === "string" && qUid.trim() !== ""
      ? parseInt(qUid, 10)
      : typeof qUid === "number"
        ? qUid
        : NaN;
  let userId = Number.isFinite(uid) ? Math.trunc(uid) : NaN;
  const qName = typeof req.query.username === "string" ? req.query.username.trim() : "";
  if (!Number.isFinite(userId)) {
    if (!qName) {
      res.status(400).json({ error: "Provide user_id or username query parameter" });
      return;
    }
    const { data: ur, error: uerr } = await supabase
      .from("users")
      .select("id")
      .ilike("username", qName)
      .limit(1)
      .maybeSingle();
    if (uerr || !ur) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    userId = Number((ur as { id: number }).id);
  }

  const { data: grants, error: gerr } = await supabase
    .from("profile_achievement_grants")
    .select("id, achievement_id, granted_at")
    .eq("user_id", userId)
    .order("granted_at", { ascending: false });
  if (gerr) {
    const missing = /profile_achievement_grants|relation|does not exist|schema cache/i.test(gerr.message);
    res.status(missing ? 503 : 500).json({
      error: missing ? "Run supabase/profile_achievements.sql." : gerr.message,
    });
    return;
  }

  const gRows = (grants ?? []) as { id: number; achievement_id: number; granted_at: string }[];
  const ids = [...new Set(gRows.map((g) => g.achievement_id))];
  if (ids.length === 0) {
    res.json({ user_id: userId, grants: [] });
    return;
  }

  const { data: defs, error: derr } = await supabase
    .from("profile_achievement_definitions")
    .select("id, slug, title, tier, active, sort_order")
    .in("id", ids);
  if (derr) {
    res.status(500).json({ error: derr.message });
    return;
  }
  type DefGrantJoin = {
    id: number;
    slug: string;
    title: string;
    tier: string;
    active: boolean;
    sort_order: number;
  };
  const defById = new Map(((defs ?? []) as DefGrantJoin[]).map((d) => [d.id, d]));
  const sortedGrants = gRows.slice().sort((ga, gb) => {
    const da = defById.get(ga.achievement_id);
    const db = defById.get(gb.achievement_id);
    const tr = achievementTierRank(da?.tier ?? "") - achievementTierRank(db?.tier ?? "");
    if (tr !== 0) return tr;
    const so = (da?.sort_order ?? 0) - (db?.sort_order ?? 0);
    if (so !== 0) return so;
    return String(da?.title ?? "").localeCompare(String(db?.title ?? ""));
  });
  res.json({
    user_id: userId,
    grants: sortedGrants.map((g) => {
      const d = defById.get(g.achievement_id);
      return {
        grant_id: g.id,
        achievement_id: g.achievement_id,
        granted_at: g.granted_at,
        slug: d?.slug ?? "",
        title: d?.title ?? "(deleted badge)",
        tier: d?.tier ?? "cyan",
        definition_active: d?.active ?? false,
      };
    }),
  });
});

app.post("/admin/profile-achievement-grants", requireAuth, requireAdmin, async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const staff = res.locals.user!;
  const body = req.body ?? {};
  let userId =
    typeof body.target_user_id === "number"
      ? body.target_user_id
      : typeof body.user_id === "number"
        ? body.user_id
        : NaN;
  const sid = typeof body.target_user_id === "string" ? body.target_user_id : typeof body.user_id === "string" ? body.user_id : "";
  if (!Number.isFinite(userId) && sid) userId = parseInt(String(sid), 10);

  const uname =
    typeof body.username === "string"
      ? body.username.trim()
      : typeof body.target_username === "string"
        ? body.target_username.trim()
        : "";
  if (!Number.isFinite(userId) && uname) {
    const { data: ur } = await supabase.from("users").select("id").ilike("username", uname).limit(1).maybeSingle();
    if (ur) userId = Number((ur as { id: number }).id);
  }
  if (!Number.isFinite(userId) || userId < 1) {
    res.status(400).json({ error: "target user: provide target_user_id, user_id (number), or username" });
    return;
  }

  let achievementId =
    typeof body.achievement_id === "number"
      ? body.achievement_id
      : typeof body.achievement_definition_id === "number"
        ? body.achievement_definition_id
        : NaN;
  const aidRaw = typeof body.achievement_id === "string" ? body.achievement_id : "";
  if (!Number.isFinite(achievementId) && aidRaw) achievementId = parseInt(aidRaw, 10);
  const slug = typeof body.slug === "string" ? normalizeAchievementSlug(body.slug) : "";
  if (!Number.isFinite(achievementId)) {
    if (!slug) {
      res.status(400).json({ error: "Provide achievement_id or slug" });
      return;
    }
    const { data: def } = await supabase
      .from("profile_achievement_definitions")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!def) {
      res.status(404).json({ error: "Achievement definition not found for slug" });
      return;
    }
    achievementId = Number((def as { id: number }).id);
  }

  const { data: exists } = await supabase
    .from("profile_achievement_definitions")
    .select("id, active")
    .eq("id", achievementId)
    .maybeSingle();
  if (!exists) {
    res.status(404).json({ error: "Achievement definition not found" });
    return;
  }
  const defActive = (exists as { active?: boolean }).active !== false;
  if (!defActive) {
    res.status(400).json({ error: "Badge type is hidden — activate it before granting." });
    return;
  }
  const { error: insErr } = await supabase.from("profile_achievement_grants").insert({
    user_id: userId,
    achievement_id: achievementId,
    granted_by: staff.userId,
  });
  if (insErr) {
    if (/duplicate key|unique/i.test(insErr.message)) {
      res.status(409).json({ error: "User already has this badge." });
      return;
    }
    res.status(500).json({ error: insErr.message });
    return;
  }

  const { data: urow } = await supabase.from("users").select("username").eq("id", userId).maybeSingle();
  const un = String((urow as { username?: string } | null)?.username ?? "").trim();
  if (!un) {
    res.json({ ok: true, granted: true, user_id: userId, achievement_id: achievementId });
    return;
  }
  try {
    const profile = await fetchPublicProfileByUsername(
      supabase,
      un,
      readMinecraftRoleField,
      pvpTierFromElo,
      cobbleStore.leaderboard
    );
    res.status(201).json({ ok: true, profile });
  } catch {
    res.status(201).json({ ok: true });
  }
});

app.delete("/admin/profile-achievement-grants/:grantId", requireAuth, requireAdmin, async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const grantId = parseInt(String(req.params.grantId ?? ""), 10);
  if (!Number.isFinite(grantId) || grantId < 1) {
    res.status(400).json({ error: "Invalid grant id" });
    return;
  }
  const { data: gr, error: findErr } = await supabase
    .from("profile_achievement_grants")
    .select("user_id")
    .eq("id", grantId)
    .maybeSingle();
  if (findErr || !gr) {
    res.status(findErr ? 500 : 404).json({ error: findErr?.message ?? "Grant not found" });
    return;
  }
  const targetUserId = Number((gr as { user_id: number }).user_id);
  const { error: delErr } = await supabase.from("profile_achievement_grants").delete().eq("id", grantId);
  if (delErr) {
    res.status(500).json({ error: delErr.message });
    return;
  }
  const { data: urow } = await supabase.from("users").select("username").eq("id", targetUserId).maybeSingle();
  const un = String((urow as { username?: string } | null)?.username ?? "").trim();
  if (!un) {
    res.json({ ok: true });
    return;
  }
  try {
    const profile = await fetchPublicProfileByUsername(
      supabase,
      un,
      readMinecraftRoleField,
      pvpTierFromElo,
      cobbleStore.leaderboard
    );
    res.json({ ok: true, profile });
  } catch {
    res.json({ ok: true });
  }
});

app.get("/admin/minecraft-roles", requireAuth, requireAdmin, (_req, res) => {
  res.json({ keys: listAllKnownRoleKeys() });
});

app.get("/admin/cobble-ranked/feed", requireAuth, requireAdmin, async (req, res) => {
  const limit = parseRankedFeedLimit(req.query.limit);
  const rawMatches = (cobbleStore.matchResults as unknown[]).slice(0, limit);
  const rawReplays = (cobbleStore.battleReplays as unknown[]).slice(0, limit);

  const matches = rawMatches.map((item) => {
    const key = stableRankedFeedItemKey("match_result", item);
    return {
      key,
      needsAttention: rankedFeedNeedsAttention("match_result", item),
      attentionReasons: rankedFeedAttentionReasons("match_result", item),
      item,
    };
  });
  const replays = rawReplays.map((item) => {
    const key = stableRankedFeedItemKey("battle_replay", item);
    return {
      key,
      needsAttention: rankedFeedNeedsAttention("battle_replay", item),
      attentionReasons: rankedFeedAttentionReasons("battle_replay", item),
      item,
    };
  });

  const keys = [...matches.map((m) => m.key), ...replays.map((r) => r.key)];
  let reviewedKeys: string[] = [];
  if (supabase && keys.length > 0) {
    try {
      const set = await fetchReviewedKeySet(supabase, keys);
      reviewedKeys = [...set];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[admin/cobble-ranked/feed] reviewed keys:", msg);
    }
  }

  res.json({ matches, replays, reviewedKeys });
});

app.delete("/admin/cobble-ranked/feed", requireAuth, requireAdmin, async (req, res) => {
  const staff = res.locals.user!;
  try {
    const { matchCount, replayCount } = await clearCobbleRankedFeed(cobbleStore as CobbleRankedMemoryStore);
    void insertRankedBattleStaffEvent({
      staffUserId: staff.userId,
      eventKind: "feed_clear",
      staffReason: `Cleared ${matchCount} match result(s) and ${replayCount} battle replay(s) from the feed.`,
    });
    res.json({ ok: true, matchCount, replayCount });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

app.get("/admin/ranked-battle/staff-history", requireAuth, requireAdmin, async (req, res) => {
  const raw = typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : 100;
  const limit = Number.isFinite(raw) && raw > 0 ? raw : 100;
  const out = await listRankedBattleStaffEvents(limit);
  if (!out.ok) {
    const missing = /Run supabase/i.test(out.error);
    res.status(missing ? 503 : 500).json({ error: out.error });
    return;
  }
  res.json({ events: out.events });
});

app.post("/admin/cobble-ranked/review", requireAuth, requireAdmin, async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const staff = res.locals.user!;
  const body = req.body ?? {};
  const itemKey = typeof body.item_key === "string" ? body.item_key.trim() : "";
  const feedKind: RankedFeedKind =
    body.feed_kind === "battle_replay" ? "battle_replay" : "match_result";
  const reviewed = Boolean(body.reviewed);
  if (!itemKey) {
    res.status(400).json({ error: "item_key required" });
    return;
  }
  try {
    await upsertFeedReview(supabase, {
      itemKey,
      feedKind,
      reviewed,
      reviewedByUserId: staff.userId,
    });
    void insertRankedBattleStaffEvent({
      staffUserId: staff.userId,
      eventKind: "feed_review",
      reviewItemKey: itemKey,
      reviewFeedKind: feedKind,
      reviewReviewed: reviewed,
    });
    res.json({ ok: true, item_key: itemKey, reviewed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

/** Review one or more feed items together (single staff log), e.g. match result + battle replay for same matchId. */
app.post("/admin/cobble-ranked/review-bundle", requireAuth, requireAdmin, async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const staff = res.locals.user!;
  const body = req.body ?? {};
  const reviewed = Boolean(body.reviewed);
  const rawEntries = body.entries;
  if (!Array.isArray(rawEntries) || rawEntries.length < 1 || rawEntries.length > 4) {
    res.status(400).json({ error: "entries must be a non-empty array (max 4)" });
    return;
  }
  const entries: { itemKey: string; feedKind: RankedFeedKind }[] = [];
  for (const row of rawEntries) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const ik = typeof o.item_key === "string" ? o.item_key.trim() : "";
    const fk = o.feed_kind === "battle_replay" ? "battle_replay" : "match_result";
    if (!ik) continue;
    entries.push({ itemKey: ik, feedKind: fk });
  }
  if (entries.length === 0) {
    res.status(400).json({ error: "No valid entries (item_key + feed_kind)" });
    return;
  }
  try {
    await upsertFeedReviewBundle(supabase, entries, reviewed, staff.userId);
    const kinds = [...new Set(entries.map((e) => e.feedKind))].join("+");
    const keysShort = entries
      .map((e) => e.itemKey)
      .join(" · ")
      .slice(0, 900);
    void insertRankedBattleStaffEvent({
      staffUserId: staff.userId,
      eventKind: "feed_review",
      reviewItemKey: keysShort,
      reviewFeedKind: kinds,
      reviewReviewed: reviewed,
      staffReason: entries.length > 1 ? `Bundle (${entries.length} items)` : null,
    });
    res.json({ ok: true, reviewed, count: entries.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

app.post("/admin/minecraft/rankedadmin-elo", requireAuth, requireAdmin, async (req, res) => {
  const body = req.body ?? {};
  const action = body.action === "remove" ? "remove" : "add";
  const amount = Number(body.amount);
  const minecraftUsername = typeof body.minecraft_username === "string" ? body.minecraft_username.trim() : "";
  const fmtIn = typeof body.format === "string" ? body.format.trim().toLowerCase() : "singles";
  const format: RankedFormatArg = fmtIn === "doubles" ? "doubles" : "singles";
  const reasonRaw = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!minecraftUsername) {
    res.status(400).json({ error: "minecraft_username required" });
    return;
  }
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
    res.status(400).json({ error: "amount must be a positive whole number" });
    return;
  }
  const maxAmt = 10_000;
  if (amount > maxAmt) {
    res.status(400).json({ error: `amount must be at most ${maxAmt}` });
    return;
  }
  const maxReason = 4000;
  if (!reasonRaw) {
    res.status(400).json({ error: "reason is required (explain the decision for audit and Discord)." });
    return;
  }
  if (reasonRaw.length > maxReason) {
    res.status(400).json({ error: `reason must be at most ${maxReason} characters` });
    return;
  }

  const adminId = res.locals.user?.userId;
  if (!adminId) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const resolved = await resolveOptionalWebsiteUserIdForMinecraftUsername(minecraftUsername, body.user_id);
  if (!resolved.ok) {
    res.status(400).json({ error: resolved.error });
    return;
  }

  const exec = await runRankedAdminEloRcon(action, amount, minecraftUsername, format);
  const eventKind = action === "add" ? "elo_add" : "elo_remove";
  const errText = exec.ok ? null : (exec.error ?? "").slice(0, 2000);
  void insertRankedBattleStaffEvent({
    staffUserId: adminId,
    eventKind,
    minecraftUsername,
    eloAmount: amount,
    eloFormat: format,
    eloOk: exec.ok,
    eloError: errText,
    staffReason: reasonRaw,
  });

  if (exec.ok) {
    console.info(`[admin] ranked elo ${action} ${amount} ${minecraftUsername} ${format}: ok`);
    void (async () => {
      if (!DISCORD_RANKED_ELO_WEBHOOK_URL) {
        console.warn("[Discord] DISCORD_RANKED_ELO_WEBHOOK_URL missing; ranked elo not announced");
        return;
      }
      const staffName = await resolveDiscordUsername(adminId);
      const title = action === "add" ? "Ranked ELO added" : "Ranked ELO removed";
      const color = action === "add" ? 0x22c55e : 0xf43f5e;
      await notifyDiscordEmbed(
        {
          title,
          color,
          fields: [
            { name: "Player", value: clampDiscordText(minecraftUsername, 256), inline: true },
            { name: "Amount", value: String(amount), inline: true },
            { name: "Format", value: format, inline: true },
            { name: "Staff", value: clampDiscordText(staffName, 256), inline: false },
            { name: "Reason", value: clampDiscordText(reasonRaw, 1024), inline: false },
          ],
          timestamp: new Date().toISOString(),
        },
        DISCORD_RANKED_ELO_WEBHOOK_URL
      );
    })().catch((e) => console.warn("[Discord] ranked elo notify:", e instanceof Error ? e.message : e));
    res.json({ ok: true });
    return;
  }
  console.warn(`[admin] ranked elo failed`, exec.error);
  res.json({ ok: false, error: exec.error ?? "Could not update ELO on the server." });
});

function parseBooleanGrant(body: Record<string, unknown>, field: "grant" | "enable"): boolean | null {
  const v = body[field];
  if (v === true || v === "true") return true;
  if (v === false || v === "false") return false;
  return null;
}

async function resolveOptionalWebsiteUserIdForMinecraftUsername(
  minecraftUsername: string,
  userIdRaw: unknown
): Promise<{ ok: true; websiteUserId: number | null } | { ok: false; error: string }> {
  if (userIdRaw === undefined || userIdRaw === null || userIdRaw === "") {
    return { ok: true, websiteUserId: null };
  }
  const uid =
    typeof userIdRaw === "number" && Number.isFinite(userIdRaw)
      ? Math.trunc(userIdRaw)
      : parseInt(String(userIdRaw), 10);
  if (!Number.isFinite(uid) || uid < 1) return { ok: false, error: "Invalid user_id" };
  if (!supabase) return { ok: false, error: "Database not configured" };
  const { data: u, error } = await supabase
    .from("users")
    .select("id, username")
    .eq("id", uid)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!u) return { ok: false, error: "user_id not found" };
  const uname = String((u as { username: string }).username).trim();
  if (uname.toLowerCase() !== minecraftUsername.trim().toLowerCase()) {
    return {
      ok: false,
      error: "user_id must be the website account whose username matches the Minecraft IGN",
    };
  }
  return { ok: true, websiteUserId: uid };
}

app.get("/admin/minecraft/battlepass-grants", requireAuth, requireAdmin, async (req, res) => {
  const k = typeof req.query.kind === "string" ? req.query.kind.trim().toLowerCase() : "";
  if (k !== "premium" && k !== "party") {
    res.status(400).json({ error: "kind must be premium or party" });
    return;
  }
  const out = await listActiveBattlePassGrants(k);
  if (!out.ok) {
    const missing = /Run supabase/i.test(out.error);
    res.status(missing ? 503 : 500).json({ error: out.error });
    return;
  }
  res.json({ grants: out.grants });
});

app.post("/admin/minecraft/battlepass-premium", requireAuth, requireAdmin, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const minecraft_username =
    typeof body.minecraft_username === "string" ? body.minecraft_username.trim() : "";
  const grant = parseBooleanGrant(body, "grant") ?? parseBooleanGrant(body, "enable");
  if (grant === null) {
    res.status(400).json({ error: "grant (or enable) must be explicitly true or false" });
    return;
  }
  if (!minecraft_username) {
    res.status(400).json({ error: "minecraft_username required" });
    return;
  }
  const adminId = res.locals.user?.userId;
  if (!adminId) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const resolved = await resolveOptionalWebsiteUserIdForMinecraftUsername(minecraft_username, body.user_id);
  if (!resolved.ok) {
    res.status(400).json({ error: resolved.error });
    return;
  }
  const exec = await runBattlePassLuckpermsCommand("premium", minecraft_username, grant);
  if (exec.ok) {
    console.info(`[admin] battlepass premium ${grant ? "grant" : "revoke"} ${minecraft_username}: ok`);
    const mirror = await persistBattlePassGrantMirror({
      kind: "premium",
      minecraftUsername: minecraft_username,
      grant,
      websiteUserId: resolved.websiteUserId,
      grantedByUserId: adminId,
    });
    if (!mirror.ok) {
      console.error("[admin] battlepass premium DB mirror failed", mirror.error);
    }
    res.json({
      ok: true,
      command: exec.command,
      output: exec.output,
      dbPersisted: mirror.ok,
    });
    return;
  }
  if (!exec.command) {
    res.status(400).json({ error: exec.error });
    return;
  }
  console.warn("[admin] battlepass premium failed", exec.command, exec.error);
  res.json({ ok: false, command: exec.command, error: exec.error });
});

app.post("/admin/minecraft/battlepass-party", requireAuth, requireAdmin, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const minecraft_username =
    typeof body.minecraft_username === "string" ? body.minecraft_username.trim() : "";
  const grant = parseBooleanGrant(body, "grant") ?? parseBooleanGrant(body, "enable");
  if (grant === null) {
    res.status(400).json({ error: "grant (or enable) must be explicitly true or false" });
    return;
  }
  if (!minecraft_username) {
    res.status(400).json({ error: "minecraft_username required" });
    return;
  }
  const adminId = res.locals.user?.userId;
  if (!adminId) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const resolved = await resolveOptionalWebsiteUserIdForMinecraftUsername(minecraft_username, body.user_id);
  if (!resolved.ok) {
    res.status(400).json({ error: resolved.error });
    return;
  }
  const exec = await runBattlePassLuckpermsCommand("party", minecraft_username, grant);
  if (exec.ok) {
    console.info(`[admin] battlepass party ${grant ? "grant" : "revoke"} ${minecraft_username}: ok`);
    const mirror = await persistBattlePassGrantMirror({
      kind: "party",
      minecraftUsername: minecraft_username,
      grant,
      websiteUserId: resolved.websiteUserId,
      grantedByUserId: adminId,
    });
    if (!mirror.ok) {
      console.error("[admin] battlepass party DB mirror failed", mirror.error);
    }
    res.json({
      ok: true,
      command: exec.command,
      output: exec.output,
      dbPersisted: mirror.ok,
    });
    return;
  }
  if (!exec.command) {
    res.status(400).json({ error: exec.error });
    return;
  }
  console.warn("[admin] battlepass party failed", exec.command, exec.error);
  res.json({ ok: false, command: exec.command, error: exec.error });
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
  if (hasUsername && typeof patch.username === "string" && patch.username !== row.username) {
    void syncBattlePassGrantsForWebsiteUser(userId, patch.username);
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
  /** Ladder tab(s) processed this run (comma-separated if multiple). */
  format: string;
  ladderResults: Array<{
    format: string;
    alreadyProcessed: boolean;
    paid: Array<{
      rank: number;
      username: string;
      amount: number;
      tickets?: number;
      ticket_error?: string;
    }>;
    skipped: Array<{ rank: number; username: string; reason: string }>;
    predictions: { settled: number; wins: number };
  }>;
  paid: Array<{
    rank: number;
    username: string;
    amount: number;
    format?: string;
    tickets?: number;
    ticket_error?: string;
  }>;
  skipped: Array<{ rank: number; username: string; reason: string; format?: string }>;
  predictions: { settled: number; wins: number };
}> {
  if (!supabase) {
    throw new Error("Database not configured");
  }
  const payload = cobbleStore.leaderboard;
  const formatKeys = listLeaderboardPvpFormatKeys(payload);
  const targets: Array<{ formatKey: string; rows: PvpLeaderboardRow[] }> = [];
  if (formatKeys.length > 0) {
    for (const fk of formatKeys) {
      const rows = rankedPvpRowsForFormatKey(payload, fk);
      if (rows.length) targets.push({ formatKey: rows[0]!.formatKey, rows });
    }
  } else {
    const rawRows = extractPvpRowsFromLeaderboardPayload(payload);
    const rows = filterPvpRowsWithPlayedMatchesAndRerank(rawRows);
    if (rows.length) targets.push({ formatKey: rows[0]!.formatKey, rows });
  }

  if (targets.length === 0) {
    const rawRows = extractPvpRowsFromLeaderboardPayload(payload);
    if (!rawRows.length) {
      throw new Error("Leaderboard is empty. Sync /leaderboard first.");
    }
    throw new Error(
      "No PvP leaderboard players have matches > 0 in the synced payload. Top-3 payouts only include players who played at least one ranked match."
    );
  }

  const payoutDate = localDateOnly(new Date(), DAILY_RESET_TIMEZONE);
  const { data: users, error: usersErr } = await supabase.from("users").select("id, username");
  if (usersErr) {
    throw new Error(usersErr.message);
  }
  const byUsername = new Map<string, { id: number }>();
  for (const u of (users ?? []) as { id: number; username: string }[]) {
    byUsername.set(normalizeName(u.username), { id: u.id });
  }

  type PaidRow = {
    rank: number;
    username: string;
    amount: number;
    format?: string;
    tickets?: number;
    ticket_error?: string;
  };
  type SkippedRow = { rank: number; username: string; reason: string; format?: string };
  const ladderResults: Array<{
    format: string;
    alreadyProcessed: boolean;
    paid: PaidRow[];
    skipped: SkippedRow[];
    predictions: { settled: number; wins: number };
  }> = [];
  let anyNewPayout = false;

  for (const { formatKey, rows } of targets) {
    const { data: existing } = await supabase
      .from("user_pvp_daily_payouts")
      .select("id")
      .eq("payout_date", payoutDate)
      .eq("format_key", formatKey);
    if ((existing?.length ?? 0) > 0) {
      ladderResults.push({
        format: formatKey,
        alreadyProcessed: true,
        paid: [],
        skipped: [],
        predictions: { settled: 0, wins: 0 },
      });
      continue;
    }
    anyNewPayout = true;

    /** Same moment as daily login & rank rewards: calendar date = payoutDate at 00:00 Asia/Ho_Chi_Minh. */
    const predictions = { settled: 0, wins: 0 };
    const paid: PaidRow[] = [];
    const skipped: SkippedRow[] = [];
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
        skipped.push({
          rank,
          username: row.playerName,
          reason: "No matching website username",
          format: formatKey,
        });
        continue;
      }
      const ticketBonus = PVP_DAILY_TICKETS_BY_RANK[rank] ?? 0;
      await incrementUserCurrency(user.id, COBBLEDOLLARS_CURRENCY, amount, {
        kind: "pvp_rank_daily",
        detail: `Rank ${rank} — ${row.formatKey} (daily job)`,
      });
      let note: string | null = null;
      let payoutStatus: "success" | "partial" = "success";
      let ticketError: string | undefined;
      if (ticketBonus > 0) {
        await ensureUserTicketsWalletRow(user.id);
        try {
          await incrementUserCurrency(user.id, PVP_TICKETS_CURRENCY, ticketBonus, {
            kind: "pvp_rank_daily",
            detail: `Rank ${rank} — tickets (daily job)`,
          });
          note = `+${ticketBonus} website normal ticket(s) (${PVP_TICKETS_CURRENCY})`;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          ticketError = msg;
          payoutStatus = "partial";
          console.error(`[pvp-daily-payout] Cobble$ paid but tickets failed (rank ${rank}, user ${user.id}):`, msg);
          note = `Cobble$ OK. Ticket grant failed: ${msg}. Staff can grant ${ticketBonus} ${PVP_TICKETS_CURRENCY} manually.`;
        }
      }
      await supabase.from("user_pvp_daily_payouts").insert({
        payout_date: payoutDate,
        format_key: row.formatKey,
        rank_position: rank,
        minecraft_username: row.playerName,
        user_id: user.id,
        amount,
        ticket_bonus: ticketBonus,
        status: payoutStatus,
        note,
        paid_at: now,
        claimed_at: now,
        updated_at: now,
      });
      paid.push({
        rank,
        username: row.playerName,
        amount,
        format: formatKey,
        ...(ticketBonus > 0 && !ticketError ? { tickets: ticketBonus } : {}),
        ...(ticketError ? { ticket_error: ticketError } : {}),
      });
    }
    ladderResults.push({
      format: formatKey,
      alreadyProcessed: false,
      paid,
      skipped,
      predictions,
    });
  }

  if (!anyNewPayout) {
    throw new Error(`Daily payout already processed for ${payoutDate} (all ladders).`);
  }

  const paid = ladderResults.flatMap((r) => r.paid);
  const skipped = ladderResults.flatMap((r) => r.skipped);
  const predictions = ladderResults.reduce(
    (acc, r) => ({
      settled: acc.settled + r.predictions.settled,
      wins: acc.wins + r.predictions.wins,
    }),
    { settled: 0, wins: 0 }
  );
  const formatLabel = targets.map((t) => t.formatKey).join(",");

  return { payoutDate, format: formatLabel, ladderResults, paid, skipped, predictions };
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

app.post("/admin/minecraft/boss-spawn/run-now", requireAuth, requireAdmin, async (_req, res) => {
  try {
    await runBossSpawnCycleNow();
    res.json({
      ok: true,
      warningDelayMs: BOSS_SPAWN_WARNING_DELAY_MS,
      warningCommands: BOSS_SPAWN_WARNING_COMMANDS.length,
      spawnCommands: BOSS_SPAWN_COMMANDS.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/already running/i.test(msg)) {
      res.status(409).json({ error: msg });
      return;
    }
    res.status(500).json({ error: msg });
  }
});

app.post("/admin/pokemon-shop/refresh", requireAuth, requireAdmin, async (_req, res) => {
  const { start, end } = forcePokemonShopWindowRefresh();
  const windowStartIso = start.toISOString();
  const offers = buildPokemonShopOffers(windowStartIso);
  notifyPokemonShopRefreshIfNeeded(windowStartIso, offers);
  res.json({
    ok: true,
    windowStart: windowStartIso,
    windowEnd: end.toISOString(),
    refreshHours: POKEMON_SHOP_REFRESH_HOURS,
    offers: offers.map((o) => ({
      slot: o.slot,
      category: o.category,
      species: o.species,
      shiny: o.shiny,
      listPrice: o.price,
      label: o.label,
    })),
  });
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
    } else if (TICKET_LEDGER_CURRENCIES.has(currencyTypeStr)) {
      await recordTicketCurrencyLedger(
        userId,
        currencyTypeStr,
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
    } else if (TICKET_LEDGER_CURRENCIES.has(currencyTypeStr)) {
      await recordTicketCurrencyLedger(
        userId,
        currencyTypeStr,
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

/** Grant website ticket currencies (exchange types + normal tickets) to many users. Ticket ledger mirrors single admin grant. */
app.post("/admin/tickets/bulk-grant", requireAuth, requireAdmin, async (req, res) => {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured" });
    return;
  }
  const staff = res.locals.user!;
  const body = req.body ?? {};
  const rawIds = body.user_ids;
  const amount = body.amount;
  const currencyTypeStr =
    typeof body.currency_type === "string" ? body.currency_type.trim() : "";
  const note =
    typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";

  if (!BULK_ADMIN_TICKET_CURRENCIES.includes(currencyTypeStr)) {
    res.status(400).json({
      error: "Invalid currency_type for bulk ticket grant",
      allowed: [...BULK_ADMIN_TICKET_CURRENCIES],
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
  const maxPerUser = 1_000_000;
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
  const ledgerDetail =
    note.length > 0
      ? `Staff: ${staff.username} (bulk: ${note})`
      : `Staff: ${staff.username} (bulk)`;
  const failures: Array<{ user_id: number; error: string }> = [];
  let granted = 0;
  for (const userId of userIds) {
    try {
      await incrementUserCurrency(userId, currencyTypeStr, amount, {
        kind: "admin_grant",
        detail: ledgerDetail,
      });
      granted += 1;
      console.info(
        `[admin] bulk tickets +${amount} ${currencyTypeStr} user ${userId} by ${staff.username}${detailNote}`
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
    currency_type: currencyTypeStr,
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

app.delete("/admin/users/:userId/history", requireAuth, requireAdmin, async (req, res) => {
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
    .from("user_gacha_pulls")
    .delete()
    .eq("user_id", userId)
    .select("id");
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  const deleted = Array.isArray(data) ? data.length : 0;
  res.json({ ok: true, deleted });
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
        `[pvp-daily-auto] paid date=${result.payoutDate} formats=${result.format} paid=${result.paid.length} skipped=${result.skipped.length}`
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

const BOSS_SPAWN_WARNING_COMMANDS = [
  "title @a title {\"text\":\"\\u2694 BOSSES SPAWN IN 1' \\u2694\",\"color\":\"red\",\"bold\":true}",
  "title @a subtitle {\"text\":\"A mysterious boss will appear in the Raid Area! Use /raid\",\"color\":\"gold\"}",
] as const;
const BOSS_SPAWN_COMMANDS = [
  "execute in minecraft:overworld run crd spawnboss 3096 223 1217 minecraft:overworld random false false false",
  "execute in minecraft:overworld run crd spawnboss 3093 227 1188 minecraft:overworld random false false false",
  "execute in minecraft:overworld run crd spawnboss 3093 227 1287 minecraft:overworld random false false false",
] as const;
const BOSS_SPAWN_WARNING_DELAY_MS = 60_000;
let bossSpawnCycleInProgress = false;

async function runBossSpawnCycleNow(): Promise<void> {
  if (bossSpawnCycleInProgress) {
    throw new Error("Boss spawn cycle is already running");
  }
  bossSpawnCycleInProgress = true;
  try {
    for (const command of BOSS_SPAWN_WARNING_COMMANDS) {
      const exec = await executeMinecraftRconCommand(command);
      if (!exec.ok) {
        console.warn(`[boss-spawn-cron] warning command failed: ${command} :: ${exec.error}`);
      } else {
        console.log(`[boss-spawn-cron] warning command ok: ${command}`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, BOSS_SPAWN_WARNING_DELAY_MS));
    for (const command of BOSS_SPAWN_COMMANDS) {
      const exec = await executeMinecraftRconCommand(command);
      if (!exec.ok) {
        console.warn(`[boss-spawn-cron] spawn command failed: ${command} :: ${exec.error}`);
      } else {
        console.log(`[boss-spawn-cron] spawn command ok: ${command}`);
      }
    }
  } finally {
    bossSpawnCycleInProgress = false;
  }
}

function startBossSpawnCronScheduler(): void {
  const cronExpr = (process.env.MC_BOSS_SPAWN_CRON ?? "").trim();
  if (!cronExpr) return;
  if (!cron.validate(cronExpr)) {
    console.warn(`[boss-spawn-cron] invalid MC_BOSS_SPAWN_CRON="${cronExpr}"`);
    return;
  }
  const tzRaw = (process.env.MC_BOSS_SPAWN_CRON_TIMEZONE ?? DAILY_RESET_TIMEZONE).trim();
  const timezone = tzRaw || DAILY_RESET_TIMEZONE;

  const runBossSpawnCycle = async () => {
    if (bossSpawnCycleInProgress) {
      console.warn("[boss-spawn-cron] skipped trigger because previous cycle is still running");
      return;
    }
    await runBossSpawnCycleNow();
  };

  cron.schedule(
    cronExpr,
    () => {
      void runBossSpawnCycle();
    },
    { timezone }
  );
  console.log(
    `[boss-spawn-cron] started cron="${cronExpr}" timezone="${timezone}" warning_commands=${BOSS_SPAWN_WARNING_COMMANDS.length} spawn_commands=${BOSS_SPAWN_COMMANDS.length} delay_ms=${BOSS_SPAWN_WARNING_DELAY_MS}`
  );
  if (process.env.MC_BOSS_SPAWN_CRON_RUN_ON_BOOT === "true") {
    void runBossSpawnCycle();
  }
}

registerTournamentPredictionRoutes(app, {
  requireAuth,
  requireAdmin,
  ensureUserCobbledollarsRow,
  recordCobbledollarLedger,
  notifyDiscordTournamentPredictionStake,
});

registerClanRoutes(app, {
  requireAuth,
  ensureUserCobbledollarsRow,
  recordCobbledollarLedger,
  incrementUserCurrency,
  ensureUserTicketsWalletRow,
  cobbledollarsCurrency: COBBLEDOLLARS_CURRENCY,
  ticketsCurrency: PVP_TICKETS_CURRENCY,
  getLiveLeaderboard: () => cobbleStore.leaderboard,
});

registerAdminClanRoutes(app, {
  requireAuth,
  requireAdmin,
  getLiveLeaderboard: () => cobbleStore.leaderboard,
});

registerPokerRoutes(app, { requireAuth });

const httpServer = createServer(app);

attachPokerWebSocket(httpServer, {
  cobbledollarsCurrency: COBBLEDOLLARS_CURRENCY,
  ensureUserCobbledollarsRow,
  recordCobbledollarLedger,
  incrementUserCurrency,
});

httpServer.listen(port, () => {
  console.log(`Backend http://localhost:${port}`);
  if (supabase) {
    void Promise.all([
      hydrateCobbleRankedStore(cobbleStore as CobbleRankedMemoryStore, COBBLE_RANKED_FEED_MAX),
      hydrateLeaderboardDisplaySettings(),
    ]).then(() => {
      if (cobbleStore.leaderboard) void syncWebsitePvpRanksFromLeaderboard(cobbleStore.leaderboard);
    });
  }
  startDailyPvpAutoPayoutScheduler();
  startBossSpawnCronScheduler();
  startClanDailyIncomeScheduler({
    requireAuth,
    ensureUserCobbledollarsRow,
    recordCobbledollarLedger,
    incrementUserCurrency,
    ensureUserTicketsWalletRow,
    cobbledollarsCurrency: COBBLEDOLLARS_CURRENCY,
    ticketsCurrency: PVP_TICKETS_CURRENCY,
    getLiveLeaderboard: () => cobbleStore.leaderboard,
  });
});
