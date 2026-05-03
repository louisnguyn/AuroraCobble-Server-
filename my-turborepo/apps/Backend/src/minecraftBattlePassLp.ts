import { isLikelyMinecraftUsername } from "./gachaRewardClaim.js";
import { executeMinecraftRconCommand } from "./minecraftRconExecute.js";

/** LuckPerms node for paid battle pass perks (RCON: no leading slash). */
export const BATTLEPASS_LP_PREMIUM = "mbattlepass.player.premium";
/** LuckPerms node for creating battle pass parties. */
export const BATTLEPASS_LP_PARTY = "mbattlepass.party.create";

export type BattlePassLpKind = "premium" | "party";

/**
 * Console-style LP (no `/` prefix). Matches in-game `/lp user …`.
 */
export function buildBattlePassLpCommand(kind: BattlePassLpKind, ign: string, grant: boolean): string {
  const u = ign.trim();
  if (kind === "premium") {
    return grant
      ? `lp user ${u} permission set ${BATTLEPASS_LP_PREMIUM} true`
      : `lp user ${u} permission unset ${BATTLEPASS_LP_PREMIUM}`;
  }
  return grant
    ? `lp user ${u} permission set ${BATTLEPASS_LP_PARTY} true`
    : `lp user ${u} permission unset ${BATTLEPASS_LP_PARTY}`;
}

export async function runBattlePassLuckpermsCommand(
  kind: BattlePassLpKind,
  minecraftUsername: string,
  grant: boolean
): Promise<
  { ok: true; command: string; output: string } | { ok: false; command: string; error: string }
> {
  const name = minecraftUsername.trim();
  if (!name) {
    return { ok: false, command: "", error: "minecraft_username is required" };
  }
  if (!isLikelyMinecraftUsername(name)) {
    return {
      ok: false,
      command: "",
      error: "minecraft_username must be a valid Minecraft name (2–16 characters, letters, numbers, underscore only).",
    };
  }
  const command = buildBattlePassLpCommand(kind, name, grant);
  const res = await executeMinecraftRconCommand(command);
  if (res.ok) return { ok: true, command, output: res.output };
  return { ok: false, command, error: res.error };
}
