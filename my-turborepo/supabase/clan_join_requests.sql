-- Migrate from clan_invites → clan_join_requests (run if you already applied an older clans.sql).

DROP TABLE IF EXISTS clan_invites;

CREATE TABLE IF NOT EXISTS clan_join_requests (
  id bigserial PRIMARY KEY,
  clan_id bigint NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  requester_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clan_join_requests_pending_unique
  ON clan_join_requests (clan_id, requester_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_clan_join_requests_clan_pending
  ON clan_join_requests (clan_id)
  WHERE status = 'pending';
