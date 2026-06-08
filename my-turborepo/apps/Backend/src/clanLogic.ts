/** Website clan economy rules (Cobble$). */



export const CLAN_CREATE_COST = 750_000;

export const CLAN_BASE_MAX_MEMBERS = 2;

export const CLAN_ABSOLUTE_MAX_MEMBERS = 5;

export const CLAN_DONATE_MILESTONE = 250_000;

export const CLAN_DAILY_PER_MEMBER = 50_000;

/** Daily treasury bonus for #1 on each clan leaderboard category (Asia/Ho_Chi_Minh). */
export const CLAN_LEADERBOARD_DAILY_REWARD_TOP1 = 200_000;

export type ClanLeaderboardRewardCategory = "top_donated" | "top_average_elo";

export const CLAN_LEADERBOARD_REWARD_CATEGORIES: readonly {
  key: ClanLeaderboardRewardCategory;
  label: string;
}[] = [
  { key: "top_donated", label: "Top donations" },
  { key: "top_average_elo", label: "Average ELO" },
];

export function clanLeaderboardDailyTreasuryBonus(
  rankTopDonated: number | null,
  rankTopAverageElo: number | null
): number {
  let bonus = 0;
  if (rankTopDonated === 1) bonus += CLAN_LEADERBOARD_DAILY_REWARD_TOP1;
  if (rankTopAverageElo === 1) bonus += CLAN_LEADERBOARD_DAILY_REWARD_TOP1;
  return bonus;
}



export type ClanDonationMilestoneDef = {

  key: string;

  threshold: number;

  label: string;

  kind: "income" | "tickets";

};



/** Ordered donation unlocks (member slots use {@link CLAN_DONATE_MILESTONE} separately). */

export const CLAN_DONATION_MILESTONES: readonly ClanDonationMilestoneDef[] = [

  { key: "income_25", threshold: 1_000_000, label: "+25% daily income", kind: "income" },

  { key: "tickets_1", threshold: 1_250_000, label: "+1 ticket/member/day", kind: "tickets" },

  { key: "income_50", threshold: 1_500_000, label: "+50% daily income", kind: "income" },

  { key: "tickets_2", threshold: 2_000_000, label: "+2 tickets/member/day", kind: "tickets" },

  { key: "income_100", threshold: 2_500_000, label: "+100% daily income", kind: "income" },

  { key: "income_150", threshold: 3_000_000, label: "+150% daily income", kind: "income" },

];



const CLAN_INCOME_MULTIPLIER_TIERS: readonly { threshold: number; multiplier: number }[] = [

  { threshold: 3_000_000, multiplier: 2.5 },

  { threshold: 2_500_000, multiplier: 2 },

  { threshold: 1_500_000, multiplier: 1.5 },

  { threshold: 1_000_000, multiplier: 1.25 },

];



const CLAN_TICKET_TIERS: readonly { threshold: number; ticketsPerDay: number }[] = [

  { threshold: 2_000_000, ticketsPerDay: 2 },

  { threshold: 1_250_000, ticketsPerDay: 1 },

];



export function clanMaxMembersFromTotalDonated(totalDonated: number): number {

  const extra = Math.floor(Math.max(0, totalDonated) / CLAN_DONATE_MILESTONE);

  return Math.min(CLAN_ABSOLUTE_MAX_MEMBERS, CLAN_BASE_MAX_MEMBERS + extra);

}



export function clanDailyIncomeMultiplier(totalDonated: number): number {

  for (const tier of CLAN_INCOME_MULTIPLIER_TIERS) {

    if (totalDonated >= tier.threshold) return tier.multiplier;

  }

  return 1;

}



export function clanDailyBankIncome(memberCount: number, totalDonated: number): number {

  const mc = Math.max(0, Math.floor(memberCount));

  const mult = clanDailyIncomeMultiplier(totalDonated);

  return Math.floor(mc * CLAN_DAILY_PER_MEMBER * mult);

}



export function clanDailyTicketBonus(totalDonated: number): number {

  for (const tier of CLAN_TICKET_TIERS) {

    if (totalDonated >= tier.threshold) return tier.ticketsPerDay;

  }

  return 0;

}



export function clanHasDailyTicketBonus(totalDonated: number): boolean {

  return clanDailyTicketBonus(totalDonated) > 0;

}



export function nextMemberUnlockDonation(totalDonated: number, currentMax: number): number | null {

  if (currentMax >= CLAN_ABSOLUTE_MAX_MEMBERS) return null;

  const needed = (currentMax - CLAN_BASE_MAX_MEMBERS + 1) * CLAN_DONATE_MILESTONE;

  return Math.max(0, needed - totalDonated);

}



/** Minimum wait after leaving before joining another clan. */

export const CLAN_REJOIN_COOLDOWN_MS = 24 * 60 * 60 * 1000;



export function clanRejoinAvailableAt(leftAt: Date): Date {

  return new Date(leftAt.getTime() + CLAN_REJOIN_COOLDOWN_MS);

}



export function isClanRejoinBlocked(leftAt: Date | null, now: Date = new Date()): boolean {

  if (!leftAt) return false;

  return now.getTime() < clanRejoinAvailableAt(leftAt).getTime();

}


