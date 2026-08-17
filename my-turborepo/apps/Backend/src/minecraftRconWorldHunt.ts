import { RCON } from "minecraft-server-util";
import { explainRconConnectionError, getTcpPortDiagnostics } from "./minecraftRconHelpers.js";
import { rconTextPreview } from "./minecraftRconCobbledollars.js";

function stripMinecraftFormatCodes(s: string): string {
  return s.replace(/\u00a7./g, "").replace(/§./g, "");
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex -- strip ANSI color codes
  return s.replace(/\u001b\[[0-9;]*m/g, "");
}

function cleanRconText(text: string): string {
  return stripAnsi(stripMinecraftFormatCodes(text)).replace(/\r/g, "");
}

export type WorldHuntLeaderboardRow = {
  rank: number;
  name: string;
  points: number;
};

export type WorldHuntLeaderboardParsed = {
  pokemon: string | null;
  shownCount: number | null;
  totalSlots: number | null;
  rows: WorldHuntLeaderboardRow[];
};

export type WorldHuntRconResult = {
  parsed: WorldHuntLeaderboardParsed;
  error?: string;
};

export function isEmptyWorldHuntLeaderboardText(text: string): boolean {
  const t = cleanRconText(text).trim();
  if (!t) return true;
  return (
    /no active hunt/i.test(t) ||
    /no hunt event/i.test(t) ||
    /no players? (yet|participating)/i.test(t) ||
    /hunt (is )?not active/i.test(t) ||
    /unknown or incomplete command/i.test(t)
  );
}

/** Parse RCON output from `hunt event` (World Hunt leaderboard). */
export function parseWorldHuntLeaderboardOutput(text: string): WorldHuntLeaderboardParsed {
  const cleaned = cleanRconText(text);
  const result: WorldHuntLeaderboardParsed = {
    pokemon: null,
    shownCount: null,
    totalSlots: null,
    rows: [],
  };

  if (isEmptyWorldHuntLeaderboardText(cleaned)) return result;

  const headerMatch = cleaned.match(
    /world\s*hunt\s*:\s*(.+?)\s*\(\s*top\s*(\d+)\s*\/\s*(\d+)\s*\)/i
  );
  if (headerMatch?.[1]) {
    result.pokemon = headerMatch[1].trim();
    result.shownCount = Number.parseInt(headerMatch[2] ?? "", 10) || null;
    result.totalSlots = Number.parseInt(headerMatch[3] ?? "", 10) || null;
  }

  const split = cleaned
    .replace(/\(\s*top\s*\d+\s*\/\s*\d+\s*\)\s*:/gi, ")\n")
    .replace(/AsterynPoints?(?=\d+\.)/gi, "AsterynPoint\n");

  const seen = new Set<number>();
  const rowRe =
    /(?:^|\n)\s*(\d{1,3})\.\s+([A-Za-z0-9_]{1,16})\s+([\d.,]+)\s*AsterynPoints?\b/gi;

  for (const m of split.matchAll(rowRe)) {
    const rank = Number.parseInt(m[1] ?? "", 10);
    const name = (m[2] ?? "").trim();
    const pointsRaw = (m[3] ?? "").replace(/,/g, "");
    const points = Number.parseFloat(pointsRaw);
    if (!Number.isFinite(rank) || rank < 1 || !name || !Number.isFinite(points)) continue;
    if (seen.has(rank)) continue;
    seen.add(rank);
    result.rows.push({ rank, name, points });
  }

  result.rows.sort((a, b) => a.rank - b.rank);
  return result;
}

/**
 * World Hunt event leaderboard via RCON (`hunt event`).
 *
 * Env:
 * - MC_WORLD_HUNT_DISABLE=true — return empty
 * - MC_WORLD_HUNT_EVENT_COMMAND — default `hunt event`
 */
export async function fetchWorldHuntLeaderboardViaRcon(): Promise<WorldHuntRconResult> {
  const empty: WorldHuntLeaderboardParsed = {
    pokemon: null,
    shownCount: null,
    totalSlots: null,
    rows: [],
  };

  if (process.env.MC_WORLD_HUNT_DISABLE === "true") {
    return { parsed: empty };
  }

  const password = process.env.MC_RCON_PASSWORD?.trim();
  if (!password) {
    return { parsed: empty, error: "MC_RCON_PASSWORD not set" };
  }

  const host =
    process.env.MC_RCON_HOST?.trim() || process.env.MC_SERVER_HOST?.trim();
  if (!host) {
    return { parsed: empty, error: "MC_SERVER_HOST / MC_RCON_HOST not set" };
  }

  const port = parseInt(process.env.MC_RCON_PORT ?? "25575", 10);
  const timeout = Math.min(
    Math.max(parseInt(process.env.MC_RCON_TIMEOUT_MS ?? "12000", 10) || 12000, 3000),
    90000
  );

  const primary = process.env.MC_WORLD_HUNT_EVENT_COMMAND?.trim() || "hunt event";

  const rcon = new RCON();
  try {
    await rcon.connect(host, port);
    await rcon.login(password, { timeout });

    let out = await rcon.execute(primary);
    let parsed = parseWorldHuntLeaderboardOutput(out);

    if (parsed.rows.length === 0 && !parsed.pokemon && !isEmptyWorldHuntLeaderboardText(out)) {
      const alts = ["/hunt event", "hunt event leaderboard", "/hunt event leaderboard"] as const;
      for (const cmd of alts) {
        if (cmd === primary) continue;
        const altOut = await rcon.execute(cmd);
        const altParsed = parseWorldHuntLeaderboardOutput(altOut);
        if (
          altParsed.rows.length > 0 ||
          altParsed.pokemon ||
          isEmptyWorldHuntLeaderboardText(altOut)
        ) {
          parsed = altParsed;
          out = altOut;
          break;
        }
        if (rconTextPreview(altOut).length > rconTextPreview(out).length) out = altOut;
      }
    }

    rcon.close();
    if (parsed.rows.length > 0 || parsed.pokemon) return { parsed };
    if (isEmptyWorldHuntLeaderboardText(out)) return { parsed };

    const preview = rconTextPreview(out);
    if (!preview || /command (ran|executed) successfully|done\.?$/i.test(preview)) {
      return { parsed };
    }
    return {
      parsed,
      error: `Could not parse World Hunt leaderboard from RCON: ${preview}`,
    };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    console.warn("[MC RCON] hunt event:", raw);
    try {
      rcon.close();
    } catch {
      /* ignore */
    }
    const tcpDiag = await getTcpPortDiagnostics(host, port).catch(() => "");
    return {
      parsed: empty,
      error: explainRconConnectionError(raw, host, port) + (tcpDiag ? ` |${tcpDiag}` : ""),
    };
  }
}
