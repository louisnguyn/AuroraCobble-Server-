import { executeMinecraftRconCommand } from "./minecraftRconExecute.js";

export type RankedFormatArg = "singles" | "doubles";

/**
 * RCON command has no leading slash (see executeMinecraftRconCommand).
 * Format token: default `SINGLES`/`DOUBLES`.
 * Set MC_RANKEDADMIN_ELO_FORMAT_LOWERCASE=true if your mod expects lowercase literals.
 * Optional full override: MC_RANKEDADMIN_ADDELO_TEMPLATE / MC_RANKEDADMIN_REMOVEELO_TEMPLATE
 * with placeholders {amount} {user} {format}
 */
export function buildRankedAdminEloCommand(
  action: "add" | "remove",
  amount: number,
  minecraftUsername: string,
  format: RankedFormatArg
): string {
  const user = minecraftUsername.trim();
  const fmtRaw =
    process.env.MC_RANKEDADMIN_ELO_FORMAT_LOWERCASE === "true"
      ? format.toLowerCase()
      : format.toUpperCase();

  const addTpl = process.env.MC_RANKEDADMIN_ADDELO_TEMPLATE?.trim();
  const remTpl = process.env.MC_RANKEDADMIN_REMOVEELO_TEMPLATE?.trim();

  if (action === "add" && addTpl) {
    return addTpl.replaceAll("{amount}", String(amount)).replaceAll("{user}", user).replaceAll("{format}", fmtRaw);
  }
  if (action === "remove" && remTpl) {
    return remTpl.replaceAll("{amount}", String(amount)).replaceAll("{user}", user).replaceAll("{format}", fmtRaw);
  }

  const verb = action === "add" ? "addelo" : "removeelo";
  return `rankedadmin ${verb} ${amount} ${user} ${fmtRaw}`;
}

export async function runRankedAdminEloRcon(
  action: "add" | "remove",
  amount: number,
  minecraftUsername: string,
  format: RankedFormatArg
): Promise<{ ok: true; output: string; command: string } | { ok: false; error: string; command: string }> {
  const command = buildRankedAdminEloCommand(action, amount, minecraftUsername, format);
  const res = await executeMinecraftRconCommand(command);
  if (res.ok) return { ok: true, output: res.output, command };
  return { ok: false, error: res.error, command };
}
