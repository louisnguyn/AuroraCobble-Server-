-- Daily PVP rank rewards (top 1 -> top 8) paid once per day.

CREATE TABLE IF NOT EXISTS user_pvp_daily_payouts (
  id bigserial PRIMARY KEY,
  payout_date date NOT NULL,
  format_key text NOT NULL DEFAULT 'singles',
  rank_position integer NOT NULL,
  minecraft_username text NOT NULL,
  user_id bigint NULL REFERENCES users(id) ON DELETE SET NULL,
  amount integer NOT NULL,
  status text NOT NULL DEFAULT 'success',
  note text NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_pvp_daily_payouts_once
  ON user_pvp_daily_payouts (payout_date, format_key, rank_position);

CREATE INDEX IF NOT EXISTS idx_user_pvp_daily_payouts_user
  ON user_pvp_daily_payouts (user_id, paid_at DESC);
