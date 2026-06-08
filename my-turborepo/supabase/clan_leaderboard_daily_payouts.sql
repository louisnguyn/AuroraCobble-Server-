-- Daily clan leaderboard treasury rewards (#1 per category, once per day).

CREATE TABLE IF NOT EXISTS clan_leaderboard_daily_payouts (
  id bigserial PRIMARY KEY,
  payout_date date NOT NULL,
  category text NOT NULL CHECK (category IN ('top_treasury', 'top_average_elo')),
  clan_id bigint NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  rank_position integer NOT NULL DEFAULT 1 CHECK (rank_position = 1),
  amount bigint NOT NULL CHECK (amount > 0),
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_clan_leaderboard_daily_payouts_once
  ON clan_leaderboard_daily_payouts (payout_date, category);

CREATE INDEX IF NOT EXISTS idx_clan_leaderboard_daily_payouts_clan
  ON clan_leaderboard_daily_payouts (clan_id, paid_at DESC);
