-- Admin-granted clan XP (audit log). Run once in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS clan_admin_xp_grants (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clan_id bigint NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  admin_user_id bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  xp_amount int NOT NULL CHECK (xp_amount > 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clan_admin_xp_grants_clan_created
  ON clan_admin_xp_grants (clan_id, created_at DESC);
