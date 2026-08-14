/**
 * One-shot: strip mbattlepass.party.create + mbattlepass.player.premium everywhere.
 * - Unset on all website LP groups
 * - Unset on every IGN in battlepass_lp_grants (active)
 * - Unset on currently online players
 * - Deactivate all active battlepass_lp_grants rows
 * - LP bulkupdate users (may need console confirm)
 *
 * From apps/Backend: npx tsx scripts/wipe-mbattlepass-lp.ts
 */
import "dotenv/config";
import { RCON } from "minecraft-server-util";
import { supabase } from "../src/supabase.js";
import {
  BATTLEPASS_LP_PARTY,
  BATTLEPASS_LP_PREMIUM,
} from "../src/minecraftBattlePassLp.js";

const GROUPS = [
  "default",
  "member",
  "player",
  "noob",
  "elite",
  "pro",
  "master",
  "hero",
  "onichan",
  "ultimate",
  "overlord",
  "god",
  "vip",
  "mvip",
  "svip",
  "uvip",
  "legend",
  "titan",
  "champion",
  "helper",
  "mod",
  "tiktok",
  "youtuber",
  "builder",
  "admin",
  "owner",
  "donator",
];

const PERMS = [BATTLEPASS_LP_PARTY, BATTLEPASS_LP_PREMIUM];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const host = process.env.MC_RCON_HOST?.trim() || process.env.MC_SERVER_HOST?.trim();
  const port = parseInt(process.env.MC_RCON_PORT ?? "25575", 10);
  const password = process.env.MC_RCON_PASSWORD?.trim();
  const timeout = Math.max(parseInt(process.env.MC_RCON_TIMEOUT_MS ?? "12000", 10) || 12000, 3000);
  if (!host || !password) {
    console.error("Missing MC_RCON_HOST / MC_RCON_PASSWORD");
    process.exit(1);
  }
  if (!supabase) {
    console.error("Supabase not configured");
    process.exit(1);
  }

  const { data: grantRows, error: gErr } = await supabase
    .from("battlepass_lp_grants")
    .select("id, minecraft_username, kind, active")
    .eq("active", true);
  if (gErr) {
    console.error("DB read failed:", gErr.message);
    process.exit(1);
  }

  const igns = new Set<string>();
  for (const row of grantRows ?? []) {
    const n = String((row as { minecraft_username?: string }).minecraft_username ?? "").trim();
    if (n) igns.add(n);
  }

  const rcon = new RCON();
  await rcon.connect(host, port);
  await rcon.login(password, { timeout });

  const run = async (cmd: string) => {
    try {
      await rcon.execute(cmd);
      console.log("OK ", cmd);
    } catch (e) {
      console.warn("FAIL", cmd, e instanceof Error ? e.message : e);
    }
    await sleep(200);
  };

  console.log(`\n=== Groups (${GROUPS.length} × ${PERMS.length}) ===`);
  for (const g of GROUPS) {
    for (const p of PERMS) {
      await run(`lp group ${g} permission unset ${p}`);
    }
  }

  console.log(`\n=== Grant IGNs from DB (${igns.size}) ===`);
  for (const u of [...igns].sort((a, b) => a.localeCompare(b))) {
    for (const p of PERMS) {
      await run(`lp user ${u} permission unset ${p}`);
    }
  }

  const listOut = await rcon.execute("list");
  console.log("\nlist:", listOut);
  const m = listOut.match(/online:\s*(.*)$/i);
  const online = (m?.[1] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  console.log(`\n=== Online (${online.length}) ===`);
  for (const u of online) {
    for (const p of PERMS) {
      await run(`lp user ${u} permission unset ${p}`);
    }
  }

  console.log("\n=== bulkupdate (confirm on console if prompted) ===");
  for (const p of PERMS) {
    await run(`lp bulkupdate users delete "permission == ${p}"`);
    await run(`lp bulkupdate groups delete "permission == ${p}"`);
    await run(`lp bulkupdate all delete "permission == ${p}"`);
  }

  rcon.close();

  const now = new Date().toISOString();
  const { error: updErr, count } = await supabase
    .from("battlepass_lp_grants")
    .update({ active: false, revoked_at: now, updated_at: now }, { count: "exact" })
    .eq("active", true);
  if (updErr) {
    console.error("DB deactivate failed:", updErr.message);
    process.exit(1);
  }
  console.log(`\n=== DB: deactivated active grants (count≈${count ?? grantRows?.length ?? "?"}) ===`);
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
