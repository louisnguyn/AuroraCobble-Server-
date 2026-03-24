-- Run in Supabase SQL Editor.
-- Append-only ledger for website Cobble$ (user_currency cobbledollars).

CREATE TABLE IF NOT EXISTS user_cobbledollar_ledger (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta integer NOT NULL,
  balance_after integer NOT NULL,
  kind text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_cobbledollar_ledger_user_created
  ON user_cobbledollar_ledger (user_id, created_at DESC);
