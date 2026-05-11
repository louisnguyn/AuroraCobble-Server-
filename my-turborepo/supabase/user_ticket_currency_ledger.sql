-- Run in Supabase SQL Editor.
-- Append-only ledger for website ticket wallets (user_currency rows: normal + exchange ticket types).

CREATE TABLE IF NOT EXISTS user_ticket_currency_ledger (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency_type text NOT NULL,
  delta integer NOT NULL,
  balance_after integer NOT NULL,
  kind text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_ticket_currency_ledger_user_created
  ON user_ticket_currency_ledger (user_id, created_at DESC);
