-- Minecraft account client type: official (premium) vs cracked launcher.
-- Players choose at signup; staff can change later in Admin → Users.
--
-- Run in the Supabase SQL Editor.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS minecraft_client text;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_minecraft_client_check;

ALTER TABLE users
  ADD CONSTRAINT users_minecraft_client_check
  CHECK (minecraft_client IS NULL OR minecraft_client IN ('premium', 'crack'));

COMMENT ON COLUMN users.minecraft_client IS
  'Account client type chosen at signup: premium (official) or crack. Staff may update.';
