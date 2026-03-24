import { RCON } from "minecraft-server-util";
import { explainRconConnectionError } from "./minecraftRconHelpers.js";

export function parseWhitelistListOutput(text: string): Map<string, string> {
  const map = new Map<string, string>();
  // eslint-disable-next-line no-control-regex -- strip ANSI color codes
  const raw = text.replace(/\u001b\[[0-9;]*m/g, "").trim();
  if (!raw) return map;

  if (/no whitelisted players/i.test(raw) || /there are (?:no|0) whitelisted/i.test(raw)) {
    return map;
  }

  let body = raw;
  const colonMatch = raw.match(/:\s*(.+)$/s);
  const afterColon = colonMatch?.[1]?.trim();
  if (afterColon) {
    body = afterColon;
  }

  const flat = body.replace(/\r\n/g, "\n").split("\n").join(" ");
  const segments = flat.split(/[,，]/).map((s) => s.trim()).filter(Boolean);

  for (let seg of segments) {
    seg = seg.replace(/\s+and\s+$/i, "").trim();
    if (!seg) continue;
    seg = seg.replace(/\s*\(\d+\)\s*$/, "").trim();
    if (/^there are\s+\d+/i.test(seg)) continue;

    const name = seg;
    if (name.length < 1 || name.length > 32) continue;
    const key = name.toLowerCase();
    if (!map.has(key)) map.set(key, name);
  }

  return map;
}

export async function fetchRosterFromWhitelistRcon(): Promise<Map<string, string>> {
  const password = process.env.MC_RCON_PASSWORD?.trim();
  if (!password) return new Map();

  const host =
    process.env.MC_RCON_HOST?.trim() || process.env.MC_SERVER_HOST?.trim();
  if (!host) return new Map();

  const port = parseInt(process.env.MC_RCON_PORT ?? "25575", 10);
  const timeout = Math.min(
    Math.max(parseInt(process.env.MC_RCON_TIMEOUT_MS ?? "12000", 10) || 12000, 3000),
    60000
  );

  const rcon = new RCON();
  try {
    await rcon.connect(host, port);
    await rcon.login(password, { timeout });
    const out = await rcon.execute("whitelist list");
    rcon.close();
    return parseWhitelistListOutput(out);
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    console.warn("[MC RCON] whitelist list:", explainRconConnectionError(raw, host, port));
    try {
      rcon.close();
    } catch {
      /* ignore */
    }
    return new Map();
  }
}
