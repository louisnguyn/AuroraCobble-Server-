import { executeMinecraftRconCommand } from "./minecraftRconExecute.js";

export type FacilityAdminMode = "tower" | "classic";

const FACILITY_MODES = new Set<FacilityAdminMode>(["tower", "classic"]);

/** Minecraft IGN: 2–16 [A-Za-z0-9_]. */
export function isValidMinecraftIgn(name: string): boolean {
  return /^[A-Za-z0-9_]{2,16}$/.test(name.trim());
}

export function normalizeFacilityAdminMode(mode: string): FacilityAdminMode | null {
  const m = mode.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (FACILITY_MODES.has(m as FacilityAdminMode)) return m as FacilityAdminMode;
  // Legacy aliases from older admin UI / docs
  if (m === "unlimited_tower" || m === "unlimitedtower") return "tower";
  if (m === "unlimited_factory" || m === "unlimitedfactory" || m === "factory") return "classic";
  return null;
}

/**
 * Force a win for the player's current Battle Tower challenge.
 * RCON has no leading slash: `sbf admin forcewin <player>`
 */
export function buildFacilityForceWinCommand(minecraftUsername: string): string {
  const user = minecraftUsername.trim();
  const tpl = process.env.MC_FACILITY_FORCE_WIN_TEMPLATE?.trim();
  if (tpl) return tpl.replaceAll("{user}", user);
  return `sbf admin forcewin ${user}`;
}

/**
 * Set a player's stage in tower/classic.
 * RCON: `sbf admin setstage <player> <mode> <stage>`
 * e.g. `sbf admin setstage W1ndy011 tower 38`
 */
export function buildFacilitySetStageCommand(
  minecraftUsername: string,
  stage: number,
  mode: FacilityAdminMode
): string {
  const user = minecraftUsername.trim();
  const tpl = process.env.MC_FACILITY_SETSTAGE_TEMPLATE?.trim();
  if (tpl) {
    return tpl
      .replaceAll("{user}", user)
      .replaceAll("{stage}", String(stage))
      .replaceAll("{mode}", mode);
  }
  return `sbf admin setstage ${user} ${mode} ${stage}`;
}

export async function runFacilityForceWinRcon(
  minecraftUsername: string
): Promise<{ ok: true; output: string; command: string } | { ok: false; error: string; command: string }> {
  const command = buildFacilityForceWinCommand(minecraftUsername);
  const res = await executeMinecraftRconCommand(command);
  if (res.ok) return { ok: true, output: res.output, command };
  return { ok: false, error: res.error, command };
}

export async function runFacilitySetStageRcon(
  minecraftUsername: string,
  stage: number,
  mode: FacilityAdminMode
): Promise<{ ok: true; output: string; command: string } | { ok: false; error: string; command: string }> {
  const command = buildFacilitySetStageCommand(minecraftUsername, stage, mode);
  const res = await executeMinecraftRconCommand(command);
  if (res.ok) return { ok: true, output: res.output, command };
  return { ok: false, error: res.error, command };
}
