/**
 * Credit in-game AsterynPoints onto matching website wallets, then
 * `/asterynpoint bank clear`. Prefer the Admin Leaderboard → In-game AP button.
 *
 * CLI (optional):
 *   npx tsx scripts/migrate-ingame-ap-to-website.ts
 *   npx tsx scripts/migrate-ingame-ap-to-website.ts --apply
 */
import "dotenv/config";
import { supabase } from "../src/supabase.js";
import {
  applyAsterynPointMigration,
  planAsterynPointMigration,
} from "../src/minecraftAsterynPointMigrate.js";

const APPLY = process.argv.includes("--apply");

async function main(): Promise<void> {
  if (!supabase) {
    console.error("Supabase not configured (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)");
    process.exit(1);
  }

  console.log(APPLY ? "Mode: APPLY\n" : "Mode: DRY-RUN\n");
  const plan = APPLY
    ? await applyAsterynPointMigration(supabase)
    : { ...(await planAsterynPointMigration(supabase)), applied: false, bankCleared: false, bankClearOutput: null, bankClearError: null };

  console.log("In-game board rows:", plan.boardCount);
  console.log("Matched:", plan.matched.length);
  console.log("Unmatched:", plan.unmatched.length);
  console.log("Total to credit:", plan.totalCredit, "AsterynPoints\n");
  for (const m of plan.matched) {
    const after = m.walletAfter != null ? ` (wallet now ${m.walletAfter})` : "";
    console.log(`  +${m.amount} AP  ${m.ign}  →  #${m.userId} (${m.websiteName})${after}`);
  }
  for (const u of plan.unmatched) {
    console.log(`  SKIP  ${u.ign}  ${u.amount} AP`);
  }
  if (plan.leaderboardError) console.warn("Leaderboard warning:", plan.leaderboardError);
  if ("bankClearError" in plan && plan.bankClearError) {
    console.error("bank clear failed:", plan.bankClearError);
    process.exit(1);
  }
  if ("bankClearOutput" in plan && plan.applied) {
    console.log("\nbank clear:", plan.bankClearOutput || "(empty)");
    console.log("Done.");
  } else {
    console.log("\nRe-run with --apply, or use Admin → Leaderboard → In-game AP → Convert.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
