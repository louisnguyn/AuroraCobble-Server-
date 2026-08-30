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

export type StellarBattleFactoryLeaderboardRow = {
  rank: number;
  name: string;
  floor: number;
  time: string | null;
};

export type StellarBattleFactoryLeaderboardParsed = {
  mode: string | null;
  rows: StellarBattleFactoryLeaderboardRow[];
};

export type StellarBattleFactoryRconResult = {
  parsed: StellarBattleFactoryLeaderboardParsed;
  error?: string;
};

export function isEmptyStellarBattleFactoryLeaderboardText(text: string): boolean {
  const t = cleanRconText(text).trim();
  if (!t) return true;
  return (
    /unknown or incomplete command/i.test(t) ||
    /no such command/i.test(t) ||
    /no (?:players?|entries|scores)/i.test(t) ||
    /leaderboard is empty/i.test(t)
  );
}

function normalizeTime(raw: string | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t || t === "-" || t === "—" || t === "–" || /^n\/?a$/i.test(t)) return null;
  return t;
}

/**
 * Parse RCON output from `stellarbattlefactory leaderboardtext`.
 *
 * Chat looks like:
 *   Battle Factory Leaderboard [tower]
 *   #1 _KevinMC_VN - Floor: 102 | Time: -
 *   #2 beLouissis - Floor: 50 | Time: -
 */
export function parseStellarBattleFactoryLeaderboardOutput(
  text: string
): StellarBattleFactoryLeaderboardParsed {
  const result: StellarBattleFactoryLeaderboardParsed = { mode: null, rows: [] };
  const cleaned = cleanRconText(text);
  if (isEmptyStellarBattleFactoryLeaderboardText(cleaned)) return result;

  const headerMatch = cleaned.match(/battle\s*factory\s*leaderboard\s*\[\s*([^\]]+?)\s*\]/i);
  if (headerMatch?.[1]) result.mode = headerMatch[1].trim().toLowerCase();

  // RCON often glues ranks onto one line: "...Time: -#2 Name - Floor: 50"
  const split = cleaned
    .replace(/\]\s*(?=#\d)/g, "]\n")
    .replace(/(?<=\S)(?=#\d{1,3}\s+[A-Za-z0-9_])/g, "\n");

  const seen = new Set<number>();
  const rowRe =
    /#(\d{1,3})\s+([A-Za-z0-9_]{2,16})\s*[-–—]\s*Floor:\s*(\d+)\s*(?:\|\s*Time:\s*(.+?))?(?=\s*#\d|\s*$)/gi;

  for (const m of split.matchAll(rowRe)) {
    const rank = Number.parseInt(m[1] ?? "", 10);
    const name = (m[2] ?? "").trim();
    const floor = Number.parseInt(m[3] ?? "", 10);
    if (!Number.isFinite(rank) || rank < 1 || !name || !Number.isFinite(floor)) continue;
    if (seen.has(rank)) continue;
    seen.add(rank);
    result.rows.push({
      rank,
      name,
      floor,
      time: normalizeTime(m[4]),
    });
  }

  result.rows.sort((a, b) => a.rank - b.rank);
  return result;
}

/**
 * Endless Tower / Battle Factory board via RCON (`stellarbattlefactory leaderboardtext`).
 *
 * Env:
 * - MC_SBF_LEADERBOARD_DISABLE=true — return empty
 * - MC_SBF_LEADERBOARD_COMMAND — default `stellarbattlefactory leaderboardtext`
 */
export async function fetchStellarBattleFactoryLeaderboardViaRcon(): Promise<StellarBattleFactoryRconResult> {
  const empty: StellarBattleFactoryLeaderboardParsed = { mode: null, rows: [] };

  if (process.env.MC_SBF_LEADERBOARD_DISABLE === "true") {
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

  const primary =
    process.env.MC_SBF_LEADERBOARD_COMMAND?.trim() || "stellarbattlefactory leaderboardtext";

  const rcon = new RCON();
  try {
    await rcon.connect(host, port);
    await rcon.login(password, { timeout });

    let out = await rcon.execute(primary);
    let parsed = parseStellarBattleFactoryLeaderboardOutput(out);

    if (parsed.rows.length === 0 && !parsed.mode && !isEmptyStellarBattleFactoryLeaderboardText(out)) {
      const alts = [
        "/stellarbattlefactory leaderboardtext",
        "sbf leaderboardtext",
        "/sbf leaderboardtext",
      ] as const;
      for (const cmd of alts) {
        if (cmd === primary) continue;
        const altOut = await rcon.execute(cmd);
        const altParsed = parseStellarBattleFactoryLeaderboardOutput(altOut);
        if (
          altParsed.rows.length > 0 ||
          altParsed.mode ||
          isEmptyStellarBattleFactoryLeaderboardText(altOut)
        ) {
          parsed = altParsed;
          out = altOut;
          break;
        }
        if (rconTextPreview(altOut).length > rconTextPreview(out).length) out = altOut;
      }
    }

    rcon.close();
    if (parsed.rows.length > 0 || parsed.mode) return { parsed };
    if (isEmptyStellarBattleFactoryLeaderboardText(out)) return { parsed };

    const preview = rconTextPreview(out);
    if (!preview || /command (ran|executed) successfully|done\.?$/i.test(preview)) {
      return { parsed };
    }
    return {
      parsed,
      error: `Could not parse Tower leaderboard from RCON: ${preview}`,
    };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    console.warn("[MC RCON] stellarbattlefactory leaderboardtext:", raw);
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
