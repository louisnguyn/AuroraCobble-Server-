import { executeMinecraftRconCommand } from "./minecraftRconExecute.js";

/** Where the market spawns. Matches the mod's location argument (e.g. `spawn`). */
export const DEFAULT_NIGHT_MARKET_LOCATION = "spawn";

/** Longest duration an admin may open the market for, in minutes (24h). */
export const NIGHT_MARKET_MAX_MINUTES = 1440;

export function normalizeNightMarketLocation(location: string): string | null {
  const l = location.trim().toLowerCase();
  if (!l) return DEFAULT_NIGHT_MARKET_LOCATION;
  return /^[a-z0-9_]{1,32}$/.test(l) ? l : null;
}

/**
 * RCON has no leading slash: `nightmarket admin open <location> <minutes>`
 */
export function buildNightMarketOpenCommand(location: string, minutes: number): string {
  const tpl = process.env.MC_NIGHTMARKET_OPEN_TEMPLATE?.trim();
  if (tpl) {
    return tpl.replaceAll("{location}", location).replaceAll("{minutes}", String(minutes));
  }
  return `nightmarket admin open ${location} ${minutes}`;
}

/**
 * RCON has no leading slash: `nightmarket admin close <location>`
 */
export function buildNightMarketCloseCommand(location: string): string {
  const tpl = process.env.MC_NIGHTMARKET_CLOSE_TEMPLATE?.trim();
  if (tpl) return tpl.replaceAll("{location}", location);
  return `nightmarket admin close ${location}`;
}

type NightMarketResult =
  | { ok: true; output: string; command: string }
  | { ok: false; error: string; command: string };

export async function runNightMarketOpenRcon(
  location: string,
  minutes: number
): Promise<NightMarketResult> {
  const command = buildNightMarketOpenCommand(location, minutes);
  const res = await executeMinecraftRconCommand(command);
  if (res.ok) return { ok: true, output: res.output, command };
  return { ok: false, error: res.error, command };
}

export async function runNightMarketCloseRcon(location: string): Promise<NightMarketResult> {
  const command = buildNightMarketCloseCommand(location);
  const res = await executeMinecraftRconCommand(command);
  if (res.ok) return { ok: true, output: res.output, command };
  return { ok: false, error: res.error, command };
}
