-- Clan XP from member daily login claims. Run once in Supabase SQL Editor.

ALTER TABLE clans ADD COLUMN IF NOT EXISTS xp bigint NOT NULL DEFAULT 0 CHECK (xp >= 0);

CREATE TABLE IF NOT EXISTS clan_xp_grants (
  clan_id bigint NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  claim_date date NOT NULL,
  streak_day smallint NOT NULL CHECK (streak_day >= 1 AND streak_day <= 7),
  xp_amount int NOT NULL CHECK (xp_amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clan_id, user_id, claim_date)
);

CREATE INDEX IF NOT EXISTS idx_clan_xp_grants_clan_date
  ON clan_xp_grants (clan_id, claim_date DESC);

CREATE OR REPLACE FUNCTION increment_clan_xp(p_clan_id bigint, p_amount int)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  new_xp bigint;
BEGIN
  IF p_amount <= 0 THEN
    SELECT xp INTO new_xp FROM clans WHERE id = p_clan_id;
    RETURN COALESCE(new_xp, 0);
  END IF;
  UPDATE clans
  SET xp = xp + p_amount, updated_at = now()
  WHERE id = p_clan_id
  RETURNING xp INTO new_xp;
  RETURN COALESCE(new_xp, 0);
END;
$$;
