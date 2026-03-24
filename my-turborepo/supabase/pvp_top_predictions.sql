-- PVP leaderboard predictions (website Cobble$), settled at daily 00:00 Asia/Ho_Chi_Minh.
-- Full exact top-1,2,3 order: stake × 4 if correct. Single-rank guesses: each stake × 2 if that rank is correct.

CREATE TABLE IF NOT EXISTS pvp_top_predictions (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  for_payout_date date NOT NULL,
  format_key text NOT NULL DEFAULT 'singles',
  stake integer NOT NULL DEFAULT 0,
  pick_rank1_name text NOT NULL DEFAULT '',
  pick_rank2_name text NOT NULL DEFAULT '',
  pick_rank3_name text NOT NULL DEFAULT '',
  stake_rank1_only integer NOT NULL DEFAULT 0,
  pick_rank1_only text NULL,
  stake_rank2_only integer NOT NULL DEFAULT 0,
  pick_rank2_only text NULL,
  stake_rank3_only integer NOT NULL DEFAULT 0,
  pick_rank3_only text NULL,
  result text NOT NULL DEFAULT 'pending' CHECK (result IN ('pending', 'won', 'lost')),
  payout_amount integer NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  CONSTRAINT pvp_top_predictions_stakes_non_negative CHECK (
    stake >= 0
    AND stake_rank1_only >= 0
    AND stake_rank2_only >= 0
    AND stake_rank3_only >= 0
  ),
  CONSTRAINT pvp_top_predictions_total_stake_positive CHECK (
    stake + stake_rank1_only + stake_rank2_only + stake_rank3_only > 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pvp_top_predictions_user_round
  ON pvp_top_predictions (user_id, for_payout_date, format_key);

CREATE INDEX IF NOT EXISTS idx_pvp_top_predictions_resolve
  ON pvp_top_predictions (for_payout_date, format_key, result);
