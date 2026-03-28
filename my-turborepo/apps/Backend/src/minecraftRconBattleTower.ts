import { RCON } from "minecraft-server-util";
import { explainRconConnectionError, getTcpPortDiagnostics } from "./minecraftRconHelpers.js";

function stripMinecraftFormatCodes(s: string): string {
  return s.replace(/\u00a7./g, "").replace(/§./g, "");
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex -- strip ANSI color codes
  return s.replace(/\u001b\[[0-9;]*m/g, "");
}

export type BattleTowerLeaderboardRow = {
  rank: number;
  name: string;
  floor?: number;
  streak?: number;
  legendary?: boolean;
  detail?: string;
};

/** Strip leading medals / emoji so `#1 Name - Floor 6` can be matched. */
function stripLeadingDecorations(s: string): string {
  let t = s.trim();
  t = t.replace(/^[\uFE0F\u200D\s]+/g, "").trim();
  t = t.replace(
    /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]+/gu,
    ""
  ).trim();
  t = t.replace(/^[^\w#.,-]+/g, "").trim();
  return t;
}

function bucketRowByDetail(row: BattleTowerLeaderboardRow): "floor" | "streak" {
  const d = (row.detail ?? "").toLowerCase();
  if (/\bfloor\b/.test(d)) return "floor";
  if (/\bwins?\b/.test(d) || /\bstreak\b/.test(d)) return "streak";
  if (row.floor != null && row.streak == null) return "floor";
  if (row.streak != null && row.floor == null) return "streak";
  return "floor";
}

function partitionParsedRows(rows: BattleTowerLeaderboardRow[]): {
  floorRows: BattleTowerLeaderboardRow[];
  streakRows: BattleTowerLeaderboardRow[];
} {
  const floorRows: BattleTowerLeaderboardRow[] = [];
  const streakRows: BattleTowerLeaderboardRow[] = [];
  for (const row of rows) {
    const bucket = bucketRowByDetail(row);
    const d = row.detail ?? "";
    const winsM = d.match(/\bwins?\s*[:#]?\s*(\d+)/i);
    const winsCap = winsM?.[1];
    const wins = winsCap != null ? parseInt(winsCap, 10) : undefined;
    if (bucket === "streak") {
      streakRows.push({
        ...row,
        floor: undefined,
        streak: wins ?? row.streak,
      });
    } else {
      floorRows.push({
        ...row,
        streak: undefined,
      });
    }
  }
  const rankSort = (a: BattleTowerLeaderboardRow, b: BattleTowerLeaderboardRow) => a.rank - b.rank;
  floorRows.sort(rankSort);
  streakRows.sort(rankSort);
  return { floorRows, streakRows };
}

function splitFallbackLines(lines: string[]): {
  fallbackFloorLines: string[];
  fallbackStreakLines: string[];
} {
  const fallbackFloorLines: string[] = [];
  const fallbackStreakLines: string[] = [];
  for (const line of lines) {
    const l = line.toLowerCase();
    if (/\bfloor\b/.test(l)) fallbackFloorLines.push(line);
    else if (/\bwins?\b/.test(l) || /\bstreak\b/.test(l)) fallbackStreakLines.push(line);
    else if (/\d/.test(line)) fallbackFloorLines.push(line);
  }
  return { fallbackFloorLines, fallbackStreakLines };
}

/**
 * Parse `/bt leaderboard <mode> topN` RCON output (format varies by mod version).
 * Tries ranked lines with Minecraft IGN (2–16 [a-zA-Z0-9_]); fills floor/streak when present.
 */
export function parseBattleTowerLeaderboardOutput(text: string): {
  floorRows: BattleTowerLeaderboardRow[];
  streakRows: BattleTowerLeaderboardRow[];
  fallbackFloorLines: string[];
  fallbackStreakLines: string[];
} {
  const rows: BattleTowerLeaderboardRow[] = [];
  const fallbackLines: string[] = [];
  const raw = stripAnsi(stripMinecraftFormatCodes(text));

  for (const line of raw.split(/\r?\n/)) {
    let trimmed = line.trim();
    if (!trimmed) continue;
    if (/^unknown or incomplete command|^no such command|^wrong number of arguments/i.test(trimmed)) {
      continue;
    }
    if (/^[-=─_]+$/.test(trimmed)) continue;
    if (/^---+$/i.test(trimmed)) continue;
    if (/^#{0,2}\s*leaderboard/i.test(trimmed)) continue;
    if (/^battle\s*tower/i.test(trimmed)) continue;

    const legendary = /\(\s*[Ll]\s*\)/.test(trimmed);
    const deco = stripLeadingDecorations(trimmed);

    let m = trimmed.match(/^(\d+)\.\s+([a-zA-Z0-9_]{2,16})\b(?:\s+(.*))?$/);
    if (!m) m = trimmed.match(/^#?(\d+)\s*[.)]\s+([a-zA-Z0-9_]{2,16})\b(?:\s+(.*))?$/);
    if (!m)
      m = deco.match(/^#(\d+)\s+([a-zA-Z0-9_]{2,16})\s*[-–—]\s*(.+)$/);
    if (!m)
      m = deco.match(/^(\d+)\.\s+([a-zA-Z0-9_]{2,16})\s*[-–—]\s*(.+)$/);

    if (m?.[1] && m[2]) {
      const rank = parseInt(m[1], 10);
      const name = m[2];
      const rest = (m[3] ?? "").trim();
      const floorM =
        rest.match(/(?:floor|fl|max\s*floor)\s*[:#]?\s*(\d+)/i) ??
        rest.match(/\bf\s*[:#]?\s*(\d+)\b/i);
      const streakM =
        rest.match(/(?:streak|win\s*streak|best\s*streak)\s*[:#]?\s*(\d+)/i) ??
        rest.match(/\bwins?\s*[:#]?\s*(\d+)/i) ??
        rest.match(/\bw\s*[:#]?\s*(\d+)\b/i);
      const floorCap = floorM?.[1];
      const streakCap = streakM?.[1];
      let floor = floorCap != null ? parseInt(floorCap, 10) : undefined;
      let streak = streakCap != null ? parseInt(streakCap, 10) : undefined;
      if (floor == null && streak == null) {
        const nums = rest.match(/\b(\d{1,3})\b/g);
        if (nums?.length === 1 && nums[0] != null) {
          const n = parseInt(nums[0], 10);
          if (n >= 1 && n <= 999) floor = n;
        } else if (nums && nums.length >= 2 && nums[0] != null && nums[1] != null) {
          const a = parseInt(nums[0], 10);
          const b = parseInt(nums[1], 10);
          if (a >= 1 && a <= 200) floor = a;
          if (b >= 0 && b <= 500) streak = b;
        }
      }
      rows.push({
        rank: Number.isFinite(rank) ? rank : rows.length + 1,
        name,
        floor,
        streak,
        legendary,
        detail: rest || undefined,
      });
      continue;
    }

    if (
      /\b[a-zA-Z0-9_]{2,16}\b/.test(trimmed) &&
      /\d/.test(trimmed) &&
      trimmed.length < 160 &&
      !/^there (are|is)\s+no\b/i.test(trimmed)
    ) {
      fallbackLines.push(trimmed);
    }
  }

  rows.sort((a, b) => a.rank - b.rank);
  const { floorRows, streakRows } = partitionParsedRows(rows);
  const { fallbackFloorLines, fallbackStreakLines } = splitFallbackLines(
    fallbackLines.slice(0, 40)
  );
  return {
    floorRows,
    streakRows,
    fallbackFloorLines,
    fallbackStreakLines,
  };
}

const TOP_SET = new Set(["10", "25", "50", "100"]);

export function normalizeBattleTowerTop(top: string): "10" | "25" | "50" | "100" {
  const t = String(top).trim();
  return TOP_SET.has(t) ? (t as "10" | "25" | "50" | "100") : "10";
}

/** Modes from Cobblemon Battle Tower; RCON uses `coop` (hyphens stripped so `co-op` → `coop`). */
export function normalizeBattleTowerMode(mode: string): string {
  const m = mode.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!m) return "singles";
  return m;
}

function buildBattleTowerCommand(mode: string, top: "10" | "25" | "50" | "100"): string {
  const template =
    process.env.MC_BT_LEADERBOARD_COMMAND_TEMPLATE?.trim() ||
    "bt leaderboard {mode} top{top}";
  return template
    .replace(/\{mode\}/g, normalizeBattleTowerMode(mode))
    .replace(/\{top\}/g, top);
}

export type BattleTowerRconResult = {
  floorRows: BattleTowerLeaderboardRow[];
  streakRows: BattleTowerLeaderboardRow[];
  fallbackFloorLines: string[];
  fallbackStreakLines: string[];
  rawOutput: string;
  command: string;
  error?: string;
};

export async function fetchBattleTowerLeaderboardViaRcon(
  mode: string,
  top: "10" | "25" | "50" | "100"
): Promise<BattleTowerRconResult> {
  if (process.env.MC_BT_DISABLE === "true") {
    return {
      floorRows: [],
      streakRows: [],
      fallbackFloorLines: [],
      fallbackStreakLines: [],
      rawOutput: "",
      command: "",
    };
  }

  const password = process.env.MC_RCON_PASSWORD?.trim();
  if (!password) {
    return {
      floorRows: [],
      streakRows: [],
      fallbackFloorLines: [],
      fallbackStreakLines: [],
      rawOutput: "",
      command: "",
      error: "MC_RCON_PASSWORD not set",
    };
  }

  const host =
    process.env.MC_RCON_HOST?.trim() || process.env.MC_SERVER_HOST?.trim();
  if (!host) {
    return {
      floorRows: [],
      streakRows: [],
      fallbackFloorLines: [],
      fallbackStreakLines: [],
      rawOutput: "",
      command: "",
      error: "MC_SERVER_HOST / MC_RCON_HOST not set",
    };
  }

  const port = parseInt(process.env.MC_RCON_PORT ?? "25575", 10);
  const timeout = Math.min(
    Math.max(parseInt(process.env.MC_RCON_TIMEOUT_MS ?? "12000", 10) || 12000, 3000),
    90000
  );

  const command = buildBattleTowerCommand(mode, top);

  const rcon = new RCON();
  try {
    await rcon.connect(host, port);
    await rcon.login(password, { timeout });

    let out = await rcon.execute(command);
    if (
      /^unknown or incomplete command|^no such command|^wrong number of arguments/i.test(
        out.trim()
      ) &&
      !command.trim().startsWith("/")
    ) {
      out = await rcon.execute(`/${command.trim()}`);
    }

    rcon.close();
    const parsed = parseBattleTowerLeaderboardOutput(out);
    return { ...parsed, rawOutput: out, command };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    console.warn("[MC RCON] battle tower:", raw);
    try {
      rcon.close();
    } catch {
      /* ignore */
    }
    const tcpDiag = await getTcpPortDiagnostics(host, port).catch(() => "");
    return {
      floorRows: [],
      streakRows: [],
      fallbackFloorLines: [],
      fallbackStreakLines: [],
      rawOutput: "",
      command,
      error: explainRconConnectionError(raw, host, port) + (tcpDiag ? ` |${tcpDiag}` : ""),
    };
  }
}
