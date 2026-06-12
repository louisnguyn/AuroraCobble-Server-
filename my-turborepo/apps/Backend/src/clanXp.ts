import { supabase } from "./supabase.js";
import {
  CLAN_XP_PER_LEVEL,
  clanLevelFromXp,
  clanXpFromDailyLoginStreak,
  clanXpInCurrentLevel,
} from "./clanLogic.js";

export type ClanXpGrantResult = {
  granted: number;
  totalXp: number;
  level: number;
  xpInLevel: number;
  xpPerLevel: number;
  streakDay: number;
};

function serializeClanXpState(totalXp: number, streakDay: number, granted: number): ClanXpGrantResult {
  return {
    granted,
    totalXp,
    level: clanLevelFromXp(totalXp),
    xpInLevel: clanXpInCurrentLevel(totalXp),
    xpPerLevel: CLAN_XP_PER_LEVEL,
    streakDay,
  };
}

/** Credit clan XP when a member successfully claims their daily login reward. Idempotent per member/day. */
export async function grantClanXpForDailyLoginClaim(
  userId: number,
  streakDay: number,
  claimDate: string
): Promise<ClanXpGrantResult | null> {
  if (!supabase) return null;

  const { data: member } = await supabase
    .from("clan_members")
    .select("clan_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) return null;

  const clanId = (member as { clan_id: number }).clan_id;
  const xpAmount = clanXpFromDailyLoginStreak(streakDay);

  const { error: insErr } = await supabase.from("clan_xp_grants").insert({
    clan_id: clanId,
    user_id: userId,
    claim_date: claimDate,
    streak_day: streakDay,
    xp_amount: xpAmount,
  });

  if (insErr) {
    if (/duplicate key|clan_xp_grants_pkey/i.test(insErr.message)) {
      const { data: clan } = await supabase.from("clans").select("xp").eq("id", clanId).maybeSingle();
      if (!clan) return null;
      const totalXp = Number((clan as { xp: number }).xp) || 0;
      return serializeClanXpState(totalXp, streakDay, 0);
    }
    console.warn("[clan-xp] grant insert failed:", insErr.message);
    return null;
  }

  const { data: newXpRaw, error: rpcErr } = await supabase.rpc("increment_clan_xp", {
    p_clan_id: clanId,
    p_amount: xpAmount,
  });

  if (rpcErr) {
    console.warn("[clan-xp] increment failed:", rpcErr.message);
    await supabase
      .from("clan_xp_grants")
      .delete()
      .eq("clan_id", clanId)
      .eq("user_id", userId)
      .eq("claim_date", claimDate);
    return null;
  }

  const totalXp = Number(newXpRaw) || 0;
  return serializeClanXpState(totalXp, streakDay, xpAmount);
}

export type AdminClanXpGrantResult = {
  granted: number;
  totalXp: number;
  level: number;
  xpInLevel: number;
  xpPerLevel: number;
};

function serializeAdminClanXpGrant(totalXp: number, granted: number): AdminClanXpGrantResult {
  return {
    granted,
    totalXp,
    level: clanLevelFromXp(totalXp),
    xpInLevel: clanXpInCurrentLevel(totalXp),
    xpPerLevel: CLAN_XP_PER_LEVEL,
  };
}

/** Credit clan XP from an admin action. Records audit row in clan_admin_xp_grants. */
export async function grantClanXpByAdmin(
  clanId: number,
  adminUserId: number,
  xpAmount: number,
  note?: string | null
): Promise<AdminClanXpGrantResult | { error: string }> {
  if (!supabase) return { error: "Database not configured" };

  const amount = Math.floor(xpAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "XP amount must be a positive integer" };
  }

  const { data: clan } = await supabase.from("clans").select("id").eq("id", clanId).maybeSingle();
  if (!clan) return { error: "Clan not found" };

  const trimmedNote = typeof note === "string" && note.trim() ? note.trim().slice(0, 500) : null;

  const { data: auditRow, error: insErr } = await supabase
    .from("clan_admin_xp_grants")
    .insert({
      clan_id: clanId,
      admin_user_id: adminUserId,
      xp_amount: amount,
      note: trimmedNote,
    })
    .select("id")
    .maybeSingle();

  if (insErr || !auditRow) {
    console.warn("[clan-xp] admin grant insert failed:", insErr?.message);
    return { error: insErr?.message ?? "Could not record admin XP grant" };
  }

  const auditId = (auditRow as { id: number }).id;

  const { data: newXpRaw, error: rpcErr } = await supabase.rpc("increment_clan_xp", {
    p_clan_id: clanId,
    p_amount: amount,
  });

  if (rpcErr) {
    console.warn("[clan-xp] admin increment failed:", rpcErr.message);
    await supabase.from("clan_admin_xp_grants").delete().eq("id", auditId);
    return { error: rpcErr.message };
  }

  const totalXp = Number(newXpRaw) || 0;
  return serializeAdminClanXpGrant(totalXp, amount);
}
