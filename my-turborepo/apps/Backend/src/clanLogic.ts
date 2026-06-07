/** Website clan economy rules (Cobble$). */

export const CLAN_CREATE_COST = 1_000_000;
export const CLAN_BASE_MAX_MEMBERS = 2;
export const CLAN_ABSOLUTE_MAX_MEMBERS = 5;
export const CLAN_DONATE_MILESTONE = 250_000;
export const CLAN_DAILY_PER_MEMBER = 50_000;
/** +50% daily clan bank income when total donated >= this. */
export const CLAN_MULTIPLIER_THRESHOLD_50 = 1_500_000;
/** +100% daily income + 2 tickets/member/day when total donated >= this. */
export const CLAN_MULTIPLIER_THRESHOLD_100 = 2_000_000;
export const CLAN_DAILY_TICKETS_BONUS = 2;

export function clanMaxMembersFromTotalDonated(totalDonated: number): number {
  const extra = Math.floor(Math.max(0, totalDonated) / CLAN_DONATE_MILESTONE);
  return Math.min(CLAN_ABSOLUTE_MAX_MEMBERS, CLAN_BASE_MAX_MEMBERS + extra);
}

export function clanDailyIncomeMultiplier(totalDonated: number): number {
  if (totalDonated >= CLAN_MULTIPLIER_THRESHOLD_100) return 2;
  if (totalDonated >= CLAN_MULTIPLIER_THRESHOLD_50) return 1.5;
  return 1;
}

export function clanDailyBankIncome(memberCount: number, totalDonated: number): number {
  const mc = Math.max(0, Math.floor(memberCount));
  const mult = clanDailyIncomeMultiplier(totalDonated);
  return Math.floor(mc * CLAN_DAILY_PER_MEMBER * mult);
}

export function clanHasDailyTicketBonus(totalDonated: number): boolean {
  return totalDonated >= CLAN_MULTIPLIER_THRESHOLD_100;
}

export function nextMemberUnlockDonation(totalDonated: number, currentMax: number): number | null {
  if (currentMax >= CLAN_ABSOLUTE_MAX_MEMBERS) return null;
  const needed = (currentMax - CLAN_BASE_MAX_MEMBERS + 1) * CLAN_DONATE_MILESTONE;
  return Math.max(0, needed - totalDonated);
}
