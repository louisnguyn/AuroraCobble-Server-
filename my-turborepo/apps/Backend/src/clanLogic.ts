/** Website clan economy rules (Cobble$). */

export const CLAN_CREATE_COST = 750_000;

export const CLAN_BASE_MAX_MEMBERS = 2;

export const CLAN_ABSOLUTE_MAX_MEMBERS = 5;

/** Treasury balance needed per extra member slot (beyond base). */
export const CLAN_TREASURY_MILESTONE = 250_000;

/** @deprecated Use {@link CLAN_TREASURY_MILESTONE}. */
export const CLAN_DONATE_MILESTONE = CLAN_TREASURY_MILESTONE;

export const CLAN_DAILY_PER_MEMBER = 50_000;

/** Daily treasury bonus for #1 on each clan leaderboard category (Asia/Ho_Chi_Minh). */
export const CLAN_LEADERBOARD_DAILY_REWARD_TOP1 = 200_000;

export type ClanLeaderboardRewardCategory = "top_treasury" | "top_average_elo";

export const CLAN_LEADERBOARD_REWARD_CATEGORIES: readonly {
  key: ClanLeaderboardRewardCategory;
  label: string;
}[] = [
  { key: "top_treasury", label: "Top treasury" },
  { key: "top_average_elo", label: "Average ELO" },
];

export function clanLeaderboardDailyTreasuryBonus(
  rankTopTreasury: number | null,
  rankTopAverageElo: number | null
): number {
  let bonus = 0;
  if (rankTopTreasury === 1) bonus += CLAN_LEADERBOARD_DAILY_REWARD_TOP1;
  if (rankTopAverageElo === 1) bonus += CLAN_LEADERBOARD_DAILY_REWARD_TOP1;
  return bonus;
}

export type ClanTreasuryMilestoneDef = {
  key: string;
  threshold: number;
  label: string;
  kind: "income" | "tickets";
};

/** Ordered treasury unlocks (member slots use {@link CLAN_TREASURY_MILESTONE} separately). */
export const CLAN_TREASURY_MILESTONES: readonly ClanTreasuryMilestoneDef[] = [
  { key: "income_25", threshold: 1_000_000, label: "+25% daily income", kind: "income" },
  { key: "tickets_1", threshold: 1_250_000, label: "+1 ticket/member/day", kind: "tickets" },
  { key: "income_50", threshold: 1_500_000, label: "+50% daily income", kind: "income" },
  { key: "tickets_2", threshold: 2_000_000, label: "+2 tickets/member/day", kind: "tickets" },
  { key: "income_100", threshold: 2_500_000, label: "+100% daily income", kind: "income" },
  { key: "income_150", threshold: 3_000_000, label: "+150% daily income", kind: "income" },
];

/** @deprecated Use {@link CLAN_TREASURY_MILESTONES}. */
export const CLAN_DONATION_MILESTONES = CLAN_TREASURY_MILESTONES;

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

export function clanMaxMembersFromTreasury(treasury: number): number {
  const extra = Math.floor(Math.max(0, treasury) / CLAN_TREASURY_MILESTONE);
  return Math.min(CLAN_ABSOLUTE_MAX_MEMBERS, CLAN_BASE_MAX_MEMBERS + extra);
}

/** @deprecated Use {@link clanMaxMembersFromTreasury}. */
export function clanMaxMembersFromTotalDonated(treasury: number): number {
  return clanMaxMembersFromTreasury(treasury);
}

export function clanDailyIncomeMultiplier(treasury: number): number {
  for (const tier of CLAN_INCOME_MULTIPLIER_TIERS) {
    if (treasury >= tier.threshold) return tier.multiplier;
  }
  return 1;
}

export function clanDailyBankIncome(memberCount: number, treasury: number): number {
  const mc = Math.max(0, Math.floor(memberCount));
  const mult = clanDailyIncomeMultiplier(treasury);
  return Math.floor(mc * CLAN_DAILY_PER_MEMBER * mult);
}

export function clanDailyTicketBonus(treasury: number): number {
  for (const tier of CLAN_TICKET_TIERS) {
    if (treasury >= tier.threshold) return tier.ticketsPerDay;
  }
  return 0;
}

export function clanHasDailyTicketBonus(treasury: number): boolean {
  return clanDailyTicketBonus(treasury) > 0;
}

export function nextMemberUnlockTreasury(treasury: number, currentMax: number): number | null {
  if (currentMax >= CLAN_ABSOLUTE_MAX_MEMBERS) return null;
  const needed = (currentMax - CLAN_BASE_MAX_MEMBERS + 1) * CLAN_TREASURY_MILESTONE;
  return Math.max(0, needed - treasury);
}

/** @deprecated Use {@link nextMemberUnlockTreasury}. */
export function nextMemberUnlockDonation(treasury: number, currentMax: number): number | null {
  return nextMemberUnlockTreasury(treasury, currentMax);
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
