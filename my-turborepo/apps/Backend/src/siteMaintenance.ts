import { persistCobbleRankedSnapshot } from "./cobbleRankedPersistence.js";
import { supabase } from "./supabase.js";

/**
 * Website-only maintenance notice. Independent from the Minecraft maintenance
 * mod: flipping this blocks the site but leaves the game server alone.
 *
 * Served from memory so the public endpoint stays instant, mirrored to
 * Supabase so it survives a backend restart.
 */

export const SITE_MAINTENANCE_KEY = "site_maintenance";

export const SITE_MAINTENANCE_MAX_MESSAGE = 300;

export type SiteMaintenance = {
  enabled: boolean;
  message: string;
  updatedAt: string | null;
};

let cache: SiteMaintenance = { enabled: false, message: "", updatedAt: null };

function normalizeMessage(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().slice(0, SITE_MAINTENANCE_MAX_MESSAGE);
}

export function getSiteMaintenance(): SiteMaintenance {
  return { ...cache };
}

export function parseSiteMaintenanceInput(body: unknown): { enabled: boolean; message: string } | null {
  if (!body || typeof body !== "object") return null;
  const enabled = (body as { enabled?: unknown }).enabled;
  if (typeof enabled !== "boolean") return null;
  return { enabled, message: normalizeMessage((body as { message?: unknown }).message) };
}

export async function setSiteMaintenance(input: {
  enabled: boolean;
  message: string;
}): Promise<SiteMaintenance> {
  cache = {
    enabled: input.enabled,
    message: normalizeMessage(input.message),
    updatedAt: new Date().toISOString(),
  };
  await persistCobbleRankedSnapshot(SITE_MAINTENANCE_KEY, cache);
  return getSiteMaintenance();
}

export async function hydrateSiteMaintenance(): Promise<void> {
  if (!supabase) return;
  try {
    const { data, error } = await supabase
      .from("cobble_ranked_snapshots")
      .select("payload")
      .eq("snapshot_key", SITE_MAINTENANCE_KEY)
      .maybeSingle();
    if (error) throw error;
    const payload = data?.payload as Record<string, unknown> | null | undefined;
    if (payload && typeof payload.enabled === "boolean") {
      cache = {
        enabled: payload.enabled,
        message: normalizeMessage(payload.message),
        updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : null,
      };
    }
  } catch (e) {
    console.warn("[site-maintenance] hydrate failed:", e instanceof Error ? e.message : e);
  }
}
