-- Run in Supabase SQL Editor.
-- User-saved teams from the website Team Builder (JSON slots).

CREATE TABLE IF NOT EXISTS user_saved_teams (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  team_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_saved_teams_name_len CHECK (char_length(name) >= 1 AND char_length(name) <= 120)
);

CREATE INDEX IF NOT EXISTS idx_user_saved_teams_user_updated
  ON user_saved_teams (user_id, updated_at DESC);
