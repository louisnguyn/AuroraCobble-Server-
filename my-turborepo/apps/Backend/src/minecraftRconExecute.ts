import { RCON } from "minecraft-server-util";
import { explainRconConnectionError, getTcpPortDiagnostics } from "./minecraftRconHelpers.js";

/**
 * Run a single command on the Minecraft server via RCON (no leading slash).
 */
export async function executeMinecraftRconCommand(
  command: string
): Promise<{ ok: true; output: string } | { ok: false; error: string }> {
  const password = process.env.MC_RCON_PASSWORD?.trim();
  if (!password) {
    return { ok: false, error: "MC_RCON_PASSWORD not set" };
  }
  const host =
    process.env.MC_RCON_HOST?.trim() || process.env.MC_SERVER_HOST?.trim();
  if (!host) {
    return { ok: false, error: "MC_RCON_HOST / MC_SERVER_HOST not set" };
  }
  const port = parseInt(process.env.MC_RCON_PORT ?? "25575", 10);
  const timeout = Math.min(
    Math.max(parseInt(process.env.MC_RCON_TIMEOUT_MS ?? "12000", 10) || 12000, 3000),
    90000
  );

  const rcon = new RCON();
  try {
    await rcon.connect(host, port);
    await rcon.login(password, { timeout });
    const output = await rcon.execute(command);
    rcon.close();
    return { ok: true, output: output ?? "" };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    console.warn("[MC RCON] execute:", raw);
    try {
      rcon.close();
    } catch {
      /* ignore */
    }
    const tcpDiag = await getTcpPortDiagnostics(host, port).catch(() => "");
    return {
      ok: false,
      error: explainRconConnectionError(raw, host, port) + (tcpDiag ? ` |${tcpDiag}` : ""),
    };
  }
}
