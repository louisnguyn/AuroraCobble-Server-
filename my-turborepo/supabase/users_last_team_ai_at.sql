-- Run in Supabase SQL Editor.
-- Cooldown for Team Builder AI analysis (non-admin): once per 12h per user (see TEAM_AI_COOLDOWN_MS in Backend).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_team_ai_at timestamptz;
