/**
 * Local RCON smoke test — run from apps/Backend: npm run test-rcon
 * Uses MC_RCON_HOST (or MC_SERVER_HOST), MC_RCON_PORT, MC_RCON_PASSWORD from .env
 */
import "dotenv/config";
import { RCON } from "minecraft-server-util";
import { explainRconConnectionError, getTcpPortDiagnostics } from "../src/minecraftRconHelpers.js";

async function main(): Promise<void> {
  const host = process.env.MC_RCON_HOST?.trim() || process.env.MC_SERVER_HOST?.trim();
  const port = parseInt(process.env.MC_RCON_PORT ?? "25575", 10);
  const password = process.env.MC_RCON_PASSWORD?.trim();
  const timeout = Math.max(parseInt(process.env.MC_RCON_TIMEOUT_MS ?? "12000", 10) || 12000, 3000);

  if (!host) {
    console.error("Set MC_RCON_HOST or MC_SERVER_HOST in .env");
    process.exit(1);
  }
  if (!password) {
    console.error("Set MC_RCON_PASSWORD in .env");
    process.exit(1);
  }

  console.log(`Trying: ${host}:${port}\n`);
  console.log("Step 1 — Raw TCP...");
  const tcp = await getTcpPortDiagnostics(host, port);
  console.log(tcp.trim());

  if (!tcp.includes("succeeded")) {
    console.log("\nTCP failed — fix port/host/firewall (see docs/MINECRAFT_RCON.md).");
    process.exit(1);
  }

  console.log("\nStep 2 — RCON login + `list`...");
  const rcon = new RCON();
  try {
    await rcon.connect(host, port);
    await rcon.login(password, { timeout });
    const out = await rcon.execute("list");
    console.log(out);
    rcon.close();
    console.log("\nOK — RCON works.");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(explainRconConnectionError(msg, host, port));
    try {
      rcon.close();
    } catch {
      /* ignore */
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
