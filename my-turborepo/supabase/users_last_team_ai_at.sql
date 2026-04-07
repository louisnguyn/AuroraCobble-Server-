-- Run in Supabase SQL Editor.
-- Cooldown for Team Builder AI analysis (non-admin): once per 48h per user.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_team_ai_at timestamptz;
