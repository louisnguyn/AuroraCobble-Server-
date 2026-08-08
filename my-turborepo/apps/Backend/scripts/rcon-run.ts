/**
 * Run one arbitrary RCON command — from apps/Backend: npx tsx scripts/rcon-run.ts "<command>"
 * Uses MC_RCON_HOST (or MC_SERVER_HOST), MC_RCON_PORT, MC_RCON_PASSWORD from .env
 */
import "dotenv/config";
import { RCON } from "minecraft-server-util";
import { explainRconConnectionError } from "../src/minecraftRconHelpers.js";

async function main(): Promise<void> {
  const command = process.argv.slice(2).join(" ").trim();
  if (!command) {
    console.error('Usage: npx tsx scripts/rcon-run.ts "<command>"');
    process.exit(1);
  }

  const host = process.env.MC_RCON_HOST?.trim() || process.env.MC_SERVER_HOST?.trim();
  const port = parseInt(process.env.MC_RCON_PORT ?? "25575", 10);
  const password = process.env.MC_RCON_PASSWORD?.trim();
  const timeout = Math.max(parseInt(process.env.MC_RCON_TIMEOUT_MS ?? "12000", 10) || 12000, 3000);

  if (!host || !password) {
    console.error("Set MC_RCON_HOST / MC_SERVER_HOST and MC_RCON_PASSWORD in .env");
    process.exit(1);
  }

  console.log(`Host: ${host}:${port}`);
  console.log(`Command: ${command}\n`);

  const rcon = new RCON();
  try {
    await rcon.connect(host, port);
    await rcon.login(password, { timeout });
    const out = await rcon.execute(command);
    console.log("--- server response ---");
    console.log(out === "" ? "(empty response)" : out);
    console.log("--- end ---");
    rcon.close();
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
