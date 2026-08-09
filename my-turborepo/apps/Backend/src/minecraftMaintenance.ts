import { executeMinecraftRconCommand } from "./minecraftRconExecute.js";

/**
 * Maintenance mod RCON (no leading slash):
 *   maintenance status | on | off | list
 *   maintenance addAllowed <player> | removeAllowed <player>
 *   maintenance setMessage <text>
 *
 * The mod owns the state, so status is always read live instead of cached.
 */

export type MaintenanceState = {
  enabled: boolean | null;
  statusRaw: string;
  allowedRaw: string;
};

/** "Maintenance Mode: Enabled" / "…: Disabled" → boolean, null when unrecognized. */
export function parseMaintenanceEnabled(output: string): boolean | null {
  const text = output.toLowerCase();
  if (/\bdisabled\b/.test(text)) return false;
  if (/\benabled\b/.test(text)) return true;
  return null;
}

export function isValidMaintenanceTarget(name: string): boolean {
  return /^[A-Za-z0-9_]{2,16}$/.test(name.trim());
}

/** Kick/MOTD text goes through as a trailing argument, so newlines would break the command. */
export function sanitizeMaintenanceMessage(message: string): string {
  return message.replace(/[\r\n]+/g, " ").trim();
}

export async function readMaintenanceState(): Promise<
  { ok: true; state: MaintenanceState } | { ok: false; error: string }
> {
  const status = await executeMinecraftRconCommand("maintenance status");
  if (!status.ok) return { ok: false, error: status.error };
  const allowed = await executeMinecraftRconCommand("maintenance list");
  return {
    ok: true,
    state: {
      enabled: parseMaintenanceEnabled(status.output),
      statusRaw: status.output.trim(),
      allowedRaw: allowed.ok ? allowed.output.trim() : "",
    },
  };
}

async function runMaintenance(
  command: string
): Promise<{ ok: true; output: string; command: string } | { ok: false; error: string; command: string }> {
  const res = await executeMinecraftRconCommand(command);
  if (res.ok) return { ok: true, output: res.output, command };
  return { ok: false, error: res.error, command };
}

export function setMaintenanceEnabledRcon(enabled: boolean) {
  return runMaintenance(enabled ? "maintenance on" : "maintenance off");
}

export function addMaintenanceAllowedRcon(player: string) {
  return runMaintenance(`maintenance addAllowed ${player.trim()}`);
}

export function removeMaintenanceAllowedRcon(player: string) {
  return runMaintenance(`maintenance removeAllowed ${player.trim()}`);
}

export function setMaintenanceMessageRcon(message: string) {
  return runMaintenance(`maintenance setMessage ${sanitizeMaintenanceMessage(message)}`);
}
