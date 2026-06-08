-- Member daily income credited to clan treasury (once per clan per day).
-- Source of truth for payouts — independent of clans.last_daily_income_date.

CREATE TABLE IF NOT EXISTS clan_daily_member_income_payouts (
  id bigserial PRIMARY KEY,
  clan_id bigint NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  payout_date date NOT NULL,
  member_count int NOT NULL CHECK (member_count >= 1),
  income_amount bigint NOT NULL CHECK (income_amount > 0),
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_clan_daily_member_income_payouts_once
  ON clan_daily_member_income_payouts (clan_id, payout_date);

CREATE INDEX IF NOT EXISTS idx_clan_daily_member_income_payouts_date
  ON clan_daily_member_income_payouts (payout_date DESC);
