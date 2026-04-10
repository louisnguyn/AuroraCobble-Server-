-- PVP rank daily rewards: optional claim flow (status pending until user claims on website).

ALTER TABLE user_pvp_daily_payouts
  ADD COLUMN IF NOT EXISTS ticket_bonus integer NOT NULL DEFAULT 0;

ALTER TABLE user_pvp_daily_payouts
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz NULL;

COMMENT ON COLUMN user_pvp_daily_payouts.ticket_bonus IS 'Website normal tickets granted with this row (when claimed).';
COMMENT ON COLUMN user_pvp_daily_payouts.claimed_at IS 'When the user claimed; NULL while status is pending.';

CREATE INDEX IF NOT EXISTS idx_user_pvp_daily_pending_user
  ON user_pvp_daily_payouts (user_id)
  WHERE status = 'pending';
