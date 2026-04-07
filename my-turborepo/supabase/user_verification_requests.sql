-- User-initiated verification requests; staff approve → sets users.minecraft_verified_at, or reject with optional note.

CREATE TABLE IF NOT EXISTS user_verification_requests (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by_user_id bigint REFERENCES users(id) ON DELETE SET NULL,
  admin_note text
);

CREATE INDEX IF NOT EXISTS user_verification_requests_status_created
  ON user_verification_requests (status, created_at);

-- At most one pending request per user (PostgreSQL partial unique index).
CREATE UNIQUE INDEX IF NOT EXISTS user_verification_requests_one_pending_per_user
  ON user_verification_requests (user_id)
  WHERE (status = 'pending');
