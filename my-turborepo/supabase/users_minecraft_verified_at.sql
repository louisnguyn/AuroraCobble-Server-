-- Staff verification flag: set by admin (e.g. after confirming the player). Team Builder AI is only available
-- when this is non-null (or user is admin).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS minecraft_verified_at timestamptz;
