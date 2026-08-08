/**
 * Run many RCON commands over one connection — from apps/Backend:
 *   npx tsx scripts/rcon-batch.ts <file>
 * File format: one command per line; blank lines and `#` comments ignored.
 * `\uXXXX` escapes expand to real characters, so resource-pack glyph codepoints
 * can be written readably instead of pasting invisible private-use characters.
 * Uses MC_RCON_HOST (or MC_SERVER_HOST), MC_RCON_PORT, MC_RCON_PASSWORD from .env
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { RCON } from "minecraft-server-util";
import { explainRconConnectionError } from "../src/minecraftRconHelpers.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function expandUnicodeEscapes(line: string): string {
  return line.replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex: string) =>
    String.fromCodePoint(parseInt(hex, 16))
  );
}

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: npx tsx scripts/rcon-batch.ts <commands-file>");
    process.exit(1);
  }

  const commands = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"))
    .map(expandUnicodeEscapes);

  if (commands.length === 0) {
    console.error("No commands found in file.");
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
  console.log(`Commands: ${commands.length}\n`);

  const rcon = new RCON();
  try {
    await rcon.connect(host, port);
    await rcon.login(password, { timeout });
    for (const [i, command] of commands.entries()) {
      const out = (await rcon.execute(command)).trim();
      const label = `${String(i + 1).padStart(3, " ")}/${commands.length}`;
      console.log(`${label}  ${command}\n       -> ${out === "" ? "(no response)" : out}`);
      // LuckPerms handles commands off-thread; pace them so none are dropped.
      await sleep(250);
    }
    rcon.close();
    console.log("\nDone.");
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
