-- LuckPerms primary group mirrored on the website; default everyone is `member`.
-- Apply on Supabase: SQL editor or migration.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS minecraft_role text NOT NULL DEFAULT 'member';

COMMENT ON COLUMN users.minecraft_role IS 'LuckPerms parent group key (lowercase), e.g. member, pro, champion.';

-- User requests for roles that cannot be purchased (staff approve → LP + column update).
CREATE TABLE IF NOT EXISTS user_role_grant_requests (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_role text NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by_user_id bigint REFERENCES users(id) ON DELETE SET NULL,
  admin_note text
);

CREATE INDEX IF NOT EXISTS user_role_grant_requests_status_created
  ON user_role_grant_requests (status, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS user_role_grant_requests_one_pending_per_user
  ON user_role_grant_requests (user_id)
  WHERE (status = 'pending');
