-- Top-2 payouts per category + top_level category. Run once if clan_leaderboard_daily_payouts exists.

DROP INDEX IF EXISTS uq_clan_leaderboard_daily_payouts_once;

ALTER TABLE clan_leaderboard_daily_payouts DROP CONSTRAINT IF EXISTS clan_leaderboard_daily_payouts_category_check;
ALTER TABLE clan_leaderboard_daily_payouts ADD CONSTRAINT clan_leaderboard_daily_payouts_category_check
  CHECK (category IN ('top_treasury', 'top_average_elo', 'top_level'));

ALTER TABLE clan_leaderboard_daily_payouts DROP CONSTRAINT IF EXISTS clan_leaderboard_daily_payouts_rank_position_check;
ALTER TABLE clan_leaderboard_daily_payouts ADD CONSTRAINT clan_leaderboard_daily_payouts_rank_position_check
  CHECK (rank_position IN (1, 2));

CREATE UNIQUE INDEX IF NOT EXISTS uq_clan_leaderboard_daily_payouts_once
  ON clan_leaderboard_daily_payouts (payout_date, category, rank_position);
