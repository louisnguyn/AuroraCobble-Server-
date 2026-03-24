/**
 * Roster merge: server whitelist (RCON) + website users + MC_EXTRA_ROSTER_NAMES.
 * Online/offline vs live list from fetchMinecraftServerPayload().onlinePlayerNames
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type PlayerWithStatus = {
  name: string;
  status: "online" | "offline";
};

function parseExtraRosterFromEnv(): Map<string, string> {
  const map = new Map<string, string>();
  const raw = process.env.MC_EXTRA_ROSTER_NAMES?.trim();
  if (!raw) return map;
  for (const part of raw.split(",")) {
    const name = part.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!map.has(key)) map.set(key, name);
  }
  return map;
}

export function mergeRosterMaps(primary: Map<string, string>, fill: Map<string, string>): Map<string, string> {
  const out = new Map(primary);
  for (const [k, v] of fill) {
    if (!out.has(k)) out.set(k, v);
  }
  return out;
}

export async function fetchRosterFromUsers(supabase: SupabaseClient | null): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!supabase) return map;

  const { data, error } = await supabase.from("users").select("username");
  if (error || !data) return map;

  for (const row of data as { username?: string }[]) {
    const name = typeof row.username === "string" ? row.username.trim() : "";
    if (!name) continue;
    const key = name.toLowerCase();
    if (!map.has(key)) map.set(key, name);
  }
  return map;
}

export function mergeOnlineWithRoster(
  online: { name: string }[],
  roster: Map<string, string>
): { players: PlayerWithStatus[]; accountCount: number; extraEnvCount: number } {
  const onlineKeys = new Set(online.map((p) => p.name.toLowerCase()));
  const extra = parseExtraRosterFromEnv();
  const extraEnvCount = extra.size;
  const fullRoster = mergeRosterMaps(roster, extra);
  const accountCount = fullRoster.size;

  const players: PlayerWithStatus[] = [];

  for (const p of online) {
    const key = p.name.toLowerCase();
    const display = fullRoster.get(key) ?? p.name;
    players.push({ name: display, status: "online" });
  }

  for (const [key, display] of fullRoster) {
    if (!onlineKeys.has(key)) {
      players.push({ name: display, status: "offline" });
    }
  }

  players.sort((a, b) => {
    if (a.status !== b.status) return a.status === "online" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  return { players, accountCount, extraEnvCount };
}
