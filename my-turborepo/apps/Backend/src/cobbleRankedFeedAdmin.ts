export type RankedFeedKind = "match_result" | "battle_replay";

/** Stable id for persisting admin review state (matches mirror table rows by content). */
export function stableRankedFeedItemKey(kind: RankedFeedKind, body: unknown): string {
  if (!body || typeof body !== "object") return `${kind}:invalid`;
  const o = body as Record<string, unknown>;
  const mid = typeof o.matchId === "string" ? o.matchId.trim() : "";
  const ts = typeof o.timestamp === "string" ? o.timestamp.trim() : "";
  if (mid) return `${kind}:${mid}`;
  const players = Array.isArray(o.players) ? o.players : [];
  const names = players
    .map((p) => String((p as { playerName?: string })?.playerName ?? "").trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join("|");
  const h = `${ts}|${names}`.slice(0, 400);
  return `${kind}:noid:${h}`;
}

function endReasonNeedsAttention(reason: string | undefined): boolean {
  if (!reason || typeof reason !== "string") return false;
  const r = reason.toLowerCase();
  return (
    r.includes("disconnect") ||
    r.includes("timeout") ||
    r.includes("time_out") ||
    r.includes("timed out") ||
    r.includes("forfeit") ||
    r.includes("quit")
  );
}

function turnCountUnder5(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const o = body as Record<string, unknown>;
  const tc = o.turnCount;
  if (typeof tc === "number" && Number.isFinite(tc) && tc < 5) return true;
  return false;
}

export function rankedFeedNeedsAttention(kind: RankedFeedKind, body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const o = body as { endReason?: string };
  if (endReasonNeedsAttention(o.endReason)) return true;
  if (turnCountUnder5(body)) return true;
  return false;
}

export function rankedFeedAttentionReasons(_kind: RankedFeedKind, body: unknown): string[] {
  const reasons: string[] = [];
  if (!body || typeof body !== "object") return reasons;
  const o = body as { endReason?: string };
  if (endReasonNeedsAttention(o.endReason)) {
    reasons.push(`End: ${o.endReason ?? "suspicious"}`);
  }
  if (turnCountUnder5(body)) {
    const tc = (body as { turnCount?: unknown }).turnCount;
    reasons.push(`Turns < 5 (${typeof tc === "number" ? tc : "?"})`);
  }
  return reasons;
}
