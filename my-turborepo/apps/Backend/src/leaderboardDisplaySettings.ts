import { persistCobbleRankedSnapshot } from "./cobbleRankedPersistence.js";
import { supabase } from "./supabase.js";

export const LEADERBOARD_DISPLAY_SETTINGS_KEY = "leaderboard_display_settings";

export type LeaderboardDisplayFormatId = "singles" | "doubles";

export type LeaderboardDisplaySettings = {
  hideZeroMatchPlayers: Record<LeaderboardDisplayFormatId, boolean>;
};

const DEFAULT_SETTINGS: LeaderboardDisplaySettings = {
  hideZeroMatchPlayers: { singles: true, doubles: true },
};

let cache: LeaderboardDisplaySettings = {
  hideZeroMatchPlayers: { ...DEFAULT_SETTINGS.hideZeroMatchPlayers },
};

function normalizeFormatId(raw: string): LeaderboardDisplayFormatId | null {
  const k = raw.trim().toLowerCase();
  if (k === "singles" || k === "doubles") return k;
  return null;
}

function normalizeFromPayload(payload: unknown): LeaderboardDisplaySettings | null {
  if (!payload || typeof payload !== "object") return null;
  const hide = (payload as { hideZeroMatchPlayers?: unknown }).hideZeroMatchPlayers;
  if (typeof hide === "boolean") {
    return { hideZeroMatchPlayers: { singles: hide, doubles: hide } };
  }
  if (!hide || typeof hide !== "object") return null;
  const h = hide as Record<string, unknown>;
  const singles = h.singles;
  const doubles = h.doubles;
  if (typeof singles !== "boolean" || typeof doubles !== "boolean") return null;
  return { hideZeroMatchPlayers: { singles, doubles } };
}

export function hideZeroMatchForFormat(
  settings: LeaderboardDisplaySettings,
  formatId: string
): boolean {
  const key = normalizeFormatId(formatId) ?? "singles";
  return settings.hideZeroMatchPlayers[key];
}

export function getLeaderboardDisplaySettings(): LeaderboardDisplaySettings {
  return {
    hideZeroMatchPlayers: { ...cache.hideZeroMatchPlayers },
  };
}

export function parseLeaderboardDisplaySettingsInput(
  body: unknown
): LeaderboardDisplaySettings | null {
  return normalizeFromPayload(body);
}

export async function hydrateLeaderboardDisplaySettings(): Promise<void> {
  if (!supabase) return;
  try {
    const { data, error } = await supabase
      .from("cobble_ranked_snapshots")
      .select("payload")
      .eq("snapshot_key", LEADERBOARD_DISPLAY_SETTINGS_KEY)
      .maybeSingle();
    if (error) throw error;
    const normalized = normalizeFromPayload(data?.payload);
    if (normalized) cache = normalized;
  } catch (e) {
    console.warn(
      "[leaderboard-display] hydrate failed:",
      e instanceof Error ? e.message : e
    );
  }
}

export async function persistLeaderboardDisplaySettings(
  settings: LeaderboardDisplaySettings
): Promise<void> {
  cache = {
    hideZeroMatchPlayers: {
      singles: settings.hideZeroMatchPlayers.singles,
      doubles: settings.hideZeroMatchPlayers.doubles,
    },
  };
  await persistCobbleRankedSnapshot(LEADERBOARD_DISPLAY_SETTINGS_KEY, cache);
}
