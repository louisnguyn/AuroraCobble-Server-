/**
 * Move Cobble$ from the website wallet into the Minecraft server via RCON.
 * Command is configurable — set MC_COBBLEDOLLARS_DEPOSIT_COMMAND_TEMPLATE to match your mod
 * (default assumes a CobbleDollars-style command without a leading slash).
 *
 * Placeholders: {player}, {amount}
 */
export function buildCobbledollarsDepositCommand(playerName: string, amount: number): string {
  const template =
    process.env.MC_COBBLEDOLLARS_DEPOSIT_COMMAND_TEMPLATE?.trim() ||
    "cobbledollars give {player} {amount}";
  const amountStr = String(Math.floor(amount));
  return template.replace(/\{player\}/g, playerName).replace(/\{amount\}/g, amountStr);
}

export function isCobbledollarsDepositEnabled(): boolean {
  if (process.env.MC_COBBLEDOLLARS_DEPOSIT_DISABLE === "true") return false;
  const host =
    process.env.MC_RCON_HOST?.trim() || process.env.MC_SERVER_HOST?.trim();
  const pass = process.env.MC_RCON_PASSWORD?.trim();
  return Boolean(host && pass);
}
