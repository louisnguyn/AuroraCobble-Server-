-- Run in Supabase SQL Editor.
-- 7-day streak daily rewards (one claim per user per date).

CREATE TABLE IF NOT EXISTS user_daily_login_claims (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  claim_date date NOT NULL,
  streak_day integer NOT NULL,
  selected_reward text NOT NULL,
  reward_kind text NOT NULL,
  reward_amount integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  error_message text NULL,
  claimed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_daily_login_claims_user_date
  ON user_daily_login_claims (user_id, claim_date);

CREATE INDEX IF NOT EXISTS idx_user_daily_login_claims_user_created
  ON user_daily_login_claims (user_id, created_at DESC);
-- Run in Supabase SQL Editor.
-- Daily login claim tracking (one successful claim per user per local date).

CREATE TABLE IF NOT EXISTS user_daily_login_claims (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  claim_date date NOT NULL,
  selected_reward text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  error_message text NULL,
  claimed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_daily_login_claims_user_date
  ON user_daily_login_claims (user_id, claim_date);

CREATE INDEX IF NOT EXISTS idx_user_daily_login_claims_user_created
  ON user_daily_login_claims (user_id, created_at DESC);
