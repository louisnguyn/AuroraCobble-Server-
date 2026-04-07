-- Run in Supabase SQL Editor after user_saved_teams exists.
-- Stores optional Team Builder AI analysis (markdown) per saved team.

ALTER TABLE user_saved_teams
  ADD COLUMN IF NOT EXISTS ai_analysis text;
