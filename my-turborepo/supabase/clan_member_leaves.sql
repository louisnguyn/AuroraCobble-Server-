-- Tracks when a user last left a clan (24h rejoin cooldown). Run once in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS clan_member_leaves (
  user_id bigint PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  left_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clan_member_leaves_left_at ON clan_member_leaves (left_at DESC);
