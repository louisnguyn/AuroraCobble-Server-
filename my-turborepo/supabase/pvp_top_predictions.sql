-- PVP leaderboard top-3 prediction (website Cobble$ stake, resolved at daily payout).

CREATE TABLE IF NOT EXISTS pvp_top_predictions (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  for_payout_date date NOT NULL,
  format_key text NOT NULL DEFAULT 'singles',
  stake integer NOT NULL CHECK (stake > 0),
  pick_rank1_name text NOT NULL,
  pick_rank2_name text NOT NULL,
  pick_rank3_name text NOT NULL,
  result text NOT NULL DEFAULT 'pending' CHECK (result IN ('pending', 'won', 'lost')),
  payout_amount integer NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pvp_top_predictions_user_round
  ON pvp_top_predictions (user_id, for_payout_date, format_key);

CREATE INDEX IF NOT EXISTS idx_pvp_top_predictions_resolve
  ON pvp_top_predictions (for_payout_date, format_key, result);
