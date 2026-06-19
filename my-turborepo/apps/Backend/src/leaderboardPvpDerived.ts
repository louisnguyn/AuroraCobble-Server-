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

function readNumericField(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = parseInt(v.trim(), 10);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
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
  const direct = readNumericField(raw);
  if (direct != null) return direct;
  const wins = readNumericField(p.wins ?? p.win ?? p.w ?? p.victories);
  const losses = readNumericField(p.losses ?? p.loss ?? p.l ?? p.defeats);
  if (wins != null || losses != null) return Math.max(0, (wins ?? 0) + (losses ?? 0));
  return undefined;
}

export function normalizePvpMatchCount(matches: number | undefined): number {
  return typeof matches === "number" && Number.isFinite(matches) ? Math.max(0, Math.trunc(matches)) : 0;
}

/** Ranked ladder row = at least one completed match (0 matches / unset = unranked). */
export function isPvpLadderRowRanked(row: Pick<PvpLeaderboardRow, "matches">): boolean {
  return normalizePvpMatchCount(row.matches) > 0;
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
  const played = rows.filter(isPvpLadderRowRanked).sort((a, b) => a.rank - b.rank);
  return played.map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Raw ladder row for a website IGN (before matches filter), singles then doubles. */
export function rawPvpRowForWebsiteUser(
  payload: unknown,
  ign: string,
  options?: { preferredFormat?: "singles" | "doubles" }
): PvpLeaderboardRow | null {
  const want = normalizePvpIgName(ign);
  if (!want) return null;
  for (const pref of ["singles", "doubles"] as const) {
    const rows = extractPvpRowsFromLeaderboardPayload(payload, { preferredFormat: pref });
    const mine = rows.find((r) => normalizePvpIgName(r.playerName) === want);
    if (mine) return mine;
  }
  return null;
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

/** Default ELO for website users not on the ranked ladder (clan averages, etc.). */
export const UNRANKED_ELO_DEFAULT = 1000;

/**
 * Highest ELO across singles and doubles for a ranked website IGN on the live ladder.
 * Returns null when the player has no ranked matches (0 matches / not on ladder).
 */
export function bestEloForWebsiteUserFromLeaderboard(payload: unknown, ign: string): number | null {
  const want = normalizePvpIgName(ign);
  if (!want) return null;
  let best: number | null = null;
  for (const pref of ["singles", "doubles"] as const) {
    const rows = rankedPvpRowsForWebsiteRewards(payload, pref);
    const mine = rows.find((r) => normalizePvpIgName(r.playerName) === want);
    if (mine?.elo != null && Number.isFinite(mine.elo)) {
      const e = Math.trunc(mine.elo);
      best = best == null ? e : Math.max(best, e);
    }
  }
  return best;
}

/** Display / fallback ELO when unranked (starting rating before any match). */
export function displayEloForWebsiteUserFromLeaderboard(payload: unknown, ign: string): number {
  return bestEloForWebsiteUserFromLeaderboard(payload, ign) ?? UNRANKED_ELO_DEFAULT;
}

/**
 * Singles first (matches rewards + default leaderboard tab), then doubles — same row matching as site Leaderboard IGN.
 * @deprecated Prefer {@link bestEloForWebsiteUserFromLeaderboard} when you need max(singles, doubles) ELO.
 */
export function livePvpSnapFromLeaderboardForWebsiteUser(payload: unknown, ign: string): {
  rank: number;
  elo: number | null;
  formatKey: string;
  matches: number;
  /** Name as it appears on the CobbleRanked ladder (casing may differ from website username). */
  ladderPlayerName: string;
} | null {
  const want = normalizePvpIgName(ign);
  if (!want) return null;
  for (const pref of ["singles", "doubles"] as const) {
    const rows = rankedPvpRowsForWebsiteRewards(payload, pref);
    const mine = rows.find((r) => normalizePvpIgName(r.playerName) === want);
    if (mine && isPvpLadderRowRanked(mine)) {
      const raw = rawPvpRowForWebsiteUser(payload, ign, { preferredFormat: pref });
      if (raw && !isPvpLadderRowRanked(raw)) return null;
      return {
        rank: mine.rank,
        elo: mine.elo,
        formatKey: mine.formatKey,
        matches: normalizePvpMatchCount(mine.matches),
        ladderPlayerName: mine.playerName,
      };
    }
  }
  return null;
}
