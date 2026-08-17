import { RCON } from "minecraft-server-util";
import { explainRconConnectionError, getTcpPortDiagnostics } from "./minecraftRconHelpers.js";
import {
  isEmptyEconomyLeaderboardText,
  parseCobbledollarsLeaderboardOutput,
  rconTextPreview,
  type CobbledollarsRconResult,
} from "./minecraftRconCobbledollars.js";

/**
 * In-game Asteryn Point board via RCON (`asterynpoint leaderboard`).
 * Chat looks like:
 *   ====== ASTERYN POINT TOP 20 ======
 *   #1 PlayerName - 1 AsterynPoints
 *
 * Env:
 * - MC_ASTERYNPOINT_DISABLE=true — return empty map
 * - MC_ASTERYNPOINT_LEADERBOARD_COMMAND — default `asterynpoint leaderboard`
 */
export async function fetchAsterynPointLeaderboardViaRcon(): Promise<CobbledollarsRconResult> {
  if (process.env.MC_ASTERYNPOINT_DISABLE === "true") {
    return { balances: new Map() };
  }

  const password = process.env.MC_RCON_PASSWORD?.trim();
  if (!password) {
    return { balances: new Map(), error: "MC_RCON_PASSWORD not set" };
  }

  const host =
    process.env.MC_RCON_HOST?.trim() || process.env.MC_SERVER_HOST?.trim();
  if (!host) {
    return { balances: new Map(), error: "MC_SERVER_HOST / MC_RCON_HOST not set" };
  }

  const port = parseInt(process.env.MC_RCON_PORT ?? "25575", 10);
  const timeout = Math.min(
    Math.max(parseInt(process.env.MC_RCON_TIMEOUT_MS ?? "12000", 10) || 12000, 3000),
    90000
  );

  const primary =
    process.env.MC_ASTERYNPOINT_LEADERBOARD_COMMAND?.trim() || "asterynpoint leaderboard";

  const rcon = new RCON();
  try {
    await rcon.connect(host, port);
    await rcon.login(password, { timeout });

    let out = await rcon.execute(primary);
    let balances = parseCobbledollarsLeaderboardOutput(out);

    if (balances.size === 0 && !isEmptyEconomyLeaderboardText(out)) {
      const alts = [
        "/asterynpoint leaderboard",
        "asterynpoint leaderboardprint",
        "/asterynpoint leaderboardprint",
      ] as const;
      for (const cmd of alts) {
        if (cmd === primary) continue;
        const altOut = await rcon.execute(cmd);
        const b = parseCobbledollarsLeaderboardOutput(altOut);
        if (b.size > 0 || isEmptyEconomyLeaderboardText(altOut)) {
          balances = b;
          out = altOut;
          break;
        }
        if (rconTextPreview(altOut).length > rconTextPreview(out).length) out = altOut;
      }
    }

    rcon.close();
    if (balances.size > 0) return { balances };
    if (isEmptyEconomyLeaderboardText(out)) return { balances };

    const preview = rconTextPreview(out);
    if (!preview || /command (ran|executed) successfully|done\.?$/i.test(preview)) {
      return { balances };
    }
    return {
      balances,
      error: `Could not parse Asteryn Point leaderboard from RCON: ${preview}`,
    };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    console.warn("[MC RCON] asterynpoint leaderboard:", raw);
    try {
      rcon.close();
    } catch {
      /* ignore */
    }
    const tcpDiag = await getTcpPortDiagnostics(host, port).catch(() => "");
    return {
      balances: new Map(),
      error: explainRconConnectionError(raw, host, port) + (tcpDiag ? ` |${tcpDiag}` : ""),
    };
  }
}
