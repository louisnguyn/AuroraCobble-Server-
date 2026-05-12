/**
 * CobbleRanked /leaderboard JSON → filtered website ladder rows + live rank snapshot for profiles.
 */

export type PvpLeaderboardRow = {
  rank: number;
  playerName: string;
  elo: number | null;
  formatKey: string;
  /** Raw match count from CobbleRanked payload (website filters `matches > 0` before payouts / display parity). */
  matches?: number;
};

export function normalizePvpIgName(s: string): string {
  return s.trim().toLowerCase();
}

/** Match count from API player/entry (`matches` is what the public leaderboard uses). */
function readLeaderboardMatches(p: Record<string, unknown>): number | undefined {
  const raw =
    p.matches ??
    p.gamesPlayed ??
    p.games_played ??
    p.total_matches ??
    p.match_count ??
    p.matchCount ??
    p.matches_played ??
    p.matchesPlayed ??
    p.games;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = parseInt(raw.trim(), 10);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function mapRawPlayersToPvpRows(players: unknown[], formatKey: string): PvpLeaderboardRow[] {
  return (players as Array<{ rank?: unknown; playerName?: unknown; elo?: unknown }>)
    .map((p) => {
      const po = p as Record<string, unknown>;
      return {
        rank: Number(p.rank),
        playerName: typeof p.playerName === "string" ? p.playerName.trim() : "",
        elo: Number.isFinite(Number(p.elo)) ? Number(p.elo) : null,
        formatKey,
        matches: readLeaderboardMatches(po),
      };
    })
    .filter((row) => row.playerName && Number.isFinite(row.rank))
    .sort((a, b) => a.rank - b.rank);
}

/** Non-empty `formats` keys (any ladder tab CobbleRanked sends). */
export function listLeaderboardPvpFormatKeys(payload: unknown): string[] {
  const obj = payload as { formats?: Record<string, { players?: unknown[] }> } | null;
  const formats = obj?.formats;
  if (!formats || typeof formats !== "object") return [];
  const keys = Object.keys(formats).filter((k) => {
    const pl = formats[k]?.players;
    return Array.isArray(pl) && pl.length > 0;
  });
  return keys.sort((a, b) => {
    const pri = (s: string) => (s.toLowerCase() === "singles" ? 0 : s.toLowerCase() === "doubles" ? 1 : 2);
    const d = pri(a) - pri(b);
    return d !== 0 ? d : a.localeCompare(b);
  });
}

/** Ranked rows for one `formats[formatKey]` ladder (matches > 0, re-ranked). */
export function rankedPvpRowsForFormatKey(payload: unknown, formatKey: string): PvpLeaderboardRow[] {
  const obj = payload as { formats?: Record<string, { players?: unknown[] }> } | null;
  const players = obj?.formats?.[formatKey]?.players;
  if (!Array.isArray(players) || !players.length) return [];
  return filterPvpRowsWithPlayedMatchesAndRerank(mapRawPlayersToPvpRows(players, formatKey));
}

/** Raw rows before `matches > 0` filter. */
export function extractPvpRowsFromLeaderboardPayload(
  payload: unknown,
  options?: { preferredFormat?: "singles" | "doubles" }
): PvpLeaderboardRow[] {
  const obj = payload as { formats?: Record<string, { players?: unknown[] }>; entries?: unknown[] } | null;
  if (!obj || typeof obj !== "object") return [];

  const formats = obj.formats ?? {};
  const formatKeys = Object.keys(formats);
  const pref = options?.preferredFormat;

  let chosenKey: string | undefined;
  if (pref === "singles" || pref === "doubles") {
    chosenKey = formatKeys.find((k) => k.toLowerCase() === pref);
  } else {
    const singlesKey = formatKeys.find((k) => k.toLowerCase() === "singles");
    chosenKey = singlesKey ?? formatKeys.find((k) => Array.isArray(formats[k]?.players));
  }

  if (chosenKey) {
    const players = formats[chosenKey]?.players ?? [];
    const rows = mapRawPlayersToPvpRows(players, chosenKey);
    if (rows.length) return rows;
  }

  if (pref === "doubles") return [];

  const entries = obj.entries ?? [];
  return (entries as Array<{ rank?: unknown; name?: unknown; playerName?: unknown; elo?: unknown; rating?: unknown }>)
    .map((e) => {
      const eo = e as Record<string, unknown>;
      return {
        rank: Number(e.rank),
        playerName:
          typeof e.playerName === "string"
            ? e.playerName.trim()
            : typeof e.name === "string"
              ? e.name.trim()
              : "",
        elo: Number.isFinite(Number(e.elo)) ? Number(e.elo) : Number.isFinite(Number(e.rating)) ? Number(e.rating) : null,
        formatKey: "singles",
        matches: readLeaderboardMatches(eo),
      };
    })
    .filter((p) => p.playerName && Number.isFinite(p.rank))
    .sort((a, b) => a.rank - b.rank);
}

/** Same ordering as public Leaderboard.tsx: exclude never-played (`matches <= 0` or unset), then re-rank #1–#n. */
export function filterPvpRowsWithPlayedMatchesAndRerank(rows: PvpLeaderboardRow[]): PvpLeaderboardRow[] {
  const played = rows
    .filter((r) => typeof r.matches === "number" && Number.isFinite(r.matches) && r.matches > 0)
    .sort((a, b) => a.rank - b.rank);
  return played.map((r, i) => ({ ...r, rank: i + 1 }));
}

export function rankedPvpRowsForWebsiteRewards(
  payload: unknown,
  preferredFormat?: "singles" | "doubles"
): PvpLeaderboardRow[] {
  return filterPvpRowsWithPlayedMatchesAndRerank(
    extractPvpRowsFromLeaderboardPayload(payload, preferredFormat ? { preferredFormat } : undefined)
  );
}

export function leaderboardPayloadHasSyncedData(payload: unknown): boolean {
  if (payload == null || typeof payload !== "object") return false;
  const o = payload as { formats?: Record<string, { players?: unknown[] }>; entries?: unknown[] };
  const f = o.formats;
  if (f && typeof f === "object") {
    for (const key of Object.keys(f)) {
      const players = (f[key] as { players?: unknown[] }).players;
      if (Array.isArray(players) && players.length > 0) return true;
    }
  }
  const ent = o.entries ?? [];
  return Array.isArray(ent) && ent.length > 0;
}

/**
 * Singles first (matches rewards + default leaderboard tab), then doubles — same row matching as site Leaderboard IGN.
 */
export function livePvpSnapFromLeaderboardForWebsiteUser(payload: unknown, ign: string): {
  rank: number;
  elo: number | null;
  formatKey: string;
  /** Name as it appears on the CobbleRanked ladder (casing may differ from website username). */
  ladderPlayerName: string;
} | null {
  const want = normalizePvpIgName(ign);
  if (!want) return null;
  for (const pref of ["singles", "doubles"] as const) {
    const rows = rankedPvpRowsForWebsiteRewards(payload, pref);
    const mine = rows.find((r) => normalizePvpIgName(r.playerName) === want);
    if (mine)
      return {
        rank: mine.rank,
        elo: mine.elo,
        formatKey: mine.formatKey,
        ladderPlayerName: mine.playerName,
      };
  }
  return null;
}
