import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayerWithStatus } from "./minecraftRoster.js";

export type EnrichedPlayer = PlayerWithStatus & {
  streakDays: number;
  /** ISO timestamp of last time we saw them online */
  lastSeenOnline: string | null;
  /** Seconds offline since last online; null when online or never seen online */
  offlineSeconds: number | null;
};

type PresenceRow = {
  player_key: string;
  display_name: string;
  last_seen_online: string | null;
  streak_days: number;
  streak_last_date: string | null;
};

function utcDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDaysUtc(isoDate: string, delta: number): string {
  const parts = isoDate.split("-").map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const dt = new Date(Date.UTC(y, m - 1, day));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

/**
 * Updates DB rows and returns streak + offline duration per player.
 * Streak uses UTC dates: increments when online on consecutive days; resets when offline and they missed a day.
 */
export async function syncAndEnrichPresence(
  supabase: SupabaseClient | null,
  players: PlayerWithStatus[],
  now: Date = new Date()
): Promise<{ players: EnrichedPlayer[]; presenceTracking: boolean }> {
  const empty = (): EnrichedPlayer[] =>
    players.map((p) => ({
      ...p,
      streakDays: 0,
      lastSeenOnline: null,
      offlineSeconds: null,
    }));

  if (!supabase || players.length === 0) {
    return { players: empty(), presenceTracking: false };
  }

  const keys = [...new Set(players.map((p) => p.name.toLowerCase()))];

  const { data: existingRows, error: fetchErr } = await supabase
    .from("minecraft_player_presence")
    .select("player_key, display_name, last_seen_online, streak_days, streak_last_date")
    .in("player_key", keys);

  if (fetchErr) {
    console.warn("[minecraft presence] table missing or fetch failed:", fetchErr.message);
    return { players: empty(), presenceTracking: false };
  }

  const map = new Map<string, PresenceRow>(
    (existingRows as PresenceRow[] | null)?.map((r) => [r.player_key, r]) ?? []
  );

  const today = utcDateOnly(now);
  const yesterday = addDaysUtc(today, -1);

  const upserts: Array<{
    player_key: string;
    display_name: string;
    last_seen_online: string | null;
    streak_days: number;
    streak_last_date: string | null;
    updated_at: string;
  }> = [];

  const enriched: EnrichedPlayer[] = [];

  for (const p of players) {
    const key = p.name.toLowerCase();
    const row = map.get(key);
    const prevLastSeen = row?.last_seen_online ? new Date(String(row.last_seen_online)) : null;

    let streakDays = row?.streak_days ?? 0;
    let streakLastDate = row?.streak_last_date ?? null;

    if (p.status === "online") {
      if (streakLastDate === today) {
        // already counted today
      } else if (streakLastDate === yesterday) {
        streakDays = (row?.streak_days ?? 0) + 1;
      } else {
        streakDays = 1;
      }
      streakLastDate = today;
    } else {
      if (!streakLastDate) {
        streakDays = 0;
      } else if (streakLastDate < yesterday) {
        streakDays = 0;
      }
    }

    const newLastSeenIso = p.status === "online" ? now.toISOString() : prevLastSeen?.toISOString() ?? null;

    upserts.push({
      player_key: key,
      display_name: p.name,
      last_seen_online: newLastSeenIso,
      streak_days: streakDays,
      streak_last_date: streakLastDate,
      updated_at: now.toISOString(),
    });

    if (p.status === "online") {
      enriched.push({
        ...p,
        streakDays,
        lastSeenOnline: now.toISOString(),
        offlineSeconds: null,
      });
    } else {
      const offlineSeconds =
        prevLastSeen && prevLastSeen.getTime() <= now.getTime()
          ? Math.floor((now.getTime() - prevLastSeen.getTime()) / 1000)
          : null;
      enriched.push({
        ...p,
        streakDays,
        lastSeenOnline: prevLastSeen?.toISOString() ?? null,
        offlineSeconds,
      });
    }
  }

  const { error: upsertErr } = await supabase.from("minecraft_player_presence").upsert(upserts, {
    onConflict: "player_key",
  });

  if (upsertErr) {
    console.warn("[minecraft presence] upsert failed:", upsertErr.message);
    return { players: empty(), presenceTracking: false };
  }

  return { players: enriched, presenceTracking: true };
}
