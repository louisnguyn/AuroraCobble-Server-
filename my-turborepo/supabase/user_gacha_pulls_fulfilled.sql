-- Run in Supabase SQL Editor to add "given in-game" tracking for gacha pulls.
-- Lets admins mark rewards as fulfilled so they can tick off what they've given in-game.

ALTER TABLE user_gacha_pulls
ADD COLUMN IF NOT EXISTS fulfilled_at timestamptz NULL;

COMMENT ON COLUMN user_gacha_pulls.fulfilled_at IS 'When an admin marked this reward as given in-game; NULL = not yet given';
