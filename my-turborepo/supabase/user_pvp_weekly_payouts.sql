-- Weekly PVP rank rewards (Top 1 and Top 2).

CREATE TABLE IF NOT EXISTS user_pvp_weekly_payouts (
  id bigserial PRIMARY KEY,
  week_start date NOT NULL,
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

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_pvp_weekly_payouts_once
  ON user_pvp_weekly_payouts (week_start, format_key, rank_position);

CREATE INDEX IF NOT EXISTS idx_user_pvp_weekly_payouts_user
  ON user_pvp_weekly_payouts (user_id, paid_at DESC);
