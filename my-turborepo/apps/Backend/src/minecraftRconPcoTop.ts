import { RCON } from "minecraft-server-util";
import { explainRconConnectionError, getTcpPortDiagnostics } from "./minecraftRconHelpers.js";
import {
  parseCobbledollarsLeaderboardOutput,
  rconTextPreview,
  type CobbledollarsRconResult,
} from "./minecraftRconCobbledollars.js";

/**
 * Runs PCO top leaderboard via RCON (no leading slash by default).
 * Uses the same line parser as Cobble$ — adjust if your plugin prints a different format.
 *
 * Env:
 * - MC_PCO_DISABLE=true — return empty map
 * - MC_PCO_TOP_COMMAND — default `pco top`
 */
export async function fetchPcoTopViaRcon(): Promise<CobbledollarsRconResult> {
  if (process.env.MC_PCO_DISABLE === "true") {
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
    process.env.MC_PCO_TOP_COMMAND?.trim() || "pco top";

  const rcon = new RCON();
  try {
    await rcon.connect(host, port);
    await rcon.login(password, { timeout });

    let out = await rcon.execute(primary);
    let balances = parseCobbledollarsLeaderboardOutput(out);

    if (balances.size === 0) {
      const alts = ["/pco top", "pco top 10", "pco leaderboard", "/pco leaderboard"] as const;
      for (const cmd of alts) {
        if (cmd === primary) continue;
        const altOut = await rcon.execute(cmd);
        const b = parseCobbledollarsLeaderboardOutput(altOut);
        if (b.size > 0) {
          balances = b;
          out = altOut;
          break;
        }
        if (rconTextPreview(altOut).length > rconTextPreview(out).length) out = altOut;
      }
    }

    rcon.close();
    if (balances.size > 0) return { balances };

    const preview = rconTextPreview(out);
    if (!preview || /command (ran|executed) successfully|done\.?$/i.test(preview)) {
      return {
        balances,
        error:
          "RCON connected but PCO top returned no player rows. Confirm `/pco top` works in-game, or set MC_PCO_TOP_COMMAND to the exact server command.",
      };
    }
    return {
      balances,
      error: `Could not parse PCO leaderboard from RCON: ${preview}`,
    };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    console.warn("[MC RCON] pco top:", raw);
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
