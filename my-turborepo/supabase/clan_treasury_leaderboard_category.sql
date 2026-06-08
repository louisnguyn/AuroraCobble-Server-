-- Rename leaderboard payout category top_donated → top_treasury (run if table already exists).

UPDATE clan_leaderboard_daily_payouts SET category = 'top_treasury' WHERE category = 'top_donated';

ALTER TABLE clan_leaderboard_daily_payouts DROP CONSTRAINT IF EXISTS clan_leaderboard_daily_payouts_category_check;
ALTER TABLE clan_leaderboard_daily_payouts ADD CONSTRAINT clan_leaderboard_daily_payouts_category_check
  CHECK (category IN ('top_treasury', 'top_average_elo'));
