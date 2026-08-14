import { RCON } from "minecraft-server-util";
import { explainRconConnectionError, getTcpPortDiagnostics } from "./minecraftRconHelpers.js";

function stripMinecraftFormatCodes(s: string): string {
  return s.replace(/\u00a7./g, "").replace(/§./g, "");
}

/** e.g. "2.05" + "M" → 2_050_000; plain "998" + "K" → 998_000 */
function parseMoneyAmount(main: string, suffix?: string): number | null {
  const base = parseFloat(main.replace(/,/g, ""));
  if (!Number.isFinite(base)) return null;
  const s = (suffix ?? "").toUpperCase();
  const mult = s === "K" ? 1e3 : s === "M" ? 1e6 : s === "B" ? 1e9 : 1;
  return base * mult;
}

export function rconTextPreview(text: string, max = 280): string {
  return stripMinecraftFormatCodes(text)
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * Parse CobbleDollars (or similar) leaderboard text from RCON.
 * Handles: "1. PlayerName - 1,234", "1. Player $ 2.05M", "Name: 500", §-colored lines, K/M/B suffixes.
 * RCON often concatenates chat into one line — split on rank tokens first.
 */
export function parseCobbledollarsLeaderboardOutput(text: string): Map<string, number> {
  const map = new Map<string, number>();
  // eslint-disable-next-line no-control-regex -- strip ANSI color codes
  const raw = text.replace(/\u001b\[[0-9;]*m/g, "");

  const push = (nameRaw: string, n: number) => {
    const display = nameRaw.trim();
    const key = display.toLowerCase();
    if (!key || key.length > 48 || !Number.isFinite(n)) return;
    for (const existing of map.keys()) {
      if (existing.toLowerCase() === key) return;
    }
    map.set(display, n);
  };

  const cleaned = stripMinecraftFormatCodes(raw);
  // RCON glues rows: "166K2. Name" / "PCo2. Name" / "):1. Name" / "---1. Name"
  const dollarGlobal =
    /(\d{1,3})\.\s+([A-Za-z0-9_]{1,36})\s+\$\s*([\d.,]+)\s*([KkMmBb])?/g;
  for (const m of cleaned.matchAll(dollarGlobal)) {
    if (!m[2] || m[3] == null) continue;
    const n = parseMoneyAmount(m[3], m[4]);
    if (n != null) push(m[2], n);
  }
  if (map.size > 0) return map;

  const pcoGlobal =
    /(\d{1,3})\.\s+(.+?)\s+[-–—]\s*([\d.,]+)\s*([KkMmBb])?\s*PCo\b/gi;
  for (const m of cleaned.matchAll(pcoGlobal)) {
    if (!m[2] || m[3] == null) continue;
    const name = m[2].replace(/^[-–—\s]+/, "").trim();
    if (name.length > 48) continue;
    const n = parseMoneyAmount(m[3], m[4]);
    if (n != null) push(name, n);
  }
  if (map.size > 0) return map;

  const splitRaw = cleaned.replace(/((?:PCo)|[KkMmBb]|---+|:|\))(?=\d{1,3}\.\s)/gi, "$1\n");

  for (const line of splitRaw.split(/\r?\n/)) {
    let trimmed = stripMinecraftFormatCodes(line).trim();
    if (!trimmed) continue;
    if (/^[-=─_]+$/.test(trimmed)) continue;
    if (/^cobbledollars\s+leaderboard\s*\(/i.test(trimmed)) continue;
    if (/^#{0,2}\s*leaderboard/i.test(trimmed)) continue;
    if (/^top\s+\d+\b/i.test(trimmed)) continue;
    if (/^page\s+\d/i.test(trimmed)) continue;
    if (/^---+$/i.test(trimmed)) continue;
    if (/^there (are|is)\s+no\b/i.test(trimmed)) continue;
    if (/^pco\s+top\b/i.test(trimmed)) continue;

    trimmed = trimmed
      .replace(/\s+(?:cobble\s*dollars?|\bcd\b|coins?)\s*$/i, "")
      // PCO: in-game lines look like "1. notvel0 - 50000 PCo" — unit after amount breaks $-anchored regexes
      .replace(/\s+(?:PCo|PCO|pco)\s*$/i, "")
      .trim();

    // "1. lEOALE_ig_ $ 2.05M" / "6. Erishu21 $ 998K" (CobbleDollars RCON format)
    const dollarRanked = trimmed.match(
      /^(\d+)\.\s+(.+?)\s+\$\s*([\d.,]+)\s*([KkMmBb])?\s*$/
    );
    if (dollarRanked?.[2] && dollarRanked[3] != null) {
      const name = dollarRanked[2].trim();
      const n = parseMoneyAmount(dollarRanked[3], dollarRanked[4]);
      if (name && name.length <= 36 && n != null) {
        push(name, n);
        continue;
      }
    }

    // "Name: 1,234" or "Name: 2.05M" (avoid "Unknown or incomplete command: ...")
    const colon = trimmed.match(/^([^:]+?):\s*([\d,]+(?:\.\d+)?)\s*([KkMmBb])?\s*$/);
    if (colon?.[1] && colon[2]) {
      const name = colon[1].replace(/^#?\d+\s*[.)]\s*/, "").trim();
      const n = parseMoneyAmount(colon[2], colon[3]);
      if (name && name.length <= 36 && n != null) {
        push(name, n);
        continue;
      }
    }

    // "1. Name - 500" / "1. Name - 50000 PCo" (unit stripped above; optional K/M/B before end)
    const ranked = trimmed.match(
      /^#?\d+\s*[.)]\s*(.+?)\s*[-–—|]\s*\$?([\d,]+(?:\.\d+)?)\s*([KkMmBb])?(?:\s+(?:PCo|PCO|pco))?\s*$/i
    );
    if (ranked?.[1] && ranked[2]) {
      const name = ranked[1].trim();
      const n = parseMoneyAmount(ranked[2], ranked[3]);
      if (name && name.length <= 36 && n != null) {
        push(name, n);
        continue;
      }
    }

    // "Name - 500" (single-token name)
    const plain = trimmed.match(
      /^([a-zA-Z0-9_]+)\s*[-–—|]\s*\$?([\d,]+(?:\.\d+)?)\s*([KkMmBb])?\s*$/
    );
    if (plain?.[1] && plain[2]) {
      const n = parseMoneyAmount(plain[2], plain[3]);
      if (n != null) push(plain[1], n);
      continue;
    }

    // Number at end: "1. Name - 500" or compact "… 998K"
    const numAtEnd = trimmed.match(/([\d,]+(?:\.\d+)?)\s*([KkMmBb])?\s*$/);
    if (!numAtEnd || numAtEnd.index === undefined || numAtEnd[1] == null) continue;
    const n = parseMoneyAmount(numAtEnd[1], numAtEnd[2]);
    if (n == null) continue;

    let namePart = trimmed.slice(0, numAtEnd.index).trim();
    namePart = namePart.replace(/^#?\d+\s*[.)]\s*/, "").trim();
    namePart = namePart.replace(/\s*[-–—:|]+\s*$/g, "").trim();
    if (!namePart || namePart.length > 36) continue;

    push(namePart, n);
  }

  return map;
}

/** Highest balances first (for in-game leaderboard display). Names are lowercased keys from the parser. */
export function topBalancesFromMap(
  balances: Map<string, number>,
  n: number
): { name: string; balance: number }[] {
  return [...balances.entries()]
    .filter(([, v]) => Number.isFinite(v))
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(0, n))
    .map(([name, balance]) => ({ name, balance }));
}

export type CobbledollarsRconResult = {
  balances: Map<string, number>;
  error?: string;
};

/**
 * Runs (without leading slash): cobbledollars leaderboard update, then cobbledollars leaderboard
 * Set MC_COBBLEDOLLARS_SKIP_UPDATE=true to only fetch leaderboard.
 */
export async function fetchCobbledollarsViaRcon(): Promise<CobbledollarsRconResult> {
  if (process.env.MC_COBBLEDOLLARS_DISABLE === "true") {
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

  const skipUpdate = process.env.MC_COBBLEDOLLARS_SKIP_UPDATE === "true";

  const rcon = new RCON();
  try {
    await rcon.connect(host, port);
    await rcon.login(password, { timeout });

    if (!skipUpdate) {
      await rcon.execute("cobbledollars leaderboard update");
    }
    let out = await rcon.execute("cobbledollars leaderboard");
    let balances = parseCobbledollarsLeaderboardOutput(out);

    if (balances.size === 0) {
      for (const cmd of ["/cobbledollars leaderboard", "cd leaderboard", "/cd leaderboard"] as const) {
        const alt = await rcon.execute(cmd);
        const b = parseCobbledollarsLeaderboardOutput(alt);
        if (b.size > 0) {
          balances = b;
          out = alt;
          break;
        }
        if (rconTextPreview(alt).length > rconTextPreview(out).length) out = alt;
      }
    }

    rcon.close();
    if (balances.size > 0) return { balances };

    const preview = rconTextPreview(out);
    if (!preview || /command (ran|executed) successfully|done\.?$/i.test(preview)) {
      return {
        balances,
        error:
          "RCON connected but Cobble$ leaderboard returned no player rows. Run `/cobbledollars leaderboard update` on the Minecraft server (mod only saves the board every few minutes), then refresh.",
      };
    }
    return {
      balances,
      error: `Could not parse Cobble$ leaderboard from RCON: ${preview}`,
    };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    console.warn("[MC RCON] cobbledollars:", raw);
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
