import { executeMinecraftRconCommand } from "./minecraftRconExecute.js";
import { isValidMinecraftIgn } from "./minecraftFacilityAdmin.js";

export { isValidMinecraftIgn };

/**
 * Reset / revoke Discord ↔ Minecraft link state for a player (AsteryAccess).
 * RCON has no leading slash: `asteryaccess admin reset-unclaimed <player>`
 */
export function buildAsteryAccessResetUnclaimedCommand(minecraftUsername: string): string {
  const user = minecraftUsername.trim();
  const tpl = process.env.MC_ASTERYACCESS_RESET_UNCLAIMED_TEMPLATE?.trim();
  if (tpl) return tpl.replaceAll("{user}", user);
  return `asteryaccess admin reset-unclaimed ${user}`;
}

export async function runAsteryAccessResetUnclaimedRcon(
  minecraftUsername: string
): Promise<{ ok: true; output: string; command: string } | { ok: false; error: string; command: string }> {
  const command = buildAsteryAccessResetUnclaimedCommand(minecraftUsername);
  const res = await executeMinecraftRconCommand(command);
  if (res.ok) return { ok: true, output: res.output, command };
  return { ok: false, error: res.error, command };
}
